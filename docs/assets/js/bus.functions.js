// Bus Functions - Based on old.functions.js
// Comprehensive bus route and station visualization

var busRealtimeInterval = null;
var busRealtimeMarkers = [];
var busRealtimeLayer = null;
var busRoutesByLine = {}; // Global variable for bus legend toggle functionality
var busRouteInfo = {}; // Global variable for bus route information

// Start bus real-time visualization
function startRealtimeBus() {
    // If already running, stop it instead of starting again
    if (busRealtimeInterval) {
        stopRealtimeBus();
        return;
    }

    // Initial load
    fetchRealtimeBus().then(function(buses) {
        displayRealtimeBus(buses);
    });

    // Set up periodic updates every 30 seconds (bus data refresh rate)
    busRealtimeInterval = setInterval(function() {
        fetchRealtimeBus().then(function(buses) {
            displayRealtimeBus(buses);
        });
    }, 30000);

    // Update UI
    document.getElementById('start-bus-realtime-btn').style.display = 'none';
    document.getElementById('stop-bus-realtime-btn').style.display = 'inline-block';
    document.getElementById('bus-legend-btn').style.display = 'inline-block';
    updateBusRealtimeStatus('Carregant autobusos en temps real...');
}

// Stop bus real-time visualization
function stopRealtimeBus() {
    if (busRealtimeInterval) {
        clearInterval(busRealtimeInterval);
        busRealtimeInterval = null;
    }

    // Clear all bus markers
    busRealtimeMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    busRealtimeMarkers = [];

    // Update UI
    document.getElementById('start-bus-realtime-btn').style.display = 'inline-block';
    document.getElementById('stop-bus-realtime-btn').style.display = 'none';
    updateBusRealtimeStatus('Inactiu');
}

