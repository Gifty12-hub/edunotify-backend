const express = require("express");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try { res.json({ students: await Student.find({ school: req.user.school }).populate("parent").sort("fullName") }); }
  catch (err) { next(err); }
});

router.post("/", authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const { fullName, className, parentId, parent } = req.body;
    if (!fullName || !className || (!parentId && !parent)) return res.status(400).json({ error: "fullName, className, and parent details are required" });
    const parentRecord = parentId ? await Parent.findById(parentId) : await Parent.create(parent);
    if (!parentRecord) return res.status(404).json({ error: "Parent not found" });
    const student = await Student.create({ school: req.user.school, fullName, className, parent: parentRecord._id });
    res.status(201).json({ student: await student.populate("parent") });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, school: req.user.school }).populate("parent");
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ student });
  } catch (err) { next(err); }
});

router.patch("/:id", authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const student = await Student.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, req.body, { new: true, runValidators: true }).populate("parent");
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ student });
  } catch (err) { next(err); }
});

router.delete("/:id", authorize("admin"), async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;