const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY = process.env.SMARTSHEET_API_KEY;
const SS_BASE    = 'https://api.smartsheet.com/2.0';

// ─── Smartsheet API proxy ────────────────────────────────────────────────────
app.get('/api/smartsheet/*', async (req, res) => {
  if (!SS_API_KEY) {
    return res.status(500).json({ error: 'SMARTSHEET_API_KEY environment variable not set.' });
  }

  const ssPath   = req.path.replace('/api/smartsheet', '');
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `${SS_BASE}${ssPath}${query}`;

  try {
    const ssResp = await fetch(upstream, {
      headers: {
        'Authorization': `Bearer ${SS_API_KEY}`,
        'Content-Type':  'application/json'
      }
    });
    const body = await ssResp.text();
    res.status(ssResp.status)
       .set('Content-Type', 'application/json')
       .send(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── Serve the app ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Consent Form Library running on port ${PORT}`);
});
