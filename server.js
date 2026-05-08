const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY = process.env.SMARTSHEET_API_KEY;
const SS_BASE    = 'https://api.smartsheet.com/2.0';

// Log every request
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.url}`);
  next();
});

// ─── Smartsheet API proxy (metadata, sheet data, attachment info) ─────────────
app.get('/api/smartsheet*', async (req, res) => {
  if (!SS_API_KEY) {
    return res.status(500).json({ error: 'SMARTSHEET_API_KEY not set.' });
  }
  const ssPath   = req.path.replace('/api/smartsheet', '') || '/';
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `${SS_BASE}${ssPath}${query}`;
  console.log(`[smartsheet proxy] ${upstream}`);
  try {
    const ssResp = await fetch(upstream, {
      headers: { 'Authorization': `Bearer ${SS_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const body = await ssResp.text();
    console.log(`[smartsheet proxy] HTTP ${ssResp.status}`);
    res.status(ssResp.status).set('Content-Type', 'application/json').send(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── PDF proxy — fetches the actual PDF bytes from S3 and returns them ────────
// This is needed because S3 signed URLs have CORS restrictions when loaded
// directly in the browser. We fetch server-side and pipe the bytes back.
app.get('/api/pdf-proxy', async (req, res) => {
  const pdfUrl = req.query.url;
  if (!pdfUrl) return res.status(400).send('Missing url parameter');

  // Only allow S3/Smartsheet URLs for security
  const allowed = ['https://s3.amazonaws.com', 'https://smartsheet-attachments.s3', 'https://sg-prod-attachments'];
  const isAllowed = allowed.some(domain => pdfUrl.startsWith(domain)) ||
                    pdfUrl.includes('.s3.amazonaws.com') ||
                    pdfUrl.includes('smartsheet');
  if (!isAllowed) {
    console.warn(`[pdf-proxy] Blocked URL: ${pdfUrl.substring(0, 80)}`);
    return res.status(403).send('URL not allowed');
  }

  console.log(`[pdf-proxy] Fetching PDF from S3`);
  try {
    const pdfResp = await fetch(pdfUrl);
    if (!pdfResp.ok) {
      console.error(`[pdf-proxy] S3 returned HTTP ${pdfResp.status}`);
      return res.status(pdfResp.status).send('PDF fetch failed');
    }
    const contentType = pdfResp.headers.get('content-type') || 'application/pdf';
    const buffer = await pdfResp.buffer();
    console.log(`[pdf-proxy] PDF fetched OK, ${buffer.length} bytes`);
    res.set('Content-Type', contentType)
       .set('Content-Disposition', 'inline')
       .set('Cache-Control', 'no-store')
       .send(buffer);
  } catch (err) {
    console.error(`[pdf-proxy] Error: ${err.message}`);
    res.status(502).send('PDF fetch error: ' + err.message);
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
});
