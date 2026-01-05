// TMB Metro Stops Visualization
var tmbMetroStopsMarkers = [];
var tmbMetroStopsInterval = null;
var allTMBMetroStops = [];

// Start TMB metro stops visualization
function startTMBMetroStops() {
    if (tmbMetroStopsInterval) {
        stopTMBMetroStops();
        return;
    }

    // Initial load
    fetchAllTMBMetroStops().then(function(stops) {
        displayTMBMetroStops(stops);
    });

    // Update every 10 minutes for stops data (relatively static)
    tmbMetroStopsInterval = setInterval(function() {
        fetchAllTMBMetroStops().then(function(stops) {
            displayTMBMetroStops(stops);
        });
    }, 600000); // 10 minutes

    // Update UI
    document.getElementById('start-tmb-metro-stops-btn').style.display = 'none';
    document.getElementById('stop-tmb-metro-stops-btn').style.display = 'inline-block';
    updateTMBMetroStopsStatus(getTranslation('metro_status_loading'));
}

// Stop TMB metro stops visualization
function stopTMBMetroStops() {
    if (tmbMetroStopsInterval) {
        clearInterval(tmbMetroStopsInterval);
        tmbMetroStopsInterval = null;
    }

    // Clear all stop markers
    tmbMetroStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbMetroStopsMarkers = [];

    // Update UI
    document.getElementById('start-tmb-metro-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-tmb-metro-stops-btn').style.display = 'none';
    updateTMBMetroStopsStatus(getTranslation('metro_status_inactive'));
}

// Update TMB metro stops status display
function updateTMBMetroStopsStatus(status) {
    var statusElement = document.getElementById('tmb-metro-stops-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch all TMB metro stops by iterating through all metro lines
function fetchAllTMBMetroStops() {
    console.log('🚇 Starting to fetch all TMB metro stops...');

    // Metro line codes
    var metroLineCodes = [1, 2, 3, 4, 5, 11, 91, 94, 99, 101, 104];

    // Fetch stops for each line and aggregate them
    var stopPromises = metroLineCodes.map(function(lineCode) {
        return fetchTMBMetroStopsForLine(lineCode);
    });

    return Promise.all(stopPromises).then(function(stopsArrays) {
        // Flatten and deduplicate stops
        var allStops = [];
        var stopIds = new Set();

        stopsArrays.forEach(function(stopsArray) {
            if (Array.isArray(stopsArray)) {
                stopsArray.forEach(function(stop) {
                    var stopId = stop.id || stop.codi_estacio;
                    if (stopId && !stopIds.has(stopId)) {
                        stopIds.add(stopId);
                        allStops.push(stop);
                    }
                });
            }
        });

        console.log('🚇 SUCCESS: Retrieved', allStops.length, 'unique TMB metro stops from', metroLineCodes.length, 'lines');
        return allStops;
    }).catch(function(error) {
        console.error('❌ Error fetching TMB metro stops:', error);
        alert(getTranslation('metro_error_loading') + ': ' + error.message);
        return [];
    });
}

// Fetch stops for a specific TMB metro line
function fetchTMBMetroStopsForLine(lineCode) {
    var apiUrl = 'https://api.tmb.cat/v1/transit/linies/metro/' + encodeURIComponent(lineCode) + '/estacions?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🚇 Fetching TMB metro stops for line', lineCode, 'from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('TMB metro stops API failed for line', lineCode, ':', response.status, response.statusText);
                return []; // Return empty array instead of throwing to continue with other lines
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB metro stops API response for line', lineCode, ':', data);

            var stops = [];
            var lineColor = '#666666'; // Default color

            // Extract line color from the API response if available
            if (data && data.features && Array.isArray(data.features) && data.features.length > 0) {
                var firstFeature = data.features[0];
                if (firstFeature.properties && firstFeature.properties.COLOR_LINIA) {
                    lineColor = '#' + firstFeature.properties.COLOR_LINIA;
                    console.log('🎨 Found line color for line', lineCode, ':', lineColor);
                }
            }

            // Process TMB API response for metro stops
            if (data && data.features && Array.isArray(data.features)) {
                data.features.forEach(function(feature) {
                    if (feature.properties && feature.geometry && feature.geometry.coordinates) {
                        var coords = feature.geometry.coordinates;
                        var lat = coords[1]; // GeoJSON: [lng, lat]
                        var lng = coords[0];

                        if (typeof lat === 'number' && typeof lng === 'number' &&
                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                            stops.push({
                                id: feature.properties.CODI_ESTACIO || feature.properties.codi_estacio,
                                codi_estacio: feature.properties.CODI_ESTACIO || feature.properties.codi_estacio,
                                nom_estacio: feature.properties.NOM_ESTACIO || feature.properties.nom_estacio,
                                lat: lat,
                                lng: lng,
                                line: lineCode,
                                color: lineColor
                            });
                        }
                    }
                });
            } else if (data && Array.isArray(data)) {
                // Alternative format
                data.forEach(function(stop) {
                    if (stop.lat && stop.lng) {
                        stops.push({
                            id: stop.codi_estacio || stop.id,
                            codi_estacio: stop.codi_estacio || stop.id,
                            nom_estacio: stop.nom_estacio || stop.name,
                            lat: parseFloat(stop.lat),
                            lng: parseFloat(stop.lng),
                            line: lineCode,
                            color: lineColor
                        });
                    }
                });
            }

            console.log('🚇 Processed', stops.length, 'stops for metro line', lineCode, 'with color:', lineColor);
            return stops;
        })
        .catch(error => {
            console.error('❌ TMB metro stops API error for line', lineCode, ':', error);
            return []; // Return empty array to continue processing other lines
        });
}

// Define TMB metro colors for different lines
var tmbMetroLineColors = {
    1: '#FF0000',    // Red
    2: '#9ACD32',    // Yellow-Green
    3: '#32CD32',    // Lime Green
    4: '#FFD700',    // Gold
    5: '#4169E1',    // Royal Blue
    11: '#DC143C',   // Crimson
    91: '#FF6347',   // Tomato
    94: '#20B2AA',   // Light Sea Green
    99: '#FF4500',   // Orange Red
    101: '#8B4513',  // Saddle Brown
    104: '#9932CC'   // Dark Orchid
};

