// Geocoding API proxy endpoint using Overpass for Vercel serverless function
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
    const roadRef = req.query.ref;
    const placeName = req.query.place;

    if (!roadRef) {
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
          body: `data=${encodeURIComponent(overpassQuery)}`
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
      return res.status(404).json({
        error: 'Road not found in OpenStreetMap',
        roadRef: roadRef,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      roadRef: roadRef,
      coordinates: coordinates,
      source: 'OpenStreetMap',
      server: serverUsed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error geocoding road:', error.message);

    res.status(500).json({
      error: 'Failed to geocode road',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
