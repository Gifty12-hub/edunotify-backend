const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    preferredLanguage: {
      type: String,
      enum: ["en", "tw", "ga", "ee", "dag"],
      default: "en",
    },
    preferredChannel: {
      type: String,
      enum: ["sms", "whatsapp", "email"],
      default: "sms",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Parent", parentSchema);