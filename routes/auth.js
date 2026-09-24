const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const School = require("../models/School");
const { authenticate, authorize, signToken } = require("../middleware/auth");

const router = express.Router();
const publicUser = (user) => ({ id: user._id, school: user.school, fullName: user.fullName, email: user.email, role: user.role });

// Public signup: creates a NEW school and its first admin.
// Joining an existing school is not allowed here. An admin adds
// teachers with POST /api/auth/users instead.
router.post("/register", async (req, res, next) => {
  try {
    const { school, fullName, email, password } = req.body;
    if (!fullName || !email || !password || password.length < 8) return res.status(400).json({ error: "fullName, email, and a password of at least 8 characters are required" });
    if (!school || !school.name || !school.region || !school.town || !school.contactEmail || !school.contactPhone) return res.status(400).json({ error: "Complete school details are required" });
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "Email is already registered" });
    const schoolRecord = await School.create({
      name: school.name, region: school.region, town: school.town,
      contactEmail: school.contactEmail, contactPhone: school.contactPhone,
    });
    const user = await User.create({ school: schoolRecord._id, fullName, email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), role: "admin" });
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

router.get("/users", authenticate, authorize("admin", "teacher"), async (req, res, next) => {
  try { res.json({ users: await User.find({ school: req.user.school }).select("-passwordHash").sort("fullName") }); }
  catch (err) { next(err); }
});

router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Current password and a new password of at least 8 characters are required" });
    }
    const user = await User.findById(req.user._id);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Current password is wrong" });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;