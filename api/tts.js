// Lernfuchs — TTS proxy za prirodan njemački audio (isti domen = radi na iPhone-u)
export default async function handler(req, res) {
  const q = req.query || {};
  const text = String(q.text || '').slice(0, 600).trim();
  const tl = String(q.tl || 'de');
  const voice = String(q.voice || 'Vicki');
  if (!text) { res.status(400).json({ error: 'no text' }); return; }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  // 1) Premium neural (ElevenLabs) — samo ako postave env varijable
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + process.env.ELEVENLABS_VOICE_ID,
        { method: 'POST',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }) });
      if (r.ok) return send(res, Buffer.from(await r.arrayBuffer()));
    } catch (e) {}
  }
  // 2) Google glas (besplatno, prirodno, bez ključa)
  try {
    const chunks = chunkText(text, 180); const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const u = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
        encodeURIComponent(tl) + '&total=' + chunks.length + '&idx=' + i +
        '&textlen=' + chunks[i].length + '&q=' + encodeURIComponent(chunks[i]);
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' } });
      if (!r.ok) throw new Error('google ' + r.status);
      parts.push(Buffer.from(await r.arrayBuffer()));
    }
    return send(res, Buffer.concat(parts));
  } catch (e) {}
  // 3) Amazon Polly (StreamElements) — rezerva
  try {
    const r = await fetch('https://api.streamelements.com/kappa/v2/speech?voice=' +
      encodeURIComponent(voice) + '&text=' + encodeURIComponent(text.slice(0, 300)));
    if (r.ok) return send(res, Buffer.from(await r.arrayBuffer()));
  } catch (e) {}
  res.status(502).json({ error: 'tts unavailable' });
}
function send(res, buf) { res.setHeader('Content-Type', 'audio/mpeg'); res.status(200).send(buf); }
function chunkText(text, max) {
  const words = text.split(/\s+/); const out = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text];
}
