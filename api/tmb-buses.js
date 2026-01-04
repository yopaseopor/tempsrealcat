// TMB proxy for Vercel (CommonJS) — ensures CORS headers are always present
const https = require('https');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OpenLocalMap-Proxy/1.0', 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch (err) {
          reject(new Error('Invalid JSON from upstream: ' + err.message));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(30000, () => { req.abort(); reject(new Error('Upstream timeout')); });
  });
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const appId = process.env.TMB_APP_ID || '8029906b';
    const appKey = process.env.TMB_APP_KEY || '73b5ad24d1db9fa24988bf134a1523d1';
    const radius = req.query.radius || '1000';
    const lat = req.query.lat;
    const lon = req.query.lon;

    let tmbUrl = `https://api.tmb.cat/v1/ibus/stops/nearby?app_id=${appId}&app_key=${appKey}&radius=${radius}`;
    if (lat && lon) tmbUrl += `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

    const result = await getJson(tmbUrl);
    if (result.status && result.status >= 200 && result.status < 300) {
      return res.status(200).json(result.json);
    } else {
      return res.status(result.status || 502).json({ error: 'TMB upstream error', status: result.status });
    }
  } catch (err) {
    console.error('TMB proxy error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'TMB proxy failed', message: err.message });
  }
};
