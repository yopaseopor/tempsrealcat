const express = require('express');
const path = require('path');
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

// Serve static files from the docs directory with explicit content-type and cache control
app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }

  // Prevent caching of HTML and JS files during development
  if (req.path.endsWith('.html') || req.path.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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

    // Try multiple TMB API endpoints for bus stops
    const endpoints = [
      'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search?resource_id=0d3e10b6-9acc-4e1d-8e7d-7c1d35e8e5b8&limit=100',
      'https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download',
      'https://api.tmb.cat/v1/transit/parades?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1'
    ];

    let data = null;
    let success = false;

    for (const tmbUrl of endpoints) {
      try {
        console.log('🔄 Trying TMB endpoint:', tmbUrl.split('/').pop());

        const response = await fetch(tmbUrl, {
          headers: {
            'User-Agent': 'OpenLocalMap-Proxy/1.0',
            'Accept': 'application/json'
          },
          timeout: 15000
        });

        if (response.ok) {
          data = await response.json();
          console.log('✅ Successfully fetched TMB stops data from:', tmbUrl.split('/').pop());
          success = true;
          break;
        } else {
          console.warn(`⚠️ TMB endpoint ${tmbUrl.split('/').pop()} returned ${response.status}`);
        }
      } catch (endpointError) {
        console.warn(`❌ Failed to fetch from ${tmbUrl.split('/').pop()}:`, endpointError.message);
        continue;
      }
    }

    if (!success || !data) {
      console.error('❌ All TMB API endpoints failed');
      setCorsHeaders(res);
      return res.status(503).json({
        error: 'TMB API unavailable',
        message: 'Unable to fetch real TMB stops data from any endpoint',
        timestamp: new Date().toISOString()
      });
    }

    setCorsHeaders(res);
    res.json(data);
  } catch (error) {
    console.error('❌ Error in TMB stops API proxy:', error.message);
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



// Bus API proxy endpoint
app.get('/api/bus-realtime', async (req, res) => {
  try {
    console.log('🚌 Generating mock bus data for testing...');

    // For now, return mock data to test the frontend functionality
    // TODO: Replace with real TMB API integration when available
    const mockData = {
      entity: [
        {
          id: 'BUS_V15-001',
          vehicle: {
            trip: {
              tripId: 'v15_trip_001_' + Date.now(),
              route_id: 'V15',
              startTime: '12:00:00',
              startDate: new Date().toISOString().split('T')[0].replace(/-/g, '')
            },
            position: {
              latitude: 41.3851 + (Math.random() - 0.5) * 0.01,
              longitude: 2.1734 + (Math.random() - 0.5) * 0.01,
              bearing: Math.random() * 360,
              speed: Math.random() * 30 + 15
            },
            vehicle: {
              id: 'V15-001',
              label: 'V15-001-PLATF.(1)'
            }
          }
        },
        {
          id: 'BUS_59-002',
          vehicle: {
            trip: {
              tripId: '59_trip_002_' + Date.now(),
              route_id: '59',
              startTime: '12:05:00',
              startDate: new Date().toISOString().split('T')[0].replace(/-/g, '')
            },
            position: {
              latitude: 41.3871 + (Math.random() - 0.5) * 0.01,
              longitude: 2.1754 + (Math.random() - 0.5) * 0.01,
              bearing: Math.random() * 360,
              speed: Math.random() * 25 + 10
            },
            vehicle: {
              id: '59-002',
              label: '59-002-PLATF.(2)'
            }
          }
        },
        {
          id: 'BUS_7-003',
          vehicle: {
            trip: {
              tripId: '7_trip_003_' + Date.now(),
              route_id: '7',
              startTime: '12:10:00',
              startDate: new Date().toISOString().split('T')[0].replace(/-/g, '')
            },
            position: {
              latitude: 41.3831 + (Math.random() - 0.5) * 0.01,
              longitude: 2.1714 + (Math.random() - 0.5) * 0.01,
              bearing: Math.random() * 360,
              speed: Math.random() * 35 + 20
            },
            vehicle: {
              id: '7-003',
              label: '7-003-PLATF.(1)'
            }
          }
        }
      ]
    };

    console.log('✅ Returning mock bus data:', mockData.entity.length, 'buses');

    setCorsHeaders(res);
    res.json(mockData);
  } catch (error) {
    console.error('❌ Error generating mock bus data:', error.message);

    // Return error response with explicit CORS headers
    setCorsHeaders(res);
    res.status(500).json({
      error: 'Failed to generate bus data',
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
  console.log(` RENFE API proxy: http://localhost:${PORT}/api/renfe-trains`);
  console.log(`🔗 FGC API proxy: http://localhost:${PORT}/api/fgc-trains`);
  console.log(`🚏 TMB stops API proxy: http://localhost:${PORT}/api/tmb-stops`);
  console.log(`🚌 TMB real-time API proxy: http://localhost:${PORT}/api/tmb-realtime`);
  console.log(`🚍 TMB API proxy: http://localhost:${PORT}/api/tmb-buses`);
  console.log(`🚌 Bus real-time API proxy: http://localhost:${PORT}/api/bus-realtime`);
  console.log(`🚴 Bicing API proxy: http://localhost:${PORT}/api/bicing`);
});
