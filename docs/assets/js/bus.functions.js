// TMB Bus Stops Visualization
var tmbBusStopsMarkers = [];
var tmbBusStopsInterval = null;
var allTMBStops = []; // Store all stops data

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

    // Update every 10 minutes for stops data (relatively static)
    tmbBusStopsInterval = setInterval(function() {
        fetchAllTMBBusStops().then(function(stops) {
            displayTMBBusStops(stops);
        });
    }, 600000); // 10 minutes

    // Update UI
    document.getElementById('start-tmb-stops-btn').style.display = 'none';
    document.getElementById('stop-tmb-stops-btn').style.display = 'inline-block';
    updateTMBBusStopsStatus(getTranslation('bus_status_loading'));
}

// Stop TMB bus stops visualization
function stopTMBBusStops() {
    if (tmbBusStopsInterval) {
        clearInterval(tmbBusStopsInterval);
        tmbBusStopsInterval = null;
    }

    // Clear all stop markers
    tmbBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbBusStopsMarkers = [];

    // Update UI
    document.getElementById('start-tmb-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-tmb-stops-btn').style.display = 'none';
    updateTMBBusStopsStatus(getTranslation('bus_status_inactive'));
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

// Fetch real-time bus arrivals for a specific TMB stop
function fetchTMBRealtimeBusesForStop(stopCode) {
    var apiUrl = 'https://api.tmb.cat/v1/itransit/bus/parades/' + encodeURIComponent(stopCode) + '?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🕒 Fetching real-time bus arrivals for stop', stopCode, 'from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('TMB real-time API failed for stop', stopCode, ':', response.status, response.statusText);
                return null; // Return null instead of throwing to continue with other stops
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
                                            // If it's already in minutes, create a scheduled time for countdown
                                            scheduledTime = new Date(Date.now() + (timeArrival * 60 * 1000));
                                        }

                                        arrivals.push({
                                            id: busId + '-' + stopCode,
                                            route: routeId,
                                            destination: destination,
                                            timeToArrival: timeArrival,
                                            scheduledTime: scheduledTime, // Store the actual arrival time
                                            status: 'Arriving at stop'
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
            return arrivals;
        })
        .catch(error => {
            console.error('❌ TMB real-time API error for stop', stopCode, ':', error);
            return null; // Return null to indicate no data available
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
    var realtimePromises = [];

    // First, fetch real-time data for all stops
    stops.forEach(function(stop) {
        if (stop.codi_parada || stop.id) {
            var stopCode = stop.codi_parada || stop.id;
            var promise = fetchTMBRealtimeBusesForStop(stopCode).then(function(arrivals) {
                stop.realtimeArrivals = arrivals || [];
                return stop;
            });
            realtimePromises.push(promise);
        }
    });

    // Wait for all real-time data to be fetched
    Promise.all(realtimePromises).then(function(stopsWithRealtime) {
        // Store timestamp when data was fetched
        var dataFetchedAt = new Date();

        stopsWithRealtime.forEach(function(stop) {
            if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
                // Get stop reference number for display
                var stopRef = stop.codi_parada || stop.id || '?';
                // Truncate if too long for display
                if (stopRef.length > 5) {
                    stopRef = stopRef.substring(0, 5) + '..';
                }

                // Check if there are active buses (arriving soon)
                var hasActiveBuses = stop.realtimeArrivals && stop.realtimeArrivals.length > 0 &&
                    stop.realtimeArrivals.some(function(arrival) { return arrival.timeToArrival <= 10; });

                // Create bus stop marker with stop reference number and active bus indicator
                var markerHtml = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                    '<circle cx="12" cy="12" r="10" fill="#c41e3a" stroke="white" stroke-width="2"/>' +
                    '<rect x="7" y="6" width="10" height="6" rx="1" fill="white"/>' +
                    '<text x="12" y="11" text-anchor="middle" fill="#c41e3a" font-size="6px" font-weight="bold">BUS</text>' +
                    '<rect x="11" y="14" width="2" height="4" fill="#c41e3a"/>' +
                    '</svg>' +
                    '<div style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); ' +
                    'background: #c41e3a; color: white; font-size: 8px; font-weight: bold; ' +
                    'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                    stopRef + '</div>';

                // Add active bus indicator if there are buses arriving soon
                if (hasActiveBuses) {
                    markerHtml += '<div style="position: absolute; bottom: -2px; right: -2px; ' +
                        'background: #00aa00; color: white; font-size: 6px; font-weight: bold; ' +
                        'padding: 1px 2px; border-radius: 50%; border: 1px solid #333; min-width: 8px; text-align: center;">' +
                        '●' + '</div>';
                }

                var stopMarker = L.marker([stop.lat, stop.lng], {
                    icon: L.divIcon({
                        html: markerHtml,
                        className: 'tmb-bus-stop-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 24]
                    })
                });

                // Create popup with stop information and real-time arrivals
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

                    stop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) { // Show up to 10 arrivals
                        var arrivalId = 'tmb-arrival-' + stop.codi_parada + '-' + index;
                        var scheduledTime = arrival.scheduledTime;

                        var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                        var countdownStr = getTMBCountdownString(arrival, scheduledTime);

                        popupContent += '<div style="margin-bottom: 6px; padding: 6px; background: #fff; border-radius: 3px; border: 1px solid #eee;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                            '<div style="font-weight: bold; color: #c41e3a;">Línia ' + arrival.route + '</div>' +
                            '<div id="' + arrivalId + '" style="font-weight: bold; font-family: monospace;">' + countdownStr + '</div>' +
                            '</div>' +
                            '<div style="font-size: 11px; color: #666;">' + getTranslation('bus_arrival_time') + ': ' + scheduledTimeStr + '</div>';
                        if (arrival.destination) {
                            popupContent += '<div style="font-size: 11px; color: #666; margin-top: 2px;">➜ ' + arrival.destination + '</div>';
                        }
                        popupContent += '</div>';

                        // Start live countdown update for this arrival
                        startTMBArrivalCountdown(arrivalId, arrival, scheduledTime);
                    });

                    popupContent += '</div></div>';

                    // Now add bus vehicle markers for buses arriving at this stop
                    stop.realtimeArrivals.slice(0, 5).forEach(function(arrival) { // Show up to 5 bus vehicles
                        if (arrival.timeToArrival <= 5) { // Only show buses arriving within 5 minutes
                            var busColor = tmbBusLineColors[arrival.route] || '#c41e3a';
                            var busMarkerHtml = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.8));">' +
                                '<rect x="2" y="6" width="24" height="16" rx="3" fill="' + busColor + '" stroke="#fff" stroke-width="1"/>' +
                                '<circle cx="8" cy="22" r="2" fill="#666"/>' +
                                '<circle cx="20" cy="22" r="2" fill="#666"/>' +
                                '<rect x="4" y="8" width="20" height="2" rx="1" fill="#fff"/>' +
                                '<rect x="4" y="12" width="20" height="2" rx="1" fill="#fff"/>' +
                                '<rect x="4" y="16" width="20" height="2" rx="1" fill="#fff"/>' +
                                '<text x="14" y="20" text-anchor="middle" fill="#fff" font-size="8px" font-weight="bold">' + arrival.route + '</text>' +
                                '</svg>';

                            var busMarker = L.marker([stop.lat, stop.lng], {
                                icon: L.divIcon({
                                    html: busMarkerHtml,
                                    className: 'tmb-bus-vehicle-marker',
                                    iconSize: [28, 28],
                                    iconAnchor: [14, 24]
                                })
                            });

                            // Create bus popup
                            var busPopupContent = '<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                                '<h4 style="margin: 0 0 8px 0; color: ' + busColor + '; border-bottom: 2px solid ' + busColor + '; padding-bottom: 4px;">' +
                                '🚌 Autobús TMB Línia ' + arrival.route + '</h4>' +
                                '<div style="background: ' + busColor + '15; border: 1px solid ' + busColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                                '<strong>Línia:</strong> ' + arrival.route + '<br>' +
                                '<strong>Destí:</strong> ' + (arrival.destination || 'Desconegut') + '<br>' +
                                '<strong>Temps d\'arribada:</strong> <span style="font-weight: bold; color: ' +
                                (arrival.timeToArrival <= 2 ? '#d63031' : arrival.timeToArrival <= 5 ? '#e17055' : '#0066cc') + ';">' +
                                (arrival.timeToArrival === 0 ? 'Arribant ara' : arrival.timeToArrival + ' min') + '</span><br>' +
                                '<strong>Parada actual:</strong> ' + (stop.nom_parada || 'Sense nom') + ' (' + stopRef + ')' +
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

                            console.log('✅ ADDED TMB BUS VEHICLE MARKER: Line', arrival.route, 'at stop', stopRef, 'arriving in', arrival.timeToArrival, 'min');
                        }
                    });
                } else {
                    popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                        '<em>Sense informació de temps real</em>' +
                        '</div>';
                }

                // Add data fetch timestamp
                popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                    '<em>' + getTranslation('bus_data_fetched_at') + ' ' + dataFetchedAt.toLocaleTimeString() + '</em>' +
                    '</div>';

                popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🚌 Transport Metropolità de Barcelona' +
                    '</div>' +
                    '</div>';

                stopMarker.bindPopup(popupContent);

                // Add stop marker to map
                stopMarker.addTo(map);
                tmbBusStopsMarkers.push(stopMarker);
                totalStops++;

                console.log('✅ ADDED TMB BUS STOP MARKER:', stop.codi_parada || stop.id, stop.nom_parada, 'with', stop.realtimeArrivals ? stop.realtimeArrivals.length : 0, 'real-time arrivals');
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

        actionsCell.appendChild(zoomBtn);
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

    // Store the interval ID for cleanup (though popups are usually short-lived)
    // In a real app, you might want to clean these up when the popup closes
    if (!window.tmbCountdownIntervals) {
        window.tmbCountdownIntervals = [];
    }
    window.tmbCountdownIntervals.push(intervalId);
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
window.getTMBCountdownString = getTMBCountdownString;
window.startTMBArrivalCountdown = startTMBArrivalCountdown;
