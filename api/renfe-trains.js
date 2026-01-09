// RENFE API proxy endpoint for Vercel
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚂 Fetching RENFE train data from API...');

    // RENFE GTFS-RT JSON endpoint
    const renfeUrl = 'https://gtfsrt.renfe.com/vehicle_positions.json';

    const response = await fetch(renfeUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ RENFE API returned ${response.status}: ${response.statusText}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(response.status).json({
        error: 'RENFE API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched RENFE data:', data.entity ? data.entity.length : 0, 'trains');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error fetching RENFE data:', error.message);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(500).json({
      error: 'Failed to fetch RENFE data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}