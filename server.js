const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY   = process.env.SMARTSHEET_API_KEY;
const CODY_API_KEY = process.env.CODY_API_KEY;
const CODY_BOT_ID  = process.env.CODY_BOT_ID || 'JAPdRLjq0aGy';
const SS_BASE      = 'https://api.smartsheet.com/2.0';

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.url}`);
  next();
});

// ─── Smartsheet API proxy ────────────────────────────────────────────────────
app.get('/api/smartsheet*', async (req, res) => {
  if (!SS_API_KEY) return res.status(500).json({ error: 'SMARTSHEET_API_KEY not set.' });
  const ssPath   = req.path.replace('/api/smartsheet', '') || '/';
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `${SS_BASE}${ssPath}${query}`;
  console.log(`[smartsheet] ${upstream}`);
  try {
    const r = await fetch(upstream, {
      headers: { 'Authorization': `Bearer ${SS_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const body = await r.text();
    res.status(r.status).set('Content-Type', 'application/json').send(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── PDF proxy ───────────────────────────────────────────────────────────────
app.get('/api/pdf-proxy', async (req, res) => {
  const pdfUrl = req.query.url;
  if (!pdfUrl) return res.status(400).send('Missing url');
  const allowed = pdfUrl.includes('.s3.amazonaws.com') || pdfUrl.includes('smartsheet');
  if (!allowed) return res.status(403).send('URL not allowed');
  try {
    const r = await fetch(pdfUrl);
    if (!r.ok) return res.status(r.status).send('PDF fetch failed');
    const buffer = await r.buffer();
    res.set('Content-Type', r.headers.get('content-type') || 'application/pdf')
       .set('Content-Disposition', 'inline')
       .set('Cache-Control', 'no-store')
       .send(buffer);
  } catch (err) {
    res.status(502).send('PDF error: ' + err.message);
  }
});

// ─── Cody AI proxy ───────────────────────────────────────────────────────────
app.post('/api/cody', async (req, res) => {
  const apiKey = CODY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'CODY_API_KEY not set.' });

  const { message, conversation_id } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided' });

  console.log(`[cody] message: "${message.substring(0, 60)}"`);

  try {
    // Cody API endpoint — send message to bot
    const body = {
      message,
      bot_id: CODY_BOT_ID
    };
    if (conversation_id) body.conversation_id = conversation_id;

    const r = await fetch('https://api.getcody.ai/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    console.log(`[cody] response status: ${r.status}`);
    res.status(r.status).json(data);
  } catch (err) {
    console.error(`[cody] error: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

// ─── Serve static files ───────────────────────────────────────────────────────
app.use(express.static(__dirname));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=== Consent Form Library on port ${PORT} ===`);
  console.log(`=== SMARTSHEET_API_KEY: ${SS_API_KEY ? 'SET ✓' : 'NOT SET ✗'} ===`);
  console.log(`=== CODY_API_KEY: ${CODY_API_KEY ? 'SET ✓' : 'NOT SET ✗'} ===`);
  console.log(`=== CODY_BOT_ID: ${CODY_BOT_ID} ===`);
});
