const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const School = require("../models/School");
const { authenticate, authorize, signToken } = require("../middleware/auth");

const router = express.Router();
const publicUser = (user) => ({ id: user._id, school: user.school, fullName: user.fullName, email: user.email, role: user.role });

router.post("/register", async (req, res, next) => {
  try {
    const { schoolId, school, fullName, email, password, role = "admin" } = req.body;
    if (!fullName || !email || !password || password.length < 8) return res.status(400).json({ error: "fullName, email, and a password of at least 8 characters are required" });
    let schoolRecord;
    if (schoolId) schoolRecord = await School.findById(schoolId);
    else if (school && school.name && school.region && school.town && school.contactEmail && school.contactPhone) schoolRecord = await School.create(school);
    if (!schoolRecord) return res.status(400).json({ error: "A valid schoolId or complete school details are required" });
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "Email is already registered" });
    const user = await User.create({ school: schoolRecord._id, fullName, email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), role: role === "teacher" ? "teacher" : "admin" });
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (err) { next(err); }
});

router.post("/login", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: (req.body.email || "").toLowerCase().trim() });
    const valid = user && await bcrypt.compare(req.body.password || "", user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) { next(err); }
});

router.get("/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.post("/users", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const { fullName, email, password, role = "teacher" } = req.body;
    if (!fullName || !email || !password || password.length < 8) return res.status(400).json({ error: "fullName, email, and a password of at least 8 characters are required" });
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "Email is already registered" });
    const user = await User.create({ school: req.user.school, fullName, email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), role: role === "admin" ? "admin" : "teacher" });
    res.status(201).json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

router.get("/users", authenticate, async (req, res, next) => {
  try { res.json({ users: await User.find({ school: req.user.school }).select("-passwordHash").sort("fullName") }); }
  catch (err) { next(err); }
});

module.exports = router;