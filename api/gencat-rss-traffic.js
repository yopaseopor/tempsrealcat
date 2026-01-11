// GENCAT RSS Traffic API proxy endpoint for Vercel serverless function
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
    console.log('🚦 Fetching GENCAT RSS traffic data...');

    // GENCAT RSS XML endpoint for traffic incidents
    const gencatRssUrl = 'http://www.gencat.cat/transit/opendata/incidenciesRSS.xml';

    const response = await fetch(gencatRssUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ GENCAT RSS API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'GENCAT RSS API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const xmlData = await response.text();
    console.log('✅ Successfully fetched GENCAT RSS traffic XML data');

    // Set appropriate headers for XML response
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching GENCAT RSS traffic data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch GENCAT RSS traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
