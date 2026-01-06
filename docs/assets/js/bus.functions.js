// TMB Bus Stops Visualization
var tmbBusStopsMarkers = [];
var tmbBusStopsInterval = null;
var allTMBStops = []; // Store all stops data
var allTMBLines = []; // Store all bus lines data
var tmbBatchProcessingCancelled = false; // Flag to cancel batch processing
var tmbBusVehiclesEnabled = true; // Enable/disable bus vehicle markers

// Start TMB bus stops visualization
function startTMBBusStops() {
    if (tmbBusStopsInterval) {
        stopTMBBusStops();
        return;
    }

    // Initial load
    fetchAllTMBBusStops().then(function(stops) {
        displayTMBBusStops(stops);
    });

    // Update every 10 minutes for stops data
    tmbBusStopsInterval = setInterval(function() {
        fetchAllTMBBusStops().then(function(stops) {
            displayTMBBusStops(stops);
        });
    }, 600000); // 10 minutes

    // Add toggle button for bus vehicle markers if it doesn't exist
    var controlsDiv = document.querySelector('.sidebar-pane#bus .sidebar-pane');
    if (controlsDiv) {
        var existingToggleBtn = document.getElementById('toggle-bus-vehicles-btn');
        if (!existingToggleBtn) {
            var toggleBtn = document.createElement('button');
            toggleBtn.id = 'toggle-bus-vehicles-btn';
            toggleBtn.textContent = tmbBusVehiclesEnabled ? '🚍 Ocultar autobusos' : '🚍 Mostrar autobusos';
            toggleBtn.title = tmbBusVehiclesEnabled ? 'Amagar marcadors d\'autobusos al mapa' : 'Mostrar marcadors d\'autobusos al mapa';
            toggleBtn.style.background = '#666';
            toggleBtn.style.color = 'white';
            toggleBtn.style.border = 'none';
            toggleBtn.style.padding = '10px 15px';
            toggleBtn.style.borderRadius = '5px';
            toggleBtn.style.cursor = 'pointer';
            toggleBtn.style.fontSize = '14px';
            toggleBtn.style.marginBottom = '10px';
            toggleBtn.onclick = function() {
                toggleTMBBusVehicles();
            };

            // Insert after the stop button
            var stopBtn = document.getElementById('stop-tmb-stops-btn');
            if (stopBtn && stopBtn.parentNode) {
                stopBtn.parentNode.insertBefore(toggleBtn, stopBtn.nextSibling);
            }
        }
    }

    // Update UI
    document.getElementById('start-tmb-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-tmb-stops-btn').style.display = 'none';
    document.getElementById('toggle-bus-vehicles-btn').style.display = 'inline-block';
    updateTMBBusStopsStatus(getTranslation('bus_status_loading'));
}

// Toggle bus vehicle markers visibility
function toggleTMBBusVehicles() {
    tmbBusVehiclesEnabled = !tmbBusVehiclesEnabled;

    console.log('🚍 TMB bus vehicle markers', tmbBusVehiclesEnabled ? 'ENABLED' : 'DISABLED');

    // Remove ALL existing bus vehicle markers from the map and markers array
    if (tmbBusStopsMarkers && tmbBusStopsMarkers.length > 0) {
        // Filter out bus vehicle markers (keep only bus stop markers)
        var filteredMarkers = [];
        var removedCount = 0;

        tmbBusStopsMarkers.forEach(function(marker) {
            if (marker && marker.options && marker.options.icon &&
                marker.options.icon.options && marker.options.icon.options.className === 'tmb-bus-vehicle-marker') {
                // This is a bus vehicle marker - remove from map
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
                removedCount++;
                console.log('🚍 Removed bus vehicle marker from map');
            } else {
                // This is a bus stop marker - keep it
                filteredMarkers.push(marker);
            }
        });

        // Update the markers array to only contain stop markers
        tmbBusStopsMarkers = filteredMarkers;

        console.log('🚍 Removed', removedCount, 'bus vehicle markers, kept', tmbBusStopsMarkers.length, 'stop markers');

        // If enabling, re-add bus vehicle markers for stops with real-time data
        if (tmbBusVehiclesEnabled && allTMBStops && allTMBStops.length > 0) {
            console.log('🚍 Re-enabling bus vehicle markers - re-adding them to the map');

            // We need to re-process the stops to add bus vehicles
            // This requires re-fetching real-time data, which is expensive
            // For now, show a message to refresh the view
            console.log('🚍 Please refresh the bus stops view to see bus vehicle markers again');

            // TODO: Implement proper re-addition of bus markers without full refresh
            // This would require storing the processed stop data with arrivals
        }
    }

    // Update UI button if it exists
    var toggleBtn = document.getElementById('toggle-bus-vehicles-btn');
    if (toggleBtn) {
        toggleBtn.textContent = tmbBusVehiclesEnabled ? '🚍 Ocultar autobusos' : '🚍 Mostrar autobusos';
        toggleBtn.title = tmbBusVehiclesEnabled ? 'Amagar marcadors d\'autobusos al mapa' : 'Mostrar marcadors d\'autobusos al mapa';
    }

    return tmbBusVehiclesEnabled;
}

// Stop TMB bus stops visualization
function stopTMBBusStops() {
    if (tmbBusStopsInterval) {
        clearInterval(tmbBusStopsInterval);
        tmbBusStopsInterval = null;
    }

    // Set cancellation flag to stop any ongoing batch processing
    tmbBatchProcessingCancelled = true;

    // Clear all stop markers
    tmbBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbBusStopsMarkers = [];

    // Hide any bus routes
    hideTMBBusRoute();

    // Update UI
    document.getElementById('start-tmb-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-tmb-stops-btn').style.display = 'none';
    document.getElementById('toggle-bus-vehicles-btn').style.display = 'none';
    updateTMBBusStopsStatus(getTranslation('bus_status_inactive'));

    console.log('🛑 TMB bus stops visualization stopped - batch processing cancelled');
}

// Update TMB bus stops status display
function updateTMBBusStopsStatus(status) {
    var statusElement = document.getElementById('tmb-stops-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch all TMB bus stops by getting all lines first, then stops for each line
function fetchAllTMBBusStops() {
    console.log('🚌 Starting to fetch all TMB bus stops...');

    // First, get all bus lines
        return fetchTMBBusLines().then(function(lines) {
            console.log('✅ Found', lines.length, 'TMB bus lines');
            allTMBLines = lines; // Store lines data globally for better scheduled data access

            if (lines.length === 0) {
                console.warn('No bus lines found');
                return [];
            }

        // For each line, fetch stops and aggregate them
        var stopPromises = lines.map(function(line) {
            return fetchTMBStopsForLine(line.codi_linia || line.id);
        });

        return Promise.all(stopPromises).then(function(stopsArrays) {
            // Flatten and deduplicate stops
            var allStops = [];
            var stopIds = new Set();

            stopsArrays.forEach(function(stopsArray) {
                if (Array.isArray(stopsArray)) {
                    stopsArray.forEach(function(stop) {
                        var stopId = stop.id || stop.codi_parada;
                        if (stopId && !stopIds.has(stopId)) {
                            stopIds.add(stopId);
                            allStops.push(stop);
                        }
                    });
                }
            });

            console.log('🚏 SUCCESS: Retrieved', allStops.length, 'unique TMB bus stops from', lines.length, 'lines');
            return allStops;
        });
    }).catch(function(error) {
        console.error('❌ Error fetching TMB bus stops:', error);
        alert(getTranslation('bus_error_loading') + ': ' + error.message);
        return [];
    });
}

// Fetch all TMB bus lines
function fetchTMBBusLines() {
    var apiUrl = 'https://api.tmb.cat/v1/transit/linies/bus?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🚌 Fetching TMB bus lines from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('TMB bus lines API failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB bus lines API response:', data);

            var lines = [];

            // Process TMB API response - assuming it returns features array like other TMB endpoints
            if (data && data.features && Array.isArray(data.features)) {
                data.features.forEach(function(feature) {
                    if (feature.properties) {
                        lines.push({
                            id: feature.properties.CODI_LINIA || feature.properties.codi_linia,
                            codi_linia: feature.properties.CODI_LINIA || feature.properties.codi_linia,
                            nom_linia: feature.properties.NOM_LINIA || feature.properties.nom_linia,
                            descripcio: feature.properties.DESCRIPCIO || feature.properties.descripcio
                        });
                    }
                });
            } else if (data && Array.isArray(data)) {
                // Alternative format - direct array
                data.forEach(function(line) {
                    lines.push({
                        id: line.CODI_LINIA || line.codi_linia,
                        codi_linia: line.CODI_LINIA || line.codi_linia,
                        nom_linia: line.NOM_LINIA || line.nom_linia,
                        descripcio: line.DESCRIPCIO || line.descripcio
                    });
                });
            } else {
                console.warn('Unexpected TMB bus lines response format:', data);
            }

            return lines;
        })
        .catch(error => {
            console.error('❌ TMB bus lines API error:', error);
            throw error;
        });
}

