// DGT Traffic API proxy endpoint for Vercel
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚨 Fetching DGT traffic incidents from DATEX II API...');

    // DGT DATEX II API endpoint for traffic incidents
    const dgtUrl = 'https://infocar.dgt.es/datex2/sct/SituationPublication/all/content.xml';

    console.log('🌐 Fetching from URL:', dgtUrl);

    const response = await fetch(dgtUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

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
    console.log('✅ Successfully fetched DGT DATEX II traffic data');
    console.log('📏 Data length:', xmlData.length, 'characters');
    console.log('📄 First 200 chars:', xmlData.substring(0, 200));

    // Set content type for XML response
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(200).send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching DGT traffic data:', error.message);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(500).json({
      error: 'Failed to fetch DGT traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}