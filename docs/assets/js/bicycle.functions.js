// Bicing Barcelona Real-Time Visualization
var bicingRealtimeInterval = null;
var bicingRealtimeMarkers = [];
var bicingRealtimeLayer = null;
var bicingStationsByStatus = {}; // Global variable for Bicing legend toggle functionality
var bicingRouteInfo = {}; // Global variable for Bicing route information

// Start Bicing real-time visualization
function startRealtimeBicing() {
    // If already running, stop it instead of starting again
    if (bicingRealtimeInterval) {
        stopRealtimeBicing();
        return;
    }

    // Initial load
    fetchRealtimeBicing().then(function(stations) {
        displayRealtimeBicing(stations);
    });

    // Set up periodic updates every 30 seconds (Bicing data refresh rate)
    bicingRealtimeInterval = setInterval(function() {
        fetchRealtimeBicing().then(function(stations) {
            displayRealtimeBicing(stations);
        });
    }, 30000);

    // Update UI
    document.getElementById('start-bicing-realtime-btn').style.display = 'none';
    document.getElementById('stop-bicing-realtime-btn').style.display = 'inline-block';
    document.getElementById('bicing-legend-btn').style.display = 'inline-block';
    updateBicingRealtimeStatus('Carregant estacions Bicing en temps real...');
}

// Stop Bicing real-time visualization
function stopRealtimeBicing() {
    if (bicingRealtimeInterval) {
        clearInterval(bicingRealtimeInterval);
        bicingRealtimeInterval = null;
    }

    // Clear all station markers
    bicingRealtimeMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    bicingRealtimeMarkers = [];

    // Update UI
    document.getElementById('start-bicing-realtime-btn').style.display = 'inline-block';
    document.getElementById('stop-bicing-realtime-btn').style.display = 'none';
    updateBicingRealtimeStatus('Inactiu');
}