// Fetch stops for a specific TMB bus line
function fetchTMBStopsForLine(lineCode) {
    var apiUrl = 'https://api.tmb.cat/v1/transit/linies/bus/' + encodeURIComponent(lineCode) + '/parades?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🚏 Fetching TMB stops for line', lineCode, 'from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('TMB stops API failed for line', lineCode, ':', response.status, response.statusText);
                return []; // Return empty array instead of throwing to continue with other lines
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB stops API response for line', lineCode, ':', data);

            var stops = [];

            // Process TMB API response for stops
            if (data && data.features && Array.isArray(data.features)) {
                data.features.forEach(function(feature) {
                    if (feature.properties && feature.geometry && feature.geometry.coordinates) {
                        var coords = feature.geometry.coordinates;
                        var lat = coords[1]; // GeoJSON: [lng, lat]
                        var lng = coords[0];

                        if (typeof lat === 'number' && typeof lng === 'number' &&
                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                            stops.push({
                                id: feature.properties.CODI_PARADA || feature.properties.codi_parada,
                                codi_parada: feature.properties.CODI_PARADA || feature.properties.codi_parada,
                                nom_parada: feature.properties.NOM_PARADA || feature.properties.nom_parada,
                                lat: lat,
                                lng: lng,
                                line: lineCode
                            });
                        }
                    }
                });
            } else if (data && Array.isArray(data)) {
                // Alternative format
                data.forEach(function(stop) {
                    if (stop.lat && stop.lng) {
                        stops.push({
                            id: stop.codi_parada || stop.id,
                            codi_parada: stop.codi_parada || stop.id,
                            nom_parada: stop.nom_parada || stop.name,
                            lat: parseFloat(stop.lat),
                            lng: parseFloat(stop.lng),
                            line: lineCode
                        });
                    }
                });
            }

            console.log('🚏 Processed', stops.length, 'stops for line', lineCode);
            return stops;
        })
        .catch(error => {
            console.error('❌ TMB stops API error for line', lineCode, ':', error);
            return []; // Return empty array to continue processing other lines
        });
}

// Fetch scheduled bus times for a specific TMB stop and line using the correct API structure
function fetchTMBScheduledBusesForStop(stopCode, stop) {
    // Get the line code from the stop data (stored during initial loading from /transit/linies/bus/{lineCode}/parades)
    var lineCode = stop.line || stop.codi_linia;

    if (!lineCode) {
        console.log('📅 No line information available for stop', stopCode, '- cannot fetch scheduled data from /transit/linies/bus/{line}/parades/{stop}/horespas');
        return Promise.resolve([]);
    }

    // Use the exact API structure provided: /transit/linies/bus/{codi_linia}/parades/{codi_parada}/horespas
    var apiUrl = 'https://api.tmb.cat/v1/transit/linies/bus/' + encodeURIComponent(lineCode) + '/parades/' + encodeURIComponent(stopCode) + '/horespas?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('📅 Fetching scheduled times using TMB API structure: /transit/linies/bus/' + lineCode + '/parades/' + stopCode + '/horespas');

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('❌ TMB scheduled API failed for line', lineCode, 'stop', stopCode, ': HTTP', response.status, response.statusText);
                return [];
            }
            return response.json();
        })
        .then(data => {
            var scheduledArrivals = [];

            // Process TMB scheduled API response from /transit/linies/bus/{line}/parades/{stop}/horespas
            if (data && Array.isArray(data)) {
                // Direct array response
                data.forEach(function(schedule) {
                    processScheduledEntry(schedule, scheduledArrivals, lineCode, stopCode);
                });
            } else if (data && data.horesPas && Array.isArray(data.horesPas)) {
                // Nested horesPas array
                data.horesPas.forEach(function(schedule) {
                    processScheduledEntry(schedule, scheduledArrivals, lineCode, stopCode);
                });
            } else if (data && data.horaris && Array.isArray(data.horaris)) {
                // Alternative horaris array
                data.horaris.forEach(function(schedule) {
                    processScheduledEntry(schedule, scheduledArrivals, lineCode, stopCode);
                });
            } else {
                console.log('📅 Scheduled API returned unexpected format for stop', stopCode, 'line', lineCode);
            }

            console.log('📅 ✅ Successfully loaded', scheduledArrivals.length, 'scheduled arrivals for stop', stopCode, 'on line', lineCode);
            return scheduledArrivals;
        })
        .catch(error => {
            console.error('❌ TMB scheduled API error for line', lineCode, 'stop', stopCode, ':', error);
            return [];
        });
}

// Helper function to process individual scheduled time entries
function processScheduledEntry(schedule, scheduledArrivals, lineCode, stopCode) {
    try {
        var routeId = schedule.codi_linia || lineCode;
        var destination = schedule.desti_trajecte || '';
        var scheduledTimeStr = schedule.horaPas || schedule.hora || '';

        // Parse scheduled time (format: "HH:MM")
        if (scheduledTimeStr && typeof scheduledTimeStr === 'string') {
            var timeParts = scheduledTimeStr.split(':');
            if (timeParts.length === 2) {
                var hours = parseInt(timeParts[0]);
                var minutes = parseInt(timeParts[1]);

                if (!isNaN(hours) && !isNaN(minutes)) {
                    // Create scheduled time for today
                    var scheduledTime = new Date();
                    scheduledTime.setHours(hours, minutes, 0, 0);

                    // If the time has already passed today, assume it's for tomorrow
                    if (scheduledTime.getTime() < Date.now()) {
                        scheduledTime.setDate(scheduledTime.getDate() + 1);
                    }

                    var now = new Date().getTime();
                    var arrivalMs = scheduledTime.getTime();
                    var diffMs = arrivalMs - now;
                    var timeToArrival = Math.max(0, Math.round(diffMs / (1000 * 60))); // Convert to minutes

                    scheduledArrivals.push({
                        id: routeId + '-' + stopCode + '-scheduled-' + scheduledTimeStr,
                        route: routeId,
                        destination: destination,
                        timeToArrival: timeToArrival,
                        scheduledTime: scheduledTime,
                        status: 'Horari',
                        isRealtime: false,
                        scheduledTimeStr: scheduledTimeStr
                    });
                }
            }
        }
    } catch (error) {
        console.warn('❌ Error processing scheduled entry for stop', stopCode, ':', error, schedule);
    }
}

// Fetch real-time bus arrivals for a specific TMB stop, with fallback to scheduled data
function fetchTMBRealtimeBusesForStop(stopCode) {
    var apiUrl = 'https://api.tmb.cat/v1/itransit/bus/parades/' + encodeURIComponent(stopCode) + '?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🕒 Fetching real-time bus arrivals for stop', stopCode, 'from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('TMB real-time API failed for stop', stopCode, ':', response.status, response.statusText);
                // Try to get scheduled data as fallback
                return fetch(apiUrl).then(() => null).catch(() => null);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB real-time API response for stop', stopCode, ':', data);

            var arrivals = [];

            // Process TMB iTransit API response - bus arrivals for a specific stop
            // The response format is: {timestamp, parades: [...]}
            if (data && data.parades && Array.isArray(data.parades)) {
                data.parades.forEach(function(parada) {
                    console.log('🔍 Processing TMB stop:', parada.street_name || parada.code, 'code:', parada.code);

                    // Process buses arriving at this stop
                    if (parada.linies_trajectes && Array.isArray(parada.linies_trajectes)) {
                        parada.linies_trajectes.forEach(function(linia) {
                            if (linia.propers_busos && Array.isArray(linia.propers_busos)) {
                                linia.propers_busos.forEach(function(bus) {
                                    try {
                                        console.log('🔍 Processing TMB bus arrival:', bus, 'from line:', linia.codi_linia);

                                        var routeId = linia.codi_linia || 'Unknown';
                                        var busId = linia.codi_trajecte || 'Unknown';
                                        var destination = linia.desti_trajecte || '';
                                        var timeArrival = bus.temps_arribada || 0;
                                        var scheduledTime = null;

                                        // Store the actual arrival timestamp for countdown calculation
                                        if (typeof timeArrival === 'number' && timeArrival > 1000000000000) { // Unix timestamp in milliseconds
                                            scheduledTime = new Date(timeArrival);
                                            var now = new Date().getTime();
                                            var diffMs = scheduledTime - now;
                                            timeArrival = Math.max(0, Math.round(diffMs / (1000 * 60))); // Convert to minutes
                                        } else {
                                            // TMB API returns temps_arribada in seconds, convert to minutes
                                            timeArrival = Math.max(0, Math.round(timeArrival / 60)); // Convert seconds to minutes
                                            scheduledTime = new Date(Date.now() + (timeArrival * 60 * 1000));
                                        }

                                        arrivals.push({
                                            id: busId + '-' + stopCode,
                                            route: routeId,
                                            destination: destination,
                                            timeToArrival: timeArrival,
                                            scheduledTime: scheduledTime, // Store the actual arrival time
                                            status: 'Arriving at stop',
                                            isRealtime: true
                                        });

                                        console.log('✅ Processed TMB bus arrival:', busId, routeId, 'at stop', stopCode, 'in', timeArrival, 'min');
                                    } catch (error) {
                                        console.warn('Error processing TMB bus at stop', stopCode, ':', error, bus);
                                    }
                                });
                            }
                        });
                    }
                });
            }

            console.log('🕒 Processed', arrivals.length, 'real-time arrivals for stop', stopCode);

            // If no real-time arrivals found, try to get scheduled data
            if (arrivals.length === 0) {
                console.log('📅 No real-time data for stop', stopCode, '- attempting to fetch scheduled data');
                // Note: Scheduled data fetching would require line information
                // This is a placeholder for future enhancement
            }

            return arrivals;
        })
        .catch(error => {
            console.error('❌ TMB real-time API error for stop', stopCode, ':', error);
            return []; // Return empty array instead of null to indicate no data available
        });
}

// Define TMB bus colors for different lines
var tmbBusLineColors = {
    '1': '#FF6B6B', '2': '#4ECDC4', '3': '#45B7D1', '4': '#FFA07A',
    '5': '#98D8C8', '6': '#F7DC6F', '7': '#BB8FCE', '8': '#85C1E9',
    '9': '#F8C471', '10': '#95A5A6', '11': '#E74C3C', '12': '#3498DB',
    '13': '#2ECC71', '14': '#9B59B6', '15': '#F39C12', '16': '#1ABC9C',
    '17': '#E67E22', '18': '#34495E', '19': '#16A085', '20': '#8E44AD',
    'A1': '#FF0000', 'A2': '#0000FF', 'N1': '#FF1493', 'N2': '#00FF00',
    'N3': '#FFFF00'
};

