// FGC Real-Time Train Visualization
var fgcRealtimeTrainInterval = null;
var fgcRealtimeTrainMarkers = [];
var fgcRealtimeTrainLayer = null;
var fgcTrainsByRoute = {}; // Global variable for FGC legend toggle functionality
var fgcRouteInfo = {}; // Global variable for FGC route information

// Start FGC real-time train visualization
function startRealtimeFGCTrains() {
    if (fgcRealtimeTrainInterval) {
        clearInterval(fgcRealtimeTrainInterval);
    }

    // Initial load
    fetchRealtimeFGCTrains().then(function(trains) {
        displayFGCRealtimeTrains(trains);
    });

    // Set up periodic updates every 30 seconds (FGC data refresh rate)
    fgcRealtimeTrainInterval = setInterval(function() {
        fetchRealtimeFGCTrains().then(function(trains) {
            displayFGCRealtimeTrains(trains);
        });
    }, 30000);

    // Update UI
    document.getElementById('start-fgc-realtime-btn').style.display = 'none';
    document.getElementById('stop-fgc-realtime-btn').style.display = 'inline-block';
    document.getElementById('fgc-legend-btn').style.display = 'inline-block';
    updateFGCRealtimeStatus('Carregant trens FGC en temps real...');
}

// Stop FGC real-time train visualization
function stopRealtimeFGCTrains() {
    if (fgcRealtimeTrainInterval) {
        clearInterval(fgcRealtimeTrainInterval);
        fgcRealtimeTrainInterval = null;
    }

    // Clear all train markers
    fgcRealtimeTrainMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    fgcRealtimeTrainMarkers = [];

    // Update UI
    document.getElementById('start-fgc-realtime-btn').style.display = 'inline-block';
    document.getElementById('stop-fgc-realtime-btn').style.display = 'none';
    updateFGCRealtimeStatus('Inactiu');
}