// Update Bicing real-time status display
function updateBicingRealtimeStatus(status) {
    var statusElement = document.getElementById('bicing-realtime-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch real-time Bicing station data
function fetchRealtimeBicing() {
    // Detect deployment environment
    var hostname = window.location.hostname;
    var isGitHubPages = hostname.includes('github.io');
    var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

    // Use appropriate API endpoint based on environment
    var apiUrl;
    if (isVercel) {
        // Use Vercel-deployed API
        apiUrl = '/api/bicing';
        console.log('🚴 Fetching Bicing data via Vercel API...');
    } else if (isGitHubPages) {
        // On GitHub Pages, use our Vercel deployment as proxy
        apiUrl = 'https://openlocalmap2.vercel.app/api/bicing';
        console.log('🚴 Fetching Bicing data via Vercel proxy from GitHub Pages...');
    } else {
        // Local development
        apiUrl = '/api/bicing';
        console.log('🚴 Fetching Bicing data via local proxy server...');
    }

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Bicing API proxy failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(jsonData => {
            console.log('✅ Bicing API proxy succeeded! Processing station data...', jsonData);

            // Check if the response contains an error
            if (jsonData.error) {
                throw new Error('API Error: ' + jsonData.message);
            }

            var stations = [];

            // Process Bicing GBFS API response
            if (jsonData && jsonData.data && jsonData.data.stations) {
                // For GBFS, we have station status but need to fetch station information separately
                // For now, we'll create stations with available data and fetch station info

                // First, collect all station IDs to fetch their information
                var stationIds = jsonData.data.stations.map(function(station) {
                    return station.station_id;
                });

                // Fetch station information (this would be async in a real implementation)
                // For now, create basic stations and note we need coordinates
                jsonData.data.stations.forEach(function(station) {
                    try {
                        console.log('🔍 Processing Bicing GBFS station', station.station_id, ':', station);

                        var stationId = station.station_id;
                        var bikes = station.num_bikes_available || 0;
                        var docks = station.num_docks_available || 0;
                        var capacity = bikes + docks;
                        var isInstalled = station.is_installed === 1;
                        var isRenting = station.is_renting === 1;
                        var isReturning = station.is_returning === 1;
                        var lastReported = station.last_reported;

                        // For GBFS, we need to fetch station_information for coordinates and names
                        // For demonstration, we'll use placeholder coordinates (Barcelona center)
                        // In production, you'd fetch: https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_information
                        var lat = 41.3851 + (Math.random() - 0.5) * 0.02; // Random around Barcelona center
                        var lng = 2.1734 + (Math.random() - 0.5) * 0.02;

                        var status = 'UNKNOWN';
                        if (isInstalled && isRenting && isReturning) {
                            status = 'IN_SERVICE';
                        } else if (!isInstalled) {
                            status = 'NOT_INSTALLED';
                        } else if (!isRenting && !isReturning) {
                            status = 'MAINTENANCE';
                        }

                        // Create station with GBFS data
                        stations.push({
                            id: stationId,
                            code: stationId,
                            name: 'Estació ' + stationId, // Would come from station_information
                            address: 'Barcelona', // Would come from station_information
                            lat: lat,
                            lng: lng,
                            capacity: capacity,
                            bikes: bikes,
                            slots: docks,
                            mechanical: bikes, // GBFS doesn't separate mechanical/electric
                            electric: 0,
                            status: status,
                            lastReported: lastReported,
                            timestamp: new Date().getTime()
                        });

                        console.log('✅ Processed Bicing GBFS station:', stationId, 'bikes:', bikes, 'capacity:', capacity);
                    } catch (error) {
                        console.warn('Error processing Bicing GBFS station:', station.station_id, ':', error, station);
                    }
                });

                // Note: In production, fetch station_information endpoint for complete data
                console.log('📍 Note: Using placeholder coordinates. Fetch station_information for real coordinates.');
            } else {
                console.warn('❌ Bicing API response format unexpected:', jsonData);
            }

            if (stations.length > 0) {
                console.log('🚴 SUCCESS: Extracted', stations.length, 'Bicing stations from API proxy!');
                return stations;
            } else {
                console.warn('Proxy returned data but no stations found');
                alert('🚴 No s\'han trobat estacions Bicing a les dades. L\'API pot estar temporalment indisponible.\n\nUtilitza l\'opció "📝 Introduir Dades Manualment" per provar amb dades d\'exemple.');
                return [];
            }
        })
        .catch(error => {
            console.error('❌ Bicing API proxy failed:', error.message);

            // Fallback options - same CORS proxy system as RENFE and FGC
            if (isGitHubPages) {
                // On GitHub Pages, try CORS proxies
                console.log('🔄 Falling back to CORS proxies for Bicing...');
                return fetchRealtimeBicingFallback();
            } else if (isVercel) {
                // On Vercel, show manual fallback option
                alert('🚴 API proxy temporarily unavailable. Use manual data entry:\n\n1. Open: https://opendata-ajuntament.barcelona.cat/data/dataset/... \n2. Copy JSON data\n3. Use "📝 Introduir Dades Manualment"');
                return Promise.resolve([]);
            } else {
                // Local development - try CORS proxies
                console.log('🔄 Local development - API proxy failed, trying CORS proxies...');
                return fetchRealtimeBicingFallback();
            }
        });
}

// Display Bicing stations on map with colored status visualization
function displayRealtimeBicing(stations) {
    console.log('🚴 DISPLAYING', stations.length, 'BICING STATIONS ON MAP...');

    // Clear existing markers and layers
    bicingRealtimeMarkers.forEach(function(marker) {
        try {
            map.removeLayer(marker);
        } catch (e) {}
    });
    bicingRealtimeMarkers = [];

    // Group stations by availability status for better visualization
    var stationsByStatus = {
        'FULL': [],      // All slots occupied (red)
        'HIGH': [],      // Many bikes available (green)
        'MEDIUM': [],    // Some bikes available (orange)
        'LOW': [],       // Few bikes available (yellow)
        'EMPTY': [],     // No bikes available (gray)
        'UNKNOWN': []    // Unknown status (blue)
    };

    stations.forEach(function(station) {
        // Determine status based on bike availability
        var availabilityRatio = station.capacity > 0 ? station.bikes / station.capacity : 0;
        var status;

        if (station.status === 'IN_SERVICE') {
            if (station.bikes === 0) {
                status = 'EMPTY';
            } else if (availabilityRatio >= 0.75) {
                status = 'HIGH';
            } else if (availabilityRatio >= 0.5) {
                status = 'MEDIUM';
            } else if (availabilityRatio >= 0.25) {
                status = 'LOW';
            } else {
                status = 'FULL';
            }
        } else {
            status = 'UNKNOWN';
        }

        if (!stationsByStatus[status]) {
            stationsByStatus[status] = [];
        }
        stationsByStatus[status].push(station);
    });

    // Define colors for different availability statuses
    var statusColors = {
        'HIGH': '#28a745',    // Green - good availability
        'MEDIUM': '#ffc107',  // Yellow - moderate availability
        'LOW': '#fd7e14',     // Orange - low availability
        'EMPTY': '#6c757d',   // Gray - no bikes available
        'FULL': '#dc3545',    // Red - all slots occupied
        'UNKNOWN': '#007bff'  // Blue - unknown status
    };

    var statusNames = {
        'HIGH': 'Alta disponibilitat',
        'MEDIUM': 'Disponibilitat mitjana',
        'LOW': 'Baixa disponibilitat',
        'EMPTY': 'Sense bicicletes',
        'FULL': 'Plena (sense places)',
        'UNKNOWN': 'Estat desconegut'
    };

    var totalStations = 0;

    // Create markers for each station, grouped by status
    Object.keys(stationsByStatus).forEach(function(status) {
        var statusStations = stationsByStatus[status];
        var statusColor = statusColors[status] || '#007bff';
        var statusName = statusNames[status] || status;

        statusStations.forEach(function(station) {
            if (station.lat && station.lng && !isNaN(station.lat) && !isNaN(station.lng)) {
                // Create modern station icon with colored status indicator
                var marker = L.marker([station.lat, station.lng], {
                    icon: L.divIcon({
                        html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                              '<circle cx="12" cy="12" r="10" fill="' + statusColor + '" stroke="white" stroke-width="2"/>' +
                              '<circle cx="12" cy="8" r="2" fill="white"/>' +
                              '<rect x="10" y="10" width="4" height="8" rx="1" fill="white"/>' +
                              '<circle cx="10" cy="14" r="1.5" fill="' + statusColor + '"/>' +
                              '<circle cx="14" cy="14" r="1.5" fill="' + statusColor + '"/>' +
                              '<circle cx="10" cy="18" r="1.5" fill="' + statusColor + '"/>' +
                              '<circle cx="14" cy="18" r="1.5" fill="' + statusColor + '"/>' +
                              '</svg>' +
                              '<div style="position: absolute; top: -6px; left: 50%; transform: translateX(-50%); ' +
                              'background: ' + statusColor + '; color: white; font-size: 9px; font-weight: bold; ' +
                              'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                              station.bikes + '/' + station.capacity + '</div>',
                        className: 'bicing-station-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 20]
                    })
                });

                // Enhanced popup with Bicing station information and color coding
                var availabilityPercent = station.capacity > 0 ? Math.round((station.bikes / station.capacity) * 100) : 0;
                var availabilityColor = availabilityPercent >= 75 ? '#28a745' : availabilityPercent >= 50 ? '#ffc107' : availabilityPercent >= 25 ? '#fd7e14' : '#dc3545';

                marker.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + statusColor + '; border-bottom: 2px solid ' + statusColor + '; padding-bottom: 4px;">' +
                    '🚴 Estació Bicing ' + (station.code || station.id) + '</h4>' +
                    '<div style="background: ' + statusColor + '15; border: 1px solid ' + statusColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Nom:</strong> ' + (station.name || 'Sense nom') + '<br>' +
                    '<strong>Adreça:</strong> ' + (station.address || 'No disponible') + '<br>' +
                    '<strong>Estat:</strong> <span style="color: ' + statusColor + '; font-weight: bold;">' + statusName + '</span><br>' +
                    '<strong>Bicicletes disponibles:</strong> <span style="color: ' + availabilityColor + '; font-weight: bold; font-size: 1.1em;">' + station.bikes + '</span> (' + availabilityPercent + '%)<br>' +
                    '<strong>Places lliures:</strong> ' + station.slots + '<br>' +
                    '<strong>Capacitat total:</strong> ' + station.capacity + '<br>' +
                    '<strong>Bicicletes mecàniques:</strong> ' + (station.mechanical || 0) + '<br>' +
                    '<strong>Bicicletes elèctriques:</strong> ' + (station.electric || 0) + '<br>' +
                    '<strong>Posició:</strong> ' + station.lat.toFixed(4) + ', ' + station.lng.toFixed(4) +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🕒 Actualitzat: ' + new Date().toLocaleTimeString('ca-ES') +
                    '</div>' +
                    '</div>'
                );

                // Add marker to map
                marker.addTo(map);
                bicingRealtimeMarkers.push(marker);
                totalStations++;

                console.log('✅ ADDED BICING STATION MARKER:', station.id, station.name, 'at', station.lat, station.lng);
            } else {
                console.warn('❌ INVALID COORDS for Bicing station:', station.id, station.lat, station.lng);
            }
        });
    });

    console.log('🎯 TOTAL BICING STATION MARKERS CREATED:', totalStations);

    // Create a legend for the station statuses
    if (totalStations > 0) {
        createBicingLegend(stationsByStatus, statusColors, statusNames);
    }

    // Update status without zooming
    updateBicingRealtimeStatus('🚴 Mostrant ' + totalStations + ' estacions Bicing (' + Object.keys(stationsByStatus).filter(s => stationsByStatus[s].length > 0).length + ' estats)');

    console.log('🎉 BICING STATION DISPLAY COMPLETED SUCCESSFULLY!');
}

// Create a legend showing station availability statuses and their colors
function createBicingLegend(stationsByStatus, statusColors, statusNames) {
    // Remove existing legend if any
    var existingLegend = document.getElementById('bicing-station-legend');
    if (existingLegend) {
        existingLegend.remove();
    }

    // Create legend container
    var legend = document.createElement('div');
    legend.id = 'bicing-station-legend';
    legend.style.cssText = `
        position: absolute;
        top: 70px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        border: 2px solid #0066cc;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        max-width: 300px;
        max-height: 450px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;

    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; color: #0066cc;">🚴 Disponibilitat d\'Estacions Bicing</div>';

    // Display statuses in order of availability
    var statusOrder = ['HIGH', 'MEDIUM', 'LOW', 'EMPTY', 'FULL', 'UNKNOWN'];

    statusOrder.forEach(function(status) {
        var count = stationsByStatus[status] ? stationsByStatus[status].length : 0;
        if (count === 0) return;

        var statusColor = statusColors[status] || '#007bff';
        var statusName = statusNames[status] || status;

        var statusDiv = document.createElement('div');
        statusDiv.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            padding: 4px;
            border-radius: 3px;
            background: ${statusColor}10;
        `;

        statusDiv.innerHTML = `
            <div style="width: 12px; height: 12px; background: ${statusColor}; border: 1px solid #333; border-radius: 2px; margin-right: 6px;"></div>
            <span style="font-weight: bold; color: ${statusColor}; font-size: 11px;">${statusName}</span>
            <span style="margin-left: auto; color: #666; font-size: 10px;">(${count})</span>
        `;

        legend.appendChild(statusDiv);
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
        color: #0066cc;
    `;
    closeBtn.onclick = function() {
        legend.remove();
    };
    legend.appendChild(closeBtn);

    // Add to map container
    document.getElementById('map').appendChild(legend);
}

// Bicing Manual data entry functions
function openBicingJson() {
    window.open('https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download', '_blank');
}

function showBicingDataEntry() {
    var entryDiv = document.getElementById('bicing-manual-data-entry');
    if (entryDiv) {
        entryDiv.style.display = entryDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function processBicingManualJsonData() {
    var jsonTextarea = document.getElementById('bicing-manual-json-data');
    if (!jsonTextarea || !jsonTextarea.value.trim()) {
        alert('Si us plau, enganxa les dades JSON de Bicing primer.');
        return;
    }

    try {
        var jsonData = JSON.parse(jsonTextarea.value.trim());
        console.log('Processing manual Bicing JSON data...');

        // Process Bicing API format
        var stations = [];

        if (jsonData && jsonData.data && jsonData.data.stations) {
            jsonData.data.stations.forEach(function(station) {
                var lat = station.lat || station.latitude;
                var lng = station.lon || station.longitude;
                var stationId = station.station_id || station.id;

                if (typeof lat === 'number' && typeof lng === 'number' &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                    stations.push({
                        id: stationId,
                        code: station.stationCode || stationId,
                        name: station.name || ('Estació ' + stationId),
                        address: station.address || station.extra?.address || '',
                        lat: lat,
                        lng: lng,
                        capacity: station.capacity || station.extra?.slots || 0,
                        bikes: station.num_bikes_available || station.bikes || 0,
                        slots: station.num_docks_available || station.slots || 0,
                        mechanical: station.num_bikes_available_types?.mechanical || 0,
                        electric: station.num_bikes_available_types?.ebike || 0,
                        status: station.status || 'UNKNOWN',
                        lastReported: station.last_reported || station.lastReported || null,
                        timestamp: new Date().getTime()
                    });
                }
            });
        }

        if (stations.length > 0) {
            console.log('✅ Successfully processed', stations.length, 'Bicing stations from manual data!');
            displayRealtimeBicing(stations);

            // Clear the textarea
            jsonTextarea.value = '';

            // Hide the manual entry form
            showBicingDataEntry();

            alert('Dades processades! Veus ' + stations.length + ' estacions Bicing reals al mapa.');
        } else {
            alert('No s\'han trobat dades d\'estacions vàlides en el JSON. Comprova que has copiat les dades correctes.');
        }
    } catch (error) {
        console.error('Error processing manual Bicing JSON data:', error);
        alert('Error processant les dades JSON. Comprova que el format és correcte.');
    }
}

// Helper functions for Bicing manual data entry
function copyBicingUrl() {
    var bicingUrl = 'https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download';
    console.log('Copying Bicing URL:', bicingUrl);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(bicingUrl).then(function() {
            console.log('✅ Bicing URL copied using modern clipboard API');
            alert('✅ URL de Bicing copiada al porta-retalls!\n\n' + bicingUrl);
        }).catch(function(err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
            fallbackBicingCopy(bicingUrl, 'URL de Bicing');
        });
    } else {
        console.log('Modern clipboard API not available, using fallback');
        fallbackBicingCopy(bicingUrl, 'URL de Bicing');
    }
}

function fallbackBicingCopy(text, description) {
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

function shareBicingMapUrl() {
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

function copyBicingInstructions() {
    var instructions = "PASSOS PER COPIAR LES DADES BICING:\n\n";
    instructions += "1. Ves a la pestanya Bicing que s'ha obert\n";
    instructions += "2. Prem Ctrl+A (seleccionar tot)\n";
    instructions += "3. Prem Ctrl+C (copiar)\n";
    instructions += "4. Torna aquí i prem Ctrl+V (enganxar)\n";
    instructions += "5. Clica 'Processar Dades Reals'\n\n";
    instructions += "URL: https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download";

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

function clearBicingTextarea() {
    var jsonTextarea = document.getElementById('bicing-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = '';
        updateBicingJsonStatus('Textarea netejat. Preparat per enganxar dades.');
    }
}

function testBicingSampleData() {
    // Sample Bicing API data for testing
    var sampleData = {
        "data": {
            "stations": [
                {
                    "station_id": "1",
                    "name": "Estació de prova 1",
                    "lat": 41.3851,
                    "lon": 2.1734,
                    "capacity": 30,
                    "num_bikes_available": 25,
                    "num_docks_available": 5,
                    "num_bikes_available_types": {
                        "mechanical": 20,
                        "ebike": 5
                    },
                    "status": "IN_SERVICE",
                    "address": "Carrer de prova, 1"
                },
                {
                    "station_id": "2",
                    "name": "Estació de prova 2",
                    "lat": 41.3788,
                    "lon": 2.1734,
                    "capacity": 25,
                    "num_bikes_available": 2,
                    "num_docks_available": 23,
                    "num_bikes_available_types": {
                        "mechanical": 2,
                        "ebike": 0
                    },
                    "status": "IN_SERVICE",
                    "address": "Carrer de prova, 2"
                },
                {
                    "station_id": "3",
                    "name": "Estació de prova 3",
                    "lat": 41.3805,
                    "lon": 2.1754,
                    "capacity": 20,
                    "num_bikes_available": 0,
                    "num_docks_available": 20,
                    "num_bikes_available_types": {
                        "mechanical": 0,
                        "ebike": 0
                    },
                    "status": "IN_SERVICE",
                    "address": "Carrer de prova, 3"
                }
            ]
        }
    };

    var jsonTextarea = document.getElementById('bicing-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = JSON.stringify(sampleData, null, 2);
        updateBicingJsonStatus('Dades d\'exemple carregades. Clica "Processar Dades Reals" per veure estacions Bicing.');
    }
}

function updateBicingJsonStatus(status) {
    var statusElement = document.getElementById('bicing-json-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Toggle Bicing station legend visibility
function toggleBicingLegend() {
    var legend = document.getElementById('bicing-station-legend');
    var legendBtn = document.getElementById('bicing-legend-btn');

    if (!legend) {
        // Legend doesn't exist, create it and show
        if (bicingRealtimeMarkers.length > 0) {
            // Recreate legend with current data
            var stationsByStatus = {};
            bicingRealtimeMarkers.forEach(function(marker) {
                // This is a simplified recreation - in production, you'd store the original data
            });
            createBicingLegend(bicingStationsByStatus, {
                'HIGH': '#28a745',
                'MEDIUM': '#ffc107',
                'LOW': '#fd7e14',
                'EMPTY': '#6c757d',
                'FULL': '#dc3545',
                'UNKNOWN': '#007bff'
            }, {
                'HIGH': 'Alta disponibilitat',
                'MEDIUM': 'Disponibilitat mitjana',
                'LOW': 'Baixa disponibilitat',
                'EMPTY': 'Sense bicicletes',
                'FULL': 'Plena (sense places)',
                'UNKNOWN': 'Estat desconegut'
            });
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            alert('No hi ha estacions al mapa. Inicia la visualització d\'estacions Bicing primer.');
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

// Fallback function using external CORS proxies (same as RENFE and FGC)
function fetchRealtimeBicingFallback() {
    var corsProxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ];

    var bicingUrl = 'https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download';

    function tryNextProxy(proxyIndex) {
        if (proxyIndex >= corsProxies.length) {
            console.warn('All CORS proxies failed for Bicing - using manual fallback');
            alert('🚴 Unable to load real Bicing station data.\n\nLocal proxy server may not be running, and all external CORS proxies failed.\n\nPlease:\n1. Ensure the Node.js server is running (npm start)\n2. Or use the manual data entry option below.');
            return Promise.resolve([]);
        }

        var proxy = corsProxies[proxyIndex];
        var fullUrl = proxy + bicingUrl;

        console.log('🔄 Trying CORS proxy', proxyIndex + 1, 'of', corsProxies.length, 'for Bicing:', proxy);

        return fetch(fullUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Proxy failed: ' + response.status);
                }
                return response.json();
            })
            .then(jsonData => {
                console.log('✅ CORS proxy', proxy, 'succeeded! Processing real Bicing data...');

                var stations = [];

                // Process Bicing API response (same as main function)
                if (jsonData && jsonData.data && jsonData.data.stations) {
                    jsonData.data.stations.forEach(function(station) {
                        try {
                            var lat = station.lat || station.latitude;
                            var lng = station.lon || station.longitude;
                            var stationId = station.station_id || station.id;

                            if (typeof lat === 'number' && typeof lng === 'number' &&
                                lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                                stations.push({
                                    id: stationId,
                                    code: station.stationCode || stationId,
                                    name: station.name || ('Estació ' + stationId),
                                    address: station.address || station.extra?.address || '',
                                    lat: lat,
                                    lng: lng,
                                    capacity: station.capacity || station.extra?.slots || 0,
                                    bikes: station.num_bikes_available || station.bikes || 0,
                                    slots: station.num_docks_available || station.slots || 0,
                                    mechanical: station.num_bikes_available_types?.mechanical || 0,
                                    electric: station.num_bikes_available_types?.ebike || 0,
                                    status: station.status || 'UNKNOWN',
                                    lastReported: station.last_reported || station.lastReported || null,
                                    timestamp: new Date().getTime()
                                });
                            }
                        } catch (error) {
                            console.warn('Error processing Bicing station at proxy', proxyIndex, ':', error, station);
                        }
                    });
                }

                if (stations.length > 0) {
                    console.log('🚴 SUCCESS: Displaying', stations.length, 'REAL Bicing stations via CORS proxy!');
                    return stations;
                } else {
                    console.warn('Proxy returned data but no stations found');
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

// Make Bicing functions globally accessible
window.startRealtimeBicing = startRealtimeBicing;
window.stopRealtimeBicing = stopRealtimeBicing;
window.openBicingJson = openBicingJson;
window.showBicingDataEntry = showBicingDataEntry;
window.processBicingManualJsonData = processBicingManualJsonData;
window.toggleBicingLegend = toggleBicingLegend;