// Display TMB bus stops on map with real-time data and bus vehicle markers
function displayTMBBusStops(stops) {
    console.log('🚏 DISPLAYING', stops.length, 'TMB BUS STOPS ON MAP...');

    // Clear existing markers
    tmbBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbBusStopsMarkers = [];

    var totalStops = 0;
    var totalBusMarkers = 0;
    var stopsLoaded = 0;
    var realtimeLoaded = 0;

    // Phase 1: Load general stop information and create markers
    updateTMBBusStopsStatus('📍 Carregant parades d\'autobús... (0/' + stops.length + ')');

    stops.forEach(function(stop, index) {
        if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
            // Get stop reference number for display
            var stopCode = stop.codi_parada || stop.id;
            var stopRef = stopCode || '?';
            // Truncate if too long for display
            if (stopRef.length > 5) {
                stopRef = stopRef.substring(0, 5) + '..';
            }

            // Create basic square marker (neutral color, will be updated with data)
            var markerHtml = '<div style="width: 24px; height: 24px; background: #666; border: 2px solid #999; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 1px 1px 3px rgba(0,0,0,0.7);">' +
                '<span style="color: white; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.7);">' + stopRef + '</span>' +
                '</div>';

            var stopMarker = L.marker([stop.lat, stop.lng], {
                icon: L.divIcon({
                    html: markerHtml,
                    className: 'tmb-bus-stop-marker',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                })
            });

            // Create basic popup without real-time data
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: #c41e3a; border-bottom: 2px solid #c41e3a; padding-bottom: 4px;">' +
                '🚏 Parada TMB ' + (stop.codi_parada || stop.id) + '</h4>' +
                '<div style="background: #c41e3a15; border: 1px solid #c41e3a; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                '<strong>Nom:</strong> ' + (stop.nom_parada || 'Sense nom') + '<br>' +
                '<strong>Codi:</strong> ' + (stop.codi_parada || stop.id) + '<br>' +
                '<strong>Posició:</strong> ' + stop.lat.toFixed(4) + ', ' + stop.lng.toFixed(4) +
                '</div>' +
                '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                '<em>Carregant informació de temps real...</em>' +
                '</div>' +
                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                '🚌 Transport Metropolità de Barcelona' +
                '</div>' +
                '</div>';

            // Create popup with auto-refresh on open
            var popup = L.popup().setContent(popupContent);
            popup.on('popupopen', function() {
                console.log('🚌 Popup opened for stop', stop.codi_parada || stop.id, '- refreshing data');
                refreshTMBStop(stop);
            });
            stopMarker.bindPopup(popup);

            // Add marker to map
            stopMarker.addTo(map);
            tmbBusStopsMarkers.push(stopMarker);
            totalStops++;

            // Update counter every few stops
            stopsLoaded++;
            if (stopsLoaded % 50 === 0 || stopsLoaded === stops.length) {
                updateTMBBusStopsStatus('📍 Carregant parades d\'autobús... (' + stopsLoaded + '/' + stops.length + ')');
            }
        }
    });

    console.log('✅ PHASE 1 COMPLETE: Created', totalStops, 'bus stop markers');

    // Phase 2: Load real-time data and update markers
    updateTMBBusStopsStatus('🕒 Carregant informació de temps real... (0/' + totalStops + ')');

    // Fetch real-time data in batches to avoid overwhelming the API
    fetchRealtimeDataInBatches(stops, 0).then(function(stopsWithRealtime) {
        // Store timestamp when data was fetched
        var dataFetchedAt = new Date();

        stopsWithRealtime.forEach(function(stop) {
            // Define stopCode outside the condition so it's available for popup
            var stopCode = stop.codi_parada || stop.id;

            if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
                // Get stop reference number for display
                var stopRef = stopCode || '?';
                // Truncate if too long for display
                if (stopRef.length > 5) {
                    stopRef = stopRef.substring(0, 5) + '..';
                }

                // Check if there are active buses (has real-time or scheduled data)
                var hasActiveBuses = stop.realtimeArrivals && stop.realtimeArrivals.length > 0;
                var hasRealtimeData = hasActiveBuses && stop.realtimeArrivals.some(function(arrival) { return arrival.isRealtime; });
                var hasOnlyScheduledData = hasActiveBuses && !hasRealtimeData;

                // Create different marker styles for real-time vs scheduled stops
                var markerHtml, stopRefBgColor, stopRefBorderColor, markerSize, iconSize, iconAnchor;

                if (hasOnlyScheduledData) {
                    // Blue-themed square marker for scheduled-only stops
                    stopRefBgColor = '#0066cc';
                    stopRefBorderColor = '#004499';
                    markerSize = 28; // Slightly larger for scheduled data
                    iconSize = [28, 28];
                    iconAnchor = [14, 28];
                } else if (hasRealtimeData) {
                    // Green-themed square marker for real-time stops - make them more prominent
                    stopRefBgColor = '#00aa00';
                    stopRefBorderColor = '#008800';
                    markerSize = 32; // Even larger for real-time data
                    iconSize = [32, 32];
                    iconAnchor = [16, 32];
                } else {
                    // Default red square marker for stops with no data
                    stopRefBgColor = '#c41e3a';
                    stopRefBorderColor = '#a0172e';
                    markerSize = 24; // Normal size for no data
                    iconSize = [24, 24];
                    iconAnchor = [12, 24];
                }

                // Create a simple square marker with just the stop ID
                markerHtml = '<div style="width: ' + markerSize + 'px; height: ' + markerSize + 'px; background: ' + stopRefBgColor + '; border: 2px solid ' + stopRefBorderColor + '; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 1px 1px 3px rgba(0,0,0,0.7);">' +
                    '<span style="color: white; font-size: ' + (markerSize > 24 ? '12px' : '10px') + '; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.7);">' + stopRef + '</span>' +
                    '</div>';

                // Find the existing marker for this stop and update it
                var existingMarker = null;
                for (var i = 0; i < tmbBusStopsMarkers.length; i++) {
                    var marker = tmbBusStopsMarkers[i];
                    if (marker && marker.getLatLng) {
                        var markerLatLng = marker.getLatLng();
                        if (Math.abs(markerLatLng.lat - stop.lat) < 0.0001 &&
                            Math.abs(markerLatLng.lng - stop.lng) < 0.0001) {
                            existingMarker = marker;
                            break;
                        }
                    }
                }

                if (existingMarker) {
                    // Update the existing marker with new icon and popup
                    existingMarker.setIcon(L.divIcon({
                        html: markerHtml,
                        className: 'tmb-bus-stop-marker',
                        iconSize: iconSize,
                        iconAnchor: iconAnchor
                    }));

                    // Create updated popup content
                    var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                        '<h4 style="margin: 0 0 8px 0; color: #c41e3a; border-bottom: 2px solid #c41e3a; padding-bottom: 4px;">' +
                        '🚏 Parada TMB ' + (stop.codi_parada || stop.id) + '</h4>' +
                        '<div style="background: #c41e3a15; border: 1px solid #c41e3a; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                        '<strong>Nom:</strong> ' + (stop.nom_parada || 'Sense nom') + '<br>' +
                        '<strong>Codi:</strong> ' + (stop.codi_parada || stop.id) + '<br>' +
                        '<strong>Posició:</strong> ' + stop.lat.toFixed(4) + ', ' + stop.lng.toFixed(4) +
                        '</div>';

                    // Add real-time arrivals section
                    if (stop.realtimeArrivals && stop.realtimeArrivals.length > 0) {
                        popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                            '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🕒 Próxims autobusos</h5>' +
                            '<div style="max-height: 150px; overflow-y: auto;">';

                        var activeArrivals = stop.realtimeArrivals.filter(function(arrival) {
                            return arrival.timeToArrival > 0;
                        });
                        activeArrivals.slice(0, 10).forEach(function(arrival, index) { // Show up to 10 active arrivals
                            var arrivalId = 'tmb-arrival-' + stop.codi_parada + '-' + index;
                            var scheduledTime = arrival.scheduledTime;

                            var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                            var countdownStr = getTMBCountdownString(arrival, scheduledTime);

                            // Determine data source indicator
                            var dataSourceText = arrival.isRealtime ? '🕒 Temps real' : '📅 Horari';
                            var dataSourceColor = arrival.isRealtime ? '#00aa00' : '#0066cc';

                            popupContent += '<div style="margin-bottom: 6px; padding: 6px; background: #fff; border-radius: 3px; border: 1px solid #eee;">' +
                                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                                '<div style="font-weight: bold; color: #c41e3a;">Línia ' + arrival.route + '</div>' +
                                '<div style="font-size: 10px; color: ' + dataSourceColor + '; font-weight: bold;">' + dataSourceText + '</div>' +
                                '</div>' +
                                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                                '<div style="font-size: 11px; color: #666;">' + getTranslation('bus_arrival_time') + ': ' + scheduledTimeStr + '</div>' +
                                '<div id="' + arrivalId + '" style="font-weight: bold; font-family: monospace;">' + countdownStr + '</div>' +
                                '</div>';
                            if (arrival.destination) {
                                popupContent += '<div style="font-size: 11px; color: #666; margin-top: 2px;">➜ ' + arrival.destination + '</div>';
                            }
                            popupContent += '</div>';

                            // Start live countdown update for this arrival
                            startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
                        });

                        popupContent += '</div></div>';

                        // Now add bus vehicle markers for buses arriving at this stop - one per unique line
                        var linesWithArrivals = {};
                        stop.realtimeArrivals.forEach(function(arrival) {
                            if (arrival.timeToArrival <= 1) { // Only consider buses arriving within 1 minute
                                if (!linesWithArrivals[arrival.route]) {
                                    linesWithArrivals[arrival.route] = [];
                                }
                                linesWithArrivals[arrival.route].push(arrival);
                            }
                        });

                        // Create one marker per unique line
                        Object.keys(linesWithArrivals).slice(0, 5).forEach(function(lineRoute) { // Show up to 5 different lines
                            var arrivalsForLine = linesWithArrivals[lineRoute];
                            var nextArrival = arrivalsForLine[0]; // Use the first/next arrival for this line
                            var busColor = tmbBusLineColors[lineRoute] || '#c41e3a';

                            var busMarkerHtml = '<div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.8));">' +
                                '<div style="font-size: 20px; position: relative;">' +
                                '<span style="position: absolute; top: -2px; left: 50%; transform: translateX(-50%); font-size: 8px; font-weight: bold; color: #000; text-shadow: 1px 1px 1px rgba(255,255,255,0.8);">' + lineRoute + '</span>' +
                                '🚌</div>' +
                                '</div>';

                            var busMarker = L.marker([stop.lat, stop.lng], {
                                icon: L.divIcon({
                                    html: busMarkerHtml,
                                    className: 'tmb-bus-vehicle-marker',
                                    iconSize: [28, 28],
                                    iconAnchor: [14, 24]
                                })
                            });

                            // Create bus popup showing all arrivals for this line
                            var busPopupContent = '<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                                '<h4 style="margin: 0 0 8px 0; color: ' + busColor + '; border-bottom: 2px solid ' + busColor + '; padding-bottom: 4px;">' +
                                '🚌 Autobús TMB Línia ' + lineRoute + '</h4>' +
                                '<div style="background: ' + busColor + '15; border: 1px solid ' + busColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">';

                            arrivalsForLine.slice(0, 3).forEach(function(arrival, index) { // Show up to 3 arrivals for this line
                                if (index > 0) busPopupContent += '<br>';
                                busPopupContent += '<strong>Arribada ' + (index + 1) + ':</strong> <span style="font-weight: bold; color: ' +
                                    (arrival.timeToArrival <= 2 ? '#d63031' : arrival.timeToArrival <= 5 ? '#e17055' : '#0066cc') + ';">' +
                                    (arrival.timeToArrival === 0 ? 'Arribant ara' : arrival.timeToArrival + ' min') + '</span>';
                                if (arrival.destination) {
                                    busPopupContent += ' ➜ ' + arrival.destination;
                                }
                            });

                            busPopupContent += '<br><strong>Parada actual:</strong> ' + (stop.nom_parada || 'Sense nom') + ' (' + stopRef + ')' +
                                '<br><button onclick="showTMBBusRoute(\'' + lineRoute + '\')" style="margin-top: 8px; background: ' + busColor + '; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">🛣️ Mostrar ruta</button>' +
                                '</div>' +
                                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                                '🚌 Transport Metropolità de Barcelona' +
                                '</div>' +
                                '</div>';

                            busMarker.bindPopup(busPopupContent);

                            // Add bus marker to map
                            busMarker.addTo(map);
                            tmbBusStopsMarkers.push(busMarker);
                            totalBusMarkers++;

                            console.log('✅ ADDED TMB BUS VEHICLE MARKER: Line', lineRoute, 'at stop', stopRef, 'with', arrivalsForLine.length, 'arrivals');
                        });
                    } else {
                        popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                            '<em>Sense informació de temps real</em>' +
                            '</div>';
                    }

                    // Add refresh button and data fetch timestamp
                    popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                        '<div style="margin-bottom: 4px;">' +
                        '<button onclick="refreshTMBStop({codi_parada: \'' + (stop.codi_parada || stop.id) + '\', nom_parada: \'' + (stop.nom_parada || 'Sense nom').replace(/'/g, '\\\'') + '\', lat: ' + stop.lat + ', lng: ' + stop.lng + '})" ' +
                        'style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">' +
                        '🔄 ' + getTranslation('bus_refresh_stop') + '</button>' +
                        '</div>' +
                        '<em>' + getTranslation('bus_data_fetched_at') + ' ' + dataFetchedAt.toLocaleTimeString() + '</em>' +
                        '</div>';

                    popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                        '🚌 Transport Metropolità de Barcelona' +
                        '</div>' +
                        '</div>';

                    // Update the existing marker's popup
                    existingMarker.setPopupContent(popupContent);

                    totalStops++;

                    console.log('✅ UPDATED TMB BUS STOP MARKER:', stop.codi_parada || stop.id, stop.nom_parada, 'with', stop.realtimeArrivals ? stop.realtimeArrivals.length : 0, 'real-time arrivals');
                } else {
                    console.warn('❌ Could not find existing marker for TMB bus stop:', stop.codi_parada || stop.id, stop.lat, stop.lng);
                }
            } else {
                console.warn('❌ INVALID COORDS for TMB bus stop:', stop.codi_parada || stop.id, stop.lat, stop.lng);
            }
        });

        console.log('🎯 TOTAL TMB BUS STOP MARKERS CREATED:', totalStops);
        console.log('🚌 TOTAL TMB BUS VEHICLE MARKERS CREATED:', totalBusMarkers);

        // Update status
        updateTMBBusStopsStatus('🚏 Mostrant ' + totalStops + ' parades i ' + totalBusMarkers + ' autobusos TMB amb temps real');

        console.log('🎉 TMB BUS STOPS AND VEHICLES WITH REAL-TIME DATA DISPLAY COMPLETED SUCCESSFULLY!');
    }).catch(function(error) {
        console.error('❌ Error processing real-time data for TMB stops:', error);
        updateTMBBusStopsStatus('Error carregant dades temps real');
    });
}