// Update FGC real-time status display
function updateFGCRealtimeStatus(status) {
    var statusElement = document.getElementById('fgc-realtime-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch real-time FGC train positions
function fetchRealtimeFGCTrains() {
    // FGC provides train positioning data through their open data portal
    // Use the exact URL specified by the user
    var fgcApiUrl = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100';

    console.log('🚆 Fetching FGC real-time data from:', fgcApiUrl);

    return fetch(fgcApiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('FGC API failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ FGC API response received:', data);

            var trains = [];

            // Process FGC API response - FGC v2 API returns object with results array
            var recordsArray = data.results || data.records || (Array.isArray(data) ? data : []);
            console.log('📊 Processing', recordsArray.length, 'records from API');

            if (recordsArray && Array.isArray(recordsArray) && recordsArray.length > 0) {
                recordsArray.forEach(function(record, index) {
                    try {
                        console.log('🔍 Processing FGC record', index, ':', record);

                        // FGC API provides geo_point_2d with lat/lon coordinates
                        var lat = null;
                        var lng = null;
                        var routeId = 'Unknown';
                        var vehicleId = 'Unknown';
                        var direction = '';

                        // Extract coordinates from geo_point_2d object
                        if (record.geo_point_2d && typeof record.geo_point_2d === 'object') {
                            lat = record.geo_point_2d.lat;
                            lng = record.geo_point_2d.lon;
                            console.log('📍 Found coordinates in geo_point_2d:', lat, lng);
                        }

                        // Extract route from 'lin' field
                        if (record.lin) {
                            routeId = record.lin;
                            console.log('🚆 Found route:', routeId);
                        }

                        // Extract vehicle ID
                        if (record.id) {
                            vehicleId = record.id;
                        } else if (record.ut) {
                            vehicleId = record.ut;
                        }

                        // Extract direction
                        if (record.dir) {
                            direction = record.dir;
                        }

                        // Validate coordinates
                        if (typeof lat === 'number' && typeof lng === 'number' &&
                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
                            lat !== 0 && lng !== 0) {

                            trains.push({
                                id: vehicleId,
                                label: routeId + ' ' + direction,
                                lat: lat,
                                lng: lng,
                                speed: 0, // Not provided by FGC API
                                bearing: 0, // Not provided by FGC API
                                route: routeId,
                                status: record.en_hora === 'True' ? 'On time' : 'Delayed',
                                timestamp: new Date().getTime()
                            });

                            console.log('✅ Processed FGC train:', vehicleId, routeId, 'at', lat, lng);
                        } else {
                            console.warn('❌ Invalid coordinates for FGC record', index, '- lat:', lat, 'lng:', lng);
                        }
                    } catch (error) {
                        console.warn('Error processing FGC record', index, ':', error, record);
                    }
                });
            } else {
                console.warn('❌ FGC API response is not an array or is empty:', data);
            }

            if (trains.length > 0) {
                console.log('🚂 SUCCESS: Extracted', trains.length, 'FGC trains from API!');
                return trains;
            } else {
                console.warn('No FGC train data available');
                alert('Utilitza l\'opció d\'entrada manual si tens accés directe a dades FGC.');
                return [];
            }
        })
        .catch(error => {
            console.error('❌ FGC API error:', error);
            alert('Error connectant amb l\'API de FGC: ' + error.message + '\n\nComprova la connexió a Internet o intenta més tard.');
            return [];
        });
}

// Display FGC train positions on map with colored route visualization
function displayFGCRealtimeTrains(trains) {
    console.log('🚆 DISPLAYING', trains.length, 'FGC TRAINS ON MAP...');

    // Clear existing markers and layers
    fgcRealtimeTrainMarkers.forEach(function(marker) {
        try {
            map.removeLayer(marker);
        } catch (e) {}
    });
    fgcRealtimeTrainMarkers = [];

    // Group trains by route for better visualization
    var fgcTrainsByRoute = {};
    trains.forEach(function(train) {
        if (train.route && train.route !== 'Unknown') {
            if (!fgcTrainsByRoute[train.route]) {
                fgcTrainsByRoute[train.route] = [];
            }
            fgcTrainsByRoute[train.route].push(train);
        } else {
            // Put unknown routes in a separate group
            if (!fgcTrainsByRoute['Unknown']) {
                fgcTrainsByRoute['Unknown'] = [];
            }
            fgcTrainsByRoute['Unknown'].push(train);
        }
    });

// Define colors and names for different FGC routes - official FGC lines from Wikipedia
    var fgcRouteInfo = {
        // Metro del Vallès (Barcelona Metro lines operated by FGC)
        'L6': {name: 'L6', color: '#009933', line: 'Metro del Vallès'}, // Green
        'L7': {name: 'L7', color: '#FF6600', line: 'Metro del Vallès'}, // Orange
        'L8': {name: 'L8', color: '#660099', line: 'Metro del Vallès'}, // Purple

        // Línia Barcelona-Vallès (Barcelona-Vallès line)
        'S1': {name: 'S1', color: '#E4007C', line: 'Barcelona-Vallès'}, // Pink/Magenta
        'S2': {name: 'S2', color: '#009EE3', line: 'Barcelona-Vallès'}, // Blue
        'S5': {name: 'S5', color: '#F8B80E', line: 'Barcelona-Vallès'}, // Yellow
        'S6': {name: 'S6', color: '#8BC53F', line: 'Barcelona-Vallès'}, // Green
        'S7': {name: 'S7', color: '#9B59B6', line: 'Barcelona-Vallès'}, // Purple

        // Línia Llobregat-Anoia (Llobregat-Anoia line)
        'S4': {name: 'S4', color: '#FF6B35', line: 'Llobregat-Anoia'}, // Orange/Red
        'S8': {name: 'S8', color: '#00A0E9', line: 'Llobregat-Anoia'}, // Light Blue
        'S9': {name: 'S9', color: '#8BC53F', line: 'Llobregat-Anoia'}, // Green

        'Unknown': {name: 'Línia desconeguda', color: '#95A5A6', line: 'Desconegut'} // Gray
    };

    var totalFGTrains = 0;

    // Create markers for each train, grouped by route
    Object.keys(fgcTrainsByRoute).forEach(function(routeId) {
        var routeTrains = fgcTrainsByRoute[routeId];
        var routeData = fgcRouteInfo[routeId];
        if (!routeData) {
            // Use the route code directly if not in mapping
            routeData = {
                name: routeId,
                color: '#95A5A6', // Gray for unknown routes
                line: 'Línia desconeguda'
            };
        }
        var routeColor = routeData.color;
        var routeName = routeData.name;
        var lineName = routeData.line;

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
                        className: 'fgc-train-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 20]
                    })
                });

                // Enhanced popup with FGC route information and color coding
                var statusText = '';
                switch(train.status) {
                    case 'IN_TRANSIT_TO': statusText = '🟢 En ruta'; break;
                    case 'STOPPED_AT': statusText = '🟡 Aturat'; break;
                    case 'INCOMING_AT': statusText = '🟠 Arribant'; break;
                    default: statusText = '⚪ ' + (train.status || 'Desconegut');
                }

                marker.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 240px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + routeColor + '; border-bottom: 2px solid ' + routeColor + '; padding-bottom: 4px;">' +
                    '🚆 Tren FGC ' + (train.id || 'Desconegut') + '</h4>' +
                    '<div style="background: ' + routeColor + '15; border: 1px solid ' + routeColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Línia:</strong> <span style="color: ' + routeColor + '; font-weight: bold;">' + routeName + '</span><br>' +
                    '<strong>Servei:</strong> ' + lineName + '<br>' +
                    '<strong>Codi ruta:</strong> ' + routeId + '<br>' +
                    '<strong>Estat:</strong> ' + statusText + '<br>' +
                    '<strong>Velocitat:</strong> ' + (train.speed ? train.speed.toFixed(1) + ' km/h' : 'N/A') + '<br>' +
                    '<strong>Direcció:</strong> ' + (train.bearing ? train.bearing + '°' : 'N/A') + '<br>' +
                    '<strong>Posició:</strong> ' + train.lat.toFixed(4) + ', ' + train.lng.toFixed(4) +
                    '</div>' +
                    '<div style="background: #e6f3ff; border: 1px solid #66a3ff; border-radius: 4px; padding: 8px; margin: 8px 0; font-size: 12px;">' +
                    '<strong>🚆 Ferrocarrils de la Generalitat de Catalunya</strong><br>' +
                    'Sistema de transport públic ferroviari de Catalunya' +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🕒 Actualitzat: ' + new Date().toLocaleTimeString('ca-ES') +
                    '</div>' +
                    '</div>'
                );

                // Add marker to map
                marker.addTo(map);
                fgcRealtimeTrainMarkers.push(marker);
                totalFGTrains++;

                console.log('✅ ADDED FGC TRAIN MARKER:', routeName, train.id, 'at', train.lat, train.lng);
            } else {
                console.warn('❌ INVALID COORDS for FGC train:', train.id, train.lat, train.lng);
            }
        });
    });

    console.log('🎯 TOTAL FGC TRAIN MARKERS CREATED:', totalFGTrains);

    // Create a legend for the routes
    if (totalFGTrains > 0) {
        createFGCTrainLegend(fgcTrainsByRoute, fgcRouteInfo);
    }

    // Update status without zooming
    updateFGCRealtimeStatus('🚆 Mostrant ' + totalFGTrains + ' trens FGC (' + Object.keys(fgcTrainsByRoute).length + ' línies)');

    console.log('🎉 FGC TRAIN DISPLAY COMPLETED SUCCESSFULLY!');
}

