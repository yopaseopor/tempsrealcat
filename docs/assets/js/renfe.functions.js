//RENFE
// Decode RENFE JSON data format
function decodeRenfeJsonData(jsonData) {
    try {
        if (!jsonData || !jsonData.entity) {
            console.warn('Invalid JSON data format from RENFE');
            return null;
        }

        var trains = [];
        jsonData.entity.forEach(function(entity) {
            if (entity.vehicle && entity.vehicle.position) {
                var vehicle = entity.vehicle;
                var position = entity.vehicle.position;

                // RENFE coordinates are already in decimal degrees format, not E7
                var lat = position.latitude || 0;
                var lng = position.longitude || 0;

                // Ensure coordinates are valid numbers
                if (typeof lat === 'number' && typeof lng === 'number' &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                    // Extract route information with better handling
                    var routeId = 'Unknown';
                    if (vehicle.trip && vehicle.trip.route_id) {
                        routeId = vehicle.trip.route_id;
                        console.log('✅ Found route_id:', routeId, 'for train:', entity.id);
                    } else {
                        // Try to extract route from vehicle label
                        var label = vehicle.vehicle ? vehicle.vehicle.label : null;
                        if (label) {
                            // More comprehensive route extraction patterns
                            // Try patterns like: C2-23055, R1-12345, AVE-001, etc.
                            var routeMatch = label.match(/^([A-Z]+[-\s]?\d+|[A-Z]\d*|[A-Z]{3,})/);
                            if (routeMatch) {
                                routeId = routeMatch[1].replace(/\s/g, ''); // Remove spaces
                                console.log('✅ Extracted route from label:', routeId, 'for train:', entity.id, 'label:', label);
                            } else {
                                // Try to find any route-like pattern
                                var altMatch = label.match(/([CR]\d+|[A-Z]{3,})/);
                                if (altMatch) {
                                    routeId = altMatch[1];
                                    console.log('✅ Alternative route extraction:', routeId, 'for train:', entity.id, 'label:', label);
                                } else {
                                    console.log('❌ No route pattern found in label for train:', entity.id, 'label:', label);
                                }
                            }
                        } else {
                            console.log('❌ No route_id or label found for train:', entity.id, 'trip:', vehicle.trip);
                        }
                    }

                    // Normalize route IDs for consistency
                    if (routeId !== 'Unknown') {
                        // Ensure consistent formatting (e.g., C2 -> C2, C-2 -> C-2)
                        routeId = routeId.replace(/^C(\d+)$/, 'C$1'); // C2 stays C2
                        routeId = routeId.replace(/^R(\d+)$/, 'R$1'); // R1 stays R1
                        console.log('🔄 Normalized route:', routeId, 'for train:', entity.id);
                    }

                    trains.push({
                        // Basic train identification
                        id: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
                        label: vehicle.vehicle ? vehicle.vehicle.label : null,

                        // Geographic position (GPS coordinates)
                        lat: lat,
                        lng: lng,

                        // Movement data
                        speed: position.speed ? position.speed / 100 : 0, // Convert from cm/s to km/h
                        bearing: position.bearing || 0, // Direction in degrees (0-360)

                        // Route and trip information
                        route: routeId,
                        tripId: vehicle.trip ? vehicle.trip.tripId : null,
                        startTime: vehicle.trip ? vehicle.trip.startTime : null,
                        startDate: vehicle.trip ? vehicle.trip.startDate : null,

                        // Operational status
                        status: vehicle.currentStatus || 'Unknown',
                        stopId: vehicle.stopId || null,

                        // Metadata
                        timestamp: vehicle.timestamp || null,
                        congestionLevel: position.congestionLevel || null,
                        occupancyStatus: position.occupancyStatus || null
                    });
                } else {
                    console.warn('Invalid coordinates for train:', entity.id, lat, lng);
                }
            }
        });

        return trains;
    } catch (error) {
        console.error('Error decoding RENFE JSON data:', error);
        return null;
    }
}

