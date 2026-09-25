const express = require("express");
const Student = require("../models/Student");
const Notification = require("../models/Notification");
const Result = require("../models/Results");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("admin", "teacher"));

// GET /api/stats -> numbers for the dashboard
router.get("/", async (req, res, next) => {
  try {
    const school = req.user.school;
    const [students, parents, resultsRecorded, byStatus, byChannel, recent] = await Promise.all([
      Student.countDocuments({ school }),
      Student.distinct("parent", { school }).then((ids) => ids.length),
      Result.countDocuments({ school }),
      Notification.aggregate([{ $match: { school } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Notification.aggregate([{ $match: { school, status: "sent" } }, { $group: { _id: "$channel", count: { $sum: 1 } } }]),
      Notification.find({ school }).populate("student", "fullName className").sort({ createdAt: -1 }).limit(5),
    ]);
    const count = (rows, key) => rows.find((r) => r._id === key)?.count || 0;
    res.json({
      students,
      parents,
      resultsRecorded,
      notifications: {
        sent: count(byStatus, "sent"),
        failed: count(byStatus, "failed"),
        pending: count(byStatus, "pending"),
      },
      sentByChannel: { sms: count(byChannel, "sms"), whatsapp: count(byChannel, "whatsapp"), email: count(byChannel, "email") },
      recent,
    });
  } catch (err) { next(err); }
});

module.exports = router;