// Fetch real-time metro arrivals for a specific TMB station
function fetchTMBRealtimeMetroForStation(stationCode) {
    var apiUrl = 'https://api.tmb.cat/v1/itransit/metro/estacions/' + encodeURIComponent(stationCode) + '/?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    console.log('🚇 Fetching real-time metro arrivals for station', stationCode, 'from:', apiUrl);

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('TMB real-time metro API failed for station', stationCode, ':', response.status, response.statusText);
                return null; // Return null instead of throwing to continue with other stations
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ TMB real-time metro API response for station', stationCode, ':', data);

            // Special debugging for station 112 (Bellvitge)
            if (stationCode == '112') {
                console.log('🔍 SPECIAL DEBUG for station 112 (Bellvitge):');
                console.log('  - Full response:', JSON.stringify(data, null, 2));
                console.log('  - Has data property:', !!data?.data);
                console.log('  - Has iatx property:', !!data?.data?.iatx);
                console.log('  - iatx is array:', Array.isArray(data?.data?.iatx));
                console.log('  - Direct iatx:', !!data?.iatx);
                console.log('  - Direct iatx is array:', Array.isArray(data?.iatx));
                console.log('  - Data is array:', Array.isArray(data));
                if (data?.data?.iatx && Array.isArray(data.data.iatx)) {
                    console.log('  - iatx array length:', data.data.iatx.length);
                    data.data.iatx.forEach(function(item, index) {
                        console.log('  - Item', index, ':', item);
                    });
                }
            }

            var arrivals = [];

            // Process TMB iTransit API response for metro arrivals
            // Handle the correct nested structure: linies -> estacions -> linies_trajectes -> propers_trens
            var arrivals = [];

            if (data && data.linies && Array.isArray(data.linies)) {
                console.log('🚇 Processing correct nested structure for station', stationCode);

                // Find the station data within the linies -> estacions structure
                var stationData = null;
                data.linies.forEach(function(line) {
                    if (line.estacions && Array.isArray(line.estacions)) {
                        line.estacions.forEach(function(station) {
                            if (station.codi_estacio == stationCode) {
                                stationData = station;
                                console.log('✅ Found station data for', stationCode, ':', station);
                            }
                        });
                    }
                });

                if (stationData && stationData.linies_trajectes && Array.isArray(stationData.linies_trajectes)) {
                    console.log('🚇 Found linies_trajectes for station', stationCode, ':', stationData.linies_trajectes.length, 'trajectories');

                    stationData.linies_trajectes.forEach(function(lineTrajectory) {
                        try {
                            console.log('🔍 Processing line trajectory for station', stationCode, ':', lineTrajectory);

                            var line = lineTrajectory.codi_linia || 'Unknown';
                            var lineName = lineTrajectory.nom_linia || ('L' + line);
                            var destination = lineTrajectory.desti_trajecte || '';
                            var color = lineTrajectory.color_linia || '#666666';

                            console.log('📊 Line info - codi_linia:', lineTrajectory.codi_linia, 'nom_linia:', lineTrajectory.nom_linia, 'color:', color);

                            // Process upcoming trains for this line/direction
                            if (lineTrajectory.propers_trens && Array.isArray(lineTrajectory.propers_trens)) {
                                console.log('🚂 Found', lineTrajectory.propers_trens.length, 'propers_trens for line', line);

                                lineTrajectory.propers_trens.forEach(function(train, trainIndex) {
                                    try {
                                        var serviceCode = train.codi_servei || ('train_' + trainIndex);
                                        var arrivalTimestamp = train.temps_arribada || 0;

                                        console.log('🕒 Train', trainIndex, '- codi_servei:', serviceCode, 'temps_arribada:', arrivalTimestamp);

                                        // Convert timestamp to minutes from now
                                        var now = Date.now();
                                        var timeToArrival = 0;

                                        if (arrivalTimestamp > 1000000000000) { // Milliseconds timestamp
                                            timeToArrival = Math.max(0, Math.round((arrivalTimestamp - now) / 60000));
                                        }

                                        // Create scheduled time for countdown calculation
                                        var scheduledTime = new Date(now + (timeToArrival * 60 * 1000));

                                        arrivals.push({
                                            id: line + '-' + stationCode + '-' + serviceCode + '-' + trainIndex,
                                            line: line,
                                            lineName: lineName,
                                            direction: destination,
                                            destination: destination,
                                            serviceCode: serviceCode,
                                            timeToArrival: timeToArrival,
                                            scheduledTime: scheduledTime,
                                            color: '#' + color,
                                            status: 'Arriving at station'
                                        });

                                        console.log('✅ Processed TMB metro arrival:', {
                                            line: line,
                                            destination: destination,
                                            serviceCode: serviceCode,
                                            timeToArrival: timeToArrival + 'min',
                                            scheduledTime: scheduledTime.toLocaleTimeString()
                                        });
                                    } catch (trainError) {
                                        console.warn('Error processing train for station', stationCode, ':', trainError, train);
                                    }
                                });
                            } else {
                                console.warn('No propers_trens found for line trajectory:', lineTrajectory);
                            }
                        } catch (trajectoryError) {
                            console.warn('Error processing line trajectory for station', stationCode, ':', trajectoryError, lineTrajectory);
                        }
                    });

                    // Store the first line found as the primary line for this station
                    if (stationData.linies_trajectes.length > 0 && stationData.linies_trajectes[0].codi_linia) {
                        var primaryLine = stationData.linies_trajectes[0].codi_linia;
                        console.log('📍 Setting primary line for station', stationCode, 'to', primaryLine);

                        // Update the line information in the arrivals for consistency
                        arrivals.forEach(function(arrival) {
                            if (!arrival.primaryLine) {
                                arrival.primaryLine = primaryLine;
                            }
                        });

                        // Return the primary line along with arrivals so it can be used to update the station
                        return { arrivals: arrivals, primaryLine: primaryLine };
                    }

                    return { arrivals: arrivals, primaryLine: null };
                } else {
                    console.warn('🚇 No station data or linies_trajectes found for station', stationCode);
                }
            } else {
                console.warn('🚇 No linies structure found in API response for station', stationCode);
                // Fallback to old parsing methods
                console.log('🚇 Falling back to old parsing methods...');

                var arrivalsData = null;
                if (data && data.data && Array.isArray(data.data)) {
                    arrivalsData = data.data;
                } else if (data && data.iatx && Array.isArray(data.iatx)) {
                    arrivalsData = data.iatx;
                } else if (Array.isArray(data)) {
                    arrivalsData = data;
                }

                if (arrivalsData) {
                    arrivalsData.forEach(function(arrival) {
                        var line = arrival.line || arrival.linia || 'Unknown';
                        var timeToArrival = arrival["t-in-min"] || arrival.temps || 0;
                        var destination = arrival.destination || arrival.desti || '';

                        if (timeToArrival > 100) {
                            timeToArrival = Math.round(timeToArrival / 60);
                        }

                        var scheduledTime = new Date(Date.now() + (timeToArrival * 60 * 1000));

                        arrivals.push({
                            id: line + '-' + stationCode + '-fallback',
                            line: line,
                            destination: destination,
                            timeToArrival: timeToArrival,
                            scheduledTime: scheduledTime,
                            status: 'Arriving at station'
                        });
                    });
                }
            }

            console.log('🚇 Processed', arrivals.length, 'real-time metro arrivals for station', stationCode);
            return arrivals;
        })
        .catch(error => {
            console.error('❌ TMB real-time metro API error for station', stationCode, ':', error);
            return null; // Return null to indicate no data available
        });
}

