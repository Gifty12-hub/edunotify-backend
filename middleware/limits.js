const rateLimit = require("express-rate-limit");

const tooMany = (message) => ({ error: message });

// Failed logins only. Successful logins do not count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many login attempts. Try again in 15 minutes."),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many sign ups from this network. Try again later."),
});

// Every send costs money, so cap how often one network can trigger them.
const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("You are sending too fast. Wait a few minutes and try again."),
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many requests. Slow down and try again."),
});

module.exports = { loginLimiter, registerLimiter, sendLimiter, apiLimiter };
