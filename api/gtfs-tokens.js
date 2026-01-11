// GTFS tokens API proxy endpoint for Vercel serverless function
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

  // Only allow POST requests for token requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log('🔑 Requesting GTFS access token from Mobility Database API...');

    const { refresh_token } = req.body || {};

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Missing refresh_token in request body',
        timestamp: new Date().toISOString()
      });
    }

    const response = await fetch('https://api.mobilitydatabase.org/v1/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenLocalMap-Proxy/1.0'
      },
      body: JSON.stringify({ refresh_token: refresh_token }),
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ Mobility Database token API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'Mobility Database token API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully obtained GTFS access token');

    res.json(data);
  } catch (error) {
    console.error('❌ Error requesting GTFS access token:', error.message);

    res.status(500).json({
      error: 'Failed to request GTFS access token',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