// Fetch real-time data in batches to avoid overwhelming the API
function fetchRealtimeDataInBatches(stops, startIndex) {
    var batchSize = 100; // Process 100 stops at a time
    var delayBetweenBatches = 1000; // 1 second delay between batches

    return new Promise(function(resolve, reject) {
        var results = [];
        var processedCount = 0;

        function processBatch(index) {
            // Check if processing was cancelled
            if (tmbBatchProcessingCancelled) {
                console.log('🛑 Batch processing cancelled at index', index);
                resolve(results); // Resolve with whatever we have so far
                return;
            }

            if (index >= stops.length) {
                // All batches processed
                resolve(results);
                return;
            }

            var endIndex = Math.min(index + batchSize, stops.length);
            var batch = stops.slice(index, endIndex);

            console.log('📡 Processing batch of', batch.length, 'stops (', index, 'to', endIndex - 1, ')');

            // Process this batch - load scheduled data first, then real-time
            var batchPromises = batch.map(function(stop) {
                if (stop.codi_parada || stop.id) {
                    var stopCode = stop.codi_parada || stop.id;

                    // First try to get real-time data for all stops
                    return fetchTMBRealtimeBusesForStop(stopCode).then(function(realtimeArrivals) {
                        var realtimeData = realtimeArrivals || [];

                        if (realtimeData.length > 0) {
                            console.log('🕒 ✅ Real-time data loaded for stop', stopCode, ':', realtimeData.length, 'arrivals');
                            stop.realtimeArrivals = realtimeData;
                        } else {
                            console.log('🕒 No real-time data for stop', stopCode, '- trying scheduled data');

                            // Try scheduled data as fallback when no real-time data
                            var lineCode = stop.line || stop.codi_linia;
                            return fetchTMBScheduledBusesForStop(stopCode, stop).then(function(scheduledArrivals) {
                                var scheduledData = scheduledArrivals || [];
                                console.log('📅 Scheduled data loaded for stop', stopCode, 'as fallback:', scheduledData.length, 'arrivals');
                                stop.realtimeArrivals = scheduledData;
                                return stop;
                            }).catch(function(scheduledError) {
                                console.warn('❌ Scheduled API failed for stop', stopCode, 'line', lineCode, ':', scheduledError);
                                console.log('📅 Scheduled data failed for stop', stopCode, '- no data available');
                                stop.realtimeArrivals = [];
                                return stop;
                            });
                        }

                        // Debug: Show what data type is actually set
                        var hasRealtime = stop.realtimeArrivals.some(function(arr) { return arr.isRealtime; });
                        var hasScheduled = stop.realtimeArrivals.some(function(arr) { return !arr.isRealtime; });
                        console.log('🔍 FINAL DATA for stop', stopCode, ':', stop.realtimeArrivals.length, 'arrivals - Real-time:', hasRealtime, 'Scheduled:', hasScheduled);
                        return stop;
                    }).catch(function(realtimeError) {
                        console.warn('❌ Real-time API failed for stop', stopCode, ':', realtimeError);
                        console.log('🕒 Real-time failed for stop', stopCode, '- trying scheduled as fallback');

                        // Try scheduled data as fallback when real-time fails
                        var lineCode = stop.line || stop.codi_linia;
                        return fetchTMBScheduledBusesForStop(stopCode, stop).then(function(scheduledArrivals) {
                            var scheduledData = scheduledArrivals || [];
                            console.log('� Scheduled data loaded for stop', stopCode, 'as fallback after real-time failure:', scheduledData.length, 'arrivals');
                            stop.realtimeArrivals = scheduledData;
                            return stop;
                        }).catch(function(scheduledError) {
                            console.warn('❌ Scheduled API also failed for stop', stopCode, 'line', lineCode, ':', scheduledError);
                            stop.realtimeArrivals = [];
                            return stop;
                        });
                    });
                } else {
                    stop.realtimeArrivals = [];
                    return Promise.resolve(stop);
                }
            });

            Promise.all(batchPromises).then(function(batchResults) {
                results = results.concat(batchResults);
                processedCount += batchResults.length;

                // Update counter every batch
                updateTMBBusStopsStatus('🕒 Carregant informació de temps real... (' + processedCount + '/' + stops.length + ')');

                // If there are more batches, schedule the next one
                if (endIndex < stops.length) {
                    setTimeout(function() {
                        processBatch(endIndex);
                    }, delayBetweenBatches);
                } else {
                    // All done
                    resolve(results);
                }
            }).catch(function(error) {
                console.error('❌ Error processing batch:', error);
                reject(error);
            });
        }

        // Start processing from the beginning
        processBatch(startIndex);
    });
}

// TMB Bus Stops Table Management
var tmbStopsTableData = [];
var currentTMBTablePage = 1;
var itemsPerTMBTablePage = 25; // 25 items per page for better readability
var filteredTMBTableData = [];
var currentTMBTableSortColumn = 'id'; // Default sort column
var currentTMBTableSortDirection = 'asc'; // 'asc' or 'desc'