// Update bus real-time status display
function updateBusRealtimeStatus(status) {
    var statusElement = document.getElementById('bus-realtime-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch real-time bus data
function fetchRealtimeBus() {
    // Detect deployment environment
    var hostname = window.location.hostname;
    var isGitHubPages = hostname.includes('github.io');
    var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

    // Use appropriate API endpoint based on environment
    var apiUrl;
    if (isVercel) {
        // Use Vercel-deployed API
        apiUrl = '/api/bus-realtime';
        console.log('🚌 Fetching bus data via Vercel API...');
    } else if (isGitHubPages) {
        // On GitHub Pages, use our Vercel deployment as proxy
        apiUrl = 'https://openlocalmap2.vercel.app/api/bus-realtime';
        console.log('🚌 Fetching bus data via Vercel proxy from GitHub Pages...');
    } else {
        // Local development
        apiUrl = '/api/bus-realtime';
        console.log('🚌 Fetching bus data via local proxy server...');
    }

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Bus API proxy failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(jsonData => {
            console.log('✅ Bus API proxy succeeded! Processing bus data...', jsonData);

            // Check if the response contains an error
            if (jsonData.error) {
                throw new Error('API Error: ' + jsonData.message);
            }

            var buses = [];

            // Process bus API response - GTFS-RT or custom format
            if (jsonData && jsonData.entity && Array.isArray(jsonData.entity)) {
                // GTFS-RT format
                jsonData.entity.forEach(function(entity) {
                    try {
                        if (entity.vehicle && entity.vehicle.position) {
                            var vehicle = entity.vehicle;
                            var position = entity.vehicle.position;

                            var lat = position.latitude || 0;
                            var lng = position.longitude || 0;

                            if (typeof lat === 'number' && typeof lng === 'number' &&
                                lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
                                lat !== 0 && lng !== 0) {

                                var routeId = 'Unknown';
                                if (vehicle.trip && vehicle.trip.route_id) {
                                    routeId = vehicle.trip.route_id;
                                } else {
                                    var label = vehicle.vehicle ? vehicle.vehicle.label : null;
                                    if (label) {
                                        // Extract route from label (e.g., "59-123", "V15-456")
                                        var routeMatch = label.match(/^([A-Z]?\d+|[A-Z]+\d*)/);
                                        if (routeMatch) {
                                            routeId = routeMatch[1];
                                        }
                                    }
                                }

                                buses.push({
                                    id: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
                                    label: vehicle.vehicle ? vehicle.vehicle.label : null,
                                    lat: lat,
                                    lng: lng,
                                    speed: position.speed ? position.speed / 100 : 0,
                                    bearing: position.bearing || 0,
                                    route: routeId,
                                    tripId: vehicle.trip ? vehicle.trip.tripId : null,
                                    startTime: vehicle.trip ? vehicle.trip.startTime : null,
                                    startDate: vehicle.trip ? vehicle.trip.startDate : null,
                                    status: vehicle.currentStatus || 'Unknown',
                                    stopId: vehicle.stopId || null,
                                    timestamp: vehicle.timestamp || null,
                                    congestionLevel: position.congestionLevel || null,
                                    occupancyStatus: position.occupancyStatus || null
                                });
                            }
                        }
                    } catch (error) {
                        console.warn('Error processing bus entity:', error, entity);
                    }
                });
            } else if (jsonData && jsonData.buses && Array.isArray(jsonData.buses)) {
                // Alternative format
                jsonData.buses.forEach(function(bus) {
                    try {
                        var lat = bus.lat || bus.latitude;
                        var lng = bus.lon || bus.longitude;
                        var routeId = bus.line || bus.route || 'Unknown';

                        if (typeof lat === 'number' && typeof lng === 'number' &&
                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                            buses.push({
                                id: bus.id || bus.busId,
                                label: bus.label || routeId,
                                lat: lat,
                                lng: lng,
                                speed: bus.speed || 0,
                                bearing: bus.bearing || 0,
                                route: routeId,
                                destination: bus.destination || '',
                                status: bus.status || 'In Transit',
                                timestamp: new Date().getTime()
                            });
                        }
                    } catch (error) {
                        console.warn('Error processing bus:', error, bus);
                    }
                });
            } else {
                console.warn('❌ Bus API response format unexpected:', jsonData);
            }

            if (buses.length > 0) {
                console.log('🚌 SUCCESS: Extracted', buses.length, 'buses from API proxy!');
                return buses;
            } else {
                console.warn('Proxy returned data but no buses found');
                alert('🚌 No s\'han trobat autobusos a les dades. L\'API pot estar temporalment indisponible.\n\nUtilitza l\'opció "📝 Introduir Dades Manualment" per provar amb dades d\'exemple.');
                return [];
            }
        })
        .catch(error => {
            console.error('❌ Bus API proxy failed:', error.message);

            // Fallback options
            if (isGitHubPages) {
                // On GitHub Pages, try CORS proxies
                console.log('🔄 Falling back to CORS proxies for bus data...');
                return fetchRealtimeBusFallback();
            } else if (isVercel) {
                // On Vercel, show manual fallback option
                alert('🚌 API proxy temporarily unavailable. Use manual data entry:\n\n1. Open bus API documentation\n2. Copy JSON data\n3. Use "📝 Introduir Dades Manualment"');
                return Promise.resolve([]);
            } else {
                // Local development - try CORS proxies
                console.log('🔄 Local development - API proxy failed, trying CORS proxies...');
                return fetchRealtimeBusFallback();
            }
        });
}

// Display bus positions on map with colored route visualization
function displayRealtimeBus(buses) {
    console.log('🚌 DISPLAYING', buses.length, 'BUSES ON MAP...');

    // Clear existing markers and layers
    busRealtimeMarkers.forEach(function(marker) {
        try {
            map.removeLayer(marker);
        } catch (e) {}
    });
    busRealtimeMarkers = [];

    // Group buses by route for better visualization
    var busRoutesByLine = {};
    buses.forEach(function(bus) {
        if (bus.route && bus.route !== 'Unknown') {
            if (!busRoutesByLine[bus.route]) {
                busRoutesByLine[bus.route] = [];
            }
            busRoutesByLine[bus.route].push(bus);
        } else {
            // Put unknown routes in a separate group
            if (!busRoutesByLine['Unknown']) {
                busRoutesByLine['Unknown'] = [];
            }
            busRoutesByLine['Unknown'].push(bus);
        }
    });

    // Define colors for different bus routes - Barcelona TMB bus colors
    var busRouteInfo = {
        // TMB Bus lines - common Barcelona bus lines with their colors
        '1': {name: 'Línia 1', color: '#FF6B6B'},
        '2': {name: 'Línia 2', color: '#4ECDC4'},
        '3': {name: 'Línia 3', color: '#45B7D1'},
        '4': {name: 'Línia 4', color: '#FFA07A'},
        '5': {name: 'Línia 5', color: '#98D8C8'},
        '6': {name: 'Línia 6', color: '#F7DC6F'},
        '7': {name: 'Línia 7', color: '#BB8FCE'},
        '8': {name: 'Línia 8', color: '#85C1E9'},
        '9': {name: 'Línia 9', color: '#F8C471'},
        '10': {name: 'Línia 10', color: '#95A5A6'},
        '11': {name: 'Línia 11', color: '#E74C3C'},
        '12': {name: 'Línia 12', color: '#3498DB'},
        '13': {name: 'Línia 13', color: '#2ECC71'},
        '14': {name: 'Línia 14', color: '#9B59B6'},
        '15': {name: 'Línia 15', color: '#F39C12'},
        '16': {name: 'Línia 16', color: '#1ABC9C'},
        '17': {name: 'Línia 17', color: '#E67E22'},
        '18': {name: 'Línia 18', color: '#34495E'},
        '19': {name: 'Línia 19', color: '#16A085'},
        '20': {name: 'Línia 20', color: '#8E44AD'},
        // Aerobus lines
        'A1': {name: 'Aerobus A1', color: '#FF0000'},
        'A2': {name: 'Aerobus A2', color: '#0000FF'},
        // Nitbus (Night bus)
        'N1': {name: 'Nitbus N1', color: '#FF1493'},
        'N2': {name: 'Nitbus N2', color: '#00FF00'},
        'N3': {name: 'Nitbus N3', color: '#FFFF00'},
        'Unknown': {name: 'Línia desconeguda', color: '#95A5A6'}
    };

    var totalBuses = 0;

    // Create markers for each bus, grouped by route
    Object.keys(busRoutesByLine).forEach(function(routeId) {
        var routeBuses = busRoutesByLine[routeId];
        var routeData = busRouteInfo[routeId];
        if (!routeData) {
            // Use the route code directly if not in mapping
            routeData = {
                name: routeId,
                color: '#95A5A6' // Gray for unknown routes
            };
        }
        var routeColor = routeData.color;
        var routeName = routeData.name;

        routeBuses.forEach(function(bus) {
            if (bus.lat && bus.lng && !isNaN(bus.lat) && !isNaN(bus.lng)) {
                // Create modern bus icon with colored route label
                var marker = L.marker([bus.lat, bus.lng], {
                    icon: L.divIcon({
                        html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                              '<rect x="2" y="4" width="20" height="12" rx="2" fill="#333" stroke="white" stroke-width="2"/>' +
                              '<circle cx="6" cy="18" r="2" fill="#666"/>' +
                              '<circle cx="18" cy="18" r="2" fill="#666"/>' +
                              '<rect x="4" y="6" width="4" height="6" rx="0.5" fill="white"/>' +
                              '<rect x="10" y="6" width="4" height="6" rx="0.5" fill="white"/>' +
                              '<rect x="16" y="6" width="4" height="6" rx="0.5" fill="white"/>' +
                              '<text x="12" y="15" text-anchor="middle" fill="' + routeColor + '" font-size="8px" font-weight="bold">' + routeId + '</text>' +
                              '</svg>' +
                              '<div style="position: absolute; top: -6px; left: 50%; transform: translateX(-50%); ' +
                              'background: ' + routeColor + '; color: white; font-size: 9px; font-weight: bold; ' +
                              'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                              routeName + '</div>',
                        className: 'bus-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 20]
                    })
                });

                // Enhanced popup with bus information and color coding
                var statusText = '';
                switch(bus.status) {
                    case 'IN_TRANSIT_TO': statusText = '🟢 En ruta'; break;
                    case 'STOPPED_AT': statusText = '🟡 Aturat'; break;
                    case 'INCOMING_AT': statusText = '🟠 Arribant'; break;
                    default: statusText = '⚪ ' + (bus.status || 'Desconegut');
                }

                marker.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 220px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + routeColor + '; border-bottom: 2px solid ' + routeColor + '; padding-bottom: 4px;">' +
                    '🚌 Autobús ' + (bus.id || 'Desconegut') + '</h4>' +
                    '<div style="background: ' + routeColor + '15; border: 1px solid ' + routeColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Línia:</strong> <span style="color: ' + routeColor + '; font-weight: bold;">' + routeName + '</span><br>' +
                    '<strong>Codi ruta:</strong> ' + routeId + '<br>' +
                    '<strong>Estat:</strong> ' + statusText + '<br>' +
                    '<strong>Velocitat:</strong> ' + (bus.speed ? bus.speed.toFixed(1) + ' km/h' : 'N/A') + '<br>' +
                    '<strong>Direcció:</strong> ' + (bus.bearing ? bus.bearing + '°' : 'N/A') + '<br>' +
                    '<strong>Posició:</strong> ' + bus.lat.toFixed(4) + ', ' + bus.lng.toFixed(4) +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🕒 Actualitzat: ' + new Date().toLocaleTimeString('ca-ES') +
                    '</div>' +
                    '</div>'
                );

                // Add marker to map
                marker.addTo(map);
                busRealtimeMarkers.push(marker);
                totalBuses++;

                console.log('✅ ADDED BUS MARKER:', routeName, bus.id, 'at', bus.lat, bus.lng);
            } else {
                console.warn('❌ INVALID COORDS for bus:', bus.id, bus.lat, bus.lng);
            }
        });
    });

    console.log('🎯 TOTAL BUS MARKERS CREATED:', totalBuses);

    // Create a legend for the bus routes
    if (totalBuses > 0) {
        createBusLegend(busRoutesByLine, busRouteInfo);
    }

    // Update status without zooming
    updateBusRealtimeStatus('🚌 Mostrant ' + totalBuses + ' autobusos (' + Object.keys(busRoutesByLine).length + ' línies)');

    console.log('🎉 BUS DISPLAY COMPLETED SUCCESSFULLY!');
}

// Create a legend showing bus routes and their colors
function createBusLegend(busRoutesByLine, busRouteColors) {
    // Remove existing legend if any
    var existingLegend = document.getElementById('bus-legend');
    if (existingLegend) {
        existingLegend.remove();
    }

    // Create legend container
    var legend = document.createElement('div');
    legend.id = 'bus-legend';
    legend.style.cssText = `
        position: absolute;
        top: 70px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        border: 2px solid #c41e3a;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        max-width: 280px;
        max-height: 400px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;

    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; color: #c41e3a;">🚌 Línies d\'Autobusos</div>';

    // Display routes in order
    var routeOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'A1', 'A2', 'N1', 'N2', 'N3', 'Unknown'];

    routeOrder.forEach(function(routeId) {
        var count = busRoutesByLine[routeId] ? busRoutesByLine[routeId].length : 0;
        if (count === 0) return;

        var routeData = busRouteColors[routeId];
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
            margin-bottom: 5px;
            padding: 4px;
            border-radius: 3px;
            background: ${color}10;
        `;

        routeDiv.innerHTML = `
            <div style="width: 12px; height: 12px; background: ${color}; border: 1px solid #333; border-radius: 2px; margin-right: 6px;"></div>
            <span style="font-weight: bold; color: ${color}; font-size: 11px;">${routeName}</span>
            <span style="margin-left: auto; color: #666; font-size: 10px;">(${count})</span>
        `;

        legend.appendChild(routeDiv);
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
        color: #c41e3a;
    `;
    closeBtn.onclick = function() {
        legend.remove();
    };
    legend.appendChild(closeBtn);

    // Add to map container
    document.getElementById('map').appendChild(legend);
}

// Bus Manual data entry functions
function openBusJson() {
    window.open('https://opendata-ajuntament.barcelona.cat/data/dataset/bus-stops', '_blank');
}

function showBusDataEntry() {
    var entryDiv = document.getElementById('bus-manual-data-entry');
    if (entryDiv) {
        entryDiv.style.display = entryDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function processBusManualJsonData() {
    var jsonTextarea = document.getElementById('bus-manual-json-data');
    if (!jsonTextarea || !jsonTextarea.value.trim()) {
        alert('Si us plau, enganxa les dades JSON dels autobusos primer.');
        return;
    }

    try {
        var jsonData = JSON.parse(jsonTextarea.value.trim());
        console.log('Processing manual bus JSON data...');

        // Process bus API format (GTFS-RT or custom)
        var buses = [];

        if (jsonData && jsonData.entity && Array.isArray(jsonData.entity)) {
            // GTFS-RT format
            jsonData.entity.forEach(function(entity) {
                if (entity.vehicle && entity.vehicle.position) {
                    var vehicle = entity.vehicle;
                    var position = entity.vehicle.position;

                    var lat = position.latitude || 0;
                    var lng = position.longitude || 0;

                    if (typeof lat === 'number' && typeof lng === 'number' &&
                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                        var routeId = 'Unknown';
                        if (vehicle.trip && vehicle.trip.route_id) {
                            routeId = vehicle.trip.route_id;
                        } else {
                            var label = vehicle.vehicle ? vehicle.vehicle.label : null;
                            if (label) {
                                var routeMatch = label.match(/^([A-Z]?\d+|[A-Z]+\d*)/);
                                if (routeMatch) {
                                    routeId = routeMatch[1];
                                }
                            }
                        }

                        buses.push({
                            id: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
                            label: vehicle.vehicle ? vehicle.vehicle.label : null,
                            lat: lat,
                            lng: lng,
                            speed: position.speed ? position.speed / 100 : 0,
                            bearing: position.bearing || 0,
                            route: routeId,
                            tripId: vehicle.trip ? vehicle.trip.tripId : null,
                            startTime: vehicle.trip ? vehicle.trip.startTime : null,
                            startDate: vehicle.trip ? vehicle.trip.startDate : null,
                            status: vehicle.currentStatus || 'Unknown',
                            stopId: vehicle.stopId || null,
                            timestamp: vehicle.timestamp || null,
                            congestionLevel: position.congestionLevel || null,
                            occupancyStatus: position.occupancyStatus || null
                        });
                    }
                }
            });
        } else if (jsonData && jsonData.buses && Array.isArray(jsonData.buses)) {
            // Alternative format
            jsonData.buses.forEach(function(bus) {
                var lat = bus.lat || bus.latitude;
                var lng = bus.lon || bus.longitude;
                var routeId = bus.line || bus.route || 'Unknown';

                if (typeof lat === 'number' && typeof lng === 'number' &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                    buses.push({
                        id: bus.id || bus.busId,
                        label: bus.label || routeId,
                        lat: lat,
                        lng: lng,
                        speed: bus.speed || 0,
                        bearing: bus.bearing || 0,
                        route: routeId,
                        destination: bus.destination || '',
                        status: bus.status || 'In Transit',
                        timestamp: new Date().getTime()
                    });
                }
            });
        }

        if (buses.length > 0) {
            console.log('✅ Successfully processed', buses.length, 'buses from manual data!');
            displayRealtimeBus(buses);

            // Clear the textarea
            jsonTextarea.value = '';

            // Hide the manual entry form
            showBusDataEntry();

            alert('Dades processades! Veus ' + buses.length + ' autobusos reals al mapa.');
        } else {
            alert('No s\'han trobat dades d\'autobusos vàlides en el JSON. Comprova que has copiat les dades correctes.');
        }
    } catch (error) {
        console.error('Error processing manual bus JSON data:', error);
        alert('Error processant les dades JSON. Comprova que el format és correcte.');
    }
}

// Helper functions for bus manual data entry
function copyBusUrl() {
    var busUrl = 'https://opendata-ajuntament.barcelona.cat/data/dataset/bus-stops/resource/1234/download';
    console.log('Copying bus URL:', busUrl);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(busUrl).then(function() {
            console.log('✅ Bus URL copied using modern clipboard API');
            alert('✅ URL d\'autobusos copiada al porta-retalls!\n\n' + busUrl);
        }).catch(function(err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
            fallbackBusCopy(busUrl, 'URL d\'autobusos');
        });
    } else {
        console.log('Modern clipboard API not available, using fallback');
        fallbackBusCopy(busUrl, 'URL d\'autobusos');
    }
}

function fallbackBusCopy(text, description) {
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

function shareBusMapUrl() {
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
        // Fallback for older browsers
        var tempTextarea = document.createElement('textarea');
        tempTextarea.value = mapUrl;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextarea);
        alert('URL del mapa copiada al porta-retalls!');
    }
}

function copyBusInstructions() {
    var instructions = "PASSOS PER COPIAR LES DADES D'AUTOBUSOS:\n\n";
    instructions += "1. Ves a la pestanya d'autobusos que s'ha obert\n";
    instructions += "2. Prem Ctrl+A (seleccionar tot)\n";
    instructions += "3. Prem Ctrl+C (copiar)\n";
    instructions += "4. Torna aquí i prem Ctrl+V (enganxar)\n";
    instructions += "5. Clica 'Processar Dades d'Autobusos'\n\n";
    instructions += "URL: https://opendata-ajuntament.barcelona.cat/data/dataset/bus-stops";

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

function clearBusTextarea() {
    var jsonTextarea = document.getElementById('bus-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = '';
        updateBusJsonStatus('Textarea netejat. Preparat per enganxar dades.');
    }
}

function testBusSampleData() {
    // Sample bus JSON data for testing (GTFS-RT format)
    var sampleData = {
        "header": {
            "gtfsRealtimeVersion": "2.0",
            "timestamp": "1766825736"
        },
        "entity": [
            {
                "id": "BUS_59-001",
                "vehicle": {
                    "trip": {
                        "tripId": "5900112345",
                        "startTime": "12:00:00",
                        "startDate": "20231227",
                        "routeId": "59"
                    },
                    "position": {
                        "latitude": 41.3851,
                        "longitude": 2.1734,
                        "bearing": 45.0,
                        "speed": 1500.0
                    },
                    "currentStatus": "IN_TRANSIT_TO",
                    "timestamp": 1766825734,
                    "stopId": "1001",
                    "vehicle": {
                        "id": "59-001",
                        "label": "59-001-PLATF.(1)"
                    }
                }
            },
            {
                "id": "BUS_V15-002",
                "vehicle": {
                    "trip": {
                        "tripId": "V150067890",
                        "startTime": "12:15:00",
                        "startDate": "20231227",
                        "routeId": "V15"
                    },
                    "position": {
                        "latitude": 41.3788,
                        "longitude": 2.1734,
                        "bearing": 90.0,
                        "speed": 0.0
                    },
                    "currentStatus": "STOPPED_AT",
                    "timestamp": 1766825734,
                    "stopId": "2002",
                    "vehicle": {
                        "id": "V15-002",
                        "label": "V15-002-PLATF.(2)"
                    }
                }
            }
        ]
    };

    var jsonTextarea = document.getElementById('bus-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = JSON.stringify(sampleData, null, 2);
        updateBusJsonStatus('Dades d\'exemple d\'autobusos carregades. Clica "Processar Dades d\'Autobusos" per veure autobusos.');
    }
}

function updateBusJsonStatus(status) {
    var statusElement = document.getElementById('bus-json-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fallback function using external CORS proxies for bus data
function fetchRealtimeBusFallback() {
    var corsProxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ];

    var busUrl = 'https://opendata-ajuntament.barcelona.cat/data/dataset/bus-stops/resource/1234/download';

    function tryNextProxy(proxyIndex) {
        if (proxyIndex >= corsProxies.length) {
            console.warn('All CORS proxies failed for bus data - using manual fallback');
            alert('🚌 Unable to load real bus data.\n\nLocal proxy server may not be running, and all external CORS proxies failed.\n\nPlease:\n1. Ensure the Node.js server is running (npm start)\n2. Or use the manual data entry option below.');
            return Promise.resolve([]);
        }

        var proxy = corsProxies[proxyIndex];
        var fullUrl = proxy + busUrl;

        console.log('🔄 Trying CORS proxy', proxyIndex + 1, 'of', corsProxies.length, 'for bus data:', proxy);

        return fetch(fullUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Proxy failed: ' + response.status);
                }
                return response.json();
            })
            .then(jsonData => {
                console.log('✅ CORS proxy', proxy, 'succeeded! Processing real bus data...');

                var buses = [];

                // Process bus API response (similar to main function)
                if (jsonData && jsonData.entity && Array.isArray(jsonData.entity)) {
                    jsonData.entity.forEach(function(entity) {
                        if (entity.vehicle && entity.vehicle.position) {
                            var vehicle = entity.vehicle;
                            var position = entity.vehicle.position;

                            var lat = position.latitude || 0;
                            var lng = position.longitude || 0;

                            if (typeof lat === 'number' && typeof lng === 'number' &&
                                lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                                var routeId = 'Unknown';
                                if (vehicle.trip && vehicle.trip.route_id) {
                                    routeId = vehicle.trip.route_id;
                                } else {
                                    var label = vehicle.vehicle ? vehicle.vehicle.label : null;
                                    if (label) {
                                        var routeMatch = label.match(/^([A-Z]?\d+|[A-Z]+\d*)/);
                                        if (routeMatch) {
                                            routeId = routeMatch[1];
                                        }
                                    }
                                }

                                buses.push({
                                    id: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
                                    label: vehicle.vehicle ? vehicle.vehicle.label : null,
                                    lat: lat,
                                    lng: lng,
                                    speed: position.speed ? position.speed / 100 : 0,
                                    bearing: position.bearing || 0,
                                    route: routeId,
                                    tripId: vehicle.trip ? vehicle.trip.tripId : null,
                                    startTime: vehicle.trip ? vehicle.trip.startTime : null,
                                    startDate: vehicle.trip ? vehicle.trip.startDate : null,
                                    status: vehicle.currentStatus || 'Unknown',
                                    stopId: vehicle.stopId || null,
                                    timestamp: vehicle.timestamp || null,
                                    congestionLevel: position.congestionLevel || null,
                                    occupancyStatus: position.occupancyStatus || null
                                });
                            }
                        }
                    });
                }

                if (buses.length > 0) {
                    console.log('🚌 SUCCESS: Displaying', buses.length, 'REAL buses via CORS proxy!');
                    return buses;
                } else {
                    console.warn('Proxy returned data but no buses found');
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

// Make bus functions globally accessible
window.startRealtimeBus = startRealtimeBus;
window.stopRealtimeBus = stopRealtimeBus;
window.openBusJson = openBusJson;
window.showBusDataEntry = showBusDataEntry;
window.processBusManualJsonData = processBusManualJsonData;
window.toggleBusLegend = toggleBusLegend;
window.copyBusUrl = copyBusUrl;
window.shareBusMapUrl = shareBusMapUrl;
window.copyBusInstructions = copyBusInstructions;
window.clearBusTextarea = clearBusTextarea;
window.testBusSampleData = testBusSampleData;
window.updateBusJsonStatus = updateBusJsonStatus;