// Display TMB metro stops on map
function displayTMBMetroStops(stops) {
    console.log('🚇 DISPLAYING', stops.length, 'TMB METRO STOPS ON MAP...');

    // Clear existing markers
    tmbMetroStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbMetroStopsMarkers = [];

    var totalStops = 0;
    var realtimePromises = [];

    // First, fetch real-time data for all stops
    stops.forEach(function(stop) {
        if (stop.codi_estacio || stop.id) {
            var stationCode = stop.codi_estacio || stop.id;
            var promise = fetchTMBRealtimeMetroForStation(stationCode).then(function(result) {
                // Handle both old format (array) and new format ({arrivals, primaryLine})
                if (result && typeof result === 'object' && result.arrivals) {
                    stop.realtimeArrivals = result.arrivals || [];
                    // Update station line if we got it from real-time API
                    if (result.primaryLine && (!stop.line || stop.line === 'Unknown')) {
                        stop.line = result.primaryLine;
                        console.log('✅ Updated station', stationCode, 'line to', result.primaryLine);
                    }
                } else {
                    // Fallback for old format
                    stop.realtimeArrivals = result || [];
                }
                return stop;
            });
            realtimePromises.push(promise);
        } else {
            stop.realtimeArrivals = [];
        }
    });

    // Wait for all real-time data to be fetched
    Promise.all(realtimePromises).then(function(stopsWithRealtime) {
        // Store timestamp when data was fetched
        var dataFetchedAt = new Date();

        stopsWithRealtime.forEach(function(stop) {
            if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
                // Get stop name for display (prefer station name over code for better UX)
                var stopRef = stop.nom_estacio || stop.codi_estacio || stop.id || '?';
                // Don't truncate station names - show full names for better UX

                // Check if there are active trains (arriving soon)
                var hasActiveTrains = stop.realtimeArrivals && stop.realtimeArrivals.length > 0 &&
                    stop.realtimeArrivals.some(function(arrival) { return arrival.timeToArrival <= 5; });

                // Get line color from the stop data (fetched from API)
                var lineColor = stop.color || tmbMetroLineColors[stop.line] || '#666666';

                // Create metro stop marker
                var markerHtml = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                    '<circle cx="14" cy="14" r="12" fill="' + lineColor + '" stroke="white" stroke-width="2"/>' +
                    '<rect x="8" y="8" width="12" height="8" rx="1" fill="white"/>' +
                    '<text x="14" y="13" text-anchor="middle" fill="' + lineColor + '" font-size="8px" font-weight="bold">METRO</text>' +
                    '<circle cx="14" cy="20" r="2" fill="' + lineColor + '"/>' +
                    '</svg>' +
                    '<div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); ' +
                    'background: ' + lineColor + '; color: white; font-size: 10px; font-weight: bold; ' +
                    'padding: 2px 4px; border-radius: 3px; border: 1px solid #333; white-space: nowrap;">' +
                    'L' + stop.line + '</div>' +
                    '<div style="position: absolute; top: 28px; left: 50%; transform: translateX(-50%); ' +
                    'background: white; color: ' + lineColor + '; font-size: 8px; font-weight: bold; ' +
                    'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                    stopRef + '</div>';

                // Add active train indicator if there are trains arriving soon
                if (hasActiveTrains) {
                    markerHtml += '<div style="position: absolute; bottom: -2px; right: -2px; ' +
                        'background: #00aa00; color: white; font-size: 6px; font-weight: bold; ' +
                        'padding: 1px 2px; border-radius: 50%; border: 1px solid #333; min-width: 8px; text-align: center;">' +
                        '●' + '</div>';
                }

                var stopMarker = L.marker([stop.lat, stop.lng], {
                    icon: L.divIcon({
                        html: markerHtml,
                        className: 'tmb-metro-stop-marker',
                        iconSize: [28, 28],
                        iconAnchor: [14, 28]
                    })
                });

                // Create popup with stop information and real-time arrivals
                var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + lineColor + '; border-bottom: 2px solid ' + lineColor + '; padding-bottom: 4px;">' +
                    '🚇 ' + (stop.nom_estacio || 'Estació Metro') + '</h4>' +
                    '<div style="background: ' + lineColor + '20; border: 1px solid ' + lineColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Nom:</strong> ' + (stop.nom_estacio || 'Sense nom') + '<br>' +
                    '<strong>Codi:</strong> ' + (stop.codi_estacio || stop.id) + '<br>' +
                    '<strong>Línia:</strong> L' + stop.line + '<br>' +
                    '<strong>Posició:</strong> ' + stop.lat.toFixed(4) + ', ' + stop.lng.toFixed(4) +
                    '</div>';

                // Add real-time arrivals section
                if (stop.realtimeArrivals && stop.realtimeArrivals.length > 0) {
                    popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                        '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🚇 Próxims metros</h5>' +
                        '<div style="max-height: 150px; overflow-y: auto;">';

                    stop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) { // Show up to 10 arrivals
                        var arrivalId = 'tmb-metro-arrival-' + stop.codi_estacio + '-' + index;
                        var scheduledTime = arrival.scheduledTime;

                        var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                        var countdownStr = getTMBMetroCountdownString(arrival, scheduledTime);

                        popupContent += '<div style="margin-bottom: 6px; padding: 6px; background: #fff; border-radius: 3px; border: 1px solid #eee;">' +
                            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                            '<div style="font-weight: bold; color: ' + lineColor + ';">Línia ' + arrival.line + '</div>' +
                            '<div id="' + arrivalId + '" style="font-weight: bold; font-family: monospace;">' + countdownStr + '</div>' +
                            '</div>' +
                            '<div style="font-size: 11px; color: #666;">Arribada: ' + scheduledTimeStr + '</div>';
                        if (arrival.destination) {
                            popupContent += '<div style="font-size: 11px; color: #666; margin-top: 2px;">➜ ' + arrival.destination + '</div>';
                        }
                        popupContent += '</div>';

                        // Start live countdown update for this arrival
                        startTMBMetroArrivalCountdown(arrivalId, arrival, scheduledTime);
                    });

                    popupContent += '</div></div>';

                    // Add train vehicle markers for trains arriving at this station
                    stop.realtimeArrivals.slice(0, 3).forEach(function(arrival) { // Show up to 3 train vehicles
                        if (arrival.timeToArrival <= 3) { // Only show trains arriving within 3 minutes
                            var trainColor = tmbMetroLineColors[arrival.line] || lineColor;
                            var trainMarkerHtml = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.8));">' +
                                '<rect x="4" y="8" width="24" height="16" rx="4" fill="' + trainColor + '" stroke="#fff" stroke-width="2"/>' +
                                '<rect x="8" y="12" width="16" height="2" rx="1" fill="#fff"/>' +
                                '<rect x="8" y="16" width="16" height="2" rx="1" fill="#fff"/>' +
                                '<rect x="8" y="20" width="16" height="2" rx="1" fill="#fff"/>' +
                                '<circle cx="6" cy="26" r="3" fill="#666"/>' +
                                '<circle cx="26" cy="26" r="3" fill="#666"/>' +
                                '<text x="16" y="22" text-anchor="middle" fill="#fff" font-size="10px" font-weight="bold">' + arrival.line + '</text>' +
                                '</svg>';

                            var trainMarker = L.marker([stop.lat, stop.lng], {
                                icon: L.divIcon({
                                    html: trainMarkerHtml,
                                    className: 'tmb-metro-vehicle-marker',
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 26]
                                })
                            });

                            // Create train popup
                            var trainPopupContent = '<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                                '<h4 style="margin: 0 0 8px 0; color: ' + trainColor + '; border-bottom: 2px solid ' + trainColor + '; padding-bottom: 4px;">' +
                                '🚇 Metro Línia ' + arrival.line + '</h4>' +
                                '<div style="background: ' + trainColor + '20; border: 1px solid ' + trainColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                                '<strong>Línia:</strong> ' + arrival.line + '<br>' +
                                '<strong>Destí:</strong> ' + (arrival.destination || 'Desconegut') + '<br>' +
                                '<strong>Temps d\'arribada:</strong> <span style="font-weight: bold; color: ' +
                                (arrival.timeToArrival <= 1 ? '#d63031' : arrival.timeToArrival <= 3 ? '#e17055' : '#0066cc') + ';">' +
                                (arrival.timeToArrival === 0 ? 'Arribant ara' : arrival.timeToArrival + ' min') + '</span><br>' +
                                '<strong>Estació actual:</strong> ' + (stop.nom_estacio || 'Sense nom') +
                                '</div>' +
                                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                                '🚇 Metro de Barcelona - TMB' +
                                '</div>' +
                                '</div>';

                            trainMarker.bindPopup(trainPopupContent);

                            // Add train marker to map
                            trainMarker.addTo(map);
                            tmbMetroStopsMarkers.push(trainMarker);
                            console.log('✅ ADDED TMB METRO VEHICLE MARKER: Line', arrival.line, 'at station', stopRef, 'arriving in', arrival.timeToArrival, 'min');
                        }
                    });
                } else {
                    popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                        '<em>Sense informació de temps real</em>' +
                        '</div>';
                }

                // Add refresh button and data timestamp
                popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                    '<button onclick="refreshTMBMetroStationData({codi_estacio: \'' + (stop.codi_estacio || stop.id) + '\', nom_estacio: \'' + (stop.nom_estacio || 'Sense nom').replace(/'/g, '\\\'') + '\', lat: ' + stop.lat + ', lng: ' + stop.lng + '})" ' +
                    'style="background: #28a745; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 9px; margin-right: 8px;">🔄 Actualitzar</button>' +
                    '<em>Dades actualitzades a les ' + dataFetchedAt.toLocaleTimeString() + '</em>' +
                    '</div>';

                popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🚇 Metro de Barcelona - TMB' +
                    '</div>' +
                    '</div>';

                stopMarker.bindPopup(popupContent);

                // Add stop marker to map
                stopMarker.addTo(map);
                tmbMetroStopsMarkers.push(stopMarker);
                totalStops++;

                console.log('✅ ADDED TMB METRO STOP MARKER:', stop.codi_estacio || stop.id, stop.nom_estacio, 'line', stop.line, 'with', stop.realtimeArrivals ? stop.realtimeArrivals.length : 0, 'real-time arrivals');
            } else {
                console.warn('❌ INVALID COORDS for TMB metro stop:', stop.codi_estacio || stop.id, stop.lat, stop.lng);
            }
        });

        console.log('🎯 TOTAL TMB METRO STOP MARKERS CREATED:', totalStops);

        // Update status
        updateTMBMetroStopsStatus('🚇 Mostrant ' + totalStops + ' estacions de metro TMB amb temps real');

        console.log('🎉 TMB METRO STOPS AND VEHICLES WITH REAL-TIME DATA DISPLAY COMPLETED SUCCESSFULLY!');
    }).catch(function(error) {
        console.error('❌ Error processing real-time data for TMB metro stops:', error);
        updateTMBMetroStopsStatus('Error carregant dades temps real');
    });
}

