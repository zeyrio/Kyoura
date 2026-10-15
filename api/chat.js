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
  const models = [...new Set([process.env.GROQ_MODEL, 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'].filter(Boolean))];
  try {
    for (const model of models) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: 600, temperature: 0.8, messages: [{ role: 'system', content: system }, ...msgs] })
      });
      const j = await r.json().catch(() => ({}));
      const msg = (j.error && j.error.message) || '';
      if (r.status === 429) return res.status(429).json({ error: 'Too many requests for the free limit. Wait a minute and try again.' });
      if (!r.ok && /does not exist|not found|decommissioned|deprecated|no access/i.test(msg)) continue;
      if (!r.ok) return res.status(502).json({ error: 'AI error: ' + (msg || r.status) });
      const reply = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      return res.status(200).json({ reply: reply || '...' });
    }
    return res.status(502).json({ error: 'No Groq model was available. Check console.groq.com/docs/models and set GROQ_MODEL in Vercel.' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the AI service.' });
  }
};
