const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

const signToken = (user) => jwt.sign(
  { userId: user._id.toString(), schoolId: user.school.toString(), role: user.role },
  getSecret(),
  { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
);

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(token, getSecret());
    const user = await User.findById(payload.userId).select("-passwordHash");
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") return res.status(401).json({ error: "Invalid or expired token" });
    next(err);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
  next();
};

module.exports = { authenticate, authorize, signToken };