// Create a legend showing FGC train routes and their colors, grouped by service type
function createFGCTrainLegend(fgcTrainsByRoute, fgcRouteColors) {
    // Remove existing legend if any
    var existingLegend = document.getElementById('fgc-train-legend');
    if (existingLegend) {
        existingLegend.remove();
    }

    // Create legend container
    var legend = document.createElement('div');
    legend.id = 'fgc-train-legend';
    legend.style.cssText = `
        position: absolute;
        top: 70px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        border: 2px solid #006400;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        max-width: 280px;
        max-height: 450px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;

    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; color: #006400;">🚆 Línies FGC per Servei</div>';

    // Group routes by service type - FGC services
    var services = {
        'Metro del Vallès': [],
        'Barcelona-Vallès': [],
        'Llobregat-Anoia': [],
        'Unknown': []
    };

    // Group routes by service
    Object.keys(fgcTrainsByRoute).forEach(function(routeId) {
        var routeData = fgcRouteColors[routeId];
        var service = routeData ? routeData.line : 'Unknown';
        if (!services[service]) {
            services[service] = [];
        }
        services[service].push(routeId);
    });

    // Display services in order
    var serviceOrder = ['Metro del Vallès', 'Barcelona-Vallès', 'Llobregat-Anoia', 'Unknown'];

    serviceOrder.forEach(function(serviceName) {
        var serviceRoutes = services[serviceName];
        if (!serviceRoutes || serviceRoutes.length === 0) return;

        // Add service header
        var serviceHeader = document.createElement('div');
        serviceHeader.style.cssText = `
            font-weight: bold;
            margin: 8px 0 4px 0;
            padding: 4px 8px;
            background: #f0fff0;
            border-radius: 3px;
            color: #006400;
            font-size: 11px;
        `;
        serviceHeader.textContent = serviceName;
        legend.appendChild(serviceHeader);

        // Add routes for this service
        serviceRoutes.forEach(function(routeId) {
            var count = fgcTrainsByRoute[routeId].length;
            var routeData = fgcRouteColors[routeId];
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
        color: #006400;
    `;
    closeBtn.onclick = function() {
        legend.remove();
    };
    legend.appendChild(closeBtn);

    // Add to map container
    document.getElementById('map').appendChild(legend);
}

