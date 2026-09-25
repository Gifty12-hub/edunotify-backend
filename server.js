require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const notificationsRoute = require("./routes/notifications");
const authRoute = require("./routes/auth");
const studentsRoute = require("./routes/students");
const parentsRoute = require("./routes/parents");
const resultsRoute = require("./routes/results");
const statsRoute = require("./routes/stats");
const portalRoute = require("./routes/portal");
const voiceRoute = require("./routes/voice");
const listenRoute = require("./routes/listen");
const { loginLimiter, registerLimiter, apiLimiter, listenLimiter } = require("./middleware/limits");
const School = require("./models/School");
const { authenticate } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a host proxy (Render, Railway, Heroku) set TRUST_PROXY=1 so rate
// limits use the real visitor address and not the proxy address.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// Allows requests from your frontend (running on a different port)
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
  exposedHeaders: ["X-Spoken-Text", "X-Spoken-Language"],
}));

// Allows the server to read JSON in request bodies
app.use(express.json());

// A simple test route to confirm the server is alive
app.get("/", (req, res) => {
  res.send("EduNotify backend is running");
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api", (req, res) => {
  res.json({
    name: "EduNotify API",
    endpoints: {
      login: "POST /api/auth/login",
      register: "POST /api/auth/register",
      currentUser: "GET /api/auth/me",
      students: "/api/students",
      parents: "/api/parents",
      notifications: "/api/notifications (POST, POST /broadcast)",
      results: "/api/results (GET, POST /bulk, POST /notify)",
      stats: "GET /api/stats",
      parentPortal: "GET /api/portal/children, GET /api/portal/messages",
      school: "GET /api/school",
    },
  });
});
app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth", authRoute);
app.use("/api/portal", portalRoute);
app.use("/api/voice", voiceRoute);
app.use("/listen", listenLimiter, listenRoute);
app.use("/api/students", studentsRoute);
app.use("/api/parents", parentsRoute);
app.use("/api/notifications", notificationsRoute);
app.use("/api/results", resultsRoute);
app.use("/api/stats", statsRoute);
app.get("/api/school", authenticate, async (req, res, next) => {
  try {
    const school = await School.findById(req.user.school);
    if (!school) return res.status(404).json({ error: "School not found" });
    res.json({ school });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid resource id" });
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Unable to start server:", err.message);
  process.exit(1);
});