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
                    console.log('🚇 Found linies_trajectes for station', stationCode);

                    stationData.linies_trajectes.forEach(function(lineTrajectory) {
                        try {
                            console.log('🔍 Processing line trajectory for station', stationCode, ':', lineTrajectory);

                            var line = lineTrajectory.codi_linia || 'Unknown';
                            var lineName = lineTrajectory.nom_linia || ('L' + line);
                            var destination = lineTrajectory.desti_trajecte || '';
                            var color = lineTrajectory.color_linia || '#666666';

                            // Process upcoming trains for this line/direction
                            if (lineTrajectory.propers_trens && Array.isArray(lineTrajectory.propers_trens)) {
                                lineTrajectory.propers_trens.forEach(function(train, trainIndex) {
                                    try {
                                        var serviceCode = train.codi_servei || ('train_' + trainIndex);
                                        var arrivalTimestamp = train.temps_arribada || 0;

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
            var promise = fetchTMBRealtimeMetroForStation(stationCode).then(function(arrivals) {
                stop.realtimeArrivals = arrivals || [];
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

                // Add data fetch timestamp
                popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
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

// Make functions globally accessible
window.startTMBMetroStops = startTMBMetroStops;
window.stopTMBMetroStops = stopTMBMetroStops;
window.getTMBMetroCountdownString = getTMBMetroCountdownString;
window.startTMBMetroArrivalCountdown = startTMBMetroArrivalCountdown;