// FGC Manual data entry functions
function openFGCJson() {
    window.open('https://dadesobertes.fgc.cat/api/explore/v2.1/console', '_blank');
}

function showFGCDataEntry() {
    var entryDiv = document.getElementById('fgc-manual-data-entry');
    if (entryDiv) {
        entryDiv.style.display = entryDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function processFGCManualJsonData() {
    var jsonTextarea = document.getElementById('fgc-manual-json-data');
    if (!jsonTextarea || !jsonTextarea.value.trim()) {
        alert('Si us plau, enganxa les dades JSON de FGC primer.');
        return;
    }

    try {
        var jsonData = JSON.parse(jsonTextarea.value.trim());
        console.log('Processing manual FGC JSON data...');

        // For now, assume FGC provides similar format to RENFE
        // This will need to be adapted when real FGC GTFS-RT is available
        var decodedTrains = decodeRenfeJsonData(jsonData); // Using same decoder for now

        if (decodedTrains && decodedTrains.length > 0) {
            console.log('✅ Successfully processed', decodedTrains.length, 'FGC trains from manual data!');
            displayFGCRealtimeTrains(decodedTrains);

            // Clear the textarea
            jsonTextarea.value = '';

            // Hide the manual entry form
            showFGCDataEntry();

            alert('Dades processades! Veus ' + decodedTrains.length + ' trens FGC reals al mapa.');
        } else {
            alert('No s\'han trobat dades de trens vàlides en el JSON. Comprova que has copiat les dades correctes.');
        }
    } catch (error) {
        console.error('Error processing manual FGC JSON data:', error);
        alert('Error processant les dades JSON. Comprova que el format és correcte.');
    }
}

// Helper functions for FGC manual data entry
function copyFGCUrl() {
    var fgcUrl = 'https://dadesobertes.fgc.cat/api/explore/v2.1/console';
    console.log('Copying FGC URL:', fgcUrl);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fgcUrl).then(function() {
            console.log('✅ FGC URL copied using modern clipboard API');
            alert('✅ URL de FGC copiada al porta-retalls!\n\n' + fgcUrl);
        }).catch(function(err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
            fallbackFGCCopy(fgcUrl, 'URL de FGC');
        });
    } else {
        console.log('Modern clipboard API not available, using fallback');
        fallbackFGCCopy(fgcUrl, 'URL de FGC');
    }
}

