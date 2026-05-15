const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY   = process.env.SMARTSHEET_API_KEY;
const CODY_API_KEY = process.env.CODY_API_KEY;
const CODY_BOT_ID  = process.env.CODY_BOT_ID || 'JAPdRLjq0aGy';
const CODY_BASE    = 'https://getcody.ai/api/v1';

// ─── CORS — allow GitHub Pages (and localhost for dev) to call this API ───────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  // Always allow localhost for local dev
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
  const isAllowed   = isLocalhost || ALLOWED_ORIGINS.includes(origin);
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
// /api/pdf-proxy?url=SIGNED_S3_URL           → preview (inline, opens in browser)
// /api/pdf-proxy?url=SIGNED_S3_URL&download=1 → download (attachment, triggers save)
// /api/pdf-download?attachId=ID              → fetches URL then streams as attachment
app.get('/api/pdf-proxy', async (req, res) => {
  const pdfUrl   = req.query.url;
  const isDownload = req.query.download === '1';
  if (!pdfUrl) return res.status(400).send('Missing url');

  // Security: only allow S3/Smartsheet signed URLs
  const allowed = pdfUrl.includes('.s3.amazonaws.com') ||
                  pdfUrl.includes('.s3.') ||
                  pdfUrl.includes('smartsheet') ||
                  pdfUrl.includes('amazonaws.com');
  if (!allowed) {
    console.warn('[pdf-proxy] Blocked URL:', pdfUrl.substring(0, 80));
    return res.status(403).send('URL not allowed');
  }

  console.log(`[pdf-proxy] mode=${isDownload ? 'download' : 'preview'}`);
  try {
    const r = await fetch(pdfUrl);
    if (!r.ok) {
      console.error('[pdf-proxy] S3 returned', r.status);
      return res.status(r.status).send('PDF fetch failed');
    }
    const buffer      = await r.buffer();
    const contentType = r.headers.get('content-type') || 'application/pdf';
    const disposition = isDownload ? 'attachment; filename="consent-form.pdf"' : 'inline';
    console.log(`[pdf-proxy] Serving ${buffer.length} bytes as ${disposition}`);
    res.set('Content-Type', contentType)
       .set('Content-Disposition', disposition)
       .set('Cache-Control', 'no-store')
       .send(buffer);
  } catch (err) {
    console.error('[pdf-proxy] error:', err.message);
    res.status(502).send('PDF fetch error: ' + err.message);
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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CCH Consent Form Library — API',
    smartsheet: SS_API_KEY ? 'configured' : 'NOT SET',
    cody: CODY_API_KEY ? 'configured' : 'NOT SET'
  });
});

app.listen(PORT, () => {
  console.log(`=== Consent Form Library API on port ${PORT} ===`);
  console.log(`=== SMARTSHEET_API_KEY: ${SS_API_KEY ? 'SET ✓' : 'NOT SET ✗'} ===`);
  console.log(`=== CODY_API_KEY: ${CODY_API_KEY ? 'SET ✓' : 'NOT SET ✗'} ===`);
  console.log(`=== CODY_BOT_ID: ${CODY_BOT_ID} ===`);
  console.log(`=== ALLOWED_ORIGINS: ${ALLOWED_ORIGINS.join(', ') || '(none — set ALLOWED_ORIGINS env var)'} ===`);
});