// Load TMB stops table
function loadTMBStopsTable() {
    console.log('📋 Loading TMB stops table...');

    // Show loading indicator
    document.getElementById('tmb-table-loading').style.display = 'block';
    document.getElementById('tmb-stops-table').style.display = 'none';
    document.getElementById('tmb-no-results').style.display = 'none';
    document.getElementById('tmb-pagination').style.display = 'none';

    updateTMBTableStatus('Carregant parades d\'autobús...');

    // Check if we already have the data from the map visualization
    if (allTMBStops && allTMBStops.length > 0) {
        console.log('✅ Using cached TMB stops data:', allTMBStops.length, 'stops');
        populateTMBTable(allTMBStops);
    } else {
        // Fetch fresh data
        fetchAllTMBBusStops().then(function(stops) {
            allTMBStops = stops; // Cache for future use
            populateTMBTable(stops);
        }).catch(function(error) {
            console.error('❌ Error loading TMB stops for table:', error);
            updateTMBTableStatus('Error carregant dades');
            document.getElementById('tmb-table-loading').style.display = 'none';
            alert('Error carregant les dades de parades TMB: ' + error.message);
        });
    }
}

// Populate table with TMB stops data
function populateTMBTable(stops) {
    console.log('📊 Populating TMB table with', stops.length, 'stops');

    // Fetch real-time data for all stops
    var realtimePromises = stops.map(function(stop) {
        if (stop.codi_parada || stop.id) {
            var stopCode = stop.codi_parada || stop.id;
            return fetchTMBRealtimeBusesForStop(stopCode).then(function(arrivals) {
                stop.realtimeArrivals = arrivals || [];
                return stop;
            });
        } else {
            stop.realtimeArrivals = [];
            return Promise.resolve(stop);
        }
    });

    Promise.all(realtimePromises).then(function(stopsWithRealtime) {
        tmbStopsTableData = stopsWithRealtime;
        filteredTMBTableData = [...tmbStopsTableData];

        currentTMBTablePage = 1;
        displayTMBTablePage();

        // Hide loading, show table
        document.getElementById('tmb-table-loading').style.display = 'none';
        document.getElementById('tmb-stops-table').style.display = 'table';
        document.getElementById('tmb-pagination').style.display = 'block';

        updateTMBTableStatus('Trobat ' + stopsWithRealtime.length + ' parades d\'autobús');
        updateTMBTableSortIndicators();

        console.log('✅ TMB table populated successfully');
    }).catch(function(error) {
        console.error('❌ Error fetching real-time data for table:', error);
        // Still show the table with static data
        tmbStopsTableData = stops.map(function(stop) {
            stop.realtimeArrivals = [];
            return stop;
        });
        filteredTMBTableData = [...tmbStopsTableData];

        currentTMBTablePage = 1;
        displayTMBTablePage();

        document.getElementById('tmb-table-loading').style.display = 'none';
        document.getElementById('tmb-stops-table').style.display = 'table';
        document.getElementById('tmb-pagination').style.display = 'block';

        updateTMBTableStatus('Trobat ' + stops.length + ' parades (sense dades temps real)');
        updateTMBTableSortIndicators();
    });
}

// Display current page of TMB table
function displayTMBTablePage() {
    var tbodyElement = document.getElementById('tmb-stops-tbody');
    var noResultsElement = document.getElementById('tmb-no-results');

    if (!tbodyElement) return;

    var startIndex = (currentTMBTablePage - 1) * itemsPerTMBTablePage;
    var endIndex = startIndex + itemsPerTMBTablePage;
    var stopsToShow = filteredTMBTableData.slice(startIndex, endIndex);

    tbodyElement.innerHTML = '';

    if (stopsToShow.length === 0) {
        if (noResultsElement) {
            noResultsElement.style.display = 'block';
        }
        return;
    }

    if (noResultsElement) {
        noResultsElement.style.display = 'none';
    }

    stopsToShow.forEach(function(stop) {
        var row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        // ID column
        var idCell = document.createElement('td');
        idCell.style.padding = '8px';
        idCell.style.fontWeight = 'bold';
        idCell.style.color = '#c41e3a';
        idCell.textContent = stop.codi_parada || stop.id || '';
        row.appendChild(idCell);

        // Name column
        var nameCell = document.createElement('td');
        nameCell.style.padding = '8px';
        nameCell.textContent = stop.nom_parada || 'Sense nom';
        row.appendChild(nameCell);

        // Street column
        var streetCell = document.createElement('td');
        streetCell.style.padding = '8px';
        streetCell.style.fontSize = '12px';
        streetCell.style.color = '#666';
        streetCell.textContent = 'Barcelona'; // Simplified - could be enhanced with actual street data
        row.appendChild(streetCell);

        // Real-time arrivals column
        var arrivalsCell = document.createElement('td');
        arrivalsCell.style.padding = '8px';

        if (stop.realtimeArrivals && stop.realtimeArrivals.length > 0) {
            var arrivalsHtml = '<div style="max-height: 80px; overflow-y: auto;">';
            stop.realtimeArrivals.slice(0, 3).forEach(function(arrival, index) { // Show up to 3 arrivals
                var arrivalId = 'table-arrival-' + stop.codi_parada + '-' + index;
                var scheduledTime = arrival.scheduledTime;
                var countdownStr = getTMBCountdownString(arrival, scheduledTime);

                arrivalsHtml += '<div style="margin-bottom: 4px; font-size: 11px; border: 1px solid #eee; border-radius: 3px; padding: 4px; background: #f9f9f9;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">' +
                    '<span style="font-weight: bold; color: #c41e3a;">L' + arrival.route + '</span> ' +
                    '<span id="' + arrivalId + '" style="font-family: monospace; font-weight: bold; font-size: 10px;">' + countdownStr + '</span>' +
                    '</div>';
                if (arrival.destination) {
                    arrivalsHtml += '<div style="font-size: 10px; color: #666;">➜ ' + arrival.destination + '</div>';
                }
                arrivalsHtml += '</div>';

                // Start live countdown update for this table arrival
                startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
            });
            if (stop.realtimeArrivals.length > 3) {
                arrivalsHtml += '<div style="font-size: 10px; color: #666; text-align: center; margin-top: 2px;">+' + (stop.realtimeArrivals.length - 3) + ' més...</div>';
            }
            arrivalsHtml += '</div>';
            arrivalsCell.innerHTML = arrivalsHtml;
        } else {
            arrivalsCell.innerHTML = '<span style="color: #999; font-style: italic; font-size: 11px;">Sense dades</span>';
        }
        row.appendChild(arrivalsCell);

        // Actions column
        var actionsCell = document.createElement('td');
        actionsCell.style.padding = '8px';
        actionsCell.style.textAlign = 'center';

        // Create a container for buttons
        var actionsContainer = document.createElement('div');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '4px';
        actionsContainer.style.justifyContent = 'center';
        actionsContainer.setAttribute('data-stop-id', stop.codi_parada || stop.id);

        var zoomBtn = document.createElement('button');
        zoomBtn.textContent = '📍';
        zoomBtn.title = 'Centrar al mapa';
        zoomBtn.style.background = '#007acc';
        zoomBtn.style.color = 'white';
        zoomBtn.style.border = 'none';
        zoomBtn.style.padding = '4px 6px';
        zoomBtn.style.borderRadius = '3px';
        zoomBtn.style.cursor = 'pointer';
        zoomBtn.style.fontSize = '10px';
        zoomBtn.onclick = function() {
            zoomToTMBStop(stop);
        };

        var refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄';
        refreshBtn.title = getTranslation('bus_refresh_stop');
        refreshBtn.className = 'refresh-btn';
        refreshBtn.style.background = '#28a745';
        refreshBtn.style.color = 'white';
        refreshBtn.style.border = 'none';
        refreshBtn.style.padding = '4px 6px';
        refreshBtn.style.borderRadius = '3px';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.style.fontSize = '10px';
        refreshBtn.onclick = function() {
            var stopCode = stop.codi_parada || stop.id;
            refreshTMBStop(stop.codi_parada || stop.id, stopCode);
        };

        actionsContainer.appendChild(zoomBtn);
        actionsContainer.appendChild(refreshBtn);
        actionsCell.appendChild(actionsContainer);
        row.appendChild(actionsCell);

        tbodyElement.appendChild(row);
    });

    updateTMBTablePaginationControls();
}

// Update TMB table status display
function updateTMBTableStatus(status) {
    var statusElement = document.getElementById('tmb-table-status');
    if (statusElement) {
        statusElement.textContent = '📊 ' + status;
    }
}

// Search TMB table
function searchTMBTable() {
    var searchInput = document.getElementById('tmb-table-search');
    if (!searchInput) return;

    var searchTerm = searchInput.value.toLowerCase().trim();
    filteredTMBTableData = tmbStopsTableData.filter(function(stop) {
        var searchableText = [
            stop.codi_parada || stop.id || '',
            stop.nom_parada || '',
            stop.line || ''
        ].join(' ').toLowerCase();

        return searchableText.includes(searchTerm);
    });

    currentTMBTablePage = 1;
    displayTMBTablePage();
}

// Clear TMB table search
function clearTMBTableSearch() {
    var searchInput = document.getElementById('tmb-table-search');
    if (searchInput) {
        searchInput.value = '';
    }
    filteredTMBTableData = [...tmbStopsTableData];
    currentTMBTablePage = 1;
    displayTMBTablePage();
}

