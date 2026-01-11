// Bicing API proxy endpoint for Vercel serverless function
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
    console.log('🚴 Fetching Bicing station data from GBFS API...');

    // Barcelona GBFS (General Bikeshare Feed Specification) API endpoint
    const bicingUrl = 'https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_status';

    const response = await fetch(bicingUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Bicing GBFS API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'Bicing GBFS API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched Bicing GBFS data:', data.data?.stations?.length || 0, 'stations');

    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching Bicing GBFS data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch Bicing GBFS data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
