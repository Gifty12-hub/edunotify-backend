const crypto = require("crypto");

// A listen link is a public web address that plays a message aloud.
// It carries an expiry time and a signature, so it cannot be guessed
// and stops working after a while.

function sign(id, exp) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET || "").update(`${id}.${exp}`).digest("hex").slice(0, 32);
}

function buildListenLink(notificationId) {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) return null;
  const days = Number(process.env.LISTEN_LINK_DAYS) || 14;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const id = String(notificationId);
  return `${base.replace(/\/$/, "")}/listen/${id}/${exp}/${sign(id, exp)}`;
}

function verifyListenLink(id, exp, sig) {
  const expected = Buffer.from(sign(id, exp));
  const given = Buffer.from(String(sig));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  return Number(exp) > Math.floor(Date.now() / 1000);
}

module.exports = { buildListenLink, verifyListenLink };
