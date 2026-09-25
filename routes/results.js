const express = require("express");
const Student = require("../models/Student");
const Result = require("../models/Results");
const School = require("../models/School");
const { authenticate, authorize } = require("../middleware/auth");
const { sendAndLog } = require("../services/dispatch");
const { composeResultsMessage } = require("../services/resultsMessage");
const { sendLimiter } = require("../middleware/limits");

const router = express.Router();
router.use(authenticate, authorize("admin", "teacher"));

const validScore = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;

// GET /api/results?studentId=&className=&term=&academicYear=
router.get("/", async (req, res, next) => {
  try {
    const { studentId, className, term, academicYear } = req.query;
    const filter = { school: req.user.school };
    if (studentId) filter.student = studentId;
    if (term) filter.term = term;
    if (academicYear) filter.academicYear = academicYear;
    if (className) {
      const ids = await Student.distinct("_id", { school: req.user.school, className });
      filter.student = studentId ? { $in: ids.filter((id) => id.toString() === studentId) } : { $in: ids };
    }
    const results = await Result.find(filter).populate("student", "fullName className").sort({ subject: 1 });
    res.json({ results });
  } catch (err) { next(err); }
});

// POST /api/results/bulk
// { term, academicYear, entries: [{ studentId, subject, score, remarks? }] }
// Creates or updates one score per student, subject, term and year.
router.post("/bulk", authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const { term, academicYear, entries } = req.body;
    if (!term || !academicYear || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "term, academicYear and a non-empty entries list are required" });
    }
    for (const e of entries) {
      if (!e.studentId || !e.subject || !validScore(e.score)) {
        return res.status(400).json({ error: "Each entry needs studentId, subject and a score from 0 to 100" });
      }
    }
    const studentIds = [...new Set(entries.map((e) => e.studentId))];
    const owned = await Student.countDocuments({ _id: { $in: studentIds }, school: req.user.school });
    if (owned !== studentIds.length) return res.status(404).json({ error: "One or more students were not found" });

    await Result.bulkWrite(entries.map((e) => ({
      updateOne: {
        filter: { student: e.studentId, subject: e.subject.trim(), term, academicYear },
        update: {
          $set: { school: req.user.school, score: e.score, remarks: e.remarks, recordedBy: req.user._id },
        },
        upsert: true,
      },
    })));
    res.status(201).json({ saved: entries.length });
  } catch (err) { next(err); }
});

// POST /api/results/preview  { studentId, term, academicYear, useAi? }
// Shows the message a parent would get. Nothing is sent.
router.post("/preview", async (req, res, next) => {
  try {
    const { studentId, term, academicYear, useAi = true } = req.body;
    if (!studentId || !term || !academicYear) {
      return res.status(400).json({ error: "studentId, term and academicYear are required" });
    }
    const student = await Student.findOne({ _id: studentId, school: req.user.school }).populate("parent");
    if (!student) return res.status(404).json({ error: "Student not found" });
    const school = await School.findById(req.user.school);
    const composed = await composeResultsMessage({ student, school, term, academicYear, useAi });
    if (!composed) return res.status(404).json({ error: "No scores saved for this student yet" });
    res.json(composed);
  } catch (err) { next(err); }
});

// POST /api/results/notify  { term, academicYear, studentId? , className?, useAi? }
// Builds a results message for each student and sends it to their parent.
router.post("/notify", sendLimiter, authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const { term, academicYear, studentId, className, useAi = true } = req.body;
    if (!term || !academicYear || (!studentId && !className)) {
      return res.status(400).json({ error: "term, academicYear and either studentId or className are required" });
    }
    const filter = { school: req.user.school };
    if (studentId) filter._id = studentId;
    if (className) filter.className = className;
    const students = await Student.find(filter).populate("parent");
    if (students.length === 0) return res.status(404).json({ error: "No students found" });

    const school = await School.findById(req.user.school);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const student of students) {
      const composed = await composeResultsMessage({ student, school, term, academicYear, useAi });
      if (!composed) { skipped++; continue; }
      const n = await sendAndLog({
        student, parent: student.parent, sentBy: req.user._id, message: composed.message, kind: "results",
        language: composed.language, aiGenerated: composed.aiGenerated,
        subject: `${student.fullName}: ${term} ${academicYear} results`,
      });
      n.status === "sent" ? sent++ : failed++;
    }
    res.status(201).json({ total: students.length, sent, failed, skippedNoResults: skipped });
  } catch (err) { next(err); }
});

module.exports = router;
