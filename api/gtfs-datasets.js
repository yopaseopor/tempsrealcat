// GTFS datasets API proxy endpoint for Vercel serverless function
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
    console.log('📊 Fetching GTFS datasets from Mobility Database API...');

    // Build the API URL with query parameters
    let apiUrl = 'https://api.mobilitydatabase.org/v1/datasets';

    // Add query parameters if provided
    const queryParams = [];
    if (req.query.limit) queryParams.push(`limit=${req.query.limit}`);
    if (req.query.offset) queryParams.push(`offset=${req.query.offset}`);
    if (req.query.provider) queryParams.push(`provider=${encodeURIComponent(req.query.provider)}`);
    if (req.query.country) queryParams.push(`country=${encodeURIComponent(req.query.country)}`);

    if (queryParams.length > 0) {
      apiUrl += '?' + queryParams.join('&');
    }

    // Check if we have an authorization header from the client
    const authHeader = req.headers.authorization || req.headers['authorization'];

    const headers = {
      'User-Agent': 'OpenLocalMap-Proxy/1.0',
      'Accept': 'application/json'
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(apiUrl, {
      headers: headers,
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ Mobility Database datasets API returned ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        error: 'Mobility Database datasets API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched GTFS datasets data');

    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching GTFS datasets:', error.message);

    res.status(500).json({
      error: 'Failed to fetch GTFS datasets',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
