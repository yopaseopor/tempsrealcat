// TMB Metro stations proxy endpoint for Vercel serverless function
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log('🚇 Fetching TMB Metro stations data from API...');

    // Get line code from query parameter, default to L1
    const lineCode = req.query.line || '1';

    const tmbUrl = `https://api.tmb.cat/v1/transit/linies/metro/${lineCode}/estacions?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1`;

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB Metro stations API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'TMB Metro stations API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB Metro stations data for line', lineCode);

    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB Metro stations data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch TMB Metro stations data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
