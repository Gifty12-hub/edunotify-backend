const express = require("express");
const nodemailer = require("nodemailer");
const { sendLimiter } = require("../middleware/limits");

const router = express.Router();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const mailFrom = process.env.MAIL_FROM;
const transporter = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && mailFrom
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

router.post("/", sendLimiter, async (req, res, next) => {
  const { name, email, message } = req.body || {};
  const validEmail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (typeof name !== "string" || !name.trim() || name.length > 120 ||
      !validEmail || email.length > 254 || typeof message !== "string" ||
      !message.trim() || message.length > 5000) {
    return res.status(400).json({ error: "Please provide a name, valid email address, and message (up to 5000 characters)." });
  }

  if (!transporter) {
    return res.status(503).json({ error: "Contact email is temporarily unavailable. Please try again later." });
  }

  try {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();
    const from = mailFrom;

    await transporter.sendMail({
      from,
      to: process.env.CONTACT_EMAIL || "hello@edunotify.gh",
      replyTo: cleanEmail,
      subject: "New EduNotify contact message",
      text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\n${cleanMessage}`,
    });

    await transporter.sendMail({
      from,
      to: cleanEmail,
      subject: "We received your message",
      text: `Hi ${cleanName},\n\nThanks for contacting EduNotify. We have received your message and will get back to you within a couple of days.\n\nYour message:\n${cleanMessage}\n\nEduNotify\nhello@edunotify.gh`,
    });

    res.json({ message: "Your message has been sent. A confirmation email is on its way." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;