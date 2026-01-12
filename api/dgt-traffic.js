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

    // Try multiple DGT API endpoints in case the primary one is down
    const dgtUrls = [
        'https://infocar.dgt.es/datex2.xml',
        'https://infocar.dgt.es/xml.xml',
        'https://www.dgt.es/incidencias/incidencias.xml',
        'https://dgt.es/incidencias.xml'
    ];

    let response = null;
    let lastError = null;

    // Try each URL until one works
    for (const url of dgtUrls) {
        try {
            console.log('🔄 Trying DGT URL:', url);
            const fetchResponse = await fetch(url, {
                headers: {
                    'User-Agent': 'OpenLocalMap-Traffic/1.0',
                    'Accept': 'application/xml, text/xml'
                },
                // Add timeout to avoid hanging
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (fetchResponse.ok) {
                response = fetchResponse;
                console.log('✅ DGT URL works:', url);
                break;
            } else {
                console.warn(`⚠️ DGT URL ${url} returned ${fetchResponse.status}`);
                lastError = `HTTP ${fetchResponse.status}`;
            }
        } catch (error) {
            console.warn(`❌ DGT URL ${url} failed:`, error.message);
            lastError = error.message;
        }
    }

    if (!response) {
        return res.status(404).json({
            error: 'DGT API unavailable',
            message: `All DGT API endpoints failed. Last error: ${lastError}`,
            triedUrls: dgtUrls,
            timestamp: new Date().toISOString()
        });
    }

    const xmlData = await response.text();
    console.log('✅ Successfully fetched DGT DATEX2 XML data');

    // Set proper content type for XML response
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(xmlData);

  } catch (error) {
    console.error('❌ Error fetching DGT traffic data:', error.message);

    res.status(500).json({
      error: 'Failed to fetch DGT traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
