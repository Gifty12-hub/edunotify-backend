const express = require("express");
const Student = require("../models/Student");
const Result = require("../models/Results");
const School = require("../models/School");
const { authenticate, authorize } = require("../middleware/auth");
const { sendAndLog } = require("../services/dispatch");
const { composeResultsMessage } = require("../services/resultsMessage");
const { sendLimiter } = require("../middleware/limits");
const multer = require("multer");
const { parseCsv, toCsv } = require("../services/csv");

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB is plenty for a class list of scores
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || /\.csv$/i.test(file.originalname);
    cb(ok ? null : new Error("Please upload a .csv file"), ok);
  },
});

const normalizeName = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

// GET /api/results/template?className=&subjects=A,B,C
// A blank CSV with one row per student in the class, ready to fill in and
// upload back. Keeps the exact names EduNotify already has on file, so the
// upload step can match every row.
router.get("/template", async (req, res, next) => {
  try {
    const { className, subjects } = req.query;
    if (!className) return res.status(400).json({ error: "className is required" });
    const subjectList = (subjects || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (subjectList.length === 0) return res.status(400).json({ error: "At least one subject is required" });

    const students = await Student.find({ school: req.user.school, className }).sort("fullName");
    if (students.length === 0) return res.status(404).json({ error: "No students found in that class" });

    const csv = toCsv(
      ["Student Name", ...subjectList],
      students.map((s) => [s.fullName, ...subjectList.map(() => "")])
    );
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${className.replace(/[^a-z0-9]+/gi, "-")}-results-template.csv"`,
    });
    res.send(csv);
  } catch (err) { next(err); }
});

// POST /api/results/upload  (multipart/form-data)
// Fields: file (csv), term, academicYear, className, subjects (comma list, optional)
// The first column must be the student's name, exactly as EduNotify has it.
// Every other column (or every column named in `subjects`, if given) is
// read as a subject, with the score in each cell.
router.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message === "Please upload a .csv file" ? err.message : "Could not read the uploaded file" });
    next();
  });
}, async (req, res, next) => {
  try {
    const { term, academicYear, className } = req.body;
    if (!req.file) return res.status(400).json({ error: "A CSV file is required" });
    if (!term || !academicYear || !className) {
      return res.status(400).json({ error: "term, academicYear and className are required" });
    }

    const { headers, records } = parseCsv(req.file.buffer.toString("utf8"));
    if (headers.length === 0) return res.status(400).json({ error: "The file looks empty" });

    const nameHeader = headers.find((h) => /^(student ?name|name)$/i.test(h));
    if (!nameHeader) return res.status(400).json({ error: 'The first column must be titled "Student Name"' });

    const requestedSubjects = (req.body.subjects || "").split(",").map((s) => s.trim()).filter(Boolean);
    const subjectColumns = requestedSubjects.length > 0
      ? headers.filter((h) => requestedSubjects.some((s) => normalizeName(s) === normalizeName(h)))
      : headers.filter((h) => h !== nameHeader);
    if (subjectColumns.length === 0) return res.status(400).json({ error: "No subject columns were found in the file" });

    const students = await Student.find({ school: req.user.school, className });
    const byName = new Map();
    const duplicates = new Set();
    for (const s of students) {
      const key = normalizeName(s.fullName);
      if (byName.has(key)) duplicates.add(key); else byName.set(key, s);
    }

    const entries = [];
    const skippedRows = [];
    const skippedCells = [];

    records.forEach((record, i) => {
      const rowNum = i + 2; // account for the header row, 1-indexed for humans
      const rawName = (record[nameHeader] || "").trim();
      if (!rawName) return; // blank row
      const key = normalizeName(rawName);
      if (duplicates.has(key)) {
        skippedRows.push({ row: rowNum, name: rawName, reason: "Two students in this class share this name. Enter this one by hand instead." });
        return;
      }
      const student = byName.get(key);
      if (!student) {
        skippedRows.push({ row: rowNum, name: rawName, reason: "No student with this exact name in this class" });
        return;
      }
      for (const subject of subjectColumns) {
        const raw = (record[subject] || "").trim();
        if (!raw) continue;
        const score = Number(raw);
        if (!validScore(score)) {
          skippedCells.push({ row: rowNum, name: rawName, subject, reason: `"${raw}" is not a score from 0 to 100` });
          continue;
        }
        entries.push({ studentId: student._id.toString(), subject, score });
      }
    });

    if (entries.length === 0) {
      return res.status(400).json({ error: "No valid scores were found to save", skippedRows, skippedCells });
    }

    await Result.bulkWrite(entries.map((e) => ({
      updateOne: {
        filter: { student: e.studentId, subject: e.subject, term, academicYear },
        update: { $set: { school: req.user.school, score: e.score, recordedBy: req.user._id } },
        upsert: true,
      },
    })));

    res.status(201).json({ saved: entries.length, skippedRows, skippedCells });
  } catch (err) {
    if (err.message === "Please upload a .csv file") return res.status(400).json({ error: err.message });
    next(err);
  }
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
