const Result = require("../models/Results");
const ai = require("./ai");

/**
 * Builds the results message for one student.
 * Uses AI when asked and configured. Otherwise, or if AI fails,
 * it uses a plain English template. Returns null if no scores exist.
 */
async function composeResultsMessage({ student, school, term, academicYear, useAi }) {
  const results = await Result.find({ student: student._id, term, academicYear }).sort({ subject: 1 });
  if (results.length === 0) return null;

  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const template =
    `${school.name}: ${student.fullName} (${student.className}) ${term} ${academicYear} results. ` +
    `${results.map((r) => `${r.subject}: ${r.score}`).join(", ")}. Average: ${average.toFixed(1)}%.`;

  if (useAi && ai.isConfigured()) {
    try {
      const message = await ai.summarizeResults({
        schoolName: school.name,
        studentName: student.fullName,
        className: student.className,
        term, academicYear, results, average,
        language: student.parent?.preferredLanguage || "en",
      });
      return { message, aiGenerated: true, language: student.parent?.preferredLanguage || "en" };
    } catch (err) {
      console.error("AI summary failed, using template:", err.message);
    }
  }
  return { message: template, aiGenerated: false, language: "en" };
}

module.exports = { composeResultsMessage };
