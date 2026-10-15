// Vercel serverless function: forwards chat to Groq (free tier). The API key stays in Vercel env vars.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GROQ_API_KEY, pass = process.env.APP_PASSCODE;
  if (!key || !pass) return res.status(500).json({ error: 'Server not set up: add GROQ_API_KEY and APP_PASSCODE in Vercel, then redeploy.' });
  const b = req.body || {};
  if (b.passcode !== pass) return res.status(401).json({ error: 'Wrong or missing passcode. Open settings and enter it.' });
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return res.status(400).json({ error: 'Say something first.' });
  const system = String(b.persona || '').slice(0, 3000) || 'You are a concise voice assistant.';
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0.8,
        messages: [{ role: 'system', content: system }, ...msgs]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) return res.status(429).json({ error: 'Too many requests for the free limit. Wait a minute and try again.' });
    if (!r.ok) return res.status(502).json({ error: 'AI error: ' + ((j.error && j.error.message) || r.status) });
    const reply = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    return res.status(200).json({ reply: reply || '...' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the AI service.' });
  }
};
