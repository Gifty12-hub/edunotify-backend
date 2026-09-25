const express = require("express");
const Student = require("../models/Student");
const Notification = require("../models/Notification");
const { authenticate, authorize } = require("../middleware/auth");
const { spokenAudio } = require("../services/voice");

const router = express.Router();
router.use(authenticate);

function sendAudio(res, { audio, text, language }) {
  res.set({
    "Content-Type": "audio/wav",
    "X-Spoken-Text": encodeURIComponent(text),
    "X-Spoken-Language": language,
    "Cache-Control": "private, max-age=300",
  });
  res.send(audio);
}

const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });

// POST /api/voice/preview  { studentId, text }   (staff)
// Lets a teacher hear a message in the parent's language before sending.
router.post("/preview", authorize("admin", "teacher"), async (req, res) => {
  try {
    const { studentId, text } = req.body;
    if (!studentId || !text || !text.trim()) return res.status(400).json({ error: "studentId and text are required" });
    const student = await Student.findOne({ _id: studentId, school: req.user.school }).populate("parent");
    if (!student) return res.status(404).json({ error: "Student not found" });
    sendAudio(res, await spokenAudio({
      text: text.trim(), textLanguage: "en", targetLanguage: student.parent.preferredLanguage || "en",
    }));
  } catch (err) { fail(res, err); }
});

// GET /api/voice/notification/:id   (staff of the school, or the parent it was sent to)
router.get("/notification/:id", authorize("admin", "teacher", "parent"), async (req, res) => {
  try {
    const filter = req.user.role === "parent"
      ? { _id: req.params.id, parent: req.user.parentProfile }
      : { _id: req.params.id, school: req.user.school };
    const notification = await Notification.findOne(filter).populate("parent");
    if (!notification) return res.status(404).json({ error: "Message not found" });
    sendAudio(res, await spokenAudio({
      text: notification.message,
      textLanguage: notification.language || "en",
      targetLanguage: notification.parent.preferredLanguage || "en",
    }));
  } catch (err) { fail(res, err); }
});

module.exports = router;
