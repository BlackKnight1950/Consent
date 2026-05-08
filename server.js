const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY   = process.env.SMARTSHEET_API_KEY;
const CODY_API_KEY = process.env.CODY_API_KEY;
const CODY_BOT_ID  = process.env.CODY_BOT_ID || 'JAPdRLjq0aGy';
const CODY_BASE    = 'https://getcody.ai/api/v1';

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.url}`);
  next();
});

// ─── Smartsheet proxy ────────────────────────────────────────────────────────
app.get('/api/smartsheet*', async (req, res) => {
  if (!SS_API_KEY) return res.status(500).json({ error: 'SMARTSHEET_API_KEY not set.' });
  const ssPath   = req.path.replace('/api/smartsheet', '') || '/';
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `https://api.smartsheet.com/2.0${ssPath}${query}`;
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
  if (!pdfUrl.includes('.s3.amazonaws.com') && !pdfUrl.includes('smartsheet')) {
    return res.status(403).send('URL not allowed');
  }
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

// ─── Cody: create conversation ───────────────────────────────────────────────
// Called once at chat start to get a conversation_id
app.post('/api/cody/conversation', async (req, res) => {
  if (!CODY_API_KEY) return res.status(500).json({ error: 'CODY_API_KEY not set.' });
  try {
    const r = await fetch(`${CODY_BASE}/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CODY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Consent Forms Chat',
        bot_id: CODY_BOT_ID
      })
    });
    const data = await r.json();
    console.log(`[cody] create conversation: HTTP ${r.status}`, JSON.stringify(data).substring(0, 200));
    res.status(r.status).json(data);
  } catch (err) {
    console.error('[cody conversation]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Cody: send message ──────────────────────────────────────────────────────
app.post('/api/cody', async (req, res) => {
  if (!CODY_API_KEY) return res.status(500).json({ error: 'CODY_API_KEY not set.' });
  const { content, conversation_id } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  console.log(`[cody] sending message to conversation ${conversation_id}: "${content.substring(0,60)}"`);

  try {
    const r = await fetch(`${CODY_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CODY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, conversation_id })
    });
    const data = await r.json();
    console.log(`[cody] message response HTTP ${r.status}:`, JSON.stringify(data).substring(0, 300));
    res.status(r.status).json(data);
  } catch (err) {
    console.error('[cody message]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Static files ─────────────────────────────────────────────────────────────
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
