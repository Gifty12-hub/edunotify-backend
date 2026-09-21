require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const notificationsRoute = require("./routes/notifications");
const authRoute = require("./routes/auth");
const studentsRoute = require("./routes/students");
const parentsRoute = require("./routes/parents");
const School = require("./models/School");
const { authenticate } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// Allows requests from your frontend (running on a different port)
app.use(cors());

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
      notifications: "/api/notifications",
      school: "GET /api/school",
    },
  });
});
app.use("/api/auth", authRoute);
app.use("/api/students", studentsRoute);
app.use("/api/parents", parentsRoute);
app.use("/api/notifications", notificationsRoute);
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