// Bicing API proxy endpoint for Vercel
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(response.status).json({
        error: 'Bicing GBFS API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched Bicing GBFS data:', data.data?.stations?.length || 0, 'stations');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error fetching Bicing GBFS data:', error.message);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(500).json({
      error: 'Failed to fetch Bicing GBFS data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}