// Get countdown string for TMB metro arrival
function getTMBMetroCountdownString(arrival, scheduledTime) {
    if (!scheduledTime) {
        return '--:--:--';
    }

    var now = new Date().getTime();
    var arrivalMs = scheduledTime.getTime();
    var diffMs = arrivalMs - now;

    if (diffMs <= 0) {
        return 'Arribat';
    }

    // Convert to seconds, minutes, hours
    var totalSeconds = Math.floor(diffMs / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    // Format as HH:MM:SS or MM:SS depending on time remaining
    var timeStr = '';
    if (hours > 0) {
        timeStr = hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
    } else {
        timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
    }

    return timeStr;
}

// Start live countdown update for a specific TMB metro arrival
function startTMBMetroArrivalCountdown(elementId, arrival, scheduledTime) {
    if (!scheduledTime) return;

    function updateCountdown() {
        var element = document.getElementById(elementId);
        if (!element) return; // Element no longer exists

        var countdownStr = getTMBMetroCountdownString(arrival, scheduledTime);

        // Color coding based on urgency
        var now = new Date().getTime();
        var arrivalMs = scheduledTime.getTime();
        var diffMs = arrivalMs - now;
        var diffMinutes = diffMs / (1000 * 60);

        var color = '#0066cc'; // Default blue
        if (diffMs <= 0) {
            color = '#888'; // Gray for arrived/overdue
        } else if (diffMinutes <= 1) {
            color = '#d63031'; // Red for very soon
        } else if (diffMinutes <= 3) {
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
    if (!window.tmbMetroCountdownIntervals) {
        window.tmbMetroCountdownIntervals = [];
    }
    window.tmbMetroCountdownIntervals.push(intervalId);
}

// TMB Metro Stops Table Management
var tmbMetroStopsTableData = [];
var currentTMBMetroTablePage = 1;
var itemsPerTMBMetroTablePage = 25; // 25 items per page for better readability
var filteredTMBMetroTableData = [];
var currentTMBMetroTableSortColumn = 'id'; // Default sort column
var currentTMBMetroTableSortDirection = 'asc'; // 'asc' or 'desc'

// Load TMB metro stops table
function loadTMBMetroStopsTable() {
    console.log('📋 Loading TMB metro stops table...');

    // Show loading indicator
    document.getElementById('tmb-metro-table-loading').style.display = 'block';
    document.getElementById('tmb-metro-stops-table').style.display = 'none';
    document.getElementById('tmb-metro-no-results').style.display = 'none';
    document.getElementById('tmb-metro-pagination').style.display = 'none';

    updateTMBMetroTableStatus('Carregant estacions de metro...');

    // Check if we already have the data from the map visualization
    if (allTMBMetroStops && allTMBMetroStops.length > 0) {
        console.log('✅ Using cached TMB metro stops data:', allTMBMetroStops.length, 'stops');
        populateTMBMetroTable(allTMBMetroStops);
    } else {
        // Fetch fresh data
        fetchAllTMBMetroStops().then(function(stops) {
            allTMBMetroStops = stops; // Cache for future use
            populateTMBMetroTable(stops);
        }).catch(function(error) {
            console.error('❌ Error loading TMB metro stops for table:', error);
            updateTMBMetroTableStatus('Error carregant dades');
            document.getElementById('tmb-metro-table-loading').style.display = 'none';
            alert('Error carregant les dades d\'estacions TMB: ' + error.message);
        });
    }
}

// Populate table with TMB metro stops data
function populateTMBMetroTable(stops) {
    console.log('📊 Populating TMB metro table with', stops.length, 'stops');

    // Fetch real-time data for all stops to show upcoming metros in table
    var realtimePromises = stops.map(function(stop) {
        if (stop.codi_estacio || stop.id) {
            var stationCode = stop.codi_estacio || stop.id;
            return fetchTMBRealtimeMetroForStation(stationCode).then(function(result) {
                // Handle both old format (array) and new format ({arrivals, primaryLine})
                if (result && typeof result === 'object' && result.arrivals) {
                    stop.realtimeArrivals = result.arrivals || [];
                    // Update station line if we got it from real-time API
                    if (result.primaryLine && (!stop.line || stop.line === 'Unknown')) {
                        stop.line = result.primaryLine;
                        console.log('✅ Updated station', stationCode, 'line to', result.primaryLine);
                    }
                } else {
                    // Fallback for old format
                    stop.realtimeArrivals = result || [];
                }
                return stop;
            });
        } else {
            stop.realtimeArrivals = [];
            return Promise.resolve(stop);
        }
    });

    Promise.all(realtimePromises).then(function(stopsWithRealtime) {
        console.log('✅ Fetched real-time data for', stopsWithRealtime.length, 'metro stops');

        tmbMetroStopsTableData = stopsWithRealtime;
        filteredTMBMetroTableData = [...tmbMetroStopsTableData];

        currentTMBMetroTablePage = 1;
        displayTMBMetroTablePage();

        // Hide loading, show table
        document.getElementById('tmb-metro-table-loading').style.display = 'none';
        document.getElementById('tmb-metro-stops-table').style.display = 'table';
        document.getElementById('tmb-metro-pagination').style.display = 'block';

        updateTMBMetroTableStatus('Trobat ' + stopsWithRealtime.length + ' estacions de metro amb dades temps real');
        updateTMBMetroTableSortIndicators();

        console.log('✅ TMB metro table populated successfully with real-time data');
    }).catch(function(error) {
        console.error('❌ Error fetching real-time data for table:', error);
        // Still show the table with static data
        stops.forEach(function(stop) {
            stop.realtimeArrivals = [];
        });
        tmbMetroStopsTableData = stops;
        filteredTMBMetroTableData = [...tmbMetroStopsTableData];

        currentTMBMetroTablePage = 1;
        displayTMBMetroTablePage();

        document.getElementById('tmb-metro-table-loading').style.display = 'none';
        document.getElementById('tmb-metro-stops-table').style.display = 'table';
        document.getElementById('tmb-metro-pagination').style.display = 'block';

        updateTMBMetroTableStatus('Trobat ' + stops.length + ' estacions (sense dades temps real)');
        updateTMBMetroTableSortIndicators();
    });
}

// Display current page of TMB metro table
function displayTMBMetroTablePage() {
    var tbodyElement = document.getElementById('tmb-metro-stops-tbody');
    var noResultsElement = document.getElementById('tmb-metro-no-results');

    if (!tbodyElement) return;

    // Clear any existing countdown intervals for table elements before recreating
    if (window.tmbMetroCountdownIntervals) {
        window.tmbMetroCountdownIntervals.forEach(function(intervalId) {
            clearInterval(intervalId);
        });
        window.tmbMetroCountdownIntervals = [];
    }

    var startIndex = (currentTMBMetroTablePage - 1) * itemsPerTMBMetroTablePage;
    var endIndex = startIndex + itemsPerTMBMetroTablePage;
    var stopsToShow = filteredTMBMetroTableData.slice(startIndex, endIndex);

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
        idCell.style.color = '#333';
        idCell.textContent = stop.codi_estacio || stop.id || '';
        row.appendChild(idCell);

        // Name column
        var nameCell = document.createElement('td');
        nameCell.style.padding = '8px';
        nameCell.textContent = stop.nom_estacio || 'Sense nom';
        row.appendChild(nameCell);

        // Line column
        var lineCell = document.createElement('td');
        lineCell.style.padding = '8px';
        lineCell.style.fontWeight = 'bold';

        // Get line color
        var lineColor = stop.color || tmbMetroLineColors[stop.line] || '#666666';
        lineCell.innerHTML = '<span style="background: ' + lineColor + '; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">L' + stop.line + '</span>';
        row.appendChild(lineCell);

        // Next metros column
        var arrivalsCell = document.createElement('td');
        arrivalsCell.style.padding = '8px';

        if (stop.realtimeArrivals && stop.realtimeArrivals.length > 0) {
            var arrivalsHtml = '<div style="font-size: 11px;">';
            var nextArrivals = stop.realtimeArrivals.slice(0, 2); // Show up to 2 next arrivals

            nextArrivals.forEach(function(arrival, index) {
                var arrivalId = 'table-metro-arrival-' + stop.codi_estacio + '-' + index;
                var scheduledTime = arrival.scheduledTime;
                var countdownStr = getTMBMetroCountdownString(arrival, scheduledTime);

                arrivalsHtml += '<div style="margin-bottom: 2px; padding: 2px 4px; background: #f0f0f0; border-radius: 2px;">' +
                    '<span style="font-weight: bold; color: ' + lineColor + ';">L' + arrival.line + '</span> ' +
                    '<span id="' + arrivalId + '" style="font-family: monospace; font-weight: bold; margin-right: 4px;">' + countdownStr + '</span>';
                if (arrival.destination) {
                    arrivalsHtml += ' → ' + arrival.destination.substring(0, 12);
                    if (arrival.destination.length > 12) arrivalsHtml += '...';
                }
                arrivalsHtml += '</div>';

                // Start live countdown update for this table arrival
                startTMBMetroArrivalCountdown(arrivalId, arrival, scheduledTime);
            });

            if (stop.realtimeArrivals.length > 2) {
                arrivalsHtml += '<div style="font-size: 10px; color: #666; text-align: center;">+' + (stop.realtimeArrivals.length - 2) + ' més...</div>';
            }

            arrivalsHtml += '</div>';
            arrivalsCell.innerHTML = arrivalsHtml;
        } else {
            arrivalsCell.innerHTML = '<span style="color: #999; font-style: italic; font-size: 11px;">Sense dades temps real</span>';
        }
        row.appendChild(arrivalsCell);

        // Actions column
        var actionsCell = document.createElement('td');
        actionsCell.style.padding = '8px';
        actionsCell.style.textAlign = 'center';

        // Zoom button
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
        zoomBtn.style.marginRight = '4px';
        zoomBtn.onclick = function() {
            zoomToTMBMetroStop(stop);
        };
        actionsCell.appendChild(zoomBtn);

        // Refresh button (same behavior as popup)
        var refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄';
        refreshBtn.title = 'Actualitzar dades d\'aquesta estació';
        refreshBtn.style.background = '#28a745';
        refreshBtn.style.color = 'white';
        refreshBtn.style.border = 'none';
        refreshBtn.style.padding = '4px 6px';
        refreshBtn.style.borderRadius = '3px';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.style.fontSize = '10px';
        refreshBtn.onclick = function() {
            refreshTMBMetroStationData({
                codi_estacio: stop.codi_estacio || stop.id,
                nom_estacio: stop.nom_estacio || 'Sense nom',
                lat: stop.lat,
                lng: stop.lng
            });
        };
        actionsCell.appendChild(refreshBtn);

        row.appendChild(actionsCell);

        tbodyElement.appendChild(row);
    });

    updateTMBMetroTablePaginationControls();
}

// Update TMB metro table status display
function updateTMBMetroTableStatus(status) {
    var statusElement = document.getElementById('tmb-metro-table-status');
    if (statusElement) {
        statusElement.textContent = '📊 ' + status;
    }
}

// Search TMB metro table
function searchTMBMetroTable() {
    var searchInput = document.getElementById('tmb-metro-table-search');
    if (!searchInput) return;

    var searchTerm = searchInput.value.toLowerCase().trim();
    filteredTMBMetroTableData = tmbMetroStopsTableData.filter(function(stop) {
        var searchableText = [
            stop.codi_estacio || stop.id || '',
            stop.nom_estacio || '',
            'l' + (stop.line || ''),
            stop.line || ''
        ].join(' ').toLowerCase();

        return searchableText.includes(searchTerm);
    });

    currentTMBMetroTablePage = 1;
    displayTMBMetroTablePage();
}

// Clear TMB metro table search
function clearTMBMetroTableSearch() {
    var searchInput = document.getElementById('tmb-metro-table-search');
    if (searchInput) {
        searchInput.value = '';
    }
    filteredTMBMetroTableData = [...tmbMetroStopsTableData];
    currentTMBMetroTablePage = 1;
    displayTMBMetroTablePage();
}

// Sort TMB metro table
function sortTMBMetroTable(column) {
    // Toggle sort direction if same column, otherwise default to ascending
    if (currentTMBMetroTableSortColumn === column) {
        currentTMBMetroTableSortDirection = currentTMBMetroTableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentTMBMetroTableSortColumn = column;
        currentTMBMetroTableSortDirection = 'asc';
    }

    // Sort the filtered data
    filteredTMBMetroTableData.sort(function(a, b) {
        var aVal, bVal;

        switch(column) {
            case 'id':
                aVal = (a.codi_estacio || a.id || '').toString().toLowerCase();
                bVal = (b.codi_estacio || b.id || '').toString().toLowerCase();
                break;
            case 'name':
                aVal = (a.nom_estacio || '').toString().toLowerCase();
                bVal = (b.nom_estacio || '').toString().toLowerCase();
                break;
            case 'line':
                aVal = parseInt(a.line || 0);
                bVal = parseInt(b.line || 0);
                break;
            case 'arrivals':
                aVal = (a.realtimeArrivals && a.realtimeArrivals.length > 0) ? a.realtimeArrivals[0].timeToArrival || 999 : 999;
                bVal = (b.realtimeArrivals && b.realtimeArrivals.length > 0) ? b.realtimeArrivals[0].timeToArrival || 999 : 999;
                break;
            default:
                return 0;
        }

        if (currentTMBMetroTableSortDirection === 'asc') {
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return aVal - bVal;
            } else {
                return aVal.localeCompare ? aVal.localeCompare(bVal, 'ca', {numeric: true, sensitivity: 'base'}) : (aVal > bVal ? 1 : aVal < bVal ? -1 : 0);
            }
        } else {
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return bVal - aVal;
            } else {
                return bVal.localeCompare ? bVal.localeCompare(aVal, 'ca', {numeric: true, sensitivity: 'base'}) : (bVal > aVal ? 1 : aVal < aVal ? -1 : 0);
            }
        }
    });

    // Reset to first page when sorting
    currentTMBMetroTablePage = 1;

    // Update sort indicators
    updateTMBMetroTableSortIndicators();

    // Redisplay the table
    displayTMBMetroTablePage();
}

