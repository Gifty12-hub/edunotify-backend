const express = require("express");
const Student = require("../models/Student");
const Notification = require("../models/Notification");
const { authenticate, authorize } = require("../middleware/auth");
const { sendAndLog } = require("../services/dispatch");
const ai = require("../services/ai");
const { sendLimiter } = require("../middleware/limits");

const router = express.Router();
router.use(authenticate, authorize("admin", "teacher"));

// GET /api/notifications  -> delivery history for this school
router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({ school: req.user.school })
      .populate("student parent sentBy", "fullName className phone email")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ notifications });
  } catch (err) { next(err); }
});

// POST /api/notifications  { studentId, message }
// Sends one message to one student's parent on the parent's preferred channel.
router.post("/", sendLimiter, async (req, res, next) => {
  try {
    const { studentId, message } = req.body;
    if (!studentId || !message || !message.trim()) {
      return res.status(400).json({ error: "studentId and message are required" });
    }
    const student = await Student.findOne({ _id: studentId, school: req.user.school }).populate("parent");
    if (!student) return res.status(404).json({ error: "Student not found" });

    const notification = await sendAndLog({
      student, parent: student.parent, sentBy: req.user._id, message: message.trim(),
    });
    if (notification.status === "failed") {
      return res.status(502).json({ error: notification.error || "Delivery failed", notification });
    }
    res.status(201).json({ notification });
  } catch (err) { next(err); }
});

// POST /api/notifications/broadcast  { message, className?, translate? }
// Sends one message to every parent in the school, or in one class.
// A parent with several children in scope gets the message once.
// With translate: true, each parent gets the message in their own language.
// If a translation fails, that parent gets the original text.
router.post("/broadcast", sendLimiter, async (req, res, next) => {
  try {
    const { message, className, translate = false } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

    const filter = { school: req.user.school };
    if (className) filter.className = className;
    const students = await Student.find(filter).populate("parent");
    if (students.length === 0) return res.status(404).json({ error: "No students found for that class" });

    const translations = new Map(); // language -> translated text
    const textFor = async (language) => {
      if (!translate || !language || language === "en" || !ai.isConfigured()) return { text: message.trim(), translated: false };
      if (!translations.has(language)) {
        try { translations.set(language, await ai.translateMessage(message.trim(), language)); }
        catch (err) { console.error("Translation failed:", err.message); translations.set(language, null); }
      }
      const text = translations.get(language);
      return text ? { text, translated: true } : { text: message.trim(), translated: false };
    };

    const seen = new Set();
    let sent = 0;
    let failed = 0;
    for (const student of students) {
      const parentId = student.parent._id.toString();
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      const language = student.parent.preferredLanguage || "en";
      const { text, translated } = await textFor(language);
      const n = await sendAndLog({
        student, parent: student.parent, sentBy: req.user._id, message: text, kind: "broadcast",
        language: translated ? language : "en", aiGenerated: translated,
      });
      n.status === "sent" ? sent++ : failed++;
    }
    res.status(201).json({ total: sent + failed, sent, failed });
  } catch (err) { next(err); }
});

module.exports = router;
