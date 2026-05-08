const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const SS_API_KEY = process.env.SMARTSHEET_API_KEY;
const SS_BASE    = 'https://api.smartsheet.com/2.0';

// ─── Smartsheet API proxy ────────────────────────────────────────────────────
app.get('/api/smartsheet*', async (req, res) => {
  if (!SS_API_KEY) {
    return res.status(500).json({ error: 'SMARTSHEET_API_KEY environment variable not set.' });
  }

  // Strip /api/smartsheet to get the Smartsheet path
  const ssPath   = req.path.replace('/api/smartsheet', '');
  const query    = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstream = `${SS_BASE}${ssPath}${query}`;

  console.log(`[proxy] GET ${upstream}`);

  try {
    const ssResp = await fetch(upstream, {
      headers: {
        'Authorization': `Bearer ${SS_API_KEY}`,
        'Content-Type':  'application/json'
      }
    });
    const body = await ssResp.text();
    console.log(`[proxy] Response ${ssResp.status}`);
    res.status(ssResp.status)
       .set('Content-Type', 'application/json')
       .send(body);
  } catch (err) {
    console.error(`[proxy] Error: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

// ─── Serve static files from root ───────────────────────────────────────────
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Consent Form Library running on port ${PORT}`);
});