// Update sort indicators in table headers
function updateTMBMetroTableSortIndicators() {
    // Reset all indicators
    var indicators = ['metro-sort-id', 'metro-sort-name', 'metro-sort-line', 'metro-sort-arrivals'];
    indicators.forEach(function(id) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = '↕️';
        }
    });

    // Set active indicator
    var activeId = 'metro-sort-' + currentTMBMetroTableSortColumn;
    var activeElement = document.getElementById(activeId);
    if (activeElement) {
        activeElement.textContent = currentTMBMetroTableSortDirection === 'asc' ? '⬆️' : '⬇️';
    }
}

// Update TMB metro table pagination controls
function updateTMBMetroTablePaginationControls() {
    var prevButton = document.getElementById('tmb-metro-prev-page');
    var nextButton = document.getElementById('tmb-metro-next-page');
    var pageInfo = document.getElementById('tmb-metro-page-info');

    var totalPages = Math.ceil(filteredTMBMetroTableData.length / itemsPerTMBMetroTablePage);

    if (prevButton) {
        prevButton.disabled = currentTMBMetroTablePage <= 1;
    }

    if (nextButton) {
        nextButton.disabled = currentTMBMetroTablePage >= totalPages;
    }

    if (pageInfo) {
        pageInfo.textContent = 'Pàgina ' + currentTMBMetroTablePage + ' de ' + Math.max(1, totalPages) +
                              ' (' + filteredTMBMetroTableData.length + ' estacions)';
    }
}

