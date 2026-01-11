// DGT Traffic API proxy endpoint for Vercel serverless function
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
    console.log('🚦 Fetching DGT traffic data from DATEX2 API...');

    // DGT DATEX2 XML endpoint for traffic situations
    const dgtUrl = 'https://infocar.dgt.es/datex2/sct/SituationPublication/all/content.xml';

    const response = await fetch(dgtUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ DGT API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'DGT API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const xmlData = await response.text();
    console.log('✅ Successfully fetched DGT traffic XML data');

    // Set appropriate headers for XML response
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching DGT traffic data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch DGT traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
