const express = require("express");
const Student = require("../models/Student");
const Result = require("../models/Results");
const Notification = require("../models/Notification");
const { authenticate, authorize } = require("../middleware/auth");

// Everything here is for a logged in parent, and only shows their own children.
const router = express.Router();
router.use(authenticate, authorize("parent"));

// GET /api/portal/children -> each child with results grouped by term
router.get("/children", async (req, res, next) => {
  try {
    const students = await Student.find({ parent: req.user.parentProfile }).populate("school", "name").sort("fullName");
    const results = await Result.find({ student: { $in: students.map((s) => s._id) } }).sort({ academicYear: -1, term: 1, subject: 1 });

    const children = students.map((student) => {
      const terms = new Map();
      for (const r of results.filter((x) => x.student.toString() === student._id.toString())) {
        const key = `${r.academicYear}|${r.term}`;
        if (!terms.has(key)) terms.set(key, { academicYear: r.academicYear, term: r.term, results: [] });
        terms.get(key).results.push({ subject: r.subject, score: r.score, remarks: r.remarks });
      }
      const termList = [...terms.values()].map((t) => ({
        ...t,
        average: Number((t.results.reduce((sum, r) => sum + r.score, 0) / t.results.length).toFixed(1)),
      }));
      return {
        id: student._id,
        fullName: student.fullName,
        className: student.className,
        school: student.school?.name,
        terms: termList,
      };
    });
    res.json({ children });
  } catch (err) { next(err); }
});

// GET /api/portal/messages -> messages the school sent to this parent
router.get("/messages", async (req, res, next) => {
  try {
    const messages = await Notification.find({ parent: req.user.parentProfile, status: "sent" })
      .populate("student", "fullName")
      .select("message channel kind createdAt student")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ messages });
  } catch (err) { next(err); }
});

module.exports = router;