function fallbackFGCCopy(text, description) {
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

function shareFGCMapUrl() {
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

function copyFGCInstructions() {
    var instructions = "PASSOS PER COPIAR LES DADES FGC:\n\n";
    instructions += "1. Ves a la pestanya FGC que s'ha obert\n";
    instructions += "2. Prem Ctrl+A (seleccionar tot)\n";
    instructions += "3. Prem Ctrl+C (copiar)\n";
    instructions += "4. Torna aquí i prem Ctrl+V (enganxar)\n";
    instructions += "5. Clica 'Processar Dades Reals'\n\n";
    instructions += "URL: https://dadesobertes.fgc.cat/api/explore/v2.1/console";

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

function clearFGCTextarea() {
    var jsonTextarea = document.getElementById('fgc-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = '';
        updateFGCJsonStatus('Textarea netejat. Preparat per enganxar dades.');
    }
}

function testFGCSampleData() {
    // Sample FGC JSON data for testing (similar to RENFE format)
    var sampleData = {
        "header": {
            "gtfsRealtimeVersion": "2.0",
            "timestamp": "1766825736"
        },
        "entity": [
            {
                "id": "FGC_S1_001",
                "vehicle": {
                    "trip": {
                        "tripId": "S1_12345",
                        "startTime": "12:00:00",
                        "startDate": "20231227",
                        "routeId": "S1"
                    },
                    "position": {
                        "latitude": 41.5464,
                        "longitude": 2.1086,
                        "bearing": 45.0,
                        "speed": 25.0
                    },
                    "currentStatus": "IN_TRANSIT_TO",
                    "timestamp": 1766825734,
                    "stopId": "70001",
                    "vehicle": {
                        "id": "S1-001",
                        "label": "S1-001-PLATF.(1)"
                    }
                }
            },
            {
                "id": "FGC_L6_002",
                "vehicle": {
                    "trip": {
                        "tripId": "L6_67890",
                        "startTime": "12:15:00",
                        "startDate": "20231227",
                        "routeId": "L6"
                    },
                    "position": {
                        "latitude": 41.3851,
                        "longitude": 2.1734,
                        "bearing": 90.0,
                        "speed": 0.0
                    },
                    "currentStatus": "STOPPED_AT",
                    "timestamp": 1766825734,
                    "stopId": "60002",
                    "vehicle": {
                        "id": "L6-002",
                        "label": "L6-002-PLATF.(2)"
                    }
                }
            }
        ]
    };

    var jsonTextarea = document.getElementById('fgc-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = JSON.stringify(sampleData, null, 2);
        updateFGCJsonStatus('Dades d\'exemple carregades. Clica "Processar Dades Reals" per veure trens FGC.');
    }
}

function updateFGCJsonStatus(status) {
    var statusElement = document.getElementById('fgc-json-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Toggle FGC train legend visibility
function toggleFGCTrainLegend() {
    var legend = document.getElementById('fgc-train-legend');
    var legendBtn = document.getElementById('fgc-legend-btn');

    if (!legend) {
        // Legend doesn't exist, create it and show
        if (fgcRealtimeTrainMarkers.length > 0) {
            createFGCTrainLegend(fgcTrainsByRoute, fgcRouteInfo);
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            alert('No hi ha trens FGC al mapa. Inicia la visualització de trens FGC primer.');
            return;
        }
    } else {
        // Legend exists, toggle visibility
        var currentDisplay = window.getComputedStyle(legend).display;
        if (currentDisplay === 'none') {
            legend.style.display = 'block';
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            legend.style.display = 'none';
            legendBtn.textContent = '🎨 Mostrar Llegenda';
        }
    }
}

// Make FGC functions globally accessible
window.startRealtimeFGCTrains = startRealtimeFGCTrains;
window.stopRealtimeFGCTrains = stopRealtimeFGCTrains;
window.openFGCJson = openFGCJson;
window.showFGCDataEntry = showFGCDataEntry;
window.processFGCManualJsonData = processFGCManualJsonData;
window.toggleFGCTrainLegend = toggleFGCTrainLegend;
