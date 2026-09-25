const express = require("express");
const Notification = require("../models/Notification");
const { verifyListenLink } = require("../services/listenLink");
const { spokenAudio } = require("../services/voice");

// Public pages. No login. The signed link is the key.
const router = express.Router();

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function load(req) {
  const { id, exp, sig } = req.params;
  if (!/^[a-f0-9]{24}$/i.test(id) || !verifyListenLink(id, exp, sig)) return null;
  return Notification.findById(id).populate("parent");
}

router.get("/:id/:exp/:sig", async (req, res, next) => {
  try {
    const n = await load(req);
    if (!n) return res.status(404).type("text").send("This link is not valid or has expired.");
    const { id, exp, sig } = req.params;
    res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Listen to your school message</title>
<style>
body{font-family:system-ui,sans-serif;background:#faf7f0;color:#263238;margin:0;padding:24px;max-width:520px;margin:auto}
h1{font-size:1.25rem}
button{font-size:1.25rem;padding:16px 24px;width:100%;border:0;border-radius:12px;background:#2b3a67;color:#fff}
p.msg{background:#fff;border:1px solid #e5dfd0;border-radius:12px;padding:16px;line-height:1.5}
audio{width:100%;margin-top:16px}
#status{margin-top:12px;color:#8a4b1c}
</style></head><body>
<h1>Message from your child's school</h1>
<button id="play">Tap to listen</button>
<audio id="audio" controls preload="none"></audio>
<p id="status"></p>
<p class="msg">${escapeHtml(n.message)}</p>
<script>
var a=document.getElementById("audio"),s=document.getElementById("status");
document.getElementById("play").onclick=function(){
  s.textContent="Getting the audio. Please wait a few seconds...";
  a.src="/listen/${id}/${exp}/${sig}/audio";
  a.oncanplay=function(){s.textContent="";a.play();};
  a.onerror=function(){s.textContent="Sorry, the audio is not available right now.";};
  a.load();
};
</script></body></html>`);
  } catch (err) { next(err); }
});

router.get("/:id/:exp/:sig/audio", async (req, res) => {
  try {
    const n = await load(req);
    if (!n) return res.status(404).type("text").send("This link is not valid or has expired.");
    const { audio } = await spokenAudio({
      text: n.message,
      textLanguage: n.language || "en",
      targetLanguage: n.parent.preferredLanguage || "en",
    });
    res.set({ "Content-Type": "audio/wav", "Content-Length": audio.length, "Cache-Control": "private, max-age=600" });
    res.send(audio);
  } catch (err) {
    res.status(err.status || 500).type("text").send(err.message);
  }
});

module.exports = router;