// Fetch real-time train positions
function fetchRealtimeTrains() {
    // Detect deployment environment
    var hostname = window.location.hostname;
    var isGitHubPages = hostname.includes('github.io');
    var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

    // Use appropriate API endpoint based on environment
    var apiUrl;
    if (isVercel) {
        // Use Vercel-deployed API
        apiUrl = '/api/renfe-trains';
        console.log('🚂 Fetching RENFE data via Vercel API...');
    } else if (isGitHubPages) {
        // On GitHub Pages, use our Vercel deployment as proxy
        var vercelUrl = 'https://openlocalmap2-a2bfnl66b-yopaseopors-projects.vercel.app';
        apiUrl = vercelUrl + '/api/renfe-trains';
        console.log('🚂 Fetching RENFE data via Vercel proxy from GitHub Pages...');
    } else {
        // Local development
        apiUrl = '/api/renfe-trains';
        console.log('🚂 Fetching RENFE data via local proxy server...');
    }

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('API proxy failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(jsonData => {
            console.log('✅ API proxy succeeded! Processing RENFE data...');

            // Check if the response contains an error
            if (jsonData.error) {
                throw new Error('API Error: ' + jsonData.message);
            }

            var decodedTrains = decodeRenfeJsonData(jsonData);
            if (decodedTrains && decodedTrains.length > 0) {
                console.log('🚂 SUCCESS: Retrieved', decodedTrains.length, 'REAL RENFE trains via API proxy!');
                return decodedTrains;
            } else {
                console.warn('Proxy returned data but no trains found');
                throw new Error('No train data available from RENFE API');
            }
        })
        .catch(error => {
            console.error('❌ API proxy failed:', error.message);

            // Fallback options
            if (isGitHubPages) {
                // On GitHub Pages, direct to manual entry if Vercel proxy fails
                alert('🚂 Vercel API proxy unavailable. Use manual data entry:\n\n1. Open: https://gtfsrt.renfe.com/vehicle_positions.json\n2. Copy JSON data (Ctrl+A, Ctrl+C)\n3. Click "📝 Introduir Dades Manualment"\n4. Paste and click "Processar Dades Reals"');
                return Promise.resolve([]);
            } else if (isVercel) {
                // On Vercel, show manual fallback option
                alert('🚂 API proxy temporarily unavailable. Use manual data entry:\n\n1. Open: https://gtfsrt.renfe.com/vehicle_positions.json\n2. Copy JSON data\n3. Use "📝 Introduir Dades Manualment"');
                return Promise.resolve([]);
            } else {
                // Local development fallback to external CORS proxies
                console.log('🔄 Falling back to external CORS proxies...');
                return fetchRealtimeTrainsFallback();
            }
        });
}

// Fallback function using external CORS proxies (backup method)
function fetchRealtimeTrainsFallback() {
    var corsProxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ];

    var renfeJsonUrl = 'https://gtfsrt.renfe.com/vehicle_positions.json';

    function tryNextProxy(proxyIndex) {
        if (proxyIndex >= corsProxies.length) {
            console.warn('All CORS proxies failed - no mock data available');
            alert('🚂 Unable to load real RENFE train data.\n\nLocal proxy server may not be running, and all external CORS proxies failed.\n\nPlease:\n1. Ensure the Node.js server is running (npm start)\n2. Or use the manual data entry option below.');
            return Promise.resolve([]);
        }

        var proxy = corsProxies[proxyIndex];
        var fullUrl = proxy + renfeJsonUrl;

        console.log('🔄 Trying CORS proxy:', proxy);

        return fetch(fullUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Proxy failed: ' + response.status);
                }
                return response.json();
            })
            .then(jsonData => {
                console.log('✅ CORS proxy', proxy, 'succeeded! Processing real RENFE data...');
                var decodedTrains = decodeRenfeJsonData(jsonData);
                if (decodedTrains && decodedTrains.length > 0) {
                    console.log('🚂 SUCCESS: Displaying', decodedTrains.length, 'REAL RENFE trains via CORS proxy!');
                    return decodedTrains;
                } else {
                    console.warn('Proxy returned data but no trains found');
                    return tryNextProxy(proxyIndex + 1);
                }
            })
            .catch(error => {
                console.warn('❌ CORS proxy', proxy, 'failed:', error.message);
                return tryNextProxy(proxyIndex + 1);
            });
    }

    return tryNextProxy(0);
}

// Decode GTFS-RT Protocol Buffer data
function decodeGtfsRealtimeBuffer(buffer) {
    try {
        // Check if protobuf definitions are loaded
        if (!protobuf || !protobuf.roots || !protobuf.roots.gtfsrt) {
            console.warn('GTFS-RT protobuf definitions not loaded, using mock data');
            return null;
        }

        // Use protobuf.js to decode the buffer
        var FeedMessage = protobuf.roots.gtfsrt.FeedMessage;
        var feed = FeedMessage.decode(new Uint8Array(buffer));

        var trains = [];
        feed.entity.forEach(function(entity) {
            if (entity.vehicle && entity.vehicle.position) {
                var vehicle = entity.vehicle;
                var position = vehicle.position;

                trains.push({
                    id: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
                    lat: position.latitude,
                    lng: position.longitude,
                    speed: vehicle.position.speed || 0,
                    bearing: vehicle.position.bearing || 0,
                    route: vehicle.trip ? vehicle.trip.route_id : 'Unknown'
                });
            }
        });

        return trains;
    } catch (error) {
        console.error('Error decoding GTFS-RT buffer:', error);
        console.log('Falling back to mock train data for demonstration');
        return null; // Return null to trigger mock data fallback
    }
}

// Generate mock train positions for demonstration (only used when real data unavailable)


// Try to get real RENFE data using a server-side proxy approach
function tryRealRenfeData() {
    // This would require a backend server to proxy the request
    // Example Node.js/Express server code that would work:

    /*
    const express = require('express');
    const cors = require('cors');
    const fetch = require('node-fetch');

    const app = express();
    app.use(cors());

    app.get('/api/renfe-trains', async (req, res) => {
        try {
            const response = await fetch('https://gtfsrt.renfe.com/vehicle_positions.pb');
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch RENFE data'});
        }
    });

    app.listen(3001, () => console.log('Proxy server running on port 3001'));
    */

    // Since we don't have a backend server, we fall back to mock data
    console.log('Real RENFE data requires a backend proxy server. Using demonstration data.');
    return Promise.resolve([]);
}

