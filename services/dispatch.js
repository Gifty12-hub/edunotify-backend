const Notification = require("../models/Notification");
const { deliverToParent } = require("./notify");
const { buildListenLink } = require("./listenLink");

/**
 * Logs a notification as "pending", tries to deliver it, then records
 * "sent" or "failed" (with the reason). Never throws for delivery
 * problems, so a bulk send keeps going if one parent fails.
 */
async function sendAndLog({ student, parent, sentBy, message, kind = "message", subject, language, aiGenerated = false }) {
  const notification = await Notification.create({
    school: student.school,
    student: student._id,
    parent: parent._id,
    sentBy,
    message,
    kind,
    language,
    aiGenerated,
    channel: parent.preferredChannel || "sms",
    status: "pending",
  });

  // Parents who cannot read get a link that plays the message aloud.
  const link = parent.sendListenLink ? buildListenLink(notification._id) : null;
  const textToSend = link ? `${message}\nListen: ${link}` : message;

  try {
    const out = await deliverToParent(parent, { message: textToSend, subject });
    notification.channel = out.channel;
    notification.providerId = out.providerId;
    notification.error = out.note;
    notification.status = "sent";
  } catch (err) {
    notification.status = "failed";
    notification.error = err.message;
  }
  await notification.save();
  return notification;
}

module.exports = { sendAndLog };
