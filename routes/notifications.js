const express = require("express");
const router = express.Router();

const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Notification = require("../models/Notification");

// Africa's Talking SDK setup (npm install africastalking)
const africastalking = require("africastalking")({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME, // "sandbox" for testing
});
const sms = africastalking.SMS;

// POST /api/notifications
// Sends a message to a student's parent and logs it
router.post("/", async (req, res) => {
  try {
    const { studentId, message, sentBy } = req.body;

    const student = await Student.findById(studentId).populate("parent");
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const parent = student.parent;

    // Create the log entry first, as "pending"
    const notification = await Notification.create({
      school: student.school,
      student: student._id,
      parent: parent._id,
      sentBy,
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

module.exports = router;