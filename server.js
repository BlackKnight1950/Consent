const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY = process.env.SMARTSHEET_API_KEY;
const SS_BASE    = 'https://api.smartsheet.com/2.0';

// Log every incoming request so we can see what's happening
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.url}`);
  next();
});

// ─── Smartsheet API proxy ────────────────────────────────────────────────────
app.get('/api/smartsheet*', async (req, res) => {
  if (!SS_API_KEY) {
    console.error('[proxy] ERROR: SMARTSHEET_API_KEY not set');
    return res.status(500).json({ error: 'SMARTSHEET_API_KEY environment variable not set.' });
  }

  // Build upstream URL
  const ssPath   = req.path.replace('/api/smartsheet', '') || '/';
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `${SS_BASE}${ssPath}${query}`;

  console.log(`[proxy] Forwarding to: ${upstream}`);

  try {
    const ssResp = await fetch(upstream, {
      headers: {
        'Authorization': `Bearer ${SS_API_KEY}`,
        'Content-Type':  'application/json'
      }
    });

    const body = await ssResp.text();
    console.log(`[proxy] Smartsheet responded: HTTP ${ssResp.status}`);

    res.status(ssResp.status)
       .set('Content-Type', 'application/json')
       .send(body);

  } catch (err) {
    console.error(`[proxy] Fetch error: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

// ─── Serve static files ──────────────────────────────────────────────────────
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=== Consent Form Library running on port ${PORT} ===`);
  console.log(`=== SMARTSHEET_API_KEY: ${SS_API_KEY ? 'SET ✓' : 'NOT SET ✗'} ===`);
});