// Change TMB metro table page
function changeTMBMetroPage(direction) {
    var totalPages = Math.ceil(filteredTMBMetroTableData.length / itemsPerTMBMetroTablePage);
    currentTMBMetroTablePage += direction;

    if (currentTMBMetroTablePage < 1) currentTMBMetroTablePage = 1;
    if (currentTMBMetroTablePage > totalPages) currentTMBMetroTablePage = totalPages;

    displayTMBMetroTablePage();
}

// Zoom to TMB metro stop on map
function zoomToTMBMetroStop(stop) {
    if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
        map.setView([stop.lat, stop.lng], 18); // High zoom level to focus on the stop
        console.log('🗺️ Zoomed to TMB metro stop:', stop.codi_estacio || stop.id, 'at', stop.lat, stop.lng);

        // If map visualization is active, also trigger popup
        if (tmbMetroStopsMarkers && tmbMetroStopsMarkers.length > 0) {
            // Find the marker for this stop and open its popup
            tmbMetroStopsMarkers.forEach(function(marker) {
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
        console.warn('❌ Cannot zoom to TMB metro stop - invalid coordinates:', stop.codi_estacio || stop.id, stop.lat, stop.lng);
        alert('No es poden obtenir les coordenades d\'aquesta estació.');
    }
}

// Refresh data for a specific TMB metro station
function refreshTMBMetroStationData(stop) {
    if (!stop || (!stop.codi_estacio && !stop.id)) {
        console.warn('❌ Invalid stop data for refresh:', stop);
        return;
    }

    var stationCode = stop.codi_estacio || stop.id;
    var stationName = stop.nom_estacio || 'Sense nom';

    console.log('🔄 Refreshing data for metro station:', stationCode, stationName);

    // Show loading state in the button (if called from button click)
    var refreshBtn = event ? event.target : null;
    if (refreshBtn) {
        var originalText = refreshBtn.textContent;
        refreshBtn.textContent = '⏳';
        refreshBtn.disabled = true;
        refreshBtn.style.background = '#666';
    }

    // Fetch fresh real-time data for this station
    fetchTMBRealtimeMetroForStation(stationCode).then(function(result) {
        console.log('✅ Refreshed data for station', stationCode, ':', result);

        // Handle both old format (array) and new format ({arrivals, primaryLine})
        if (result && typeof result === 'object' && result.arrivals) {
            stop.realtimeArrivals = result.arrivals || [];
            // Update station line if we got it from real-time API
            if (result.primaryLine && (!stop.line || stop.line === 'Unknown')) {
                stop.line = result.primaryLine;
                console.log('✅ Updated station', stationCode, 'line to', result.primaryLine);
            }
        } else {
            // Fallback for old format
            stop.realtimeArrivals = result || [];
        }

        stop.lastRefresh = new Date();

        console.log('🔄 Updated stop object:', stop);

        // Update table if it's currently displayed
        if (tmbMetroStopsTableData && tmbMetroStopsTableData.length > 0) {
            // Find and update the station in the table data
            var tableIndex = tmbMetroStopsTableData.findIndex(function(tableStop) {
                return (tableStop.codi_estacio || tableStop.id) === stationCode;
            });

            if (tableIndex !== -1) {
                tmbMetroStopsTableData[tableIndex] = stop;
                filteredTMBMetroTableData = [...tmbMetroStopsTableData];
                displayTMBMetroTablePage(); // Refresh the current table page
                console.log('✅ Updated table data for station', stationCode);
            }
        }

        // Update map markers if they exist
        if (tmbMetroStopsMarkers && tmbMetroStopsMarkers.length > 0) {
            console.log('🔄 Looking for map marker for station', stationCode);

            // Find the marker for this station and update its popup
            var foundMarker = false;
            tmbMetroStopsMarkers.forEach(function(marker, markerIndex) {
                if (marker && marker.getLatLng && marker.getPopup) {
                    var markerLatLng = marker.getLatLng();
                    var distance = Math.sqrt(
                        Math.pow(markerLatLng.lat - stop.lat, 2) +
                        Math.pow(markerLatLng.lng - stop.lng, 2)
                    );

                    // Use a small tolerance for coordinate matching
                    if (distance < 0.001) { // About 100 meters tolerance
                        console.log('🎯 Found marker for station', stationCode, 'at index', markerIndex);

                        // Clear any existing countdown intervals for this station
                        var existingCountdowns = document.querySelectorAll('[id^="tmb-metro-arrival-' + stationCode + '"]');
                        existingCountdowns.forEach(function(element) {
                            var elementId = element.id;
                            // Stop any existing countdown for this element
                            if (window.tmbMetroCountdownIntervals) {
                                window.tmbMetroCountdownIntervals = window.tmbMetroCountdownIntervals.filter(function(intervalId) {
                                    if (document.getElementById(elementId)) {
                                        clearInterval(intervalId);
                                        return false;
                                    }
                                    return true;
                                });
                            }
                        });

                        // Create updated popup content
                        var lineColor = stop.color || tmbMetroLineColors[stop.line] || '#666666';
                        var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                            '<h4 style="margin: 0 0 8px 0; color: ' + lineColor + '; border-bottom: 2px solid ' + lineColor + '; padding-bottom: 4px;">' +
                            '🚇 ' + (stop.nom_estacio || 'Estació Metro') + '</h4>' +
                            '<div style="background: ' + lineColor + '20; border: 1px solid ' + lineColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                            '<strong>Nom:</strong> ' + (stop.nom_estacio || 'Sense nom') + '<br>' +
                            '<strong>Codi:</strong> ' + (stop.codi_estacio || stop.id) + '<br>' +
                            '<strong>Línia:</strong> L' + (stop.line || 'Desconeguda') + '<br>' +
                            '<strong>Posició:</strong> ' + stop.lat.toFixed(4) + ', ' + stop.lng.toFixed(4) +
                            '</div>';

                        // Add real-time arrivals section
                        if (stop.realtimeArrivals && stop.realtimeArrivals.length > 0) {
                            console.log('📊 Adding arrivals section with', stop.realtimeArrivals.length, 'arrivals');
                            popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                                '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🚇 Próxims metros</h5>' +
                                '<div style="max-height: 150px; overflow-y: auto;">';

                            stop.realtimeArrivals.slice(0, 10).forEach(function(arrival, index) {
                                var arrivalId = 'tmb-metro-arrival-' + stop.codi_estacio + '-' + index;
                                var scheduledTime = arrival.scheduledTime;

                                var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                                var countdownStr = getTMBMetroCountdownString(arrival, scheduledTime);

                                console.log('🕒 Arrival', index, ': Line', arrival.line, 'Time:', countdownStr, 'Scheduled:', scheduledTimeStr);

                                popupContent += '<div style="margin-bottom: 6px; padding: 6px; background: #fff; border-radius: 3px; border: 1px solid #eee;">' +
                                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                                    '<div style="font-weight: bold; color: ' + lineColor + ';">Línia ' + arrival.line + '</div>' +
                                    '<div id="' + arrivalId + '" style="font-weight: bold; font-family: monospace;">' + countdownStr + '</div>' +
                                    '</div>' +
                                    '<div style="font-size: 11px; color: #666;">Arribada: ' + scheduledTimeStr + '</div>';
                                if (arrival.destination) {
                                    popupContent += '<div style="font-size: 11px; color: #666; margin-top: 2px;">➜ ' + arrival.destination + '</div>';
                                }
                                popupContent += '</div>';

                                // Start live countdown update for this arrival
                                startTMBMetroArrivalCountdown(arrivalId, arrival, scheduledTime);
                            });

                            popupContent += '</div></div>';
                        } else {
                            console.log('⚠️ No arrivals data for station', stationCode);
                            popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                                '<em>Sense informació de temps real</em>' +
                                '</div>';
                        }

                        // Add refresh button and data timestamp
                        var now = new Date();
                        popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                            '<button onclick="refreshTMBMetroStationData({codi_estacio: \'' + (stop.codi_estacio || stop.id) + '\', nom_estacio: \'' + (stop.nom_estacio || 'Sense nom').replace(/'/g, '\\\'') + '\', lat: ' + stop.lat + ', lng: ' + stop.lng + '})" ' +
                            'style="background: #28a745; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 9px; margin-right: 8px;">🔄 Actualitzar</button>' +
                            '<em>Dades actualitzades a les ' + now.toLocaleTimeString() + '</em>' +
                            '</div>';

                        popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                            '🚇 Metro de Barcelona - TMB' +
                            '</div>' +
                            '</div>';

                        // Update the marker's popup
                        marker.setPopupContent(popupContent);
                        console.log('✅ Updated popup for station', stationCode, 'with fresh data');
                        foundMarker = true;
                    }
                }
            });

            if (!foundMarker) {
                console.warn('❌ Could not find map marker for station', stationCode);
            }
        }

        // Restore button state
        if (refreshBtn) {
            refreshBtn.textContent = originalText;
            refreshBtn.disabled = false;
            refreshBtn.style.background = '#28a745';
        }

        console.log('🎉 Successfully refreshed data for metro station:', stationCode, stationName);
    }).catch(function(error) {
        console.error('❌ Error refreshing data for station', stationCode, ':', error);

        // Restore button state on error
        if (refreshBtn) {
            refreshBtn.textContent = '❌';
            refreshBtn.disabled = false;
            refreshBtn.style.background = '#dc3545';

            // Reset to original state after 2 seconds
            setTimeout(function() {
                refreshBtn.textContent = originalText;
                refreshBtn.style.background = '#28a745';
            }, 2000);
        }

        alert('Error actualitzant les dades de l\'estació ' + stationName + ': ' + error.message);
    });
}

// Make functions globally accessible
window.startTMBMetroStops = startTMBMetroStops;
window.stopTMBMetroStops = stopTMBMetroStops;
window.getTMBMetroCountdownString = getTMBMetroCountdownString;
window.startTMBMetroArrivalCountdown = startTMBMetroArrivalCountdown;
window.loadTMBMetroStopsTable = loadTMBMetroStopsTable;
window.searchTMBMetroTable = searchTMBMetroTable;
window.clearTMBMetroTableSearch = clearTMBMetroTableSearch;
window.sortTMBMetroTable = sortTMBMetroTable;
window.changeTMBMetroPage = changeTMBMetroPage;
window.zoomToTMBMetroStop = zoomToTMBMetroStop;
window.refreshTMBMetroStationData = refreshTMBMetroStationData;
