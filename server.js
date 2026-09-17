require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const notificationsRoute = require("./routes/notifications");

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

// Mount the notifications route
app.use("/api/notifications", notificationsRoute);

// Start the server and keep it running
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});