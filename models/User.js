const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    // Set only for parent logins. Points at the parent contact record.
    parentProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["admin", "teacher", "parent"],
      default: "teacher",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);