// Sort TMB table
function sortTMBTable(column) {
    // Toggle sort direction if same column, otherwise default to ascending
    if (currentTMBTableSortColumn === column) {
        currentTMBTableSortDirection = currentTMBTableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentTMBTableSortColumn = column;
        currentTMBTableSortDirection = 'asc';
    }

    // Sort the filtered data
    filteredTMBTableData.sort(function(a, b) {
        var aVal, bVal;

        switch(column) {
            case 'id':
                aVal = (a.codi_parada || a.id || '').toString().toLowerCase();
                bVal = (b.codi_parada || b.id || '').toString().toLowerCase();
                break;
            case 'name':
                aVal = (a.nom_parada || '').toString().toLowerCase();
                bVal = (b.nom_parada || '').toString().toLowerCase();
                break;
            case 'street':
                aVal = 'barcelona'; // Simplified sorting
                bVal = 'barcelona';
                break;
            case 'arrivals':
                aVal = (a.realtimeArrivals && a.realtimeArrivals.length > 0) ? a.realtimeArrivals[0].timeToArrival || 999 : 999;
                bVal = (b.realtimeArrivals && b.realtimeArrivals.length > 0) ? b.realtimeArrivals[0].timeToArrival || 999 : 999;
                break;
            default:
                return 0;
        }

        if (currentTMBTableSortDirection === 'asc') {
            return aVal.localeCompare ? aVal.localeCompare(bVal, 'ca', {numeric: true, sensitivity: 'base'}) : (aVal > bVal ? 1 : aVal < bVal ? -1 : 0);
        } else {
            return bVal.localeCompare ? bVal.localeCompare(aVal, 'ca', {numeric: true, sensitivity: 'base'}) : (bVal > aVal ? 1 : bVal < aVal ? -1 : 0);
        }
    });

    // Reset to first page when sorting
    currentTMBTablePage = 1;

    // Update sort indicators
    updateTMBTableSortIndicators();

    // Redisplay the table
    displayTMBTablePage();
}

// Update sort indicators in table headers
function updateTMBTableSortIndicators() {
    // Reset all indicators
    var indicators = ['sort-id', 'sort-name', 'sort-street', 'sort-arrivals'];
    indicators.forEach(function(id) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = '↕️';
        }
    });

    // Set active indicator
    var activeId = 'sort-' + currentTMBTableSortColumn;
    var activeElement = document.getElementById(activeId);
    if (activeElement) {
        activeElement.textContent = currentTMBTableSortDirection === 'asc' ? '⬆️' : '⬇️';
    }
}

// Update TMB table pagination controls
function updateTMBTablePaginationControls() {
    var prevButton = document.getElementById('tmb-prev-page');
    var nextButton = document.getElementById('tmb-next-page');
    var pageInfo = document.getElementById('tmb-page-info');

    var totalPages = Math.ceil(filteredTMBTableData.length / itemsPerTMBTablePage);

    if (prevButton) {
        prevButton.disabled = currentTMBTablePage <= 1;
    }

    if (nextButton) {
        nextButton.disabled = currentTMBTablePage >= totalPages;
    }

    if (pageInfo) {
        pageInfo.textContent = 'Pàgina ' + currentTMBTablePage + ' de ' + Math.max(1, totalPages) +
                              ' (' + filteredTMBTableData.length + ' parades)';
    }
}

// Change TMB table page
function changeTMBTablePage(direction) {
    var totalPages = Math.ceil(filteredTMBTableData.length / itemsPerTMBTablePage);
    currentTMBTablePage += direction;

    if (currentTMBTablePage < 1) currentTMBTablePage = 1;
    if (currentTMBTablePage > totalPages) currentTMBTablePage = totalPages;

    displayTMBTablePage();
}

// Zoom to TMB stop on map
function zoomToTMBStop(stop) {
    if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
        map.setView([stop.lat, stop.lng], 18); // High zoom level to focus on the stop
        console.log('🗺️ Zoomed to TMB stop:', stop.codi_parada || stop.id, 'at', stop.lat, stop.lng);

        // If map visualization is active, also trigger popup
        if (tmbBusStopsMarkers && tmbBusStopsMarkers.length > 0) {
            // Find the marker for this stop and open its popup
            tmbBusStopsMarkers.forEach(function(marker) {
                if (marker && marker.getLatLng) {
                    var markerLatLng = marker.getLatLng();
                    if (Math.abs(markerLatLng.lat - stop.lat) < 0.0001 &&
                        Math.abs(markerLatLng.lng - stop.lng) < 0.0001) {
                        marker.openPopup();
                    }
                }
            });
        }
    } else {
        console.warn('❌ Cannot zoom to TMB stop - invalid coordinates:', stop.codi_parada || stop.id, stop.lat, stop.lng);
        alert('No es poden obtenir les coordenades d\'aquesta parada.');
    }
}

