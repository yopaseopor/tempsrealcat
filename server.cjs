const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

// Import API routers

// Helper to set CORS headers on any response
function setCorsHeaders(res) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400');
}

// Enable CORS for all routes (must run before all other middleware)
app.use((req, res, next) => {
  // IMPORTANT: Set CORS headers immediately on every request
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400');

  // Respond to preflight requests
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.sendStatus(204);
  }
  next();
});

// Serve static files from the docs directory with explicit content-type for JS files
app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'docs')));

// RENFE API proxy endpoint
app.get('/api/renfe-trains', async (req, res) => {
  try {
    console.log('🚂 Fetching RENFE train data from API...');

    // RENFE GTFS-RT JSON endpoint
    const renfeUrl = 'https://gtfsrt.renfe.com/vehicle_positions.json';

    const response = await fetch(renfeUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ RENFE API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'RENFE API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched RENFE data:', data.entity ? data.entity.length : 0, 'trains');

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching RENFE data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch RENFE data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// FGC API proxy endpoint
app.get('/api/fgc-trains', async (req, res) => {
  try {
    console.log('🚆 Fetching FGC train data from API...');

    // FGC Open Data API endpoint
    const fgcUrl = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100';

    const response = await fetch(fgcUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ FGC API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'FGC API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched FGC data:', data.results ? data.results.length : 0, 'trains');

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching FGC data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch FGC data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TMB stops data proxy endpoint
app.get('/api/tmb-stops', async (req, res) => {
  try {
    console.log('🚏 Fetching TMB stops data from API...');

    // Use TMB transit parades endpoint for stops information
    const appId = process.env.TMB_APP_ID || '8029906b';
    const appKey = process.env.TMB_APP_KEY || '73b5ad24d1db9fa24988bf134a1523d1';

    const tmbUrl = `https://api.tmb.cat/v1/transit/parades?app_id=${appId}&app_key=${appKey}`;

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB stops API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'TMB stops API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB stops data');

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB stops data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch TMB stops data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TMB API proxy endpoint
app.get('/api/tmb-buses', async (req, res) => {
  try {
    console.log('🚇 Fetching TMB metro data from API...');

    // TMB iTransit API endpoint - same proxy structure as RENFE/FGC
    const tmbUrl = 'https://api.tmb.cat/v1/itransit/bus/parades/108?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'TMB API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB data for bus stop 108');

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch TMB data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TMB Metro stations proxy endpoint
app.get('/api/tmb-metro-stations', async (req, res) => {
  try {
    console.log('🚇 Fetching TMB Metro stations data from API...');

    // Get line code from query parameter, default to L1
    const lineCode = req.query.line || '1';

    const tmbUrl = `https://api.tmb.cat/v1/transit/linies/metro/${lineCode}/estacions?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1`;

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB Metro stations API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'TMB Metro stations API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB Metro stations data for line', lineCode);

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB Metro stations data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch TMB Metro stations data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TMB real-time bus arrivals proxy endpoint
app.get('/api/tmb-realtime', async (req, res) => {
  try {
    console.log('🚌 Fetching TMB real-time bus arrivals from API...');

    // Use TMB iTransit API for real-time bus arrivals at stops
    const appId = process.env.TMB_APP_ID || '8029906b';
    const appKey = process.env.TMB_APP_KEY || '73b5ad24d1db9fa24988bf134a1523d1';

    // Get stop ID from query or use Pl. Catalunya (108) as default
    const stopId = req.query.stopId || '108';

    // Use the verified TMB iTransit endpoint for bus stop arrivals
    const tmbUrl = `https://api.tmb.cat/v1/itransit/bus/parades/${stopId}?app_id=${appId}&app_key=${appKey}`;

    console.log('🚌 TMB API URL:', tmbUrl);

    const response = await fetch(tmbUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      console.warn(`⚠️ TMB API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'TMB API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched TMB real-time data for stop:', stopId);

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching TMB real-time data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch TMB real-time data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});



// Bicing API proxy endpoint
app.get('/api/bicing', async (req, res) => {
  try {
    console.log('🚴 Fetching Bicing station data from GBFS API...');

    // Barcelona GBFS (General Bikeshare Feed Specification) API endpoint
    const bicingUrl = 'https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_status';

    const response = await fetch(bicingUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout for Vercel
    });

    if (!response.ok) {
      console.warn(`⚠️ Bicing GBFS API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'Bicing GBFS API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    console.log('✅ Successfully fetched Bicing GBFS data:', data.data?.stations?.length || 0, 'stations');

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching Bicing GBFS data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch Bicing GBFS data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DGT Traffic API proxy endpoint
app.get('/api/dgt-traffic', async (req, res) => {
  try {
    console.log('🚦 Fetching DGT traffic data from DATEX2 API...');

    // DGT DATEX2 XML endpoint for traffic situations
    const dgtUrl = 'https://infocar.dgt.es/datex2/sct/SituationPublication/all/content.xml';

    const response = await fetch(dgtUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml'
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      console.warn(`⚠️ DGT API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
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
    setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching DGT traffic data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch DGT traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GENCAT RSS Traffic API proxy endpoint
app.get('/api/gencat-rss-traffic', async (req, res) => {
  try {
    console.log('🚦 Fetching GENCAT RSS traffic data...');

    // GENCAT RSS XML endpoint for traffic incidents
    const gencatRssUrl = 'http://www.gencat.cat/transit/opendata/incidenciesRSS.xml';

    const response = await fetch(gencatRssUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml'
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      console.warn(`⚠️ GENCAT RSS API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
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
    setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching GENCAT RSS traffic data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch GENCAT RSS traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GENCAT GML Traffic API proxy endpoint
app.get('/api/gencat-gml-traffic', async (req, res) => {
  try {
    console.log('🚦 Fetching GENCAT GML traffic data...');

    // GENCAT GML XML endpoint for traffic incidents
    const gencatGmlUrl = 'https://www.gencat.cat/transit/opendata/incidenciesGML.xml';

    const response = await fetch(gencatGmlUrl, {
      headers: {
        'User-Agent': 'OpenLocalMap-Proxy/1.0',
        'Accept': 'application/xml, text/xml'
      },
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      console.warn(`⚠️ GENCAT GML API returned ${response.status}: ${response.statusText}`);
      setCorsHeaders(res);
      return res.status(response.status).json({
        error: 'GENCAT GML API error',
        status: response.status,
        message: response.statusText,
        timestamp: new Date().toISOString()
      });
    }

    const xmlData = await response.text();
    console.log('✅ Successfully fetched GENCAT GML traffic XML data');

    // Set appropriate headers for XML response
    setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xmlData);
  } catch (error) {
    console.error('❌ Error fetching GENCAT GML traffic data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to fetch GENCAT GML traffic data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Geocoding API proxy endpoint using Overpass
app.get('/api/geocode-road', async (req, res) => {
  try {
    const roadRef = req.query.ref;
    const placeName = req.query.place;

    if (!roadRef) {
      setCorsHeaders(res);
      return res.status(400).json({
        error: 'Missing road reference parameter',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🗺️ Geocoding road ${roadRef} near Catalonia...`);

    // Try multiple Overpass servers to avoid timeouts
    const overpassServers = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter'
    ];

    let coordinates = null;
    let serverUsed = null;

    for (const server of overpassServers) {
      try {
        // Build Overpass query to find highway with matching ref tag
        const overpassQuery = `
          [out:json][timeout:20];
          way["highway"]["ref"="${roadRef}"](around:50000,41.5912,1.5209);
          out center;
        `;

        const response = await fetch(server, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'OpenLocalMap-Proxy/1.0'
          },
          body: `data=${encodeURIComponent(overpassQuery)}`,
          signal: AbortSignal.timeout(15000) // 15 second timeout per server
        });

        if (response.ok) {
          const data = await response.json();

          if (data.elements && data.elements.length > 0) {
            const element = data.elements[0];
            coordinates = {
              lat: element.center ? element.center.lat : element.lat,
              lng: element.center ? element.center.lon : element.lon
            };
            serverUsed = server;
            console.log(`✅ Geocoded ${roadRef} using ${serverUsed}: ${coordinates.lat}, ${coordinates.lng}`);
            break;
          }
        }

      } catch (error) {
        console.warn(`⚠️ Overpass server ${server} failed:`, error.message);
        continue;
      }
    }

    if (!coordinates) {
      console.log(`❌ No coordinates found for road ${roadRef}`);
      setCorsHeaders(res);
      return res.status(404).json({
        error: 'Road not found in OpenStreetMap',
        roadRef: roadRef,
        timestamp: new Date().toISOString()
      });
    }

    setCorsHeaders(res);
    res.json({
      roadRef: roadRef,
      coordinates: coordinates,
      source: 'OpenStreetMap',
      server: serverUsed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error geocoding road:', error.message);

    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to geocode road',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Configurable CORS Proxy endpoint - supports any URL with custom options
app.get('/api/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const method = req.query.method || 'GET';
    const timeout = parseInt(req.query.timeout) || 30000; // Default 30 seconds
    const userAgent = req.query.userAgent || 'OpenLocalMap-Proxy/1.0';

    if (!targetUrl) {
      setCorsHeaders(res);
      return res.status(400).json({
        error: 'Missing target URL parameter',
        usage: '/api/proxy?url=https://example.com/api/data&method=GET&timeout=30000&userAgent=Custom-UA',
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL format
    try {
      new URL(targetUrl);
    } catch (error) {
      setCorsHeaders(res);
      return res.status(400).json({
        error: 'Invalid URL format',
        url: targetUrl,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🌐 Proxying ${method} request to: ${targetUrl}`);

    // Prepare axios config
    const axiosConfig = {
      method: method.toUpperCase(),
      url: targetUrl,
      timeout: timeout,
      headers: {
        'User-Agent': userAgent,
        'Accept': req.query.accept || '*/*'
      },
      responseType: 'arraybuffer' // Handle binary data
    };

    // Add custom headers if provided
    if (req.query.headers) {
      try {
        const customHeaders = JSON.parse(req.query.headers);
        axiosConfig.headers = { ...axiosConfig.headers, ...customHeaders };
      } catch (error) {
        console.warn('⚠️ Invalid headers JSON, using default headers');
      }
    }

    // Add request body for POST/PUT/PATCH if provided
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && req.query.body) {
      axiosConfig.data = req.query.body;
      // Set content-type for body data
      if (!axiosConfig.headers['Content-Type']) {
        axiosConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const response = await axios(axiosConfig);

    // Set response headers
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    setCorsHeaders(res);
    res.setHeader('Content-Type', contentType);

    // Copy other relevant headers
    const headersToCopy = ['content-length', 'cache-control', 'expires', 'last-modified'];
    headersToCopy.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    console.log(`✅ Successfully proxied request: ${response.status} ${contentType}`);

    // Send response data
    res.status(response.status).send(response.data);

  } catch (error) {
    console.error('❌ Error proxying request:', error.message);

    setCorsHeaders(res);
    if (error.response) {
      // Server responded with error status
      res.status(error.response.status).json({
        error: 'Target server error',
        status: error.response.status,
        message: error.response.statusText || error.message,
        url: req.query.url,
        timestamp: new Date().toISOString()
      });
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      res.status(408).json({
        error: 'Request timeout',
        message: `Request timed out after ${req.query.timeout || 30000}ms`,
        url: req.query.url,
        timestamp: new Date().toISOString()
      });
    } else {
      // Other error
      res.status(500).json({
        error: 'Proxy error',
        message: error.message,
        url: req.query.url,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Handle all routes by serving index.html (for SPA routing)
// API routes are handled above, so this only handles non-API routes
app.use((req, res, next) => {
  // Only serve index.html for GET requests that don't start with /api
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'));
  } else {
    next();
  }
});

// Error handler MUST be defined last (with 4 parameters)
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 OpenLocalMap server running on http://localhost:${PORT}`);
  console.log(`🚂 RENFE API proxy: http://localhost:${PORT}/api/renfe-trains`);
  console.log(`🚆 FGC API proxy: http://localhost:${PORT}/api/fgc-trains`);
  console.log(`🚏 TMB stops API proxy: http://localhost:${PORT}/api/tmb-stops`);
  console.log(`🚌 TMB real-time API proxy: http://localhost:${PORT}/api/tmb-realtime`);
  console.log(`🚍 TMB API proxy: http://localhost:${PORT}/api/tmb-buses`);
  console.log(`🚴 Bicing API proxy: http://localhost:${PORT}/api/bicing`);
  console.log(`🚦 DGT Traffic API proxy: http://localhost:${PORT}/api/dgt-traffic`);
  console.log(`🚦 GENCAT RSS Traffic API proxy: http://localhost:${PORT}/api/gencat-rss-traffic`);
  console.log(`🚦 GENCAT GML Traffic API proxy: http://localhost:${PORT}/api/gencat-gml-traffic`);
  console.log(`🌐 Configurable CORS Proxy: http://localhost:${PORT}/api/proxy?url=[target-url]`);
});
