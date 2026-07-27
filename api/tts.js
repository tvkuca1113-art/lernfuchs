// ============================================================================
// Lernfuchs — TTS proxy for natural, human-sounding German audio.
//
// WHY: browsers' built-in speech (Web Speech API) sounds robotic and is
// unreliable on iOS. This tiny serverless function serves real, natural audio
// from the SAME origin as your app (/api/tts), which fixes CORS + iOS issues.
//
// HOW TO USE (Vercel — you already deploy there):
//   1. Put this file at:  api/tts.js   (in your project root, next to index.html)
//   2. Redeploy. That's it — the app auto-detects /api/tts and uses it.
//
// AUDIO SOURCE (in order):
//   1. ElevenLabs neural voice — ONLY if you set env vars ELEVENLABS_API_KEY
//      and ELEVENLABS_VOICE_ID (the most natural, ~free tier). Optional.
//   2. Google Translate voice — free, natural, no key. (Default.)
//   3. Amazon Polly (StreamElements) — free fallback.
//
// No API key is required for it to work — Google is the free default.
// ============================================================================

export default async function handler(req, res) {
  const q = req.query || {};
  const text = String(q.text || '').slice(0, 600).trim();
  const tl = String(q.tl || 'de');
  const voice = String(q.voice || 'Vicki');
  if (!text) { res.status(400).json({ error: 'no text' }); return; }

  // long-lived cache: the same word/sentence never needs regenerating
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  // 1) Premium neural voice (ElevenLabs) — only if configured
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
    try {
      const r = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/' + process.env.ELEVENLABS_VOICE_ID,
        { method: 'POST',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }) }
      );
      if (r.ok) { return send(res, Buffer.from(await r.arrayBuffer())); }
    } catch (e) { /* fall through */ }
  }

  // 2) Google Translate TTS (free, natural). Chunked to respect its ~200-char limit.
  try {
    const chunks = chunkText(text, 180);
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const u = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
        encodeURIComponent(tl) + '&total=' + chunks.length + '&idx=' + i +
        '&textlen=' + chunks[i].length + '&q=' + encodeURIComponent(chunks[i]);
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' } });
      if (!r.ok) throw new Error('google ' + r.status);
      parts.push(Buffer.from(await r.arrayBuffer()));
    }
    return send(res, Buffer.concat(parts));
  } catch (e) { /* fall through */ }

  // 3) Amazon Polly via StreamElements (free fallback)
  try {
    const r = await fetch('https://api.streamelements.com/kappa/v2/speech?voice=' +
      encodeURIComponent(voice) + '&text=' + encodeURIComponent(text.slice(0, 300)));
    if (r.ok) { return send(res, Buffer.from(await r.arrayBuffer())); }
  } catch (e) { /* fall through */ }

  res.status(502).json({ error: 'tts unavailable' });
}

function send(res, buf) {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.status(200).send(buf);
}

// Split into <=max-char chunks on word boundaries (keeps sentences natural).
function chunkText(text, max) {
  const words = text.split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text];
}