// Display train positions on map with colored route visualization
function displayRealtimeTrains(trains) {
    console.log('🚂 DISPLAYING', trains.length, 'TRAINS ON MAP...');

    // Clear existing markers and layers
    realtimeTrainMarkers.forEach(function(marker) {
        try {
            map.removeLayer(marker);
        } catch (e) {}
    });
    realtimeTrainMarkers = [];

    // Group trains by route for better visualization
    var trainsByRoute = {};
    trains.forEach(function(train) {
        if (train.route && train.route !== 'Unknown') {
            if (!trainsByRoute[train.route]) {
                trainsByRoute[train.route] = [];
            }
            trainsByRoute[train.route].push(train);
        } else {
            // Put unknown routes in a separate group
            if (!trainsByRoute['Unknown']) {
                trainsByRoute['Unknown'] = [];
            }
            trainsByRoute['Unknown'].push(train);
        }
    });

// Define colors and names for different RENFE routes - using official RENFE colors from Wikipedia/OSM
    var routeInfo = {
        // Cercanías Madrid (Official colors)
        'C1': {name: 'C-1', color: '#E4007C'},   // Pink/Magenta
        'C2': {name: 'C-2', color: '#009EE3'},   // Blue
        'C3': {name: 'C-3', color: '#F8B80E'},   // Yellow
        'C4': {name: 'C-4', color: '#8BC53F'},   // Green
        'C5': {name: 'C-5', color: '#9B59B6'},   // Purple
        'C6': {name: 'C-6', color: '#9B59B6'},   // Purple (same as C5)
        'C7': {name: 'C-7', color: '#FF6B35'},   // Orange/Red
        'C8': {name: 'C-8', color: '#00A0E9'},   // Light Blue
        'C9': {name: 'C-9', color: '#8BC53F'},   // Green
        'C10': {name: 'C-10', color: '#E4007C'}, // Pink/Magenta

        // Cercanías with hyphens
        'C-1': {name: 'C-1', color: '#E4007C'},   // Pink/Magenta
        'C-2': {name: 'C-2', color: '#009EE3'},   // Blue
        'C-3': {name: 'C-3', color: '#F8B80E'},   // Yellow
        'C-4': {name: 'C-4', color: '#8BC53F'},   // Green
        'C-5': {name: 'C-5', color: '#9B59B6'},   // Purple
        'C-6': {name: 'C-6', color: '#9B59B6'},   // Purple (same as C5)
        'C-7': {name: 'C-7', color: '#FF6B35'},   // Orange/Red
        'C-8': {name: 'C-8', color: '#00A0E9'},   // Light Blue
        'C-9': {name: 'C-9', color: '#8BC53F'},   // Green
        'C-10': {name: 'C-10', color: '#E4007C'}, // Pink/Magenta

        // AVE (High-Speed) - Official RENFE red
        'AVE': {name: 'AVE', color: '#E4007C'}, // RENFE Red
        'AVANT': {name: 'Avant', color: '#009EE3'}, // Blue
        'ALVIA': {name: 'Alvia', color: '#8BC53F'}, // Green
        'AV City': {name: 'AVE', color: '#E4007C'}, // RENFE Red

        // Media Distancia (Medium Distance)
        'MD': {name: 'MD', color: '#F8B80E'}, // Yellow
        'Regional': {name: 'Regional', color: '#009EE3'}, // Blue
        'MD-LD': {name: 'MD', color: '#F8B80E'}, // Yellow

        // Rodalies Barcelona - Official colors from Wikipedia (ca.wikipedia.org/wiki/Rodalies_de_Catalunya)
        'R1': {name: 'R1', color: '#0066CC'}, // Blue
        'R2': {name: 'R2', color: '#009933'}, // Green
        'R2S': {name: 'R2 Sud', color: '#009933'}, // Green
        'R2N': {name: 'R2 Nord', color: '#009933'}, // Green
        'R3': {name: 'R3', color: '#CC0000'}, // Red
        'R4': {name: 'R4', color: '#FFCC00'}, // Yellow
        'R5': {name: 'R5', color: '#660099'}, // Purple
        'R6': {name: 'R6', color: '#0099CC'}, // Light Blue
        'R7': {name: 'R7', color: '#FF6600'}, // Orange
        'R8': {name: 'R8', color: '#666666'}, // Gray
        'R9': {name: 'R9', color: '#CC0000'}, // Red
        'R10': {name: 'R10', color: '#660099'}, // Purple
        'R11': {name: 'R11', color: '#0066CC'}, // Blue
        'R12': {name: 'R12', color: '#009933'}, // Green
        'R13': {name: 'R13', color: '#FFCC00'}, // Yellow
        'R14': {name: 'R14', color: '#FF6600'}, // Orange
        'R15': {name: 'R15', color: '#0099CC'}, // Light Blue
        'R16': {name: 'R16', color: '#660099'}, // Purple
        'R17': {name: 'R17', color: '#666666'}, // Gray

        // Other regional routes
        'FEVE': {name: 'FEVE', color: '#8BC53F'}, // Green

        // Additional patterns that might appear in real data
        '1': {name: 'Línia 1', color: '#FF6B6B'}, // Red
        '2': {name: 'Línia 2', color: '#4ECDC4'}, // Teal
        '3': {name: 'Línia 3', color: '#45B7D1'}, // Blue
        '4': {name: 'Línia 4', color: '#FFA07A'}, // Light Salmon
        '5': {name: 'Línia 5', color: '#98D8C8'}, // Mint
        '6': {name: 'Línia 6', color: '#F7DC6F'}, // Yellow
        '7': {name: 'Línia 7', color: '#BB8FCE'}, // Purple
        '8': {name: 'Línia 8', color: '#85C1E9'}, // Light Blue
        '9': {name: 'Línia 9', color: '#F8C471'}, // Orange
        '10': {name: 'Línia 10', color: '#95A5A6'}, // Gray

        'Unknown': {name: 'Línia desconeguda', color: '#95A5A6'} // Gray
    };

    var totalTrains = 0;

    // Create markers for each train, grouped by route
    Object.keys(trainsByRoute).forEach(function(routeId) {
        var routeTrains = trainsByRoute[routeId];
        var routeData = routeInfo[routeId];
        if (!routeData) {
            // Use the route code directly if not in mapping
            routeData = {
                name: routeId,
                color: '#95A5A6' // Gray for unknown routes
            };
        }
        var routeColor = routeData.color;
        var routeName = routeData.name;

        routeTrains.forEach(function(train) {
            if (train.lat && train.lng && !isNaN(train.lat) && !isNaN(train.lng)) {
                // Create modern train icon with colored route label
                var marker = L.marker([train.lat, train.lng], {
                    icon: L.divIcon({
                        html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                              '<path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z" fill="#666"/>' +
                              '<rect x="7" y="16" width="10" height="4" rx="1" fill="#333"/>' +
                              '<circle cx="9" cy="20" r="1.5" fill="#666"/>' +
                              '<circle cx="15" cy="20" r="1.5" fill="#666"/>' +
                              '<rect x="9" y="18" width="6" height="2" rx="0.5" fill="#999"/>' +
                              '</svg>' +
                              '<div style="position: absolute; top: -6px; left: 50%; transform: translateX(-50%); ' +
                              'background: ' + routeColor + '; color: white; font-size: 9px; font-weight: bold; ' +
                              'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                              routeName + '</div>',
                        className: 'train-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 20]
                    })
                });

                // Enhanced popup with route information and color coding
                var statusText = '';
                switch(train.status) {
                    case 'IN_TRANSIT_TO': statusText = '🟢 En ruta'; break;
                    case 'STOPPED_AT': statusText = '🟡 Aturat'; break;
                    case 'INCOMING_AT': statusText = '🟠 Arribant'; break;
                    default: statusText = '⚪ ' + (train.status || 'Desconegut');
                }

                marker.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 220px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + routeColor + '; border-bottom: 2px solid ' + routeColor + '; padding-bottom: 4px;">' +
                    '🚆 Tren ' + (train.id || 'Desconegut') + '</h4>' +
                    '<div style="background: ' + routeColor + '15; border: 1px solid ' + routeColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Línia:</strong> <span style="color: ' + routeColor + '; font-weight: bold;">' + routeName + '</span><br>' +
                    '<strong>Codi ruta:</strong> ' + routeId + '<br>' +
                    '<strong>Estat:</strong> ' + statusText + '<br>' +
                    '<strong>Velocitat:</strong> ' + (train.speed ? train.speed.toFixed(1) + ' km/h' : 'N/A') + '<br>' +
                    '<strong>Direcció:</strong> ' + (train.bearing ? train.bearing + '°' : 'N/A') + '<br>' +
                    '<strong>Posició:</strong> ' + train.lat.toFixed(4) + ', ' + train.lng.toFixed(4) +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🕒 Actualitzat: ' + new Date().toLocaleTimeString('ca-ES') +
                    '</div>' +
                    '</div>'
                );

                // Add marker to map
                marker.addTo(map);
                realtimeTrainMarkers.push(marker);
                totalTrains++;

                console.log('✅ ADDED TRAIN MARKER:', routeName, train.id, 'at', train.lat, train.lng);
            } else {
                console.warn('❌ INVALID COORDS for train:', train.id, train.lat, train.lng);
            }
        });
    });

    console.log('🎯 TOTAL TRAIN MARKERS CREATED:', totalTrains);

    // Create a legend for the routes
    if (totalTrains > 0) {
        createTrainLegend(trainsByRoute, routeInfo);
    }

    // Update status without zooming
    updateRealtimeStatus('🚂 Mostrant ' + totalTrains + ' trens RENFE (' + Object.keys(trainsByRoute).length + ' línies)');

    console.log('🎉 TRAIN DISPLAY COMPLETED SUCCESSFULLY!');
}

