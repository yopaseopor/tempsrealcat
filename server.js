const express = require('express');
const path = require('path');
const app = express();

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

// Serve static files from the docs directory
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

// Handle all routes by serving index.html (for SPA routing)
// API routes are handled above, so this only handles non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
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
  console.log(`🔗 RENFE API proxy: http://localhost:${PORT}/api/renfe-trains`);
  console.log(`🔗 FGC API proxy: http://localhost:${PORT}/api/fgc-trains`);
  console.log(`🚍 TMB API proxy: http://localhost:${PORT}/api/tmb-buses`);
});