// Get countdown string for TMB bus arrival
function getTMBCountdownString(arrival, scheduledTime) {
    if (!scheduledTime) {
        return '--:--:--';
    }

    var now = new Date().getTime();
    var arrivalMs = scheduledTime.getTime();
    var diffMs = arrivalMs - now;

    if (diffMs <= 0) {
        return getTranslation('bus_arrived');
    }

    // Convert to seconds, minutes, hours
    var totalSeconds = Math.floor(diffMs / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    // Format as HH:MM:SS
    var timeStr = '';
    if (hours > 0) {
        timeStr = hours.toString().padStart(2, '0') + ':';
    }
    timeStr += minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');

    return timeStr;
}

// Start live countdown update for a specific TMB arrival
function startTMBArrivalCountdown(elementId, arrival, scheduledTime) {
    if (!scheduledTime) return;

    function updateCountdown() {
        var element = document.getElementById(elementId);
        if (!element) return; // Element no longer exists

        var countdownStr = getTMBCountdownString(arrival, scheduledTime);

        // Color coding based on urgency
        var now = new Date().getTime();
        var arrivalMs = scheduledTime.getTime();
        var diffMs = arrivalMs - now;
        var diffMinutes = diffMs / (1000 * 60);

        var color = '#0066cc'; // Default blue
        if (diffMs <= 0) {
            color = '#888'; // Gray for arrived/overdue
        } else if (diffMinutes <= 2) {
            color = '#d63031'; // Red for very soon
        } else if (diffMinutes <= 5) {
            color = '#e17055'; // Orange for soon
        }

        element.textContent = countdownStr;
        element.style.color = color;
        element.style.fontWeight = 'bold';
        element.style.fontFamily = 'monospace';
    }

    // Update immediately
    updateCountdown();

    // Set up interval for live updates
    var intervalId = setInterval(updateCountdown, 1000); // Update every second

    // Extract stop ID from element ID (format: 'popup-arrival-STOPID-INDEX' or 'table-arrival-STOPID-INDEX')
    var stopId = null;
    var idParts = elementId.split('-');
    if (idParts.length >= 4 && idParts[0] === 'popup' || idParts[0] === 'table') {
        stopId = idParts[2]; // The stop ID is in position 2
    }

    // Store the interval ID organized by stop ID
    if (!window.tmbCountdownIntervals) {
        window.tmbCountdownIntervals = {};
    }
    if (stopId) {
        if (!window.tmbCountdownIntervals[stopId]) {
            window.tmbCountdownIntervals[stopId] = [];
        }
        window.tmbCountdownIntervals[stopId].push(intervalId);
    } else {
        // Fallback for elements without proper stop ID
        if (!window.tmbCountdownIntervals['unknown']) {
            window.tmbCountdownIntervals['unknown'] = [];
        }
        window.tmbCountdownIntervals['unknown'].push(intervalId);
    }
}

// Refresh data for a specific TMB stop
function refreshTMBStop(stopOrId, stopCode) {
    var stop = null;
    var stopId = null;
    var isPopupButton = false;

    // Handle both calling styles: refreshTMBStop(stopObject) or refreshTMBStop(stopId, stopCode)
    if (typeof stopOrId === 'object' && stopOrId !== null) {
        // New style: full stop object passed
        stop = stopOrId;
        stopId = stop.codi_parada || stop.id;
        stopCode = stopId;
        isPopupButton = true; // Object calls come from popup buttons
    } else {
        // Old style: separate parameters
        stopId = stopOrId;
        isPopupButton = false; // Parameter calls come from table buttons
    }

    console.log('🔄 Refreshing data for TMB stop:', stopCode, stop ? '(full object)' : '(legacy)');

    // Show loading state for popup button immediately
    if (isPopupButton && stopId) {
        var popupRefreshBtn = document.getElementById('popup-refresh-btn-' + stopId);
        if (popupRefreshBtn) {
            popupRefreshBtn.textContent = '⏳ Carregant...';
            popupRefreshBtn.style.background = '#666';
            popupRefreshBtn.disabled = true;
            console.log('🔄 Set popup button to loading state for stop', stopId);
        }
    }

    // Show loading indicator - for popup buttons, we'll handle this differently
    // since the button gets replaced when popup content updates
    var refreshBtn = null;
    
    // Try to find table button first (these have data-stop-id attribute)
    refreshBtn = document.querySelector(`[data-stop-id="${stopId}"] .refresh-btn`);
    
    if (refreshBtn) {
        refreshBtn.textContent = '⏳';
        refreshBtn.disabled = true;
        refreshBtn.title = getTranslation('bus_table_loading');
    }

    // Clean up existing countdown intervals for this specific stop
    // This prevents old intervals from updating DOM elements that will be recreated
    console.log('🧹 Cleaning up existing countdown intervals for stop', stopCode);

    // Clear only intervals for this specific stop
    if (window.tmbCountdownIntervals && window.tmbCountdownIntervals[stopCode]) {
        window.tmbCountdownIntervals[stopCode].forEach(function(intervalId) {
            if (intervalId) {
                clearInterval(intervalId);
            }
        });
        window.tmbCountdownIntervals[stopCode] = [];
        console.log('🧹 Cleared', window.tmbCountdownIntervals[stopCode].length, 'countdown intervals for stop', stopCode);
    }

    // Fetch fresh real-time data for this stop
    fetchTMBRealtimeBusesForStop(stopCode).then(function(arrivals) {
        console.log('✅ Refreshed data for stop', stopCode, ':', arrivals);

        // Update the stop's realtime data in the global data
        var stopIndex = tmbStopsTableData.findIndex(function(stop) {
            return stop.codi_parada === stopCode || stop.id === stopCode;
        });

        if (stopIndex !== -1) {
            // Clear previous arrival data before setting new data
            tmbStopsTableData[stopIndex].realtimeArrivals = [];
            // Set new arrival data
            tmbStopsTableData[stopIndex].realtimeArrivals = arrivals || [];
            console.log('📊 Updated stop data in global array for stop', stopCode, '- cleared previous arrivals and set', (arrivals || []).length, 'new arrivals');
        }

        // Update the table display for current page only if not called from popup button
        // This will recreate all DOM elements and countdown intervals cleanly
        if (!isPopupButton) {
            displayTMBTablePage();
        }

        // Update map markers if they exist
        if (tmbBusStopsMarkers && tmbBusStopsMarkers.length > 0) {
            // Find the stop object from global data first
            var refreshedStop = null;
            if (allTMBStops && allTMBStops.length > 0) {
                refreshedStop = allTMBStops.find(function(stop) {
                    return stop.codi_parada === stopCode || stop.id === stopCode;
                });
            }

            // If not found in allTMBStops, try tmbStopsTableData
            if (!refreshedStop && tmbStopsTableData && tmbStopsTableData.length > 0) {
                refreshedStop = tmbStopsTableData.find(function(stop) {
                    return stop.codi_parada === stopCode || stop.id === stopCode;
                });
            }

            // Update the stop's realtime data in the global arrays
            if (refreshedStop) {
                refreshedStop.realtimeArrivals = arrivals || [];
            }

            // Find and update the marker popup content for the refreshed stop
            tmbBusStopsMarkers.forEach(function(marker) {
                if (marker && marker.getLatLng && refreshedStop) {
                    var markerLatLng = marker.getLatLng();
                    // Check if this marker corresponds to the refreshed stop
                    // Use coordinate matching since we don't have direct stop reference
                    if (Math.abs(markerLatLng.lat - refreshedStop.lat) < 0.0001 &&
                        Math.abs(markerLatLng.lng - refreshedStop.lng) < 0.0001) {
                        console.log('🎯 Updating marker popup for refreshed stop', stopCode);

                        // Create updated popup content with the new data
                        var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                            '<h4 style="margin: 0 0 8px 0; color: #c41e3a; border-bottom: 2px solid #c41e3a; padding-bottom: 4px;">' +
                            '🚏 Parada TMB ' + (refreshedStop.codi_parada || refreshedStop.id) + '</h4>' +
                            '<div style="background: #c41e3a15; border: 1px solid #c41e3a; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                            '<strong>Nom:</strong> ' + (refreshedStop.nom_parada || 'Sense nom') + '<br>' +
                            '<strong>Codi:</strong> ' + (refreshedStop.codi_parada || refreshedStop.id) + '<br>' +
                            '<strong>Posició:</strong> ' + refreshedStop.lat.toFixed(4) + ', ' + refreshedStop.lng.toFixed(4) +
                            '</div>';

                        // Add real-time arrivals section
                        if (refreshedStop.realtimeArrivals && refreshedStop.realtimeArrivals.length > 0) {
                            popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                                '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🕒 Próxims autobusos</h5>' +
                                '<div style="max-height: 150px; overflow-y: auto;">';

                            refreshedStop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) { // Show up to 10 arrivals
                                var arrivalId = 'popup-arrival-' + refreshedStop.codi_parada + '-' + index;
                                var scheduledTime = arrival.scheduledTime;

                                var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                                var countdownStr = getTMBCountdownString(arrival, scheduledTime);

                                // Determine data source indicator
                                var dataSourceText = arrival.isRealtime ? '🕒 Temps real' : '📅 Horari';
                                var dataSourceColor = arrival.isRealtime ? '#00aa00' : '#0066cc';

                                popupContent += '<div style="margin-bottom: 6px; padding: 6px; background: #fff; border-radius: 3px; border: 1px solid #eee;">' +
                                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                                    '<div style="font-weight: bold; color: #c41e3a;">Línia ' + arrival.route + '</div>' +
                                    '<div style="font-size: 10px; color: ' + dataSourceColor + '; font-weight: bold;">' + dataSourceText + '</div>' +
                                    '</div>' +
                                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                                    '<div style="font-size: 11px; color: #666;">' + getTranslation('bus_arrival_time') + ': ' + scheduledTimeStr + '</div>' +
                                    '<div id="' + arrivalId + '" style="font-weight: bold; font-family: monospace;">' + countdownStr + '</div>' +
                                    '</div>';
                                if (arrival.destination) {
                                    popupContent += '<div style="font-size: 11px; color: #666; margin-top: 2px;">➜ ' + arrival.destination + '</div>';
                                }
                                popupContent += '</div>';

                                // Start live countdown update for this popup arrival
                                startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
                            });

                            popupContent += '</div></div>';
                        } else {
                            popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                                '<em>Sense informació de temps real</em>' +
                                '</div>';
                        }

                        // Add refresh button and data fetch timestamp
                        var now = new Date();
                        var buttonText = '🔄 ' + getTranslation('bus_refresh_stop');
                        var buttonBg = '#28a745';
                        
                        popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                            '<div style="margin-bottom: 4px;">' +
                            '<button id="popup-refresh-btn-' + (refreshedStop.codi_parada || refreshedStop.id) + '" onclick="refreshTMBStop({codi_parada: \'' + (refreshedStop.codi_parada || refreshedStop.id) + '\', nom_parada: \'' + (refreshedStop.nom_parada || 'Sense nom').replace(/'/g, '\\\'') + '\', lat: ' + refreshedStop.lat + ', lng: ' + refreshedStop.lng + '})" ' +
                            'style="background: ' + buttonBg + '; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">' +
                            buttonText + '</button>' +
                            '</div>' +
                            '<em>' + getTranslation('bus_data_fetched_at') + ' ' + now.toLocaleTimeString() + '</em>' +
                            '</div>';

                        popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                            '🚌 Transport Metropolità de Barcelona' +
                            '</div>' +
                            '</div>';

                        // Update the marker's popup content - close and reopen if currently open to ensure clean DOM
                        var wasOpen = marker.getPopup() && marker.getPopup().isOpen && marker.getPopup().isOpen();
                        marker.setPopupContent(popupContent);

                        // Handle popup reopening and countdown restart with proper timing
                        if (wasOpen) {
                            // Close popup, update content, reopen, then start countdowns
                            marker.closePopup();
                            setTimeout(function() {
                                marker.openPopup();
                                // Wait for popup to be fully rendered before starting countdowns
                                setTimeout(function() {
                                    console.log('🕒 Starting countdown timers for refreshed stop', stopCode);
                                    if (refreshedStop.realtimeArrivals && refreshedStop.realtimeArrivals.length > 0) {
                                        refreshedStop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) {
                                            var arrivalId = 'popup-arrival-' + refreshedStop.codi_parada + '-' + index;
                                            var scheduledTime = arrival.scheduledTime;
                                            
                                            // Verify element exists before starting countdown
                                            var element = document.getElementById(arrivalId);
                                            if (element) {
                                                console.log('✅ Starting countdown for element', arrivalId);
                                                startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
                                            } else {
                                                console.warn('⚠️ Element not found for countdown:', arrivalId);
                                            }
                                        });
                                    }
                                }, 500); // Longer delay to ensure DOM is fully stable after popup opens
                            }, 200); // Delay for popup operations
                        } else {
                            // Popup was not open, start countdowns after content update
                            setTimeout(function() {
                                console.log('🕒 Starting countdown timers for closed popup stop', stopCode);
                                if (refreshedStop.realtimeArrivals && refreshedStop.realtimeArrivals.length > 0) {
                                    refreshedStop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) {
                                        var arrivalId = 'popup-arrival-' + refreshedStop.codi_parada + '-' + index;
                                        var scheduledTime = arrival.scheduledTime;
                                        
                                        // Verify element exists before starting countdown
                                        var element = document.getElementById(arrivalId);
                                        if (element) {
                                            console.log('✅ Starting countdown for element', arrivalId);
                                            startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
                                        } else {
                                            console.warn('⚠️ Element not found for countdown:', arrivalId);
                                        }
                                    });
                                }
                            }, 300); // Longer delay for content update
                        }

                        console.log('✅ Updated marker popup for stop', stopCode, 'with', refreshedStop.realtimeArrivals ? refreshedStop.realtimeArrivals.length : 0, 'arrivals');
                    }
                }
            });
        }

        // Reset button
        if (refreshBtn) {
            // Table button reset
            refreshBtn.textContent = '🔄';
            refreshBtn.disabled = false;
            refreshBtn.title = getTranslation('bus_refresh_stop');
        } else if (isPopupButton && stopId) {
            // Popup button reset - find and update the popup button
            var popupRefreshBtn = document.getElementById('popup-refresh-btn-' + stopId);
            if (popupRefreshBtn) {
                popupRefreshBtn.textContent = '🔄 ' + getTranslation('bus_refresh_stop');
                popupRefreshBtn.style.background = '#28a745';
                popupRefreshBtn.disabled = false;
                console.log('✅ Reset popup button for stop', stopId);
            }
        }

        console.log('✅ Successfully refreshed data for TMB stop', stopCode, 'with clean DOM updates');
    }).catch(function(error) {
        console.error('❌ Error refreshing data for TMB stop', stopCode, ':', error);

        // Show error state
        if (refreshBtn) {
            // Table button error state
            refreshBtn.textContent = '❌';
            refreshBtn.disabled = false;
            refreshBtn.title = getTranslation('bus_error_table_loading');

            // Reset to normal state after 3 seconds
            setTimeout(function() {
                if (refreshBtn) {
                    refreshBtn.textContent = '🔄';
                    refreshBtn.title = getTranslation('bus_refresh_stop');
                }
            }, 3000);
        } else if (isPopupButton && stopId) {
            // Popup button error state
            var popupRefreshBtn = document.getElementById('popup-refresh-btn-' + stopId);
            if (popupRefreshBtn) {
                popupRefreshBtn.textContent = '❌ Error';
                popupRefreshBtn.style.background = '#dc3545';
                popupRefreshBtn.disabled = false;
                
                // Reset to normal state after 3 seconds
                setTimeout(function() {
                    if (popupRefreshBtn) {
                        popupRefreshBtn.textContent = '🔄 ' + getTranslation('bus_refresh_stop');
                        popupRefreshBtn.style.background = '#28a745';
                    }
                }, 3000);
            }
        }

        alert(getTranslation('bus_error_table_loading') + ': ' + error.message);
    });
}