// Create a legend showing train routes and their colors, grouped by geographical zones
function createTrainLegend(trainsByRoute, routeColors) {
    // Remove existing legend if any
    var existingLegend = document.getElementById('train-legend');
    if (existingLegend) {
        existingLegend.remove();
    }

    // Create legend container
    var legend = document.createElement('div');
    legend.id = 'train-legend';
    legend.style.cssText = `
        position: absolute;
        top: 70px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        border: 2px solid #333;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        max-width: 250px;
        max-height: 400px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;

    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; color: #333;">🚂 Línies RENFE per Zones</div>';

    // Group routes by geographical zones - RENFE núcleos (cores/hubs)
    var zones = {
        'Catalunya Rodalies': [],
        'Madrid Cercanías': [],
        'Valencia Cercanías': [],
        'Asturias Cercanías': [],
        'Bilbao Cercanías': [],
        'Sevilla Cercanías': [],
        'Málaga Cercanías': [],
        'Zaragoza Cercanías': [],
        'Cádiz Cercanías': [],
        'Murcia-Alicante Cercanías': [],
        'Cantabria Cercanías': [],
        'San Sebastián Cercanías': [],
        'Alta Velocitat': [],
        'Mitja Distància': [],
        'Regional': [],
        'Unknown': []
    };

    // Function to determine zone based on route and coordinates - using RENFE núcleos
    function getRouteZone(routeId, trainLat, trainLng) {
        // All Rodalies routes are in Catalonia (separate from Cercanías)
        if (routeId.match(/^R\d+/)) {
            return 'Catalunya Rodalies';
        }
        // Cercanías routes - determine city based on coordinates
        if (routeId.match(/^C\d+/) || routeId.match(/^C-\d+/)) {
            // Use coordinates to determine which city the train is in
            if (trainLat && trainLng) {
                // Valencia: ~39.5N, -0.4W (very expanded range to catch all Valencia trains)
                if (trainLat >= 38.5 && trainLat <= 40.5 && trainLng >= -1.5 && trainLng <= 0.5) {
                    console.log('✅ Train', routeId, 'detected in Valencia area:', trainLat, trainLng);
                    return 'Valencia Cercanías';
                }
                // Madrid: ~40.4N, -3.7W (expanded range)
                if (trainLat >= 39.5 && trainLat <= 41.5 && trainLng >= -5.0 && trainLng <= -2.5) {
                    console.log('✅ Train', routeId, 'detected in Madrid area:', trainLat, trainLng);
                    return 'Madrid Cercanías';
                }
                // Barcelona: ~41.4N, 2.2E (but Barcelona uses Rodalies, not Cercanías)
                if (trainLat >= 41.2 && trainLat <= 41.6 && trainLng >= 2.0 && trainLng <= 2.4) {
                    console.log('Train', routeId, 'detected in Barcelona area:', trainLat, trainLng);
                    return 'Barcelona Cercanías'; // Though Barcelona mainly uses Rodalies
                }
                // Bilbao: ~43.3N, -2.9W
                if (trainLat >= 43.0 && trainLat <= 43.6 && trainLng >= -3.2 && trainLng <= -2.6) {
                    return 'Bilbao Cercanías';
                }
                // Sevilla: ~37.4N, -6.0W
                if (trainLat >= 37.2 && trainLat <= 37.6 && trainLng >= -6.2 && trainLng <= -5.8) {
                    return 'Sevilla Cercanías';
                }
                // Málaga: ~36.7N, -4.4W
                if (trainLat >= 36.5 && trainLat <= 36.9 && trainLng >= -4.6 && trainLng <= -4.2) {
                    return 'Málaga Cercanías';
                }
                // Zaragoza: ~41.7N, -0.9W
                if (trainLat >= 41.5 && trainLat <= 41.9 && trainLng >= -1.1 && trainLng <= -0.7) {
                    return 'Zaragoza Cercanías';
                }
                // Cádiz: ~36.5N, -6.3W
                if (trainLat >= 36.3 && trainLat <= 36.7 && trainLng >= -6.5 && trainLng <= -6.1) {
                    return 'Cádiz Cercanías';
                }
                // Murcia-Alicante: ~38.0N, -1.1W (Murcia) or ~38.3N, -0.5W (Alicante)
                if (trainLat >= 37.8 && trainLat <= 38.5 && trainLng >= -1.3 && trainLng <= -0.3) {
                    return 'Murcia-Alicante Cercanías';
                }
                // Asturias: ~43.5N, -6.0W (Gijón/Oviedo area)
                if (trainLat >= 43.2 && trainLat <= 43.8 && trainLng >= -6.2 && trainLng <= -5.8) {
                    return 'Asturias Cercanías';
                }
                // Cantabria: ~43.5N, -4.0W (Santander area)
                if (trainLat >= 43.3 && trainLat <= 43.7 && trainLng >= -4.2 && trainLng <= -3.8) {
                    return 'Cantabria Cercanías';
                }
                // San Sebastián: ~43.3N, -1.9W
                if (trainLat >= 43.1 && trainLat <= 43.5 && trainLng >= -2.1 && trainLng <= -1.7) {
                    return 'San Sebastián Cercanías';
                }

                // Log when coordinates don't match any known city
                console.log('Train', routeId, 'coordinates', trainLat, trainLng, 'do not match any known Cercanías city');
            } else {
                console.log('Train', routeId, 'has no coordinates for city detection');
            }
            // If coordinates don't match any known city, still try to infer from route number patterns
            // Most C-1 routes are in Madrid, but some are in other cities
            var routeNum = parseInt(routeId.replace(/C-?/, ''));
            if (routeNum && routeNum <= 10) {
                // For now, default to Madrid for common routes, but log it
                console.log('Defaulting train', routeId, 'to Madrid Cercanías (could be Valencia, Zaragoza, etc.)');
                return 'Madrid Cercanías';
            }
            return 'Madrid Cercanías';
        }
        // High-speed trains (AVE, Avant, Alvia)
        if (routeId === 'AVE' || routeId === 'AVANT' || routeId === 'ALVIA' || routeId === 'AV City') {
            return 'Alta Velocitat';
        }
        // Media Distancia
        if (routeId === 'MD' || routeId === 'MD-LD') {
            return 'Mitja Distància';
        }
        // Regional trains (RT, RG, RL, etc.)
        if (routeId === 'Regional' || routeId.match(/^RT/) || routeId.match(/^RG/) || routeId.match(/^RL/)) {
            return 'Regional';
        }
        // FEVE (narrow gauge) - mainly in northern Spain
        if (routeId === 'FEVE') {
            return 'Asturias Cercanías'; // FEVE has significant presence in Asturias
        }
        // Unknown routes - keep them separate
        return 'Unknown';
    }

    // Group routes by zone with accurate counts
    var zoneRouteCounts = {}; // Track count of each route per zone

    // Initialize zone counts
    Object.keys(zones).forEach(function(zoneName) {
        zoneRouteCounts[zoneName] = {};
    });

    // Count trains per route per zone
    Object.keys(trainsByRoute).forEach(function(routeId) {
        trainsByRoute[routeId].forEach(function(train) {
            var zone = getRouteZone(routeId, train.lat, train.lng);
            if (!zoneRouteCounts[zone]) {
                zoneRouteCounts[zone] = {};
            }
            if (!zoneRouteCounts[zone][routeId]) {
                zoneRouteCounts[zone][routeId] = 0;
            }
            zoneRouteCounts[zone][routeId]++;
        });
    });

    // Add routes to zones with their counts
    Object.keys(zoneRouteCounts).forEach(function(zoneName) {
        Object.keys(zoneRouteCounts[zoneName]).forEach(function(routeId) {
            zones[zoneName].push(routeId);
        });
    });

    // Sort routes within each zone
    Object.keys(zones).forEach(function(zone) {
        zones[zone].sort(function(a, b) {
            // Sort numerically for numbered routes
            var aNum = parseInt(a.replace(/[^\d]/g, ''));
            var bNum = parseInt(b.replace(/[^\d]/g, ''));
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.localeCompare(b);
        });
    });

    // Display zones in order - using ALL RENFE núcleos as specified by user
    var zoneOrder = ['Catalunya Rodalies', 'Madrid Cercanías', 'Valencia Cercanías', 'Zaragoza Cercanías', 'Asturias Cercanías', 'Bilbao Cercanías', 'Sevilla Cercanías', 'Málaga Cercanías', 'Cádiz Cercanías', 'Murcia/Alicante Cercanías', 'Cantabria Cercanías', 'San Sebastián Cercanías', 'Alta Velocitat', 'Mitja Distància', 'Regional', 'Unknown'];

    zoneOrder.forEach(function(zoneName) {
        var zoneRoutes = zones[zoneName];
        if (!zoneRoutes || zoneRoutes.length === 0) return;

        // Add zone header
        var zoneHeader = document.createElement('div');
        zoneHeader.style.cssText = `
            font-weight: bold;
            margin: 8px 0 4px 0;
            padding: 4px 8px;
            background: #f0f0f0;
            border-radius: 3px;
            color: #333;
            font-size: 11px;
        `;
        zoneHeader.textContent = zoneName;
        legend.appendChild(zoneHeader);

        // Add routes for this zone
        zoneRoutes.forEach(function(routeId) {
            var count = trainsByRoute[routeId].length;
            var routeData = routeColors[routeId];
            if (!routeData) {
                // Unknown route - show the actual route code
                routeData = {
                    name: routeId,
                    color: '#95A5A6'
                };
            }
            var routeName = routeData.name;
            var color = routeData.color;

            var routeDiv = document.createElement('div');
            routeDiv.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 3px;
                margin-left: 8px;
                padding: 2px;
                border-radius: 2px;
            `;

            routeDiv.innerHTML = `
                <div style="width: 10px; height: 10px; background: ${color}; border: 1px solid #333; border-radius: 1px; margin-right: 4px;"></div>
                <span style="font-weight: bold; color: ${color}; font-size: 10px;">${routeName}</span>
                <span style="margin-left: auto; color: #666; font-size: 9px;">(${count})</span>
            `;

            legend.appendChild(routeDiv);
        });
    });

    // Add close button
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 2px;
        right: 5px;
        background: none;
        border: none;
        font-size: 14px;
        cursor: pointer;
        color: #666;
    `;
    closeBtn.onclick = function() {
        legend.remove();
    };
    legend.appendChild(closeBtn);

    // Add to map container
    document.getElementById('map').appendChild(legend);
}

// Start real-time train visualization
function startRealtimeTrains() {
    if (realtimeTrainInterval) {
        clearInterval(realtimeTrainInterval);
    }

    // Initial load
    fetchRealtimeTrains().then(function(trains) {
        displayRealtimeTrains(trains);
    });

    // Set up periodic updates every 30 seconds (RENFE data refresh rate)
    realtimeTrainInterval = setInterval(function() {
        fetchRealtimeTrains().then(function(trains) {
            displayRealtimeTrains(trains);
        });
    }, 30000);

    // Update UI
    document.getElementById('start-realtime-btn').style.display = 'none';
    document.getElementById('stop-realtime-btn').style.display = 'inline-block';
    document.getElementById('legend-btn').style.display = 'inline-block';
    updateRealtimeStatus('Carregant trens en temps real...');
}

// Stop real-time train visualization
function stopRealtimeTrains() {
    if (realtimeTrainInterval) {
        clearInterval(realtimeTrainInterval);
        realtimeTrainInterval = null;
    }

    // Clear all train markers
    realtimeTrainMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    realtimeTrainMarkers = [];

    // Update UI
    document.getElementById('start-realtime-btn').style.display = 'inline-block';
    document.getElementById('stop-realtime-btn').style.display = 'none';
    updateRealtimeStatus('Inactiu');
}

// Update real-time status display
function updateRealtimeStatus(status) {
    var statusElement = document.getElementById('realtime-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Manual RENFE data entry functions
function openRenfeJson() {
    window.open('https://gtfsrt.renfe.com/vehicle_positions.json', '_blank');
}

function showManualDataEntry() {
    var entryDiv = document.getElementById('manual-data-entry');
    if (entryDiv) {
        entryDiv.style.display = entryDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function processManualJsonData() {
    var jsonTextarea = document.getElementById('manual-json-data');
    if (!jsonTextarea || !jsonTextarea.value.trim()) {
        alert('Si us plau, enganxa les dades JSON de RENFE primer.');
        return;
    }

    try {
        var jsonData = JSON.parse(jsonTextarea.value.trim());
        console.log('Processing manual RENFE JSON data...');

        var decodedTrains = decodeRenfeJsonData(jsonData);
        if (decodedTrains && decodedTrains.length > 0) {
            console.log('✅ Successfully processed', decodedTrains.length, 'REAL RENFE trains from manual data!');
            displayRealtimeTrains(decodedTrains);

            // Clear the textarea
            jsonTextarea.value = '';

            // Hide the manual entry form
            showManualDataEntry();

            alert('Dades processades! Veus ' + decodedTrains.length + ' trens RENFE reals al mapa.');
        } else {
            alert('No s\'han trobat dades de trens vàlides en el JSON. Comprova que has copiat les dades correctes.');
        }
    } catch (error) {
        console.error('Error processing manual JSON data:', error);
        alert('Error processant les dades JSON. Comprova que el format és correcte.');
    }
}

// Helper functions for manual data entry
function copyRenfeUrl() {
    var renfeUrl = 'https://gtfsrt.renfe.com/vehicle_positions.json';
    console.log('Copying RENFE URL:', renfeUrl);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(renfeUrl).then(function() {
            console.log('✅ URL copied using modern clipboard API');
            alert('✅ URL de RENFE copiada al porta-retalls!\n\n' + renfeUrl);
        }).catch(function(err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
            fallbackCopy(renfeUrl, 'URL de RENFE');
        });
    } else {
        console.log('Modern clipboard API not available, using fallback');
        fallbackCopy(renfeUrl, 'URL de RENFE');
    }
}

function fallbackCopy(text, description) {
    try {
        var tempTextarea = document.createElement('textarea');
        tempTextarea.value = text;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.left = '-999999px';
        tempTextarea.style.top = '-999999px';
        document.body.appendChild(tempTextarea);
        tempTextarea.focus();
        tempTextarea.select();

        var successful = document.execCommand('copy');
        document.body.removeChild(tempTextarea);

        if (successful) {
            console.log('✅ ' + description + ' copied using fallback method');
            alert('✅ ' + description + ' copiada al porta-retalls!\n\n' + text);
        } else {
            console.error('❌ Fallback copy method failed');
            alert('❌ Error copiant al porta-retalls. Copia manualment:\n\n' + text);
        }
    } catch (err) {
        console.error('❌ Fallback copy method error:', err);
        alert('❌ Error copiant al porta-retalls. Copia manualment:\n\n' + text);
    }
}

function shareMapUrl() {
    var mapUrl = window.location.href;

    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mapUrl).then(function() {
            alert('URL del mapa copiada al porta-retalls!');
        }).catch(function() {
            // Fallback
            var tempTextarea = document.createElement('textarea');
            tempTextarea.value = mapUrl;
            document.body.appendChild(tempTextarea);
            tempTextarea.select();
            document.execCommand('copy');
            document.body.removeChild(tempTextarea);
            alert('URL del mapa copiada al porta-retalls!');
        });
    } else {
        var tempTextarea = document.createElement('textarea');
        tempTextarea.value = mapUrl;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextarea);
        alert('URL del mapa copiada al porta-retalls!');
    }
}

function copyJsonInstructions() {
    var instructions = "PASSOS PER COPIAR LES DADES RENFE:\n\n";
    instructions += "1. Ves a la pestanya RENFE que s'ha obert\n";
    instructions += "2. Prem Ctrl+A (seleccionar tot)\n";
    instructions += "3. Prem Ctrl+C (copiar)\n";
    instructions += "4. Torna aquí i prem Ctrl+V (enganxar)\n";
    instructions += "5. Clica 'Processar Dades Reals'\n\n";
    instructions += "URL: https://gtfsrt.renfe.com/vehicle_positions.json";

    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(instructions).then(function() {
            alert('Instruccions copiades al porta-retalls!');
        }).catch(function() {
            // Fallback: show in textarea for manual copy
            var tempTextarea = document.createElement('textarea');
            tempTextarea.value = instructions;
            document.body.appendChild(tempTextarea);
            tempTextarea.select();
            document.execCommand('copy');
            document.body.removeChild(tempTextarea);
            alert('Instruccions copiades al porta-retalls!');
        });
    } else {
        // Fallback for older browsers
        var tempTextarea = document.createElement('textarea');
        tempTextarea.value = instructions;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextarea);
        alert('Instruccions copiades al porta-retalls!');
    }
}

function clearTextarea() {
    var jsonTextarea = document.getElementById('manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = '';
        updateJsonStatus('Textarea netejat. Preparat per enganxar dades.');
    }
}

function testSampleData() {
    // Sample RENFE JSON data for testing
    var sampleData = {
        "header": {
            "gtfsRealtimeVersion": "2.0",
            "timestamp": "1766825736"
        },
        "entity": [
            {
                "id": "VP_C2-23055",
                "vehicle": {
                    "trip": {
                        "tripId": "3091S35315C2",
                        "startTime": "12:00:00",
                        "startDate": "20231227",
                        "routeId": "C2"
                    },
                    "position": {
                        "latitude": 37.434105,
                        "longitude": -5.9807305,
                        "bearing": 45.0,
                        "speed": 25.0
                    },
                    "currentStatus": "INCOMING_AT",
                    "timestamp": 1766825734,
                    "stopId": "43000",
                    "vehicle": {
                        "id": "23055",
                        "label": "C2-23055-PLATF.(1)"
                    }
                }
            },
            {
                "id": "VP_C4-23617",
                "vehicle": {
                    "trip": {
                        "tripId": "3091S23617C4",
                        "startTime": "12:15:00",
                        "startDate": "20231227",
                        "routeId": "C4"
                    },
                    "position": {
                        "latitude": 37.392242,
                        "longitude": -5.974642,
                        "bearing": 90.0,
                        "speed": 30.0
                    },
                    "currentStatus": "IN_TRANSIT_TO",
                    "timestamp": 1766825734,
                    "stopId": "51003",
                    "vehicle": {
                        "id": "23617",
                        "label": "C4-23617-PLATF.(8)"
                    }
                }
            }
        ]
    };

    var jsonTextarea = document.getElementById('manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = JSON.stringify(sampleData, null, 2);
        updateJsonStatus('Dades d\'exemple carregades. Clica "Processar Dades Reals" per veure trens.');
    }
}

function updateJsonStatus(status) {
    var statusElement = document.getElementById('json-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Attempt automated copy-paste from RENFE tab (won't work due to security)
function tryAutomatedCopyPaste() {
    console.log('Attempting automated copy-paste...');

    // This cannot work due to browser security:
    // 1. Cannot access content from other tabs/windows
    // 2. Cannot automatically copy from clipboard without user permission
    // 3. Cannot read content from cross-origin iframes
    // 4. Cannot automate browser interactions across tabs

    console.warn('Automated copy-paste is impossible due to browser security restrictions');
    console.log('Manual copy-paste is the only viable solution for browser-based applications');

    return false;
}

// Toggle train legend visibility
function toggleTrainLegend() {
    var legend = document.getElementById('train-legend');
    var legendBtn = document.getElementById('legend-btn');

    if (!legend) {
        // Legend doesn't exist, create it and show
        if (realtimeTrainMarkers.length > 0) {
            createTrainLegend(trainsByRoute, routeInfo);
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            alert('No hi ha trens al mapa. Inicia la visualització de trens primer.');
            return;
        }
    } else {
        // Legend exists, toggle visibility
        if (legend.style.display === 'none' || !legend.style.display) {
            legend.style.display = 'block';
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            legend.style.display = 'none';
            legendBtn.textContent = '🎨 Mostrar Llegenda';
        }
    }
}

// Make all functions globally accessible
window.startRealtimeTrains = startRealtimeTrains;
window.stopRealtimeTrains = stopRealtimeTrains;
window.openRenfeJson = openRenfeJson;
window.showManualDataEntry = showManualDataEntry;
window.processManualJsonData = processManualJsonData;
window.toggleTrainLegend = toggleTrainLegend;
