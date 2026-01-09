// FGC API proxy endpoint for Vercel
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚆 Fetching FGC train data from API...');

    // FGC Open Data API endpoint
    const fgcUrl = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100';

    const response = await fetch(fgcUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ FGC API returned ${response.status}: ${response.statusText}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(response.status).json({
        error: 'FGC API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched FGC data:', data.results ? data.results.length : 0, 'trains');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error fetching FGC data:', error.message);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(500).json({
      error: 'Failed to fetch FGC data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}