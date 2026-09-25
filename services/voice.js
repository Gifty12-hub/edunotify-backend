const ai = require("./ai");
const tts = require("./tts");

/**
 * Turns a message into speech for a parent.
 * The voice must match the language of the text. So if the message is not
 * in the parent's language, we translate it first (needs AI set up).
 * Returns { audio, text, language }, where text is exactly what is spoken.
 */
async function spokenAudio({ text, textLanguage = "en", targetLanguage = "en" }) {
  let spoken = text;
  let language = targetLanguage;

  if (textLanguage === targetLanguage) {
    // Already in the right language.
  } else if (targetLanguage === "en") {
    // The message is already in a local language. Read it in that language.
    language = textLanguage;
  } else {
    if (!ai.isConfigured()) {
      const err = new Error(
        `This message is not in ${ai.LANGUAGES[targetLanguage]} and AI translation is not set up, so it cannot be read aloud in that language`
      );
      err.status = 422;
      throw err;
    }
    spoken = await ai.translateMessage(text, targetLanguage);
  }

  const audio = await tts.synthesize(spoken, language);
  return { audio, text: spoken, language };
}

module.exports = { spokenAudio };