// TMB Bus Route Visualization
var tmbBusRoutes = []; // Store bus route polylines

// Fetch and display TMB bus route for a specific line
function showTMBBusRoute(lineCode) {
    console.log('🛣️ Showing route for TMB bus line:', lineCode);

    // Hide any existing route first
    hideTMBBusRoute();

    // Use the correct TMB API endpoint: /transit/linies/bus/{lineCode}/
    var apiUrl = 'https://api.tmb.cat/v1/transit/linies/bus/' + encodeURIComponent(lineCode) + '/?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🛣️ Fetching TMB bus line data from:', apiUrl);

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('❌ TMB bus line API failed:', response.status, response.statusText);
                throw new Error('TMB API returned ' + response.status + ': ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB bus route API response for line', lineCode, ':', data);

            var routeCoordinates = [];

            // Process TMB route API response - handle different possible formats
            if (data && data.features && Array.isArray(data.features)) {
                console.log('📊 Processing', data.features.length, 'features from API response');

                data.features.forEach(function(feature, featureIndex) {
                    console.log('🔍 Processing feature', featureIndex, ':', feature);

                    // Try different geometry formats
                    if (feature.geometry) {
                        if (feature.geometry.type === 'LineString' && feature.geometry.coordinates) {
                            console.log('✅ Found LineString geometry in feature', featureIndex);
                            // Standard GeoJSON LineString format
                            feature.geometry.coordinates.forEach(function(coord) {
                                var lng = coord[0];
                                var lat = coord[1];
                                if (typeof lat === 'number' && typeof lng === 'number' &&
                                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                    routeCoordinates.push([lat, lng]); // Leaflet uses [lat, lng]
                                    console.log('📍 Added coordinate:', lat, lng);
                                } else {
                                    console.warn('⚠️ Invalid coordinate:', lat, lng);
                                }
                            });
                        } else if (feature.geometry.type === 'MultiLineString' && feature.geometry.coordinates) {
                            console.log('✅ Found MultiLineString geometry in feature', featureIndex);
                            // MultiLineString format
                            feature.geometry.coordinates.forEach(function(lineString) {
                                lineString.forEach(function(coord) {
                                    var lng = coord[0];
                                    var lat = coord[1];
                                    if (typeof lat === 'number' && typeof lng === 'number' &&
                                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                        routeCoordinates.push([lat, lng]);
                                        console.log('📍 Added MultiLineString coordinate:', lat, lng);
                                    }
                                });
                            });
                        } else if (Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0) {
                            console.log('✅ Found coordinate array in feature', featureIndex, '- type:', feature.geometry.type);
                            // Handle cases where coordinates might be nested differently
                            if (Array.isArray(feature.geometry.coordinates[0])) {
                                // Likely nested array of coordinates
                                feature.geometry.coordinates.forEach(function(coordSet) {
                                    if (Array.isArray(coordSet) && coordSet.length >= 2) {
                                        var lng = coordSet[0];
                                        var lat = coordSet[1];
                                        if (typeof lat === 'number' && typeof lng === 'number' &&
                                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                            routeCoordinates.push([lat, lng]);
                                            console.log('📍 Added nested coordinate:', lat, lng);
                                        }
                                    }
                                });
                            } else if (feature.geometry.coordinates.length >= 2) {
                                // Direct coordinate pair
                                var lng = feature.geometry.coordinates[0];
                                var lat = feature.geometry.coordinates[1];
                                if (typeof lat === 'number' && typeof lng === 'number' &&
                                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                    routeCoordinates.push([lat, lng]);
                                    console.log('📍 Added direct coordinate:', lat, lng);
                                }
                            }
                        } else {
                            console.warn('⚠️ Feature', featureIndex, 'has geometry but no supported coordinate format:', feature.geometry.type);
                        }
                    } else {
                        console.warn('⚠️ Feature', featureIndex, 'has no geometry property');
                    }

                    // Also check properties for coordinate data (some APIs put coordinates in properties)
                    if (feature.properties && !routeCoordinates.length) {
                        console.log('🔍 Checking properties for coordinate data in feature', featureIndex);

                        // Look for coordinate arrays in properties
                        ['coordinates', 'coords', 'path', 'route', 'geometry'].forEach(function(propName) {
                            if (feature.properties[propName] && Array.isArray(feature.properties[propName])) {
                                console.log('✅ Found coordinate array in properties.' + propName);
                                feature.properties[propName].forEach(function(coord) {
                                    if (Array.isArray(coord) && coord.length >= 2) {
                                        var lng = coord[0];
                                        var lat = coord[1];
                                        if (typeof lat === 'number' && typeof lng === 'number' &&
                                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                            routeCoordinates.push([lat, lng]);
                                            console.log('📍 Added coordinate from properties:', lat, lng);
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            } else if (data && Array.isArray(data)) {
                console.log('📊 Processing direct array response with', data.length, 'items');
                // Handle direct array format
                data.forEach(function(item, index) {
                    if (item.coordinates && Array.isArray(item.coordinates)) {
                        console.log('✅ Found coordinates in array item', index);
                        item.coordinates.forEach(function(coord) {
                            if (Array.isArray(coord) && coord.length >= 2) {
                                var lng = coord[0];
                                var lat = coord[1];
                                if (typeof lat === 'number' && typeof lng === 'number' &&
                                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                                    routeCoordinates.push([lat, lng]);
                                    console.log('📍 Added coordinate from array item:', lat, lng);
                                }
                            }
                        });
                    }
                });
            } else {
                console.warn('❌ Unexpected TMB route API response format - no features or arrays found');
                console.log('Response structure:', typeof data, data ? Object.keys(data) : 'null');
            }

            console.log('🎯 Total route coordinates collected:', routeCoordinates.length);

            if (routeCoordinates.length > 1) {
                // Create polyline for the route
                var routeColor = tmbBusLineColors[lineCode] || '#c41e3a';
                var routePolyline = L.polyline(routeCoordinates, {
                    color: routeColor,
                    weight: 4,
                    opacity: 0.8,
                    dashArray: '5, 10', // Dashed line to distinguish from other routes
                    className: 'tmb-bus-route'
                });

                // Add route to map
                routePolyline.addTo(map);
                tmbBusRoutes.push(routePolyline);

                // Fit map to show the entire route
                map.fitBounds(routePolyline.getBounds(), {padding: [20, 20]});

                console.log('✅ Successfully added TMB bus route for line', lineCode, 'with', routeCoordinates.length, 'points');

                // Show route info popup at the start of the route
                if (routeCoordinates.length > 0) {
                    var startPoint = routeCoordinates[0];
                    var routeInfoPopup = L.popup()
                        .setLatLng(startPoint)
                        .setContent('<div style="font-family: Arial, sans-serif; text-align: center;">' +
                            '<h4 style="margin: 0 0 8px 0; color: ' + routeColor + ';">🛣️ Ruta Línia ' + lineCode + '</h4>' +
                            '<p style="margin: 0; font-size: 12px; color: #666;">Mostrant el trajecte de la línia</p>' +
                            '<button onclick="hideTMBBusRoute()" style="margin-top: 8px; background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Amagar ruta</button>' +
                            '</div>')
                        .openOn(map);
                }
            } else {
                console.warn('⚠️ No valid route coordinates found for line', lineCode, '- collected', routeCoordinates.length, 'points');
                console.log('Route coordinates array:', routeCoordinates);

                // Try to provide more debugging information
                if (data && data.features) {
                    console.log('Features in response:', data.features.length);
                    data.features.forEach(function(feature, i) {
                        console.log('Feature', i, 'geometry:', feature.geometry ? feature.geometry.type : 'none');
                        if (feature.geometry && feature.geometry.coordinates) {
                            console.log('Feature', i, 'coordinates length:', feature.geometry.coordinates.length);
                            console.log('First coordinate sample:', feature.geometry.coordinates[0]);
                        }
                    });
                }

                alert('No s\'ha pogut carregar la ruta per a la línia ' + lineCode + '. Comprova que la línia existeix i té dades de ruta disponibles.');
            }
        })
        .catch(error => {
            console.error('❌ TMB bus route API error for line', lineCode, ':', error);
            alert('Error carregant la ruta de la línia ' + lineCode + ': ' + error.message + '\n\nPot ser que l\'API de rutes no estigui disponible o que la línia no tingui dades de geometria.');
        });
}

// Hide TMB bus route
function hideTMBBusRoute() {
    console.log('🚫 Hiding TMB bus route');

    tmbBusRoutes.forEach(function(routePolyline) {
        if (map.hasLayer(routePolyline)) {
            map.removeLayer(routePolyline);
        }
    });

    tmbBusRoutes = [];
}



// Make functions globally accessible
window.startTMBBusStops = startTMBBusStops;
window.stopTMBBusStops = stopTMBBusStops;
window.loadTMBStopsTable = loadTMBStopsTable;
window.searchTMBTable = searchTMBTable;
window.clearTMBTableSearch = clearTMBTableSearch;
window.sortTMBTable = sortTMBTable;
window.changeTMBTablePage = changeTMBTablePage;
window.zoomToTMBStop = zoomToTMBStop;
window.refreshTMBStop = refreshTMBStop;
window.getTMBCountdownString = getTMBCountdownString;
window.startTMBArrivalCountdown = startTMBArrivalCountdown;
window.showTMBBusRoute = showTMBBusRoute;
window.hideTMBBusRoute = hideTMBBusRoute;
