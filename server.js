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

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// A simple test route to confirm the server is alive
app.get("/", (req, res) => {
  res.send("EduNotify backend is running");
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
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

// Start the server and keep it running
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});