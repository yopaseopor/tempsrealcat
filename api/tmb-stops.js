// TMB stops data proxy endpoint for Vercel serverless function
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
    console.log('🚏 Fetching TMB stops data from API...');

    // Use TMB transit parades endpoint for stops information
    const appId = process.env.TMB_APP_ID || '8029906b';
    const appKey = process.env.TMB_APP_KEY || '73b5ad24d1db9fa24988bf134a1523d1';

    const tmbUrl = `https://api.tmb.cat/v1/transit/parades?app_id=${appId}&app_key=${appKey}`;

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB stops API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'TMB stops API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB stops data');

    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB stops data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch TMB stops data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
