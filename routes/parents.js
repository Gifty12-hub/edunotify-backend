const express = require("express");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);
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
    const parent = await Parent.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ parent });
  } catch (err) { next(err); }
});

module.exports = router;