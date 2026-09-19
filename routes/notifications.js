const express = require("express");
const router = express.Router();

const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Notification = require("../models/Notification");
const { authenticate, authorize } = require("../middleware/auth");

// Africa's Talking SDK setup (npm install africastalking)
const africastalking = require("africastalking")({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME, // "sandbox" for testing
});
const sms = africastalking.SMS;

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({ school: req.user.school })
      .populate("student parent sentBy")
      .sort({ createdAt: -1 });
    res.json({ notifications });
  } catch (err) { next(err); }
});

// POST /api/notifications
// Sends a message to a student's parent and logs it
router.post("/", authorize("admin", "teacher"), async (req, res, next) => {
  try {
    const { studentId, message } = req.body;
    if (!studentId || !message) return res.status(400).json({ error: "studentId and message are required" });

    const student = await Student.findOne({ _id: studentId, school: req.user.school }).populate("parent");
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const parent = student.parent;

    // Create the log entry first, as "pending"
    const notification = await Notification.create({
      school: student.school,
      student: student._id,
      parent: parent._id,
      sentBy: req.user._id,
      message,
      channel: parent.preferredChannel,
      status: "pending",
    });

    // Send via SMS (sandbox mode is free for testing)
    const result = await sms.send({
      to: [parent.phone],
      message,
    });

    notification.status = "sent";
    await notification.save();

    res.status(201).json({ notification, providerResult: result });
  } catch (err) { next(err); }
});

module.exports = router;