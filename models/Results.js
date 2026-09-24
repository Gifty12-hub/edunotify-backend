const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    subject: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    term: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    remarks: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// One score per student, subject, term and year. Saving again updates it.
resultSchema.index({ student: 1, subject: 1, term: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);
