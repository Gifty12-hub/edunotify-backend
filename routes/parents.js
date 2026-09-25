const express = require("express");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const PARENT_FIELDS = ["fullName", "phone", "email", "preferredLanguage", "preferredChannel", "sendListenLink"];
router.use(authenticate, authorize("admin", "teacher"));
const schoolParentIds = (school) => Student.distinct("parent", { school });

router.get("/", async (req, res, next) => {
  try { res.json({ parents: await Parent.find({ _id: { $in: await schoolParentIds(req.user.school) } }).sort("fullName") }); }
  catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const ids = await schoolParentIds(req.user.school);
    const parent = ids.some((id) => id.toString() === req.params.id) ? await Parent.findById(req.params.id) : null;
    if (!parent) return res.status(404).json({ error: "Parent not found" });
    res.json({ parent });
  } catch (err) { next(err); }
});

router.patch("/:id", authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const ids = await schoolParentIds(req.user.school);
    if (!ids.some((id) => id.toString() === req.params.id)) return res.status(404).json({ error: "Parent not found" });
    const parent = await Parent.findByIdAndUpdate(req.params.id, pick(req.body, PARENT_FIELDS), { new: true, runValidators: true });
    res.json({ parent });
  } catch (err) { next(err); }
});

// POST /api/parents/:id/account  { email? }  (admin only)
// Creates a parent portal login, or resets the password if one exists.
// The temporary password is returned once. The admin passes it to the parent.
router.post("/:id/account", authorize("admin"), async (req, res, next) => {
  try {
    const ids = await schoolParentIds(req.user.school);
    if (!ids.some((id) => id.toString() === req.params.id)) return res.status(404).json({ error: "Parent not found" });
    const parent = await Parent.findById(req.params.id);

    const tempPassword = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const existing = await User.findOne({ parentProfile: parent._id });
    if (existing) {
      existing.passwordHash = passwordHash;
      await existing.save();
      return res.json({ email: existing.email, tempPassword, reset: true });
    }

    const email = (req.body.email || parent.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "An email address is needed for the parent login" });
    if (await User.exists({ email })) return res.status(409).json({ error: "That email is already used by another account" });

    await User.create({
      school: req.user.school, fullName: parent.fullName, email, passwordHash,
      role: "parent", parentProfile: parent._id,
    });
    res.status(201).json({ email, tempPassword, reset: false });
  } catch (err) { next(err); }
});

module.exports = router;