// Bicycle Infrastructure and Bicing Stations Visualization
// Based on old.functions.js patterns for POI handling and Overpass queries

var bicycleInfrastructureMarkers = [];
var bicingStationsMarkers = [];
var bicycleInfrastructureInterval = null;
var bicingStationsInterval = null;
var bicycleSpinner = 0;

// Global bicycle query variables
var bicycleQuery = ''; // Global query for bicycle infrastructure
var bicyclePoiQueryRunning = false;
var bicycleCurrentOverPassLayer = null;

// POI definitions for bicycle infrastructure
var bicyclePois = {
    'bicycle_parking': {
        name: 'Aparcament de bicicletes',
        iconName: 'parking',
        query: '["amenity"="bicycle_parking"]'
    },
    'bicycle_rental': {
        name: 'Lloguer de bicicletes',
        iconName: 'bicycle',
        query: '["amenity"="bicycle_rental"]'
    },
    'bicycle_shop': {
        name: 'Botiga de bicicletes',
        iconName: 'shopping-cart',
        query: '["shop"="bicycle"]'
    },
    'cycleway': {
        name: 'Carril bici',
        iconName: 'road',
        query: '["highway"="cycleway"]'
    },
    'cycleway_lane': {
        name: 'Carril bici lateral',
        iconName: 'road',
        query: '["cycleway"="lane"]'
    },
    'cycleway_track': {
        name: 'Via ciclista',
        iconName: 'road',
        query: '["cycleway"="track"]'
    }
};

// Get bicycle POI information
function getBicyclePoi(element) {
    var type = '';

    // Determine POI type from tags
    if (element.tags.amenity) {
        if (element.tags.amenity === 'bicycle_parking') type = 'bicycle_parking';
        if (element.tags.amenity === 'bicycle_rental') type = 'bicycle_rental';
    }
    if (element.tags.shop === 'bicycle') type = 'bicycle_shop';
    if (element.tags.highway === 'cycleway') type = 'cycleway';
    if (element.tags.cycleway === 'lane') type = 'cycleway_lane';
    if (element.tags.cycleway === 'track') type = 'cycleway_track';

    var poi = bicyclePois[type];
    return poi;
}

// Overpass callback for bicycle infrastructure
function bicycleCallback(data) {
    if (bicycleSpinner > 0) bicycleSpinner -= 1;
    if (bicycleSpinner == 0) $('#spinner').hide();

    for(var i = 0; i < data.elements.length; i++) {
        var e = data.elements[i];

        if (e.id in this.instance._ids) return;
        this.instance._ids[e.id] = true;

        var pos = (e.type == 'node') ?
            new L.LatLng(e.lat, e.lon) :
            new L.LatLng(e.center.lat, e.center.lon);

        var poi = getBicyclePoi(e);
        if (!poi) {
            console.info('Skipping undefined bicycle POI for element with id ' + e.id);
            continue;
        }

        var markerIcon = L.icon({
            iconUrl: 'assets/img/icons/' + poi.iconName + '.png',
            iconSize: [32, 37],
            iconAnchor: [18.5, 35],
            popupAnchor: [0, -27]
        });

        var marker = L.marker(pos, {
            icon: markerIcon,
            keyboard: false
        });

        // Show label on hover
        if (e.tags.name) {
            marker.bindLabel(e.tags.name, {direction: 'auto', offset: [27, -32]});
        }

        // Expert mode functionality
        marker._element = e;
        marker.on('click', function(e) {
            var element = e.target._element;
            $('#developer > .tags').html(bicycleDevelopParser(element));
        });

        // Create popup content
        var markerPopup = bicyclePoiParser(e, poi.name);
        marker.bindPopup(markerPopup);

        marker.addTo(this.instance);
    }
}

// Build Overpass query for bicycle infrastructure
function buildBicycleQuery() {
    bicycleQuery = '(';

    // Include all bicycle POI types
    for (var poiType in bicyclePois) {
        bicycleQuery += 'node(BBOX)' + bicyclePois[poiType].query + ';';
        bicycleQuery += 'way(BBOX)' + bicyclePois[poiType].query + ';';
        bicycleQuery += 'relation(BBOX)' + bicyclePois[poiType].query + ';';
    }

    bicycleQuery += ');out center;';
}

// Show bicycle Overpass layer
function showBicycleLayer() {
    $('#develop p.tags').html('');

    if (bicycleQuery == '' || bicycleQuery == '();out center;') {
        console.debug('No bicycle infrastructure selected to filter by.');
        return;
    }

    try {
        var opl = new L.OverPassLayer({
            query: bicycleQuery,
            callback: bicycleCallback,
            minzoom: 14
        });

        if (typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.addLayer === 'function') {
            iconLayer.addLayer(opl);
        } else {
            console.warn('iconLayer is not available; cannot add bicycle OverPassLayer');
        }
    } catch (err) {
        console.error('Failed to create or add bicycle OverPassLayer:', err);
    }
}

// Manual bicycle query function
function manualBicycleQuery() {
    if (bicyclePoiQueryRunning) {
        stopBicycleQuery();
        return;
    }

    bicyclePoiQueryRunning = true;
    updateBicycleQueryButton();

    $('#spinner').show();
    bicycleSpinner = 0;

    // Set timeout to force stop if needed
    if (window.bicycleQueryTimeout) {
        clearTimeout(window.bicycleQueryTimeout);
    }
    window.bicycleQueryTimeout = setTimeout(function() {
        if (bicyclePoiQueryRunning) {
            console.warn('Bicycle query timeout - forcing stop');
            $('#spinner').hide();
            bicyclePoiQueryRunning = false;
            updateBicycleQueryButton();
            if (bicycleCurrentOverPassLayer && typeof bicycleCurrentOverPassLayer.abortActiveRequests === 'function') {
                bicycleCurrentOverPassLayer.abortActiveRequests();
            }
        }
    }, 30000); // 30 second timeout

    // Clear existing markers and make new query
    bicycleInfrastructureMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    bicycleInfrastructureMarkers = [];

    buildBicycleQuery();
    showBicycleLayer();

    updateBicycleInfrastructureStatus('🚲 Carregant infraestructura ciclista...');
}

// Stop bicycle query
function stopBicycleQuery() {
    bicyclePoiQueryRunning = false;
    $('#spinner').hide();
    updateBicycleQueryButton();

    // Clear timeout
    if (window.bicycleQueryTimeout) {
        clearTimeout(window.bicycleQueryTimeout);
        window.bicycleQueryTimeout = null;
    }

    // Abort any ongoing requests
    if (bicycleCurrentOverPassLayer && typeof bicycleCurrentOverPassLayer.abortActiveRequests === 'function') {
        bicycleCurrentOverPassLayer.abortActiveRequests();
    }

    updateBicycleInfrastructureStatus('🚲 Consulta aturada');
}

// Update bicycle query button
function updateBicycleQueryButton() {
    // Update UI based on query state
    if (bicyclePoiQueryRunning) {
        updateBicycleInfrastructureStatus('🚲 Carregant infraestructura...');
    } else {
        updateBicycleInfrastructureStatus('🚲 Preparat');
    }
}

// Expert mode parser for bicycle elements
function bicycleDevelopParser(element) {
    var html = '<h3>Detalls de l\'element</h3>';
    html += '<table class="table table-striped">';

    for (var key in element.tags) {
        html += '<tr>';
        html += '<td><strong>' + key + '</strong></td>';
        html += '<td>' + element.tags[key] + '</td>';
        html += '</tr>';
    }

    html += '</table>';
    html += '<p><a href="https://www.openstreetmap.org/' + element.type + '/' + element.id + '" target="_blank">Veure a OpenStreetMap</a></p>';

    return html;
}

// POI parser for bicycle elements
function bicyclePoiParser(element, poiName) {
    var html = '<div class="poi-popup">';
    html += '<h4>🚲 ' + poiName + '</h4>';

    if (element.tags.name) {
        html += '<p><strong>Nom:</strong> ' + element.tags.name + '</p>';
    }

    // Add specific bicycle information
    if (element.tags.amenity === 'bicycle_parking') {
        html += '<p><strong>Tipus aparcament:</strong> ' + (element.tags.bicycle_parking || 'Sense especificar') + '</p>';
        if (element.tags.capacity) {
            html += '<p><strong>Capacitat:</strong> ' + element.tags.capacity + ' places</p>';
        }
    }

    if (element.tags.amenity === 'bicycle_rental') {
        html += '<p><strong>Servei de lloguer:</strong> Disponible</p>';
        if (element.tags.operator) {
            html += '<p><strong>Operador:</strong> ' + element.tags.operator + '</p>';
        }
    }

    if (element.tags.shop === 'bicycle') {
        html += '<p><strong>Botiga especialitzada:</strong> Bicicletes</p>';
        if (element.tags.opening_hours) {
            html += '<p><strong>Horaris:</strong> ' + element.tags.opening_hours + '</p>';
        }
    }

    // Add coordinates
    var lat = element.lat || (element.center && element.center.lat);
    var lon = element.lon || (element.center && element.center.lon);
    if (lat && lon) {
        html += '<p><strong>Coordenades:</strong> ' + lat.toFixed(6) + ', ' + lon.toFixed(6) + '</p>';
    }

    html += '<p><a href="https://www.openstreetmap.org/' + element.type + '/' + element.id + '" target="_blank">Veure a OpenStreetMap</a></p>';
    html += '</div>';

    return html;
}

// Start bicycle infrastructure visualization (manual query version)
function startBicycleInfrastructure() {
    if (bicycleInfrastructureInterval) {
        stopBicycleInfrastructure();
        return;
    }

    // Initial manual query
    manualBicycleQuery();

    // Update UI
    document.getElementById('start-bicycle-infrastructure-btn').style.display = 'none';
    document.getElementById('stop-bicycle-infrastructure-btn').style.display = 'inline-block';
}

// Stop bicycle infrastructure visualization
function stopBicycleInfrastructure() {
    if (bicycleInfrastructureInterval) {
        clearInterval(bicycleInfrastructureInterval);
        bicycleInfrastructureInterval = null;
    }

    // Stop any running query
    stopBicycleQuery();

    // Clear all infrastructure markers
    bicycleInfrastructureMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    bicycleInfrastructureMarkers = [];

    // Update UI
    document.getElementById('start-bicycle-infrastructure-btn').style.display = 'inline-block';
    document.getElementById('stop-bicycle-infrastructure-btn').style.display = 'none';
    updateBicycleInfrastructureStatus('🚲 Inactiu');
}

// Start Bicing stations visualization
function startBicingStations() {
    if (bicingStationsInterval) {
        stopBicingStations();
        return;
    }

    // Initial load
    fetchBicingStations().then(function(stations) {
        displayBicingStations(stations);
    });

    // Update every 5 minutes for real-time data
    bicingStationsInterval = setInterval(function() {
        fetchBicingStations().then(function(stations) {
            displayBicingStations(stations);
        });
    }, 300000); // 5 minutes

    // Update UI
    document.getElementById('start-bicing-stations-btn').style.display = 'none';
    document.getElementById('stop-bicing-stations-btn').style.display = 'inline-block';
    updateBicingStationsStatus('🚲 Carregant estacions Bicing...');
}

// Stop Bicing stations visualization
function stopBicingStations() {
    if (bicingStationsInterval) {
        clearInterval(bicingStationsInterval);
        bicingStationsInterval = null;
    }

    // Clear all station markers
    bicingStationsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    bicingStationsMarkers = [];

    // Update UI
    document.getElementById('start-bicing-stations-btn').style.display = 'inline-block';
    document.getElementById('stop-bicing-stations-btn').style.display = 'none';
    updateBicingStationsStatus('🚲 Inactiu');
}

// Update bicycle infrastructure status display
function updateBicycleInfrastructureStatus(status) {
    var statusElement = document.getElementById('bicycle-infrastructure-status');
    if (statusElement) {
        statusElement.innerHTML = '<span>Status:</span> <span>' + status + '</span>';
    }
}

// Update Bicing stations status display
function updateBicingStationsStatus(status) {
    var statusElement = document.getElementById('bicing-stations-status');
    if (statusElement) {
        statusElement.innerHTML = '<span>Status:</span> <span>' + status + '</span>';
    }
}

// Fetch Bicing stations data
function fetchBicingStations() {
    console.log('🚲 Starting to fetch Bicing stations...');

    // Bicing API endpoint
    var apiUrl = 'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search?resource_id=b1b2d08f-13e4-4c4e-9e44-efbcfd8d9494';

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('Bicing API failed:', response.status, response.statusText);
                return {result: {records: []}};
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ Bicing API response:', data);

            var stations = [];

            // Process Bicing API response
            if (data.result && data.result.records) {
                data.result.records.forEach(function(record) {
                    if (record.lat && record.lon) {
                        stations.push({
                            id: record.id,
                            name: record.streetName || record.name || 'Estació Bicing',
                            lat: parseFloat(record.lat),
                            lng: parseFloat(record.lon),
                            streetName: record.streetName,
                            streetNumber: record.streetNumber,
                            district: record.district,
                            neighborhood: record.neighborhood,
                            slots: parseInt(record.slots) || 0,
                            bikes: parseInt(record.bikes) || 0,
                            type: record.type || 'BIKE',
                            status: record.status || 'OPERATIVE'
                        });
                    }
                });
            }

            console.log('🚲 Processed', stations.length, 'Bicing stations');
            return stations;
        })
        .catch(error => {
            console.error('❌ Error fetching Bicing stations:', error);
            return [];
        });
}

// Display Bicing stations on map
function displayBicingStations(stations) {
    console.log('🚲 DISPLAYING', stations.length, 'BICING STATIONS ON MAP...');

    // Clear existing markers
    bicingStationsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    bicingStationsMarkers = [];

    var totalStations = 0;
    var dataFetchedAt = new Date();

    stations.forEach(function(station) {
        if (station.lat && station.lng && !isNaN(station.lat) && !isNaN(station.lng)) {
            // Calculate availability percentage
            var totalSlots = station.slots || 0;
            var availableBikes = station.bikes || 0;
            var availabilityPercent = totalSlots > 0 ? (availableBikes / totalSlots) * 100 : 0;

            // Color based on availability
            var color = '#4CAF50'; // Green - good availability
            if (availabilityPercent < 25) {
                color = '#FF5722'; // Red - low availability
            } else if (availabilityPercent < 50) {
                color = '#FF9800'; // Orange - medium availability
            }

            // Create station marker
            var markerHtml = '<div style="background: white; border: 3px solid ' + color + '; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; position: relative;">' +
                '<i class="fa fa-bicycle" style="color: ' + color + '; font-size: 14px;"></i>' +
                '<div style="position: absolute; bottom: -2px; right: -2px; background: ' + color + '; color: white; font-size: 8px; font-weight: bold; padding: 1px 3px; border-radius: 8px; min-width: 12px; text-align: center;">' +
                availableBikes + '</div>' +
                '</div>';

            var stationMarker = L.marker([station.lat, station.lng], {
                icon: L.divIcon({
                    html: markerHtml,
                    className: 'bicing-station-marker',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            });

            // Create popup content
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: ' + color + '; border-bottom: 2px solid ' + color + '; padding-bottom: 4px;">' +
                '🚲 ' + station.name + '</h4>' +
                '<div style="background: ' + color + '20; border: 1px solid ' + color + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                '<strong>Adreça:</strong> ' + (station.streetName || 'Sense adreça') + ' ' + (station.streetNumber || '') + '<br>' +
                '<strong>Districte:</strong> ' + (station.district || 'Sense districte') + '<br>' +
                '<strong>Barri:</strong> ' + (station.neighborhood || 'Sense barri') + '<br>' +
                '<strong>Bicicletes disponibles:</strong> ' + availableBikes + '<br>' +
                '<strong>Ancoratges totals:</strong> ' + totalSlots + '<br>' +
                '<strong>Ancoratges lliures:</strong> ' + (totalSlots - availableBikes) + '<br>' +
                '<strong>Posició:</strong> ' + station.lat.toFixed(4) + ', ' + station.lng.toFixed(4) +
                '</div>';

            // Availability indicator
            var availabilityText = '';
            if (availabilityPercent >= 75) {
                availabilityText = '<span style="color: #4CAF50; font-weight: bold;">● Alta disponibilitat</span>';
            } else if (availabilityPercent >= 50) {
                availabilityText = '<span style="color: #FF9800; font-weight: bold;">● Disponibilitat mitjana</span>';
            } else if (availabilityPercent >= 25) {
                availabilityText = '<span style="color: #FF5722; font-weight: bold;">● Baixa disponibilitat</span>';
            } else {
                availabilityText = '<span style="color: #F44336; font-weight: bold;">● Sense bicicletes</span>';
            }

            popupContent += '<div style="text-align: center; margin: 8px 0; font-size: 14px;">' +
                availabilityText +
                '</div>';

            // Add data fetch timestamp
            popupContent += '<div style="font-size: 10px; color: #888; margin-top: 8px; text-align: center; border-top: 1px solid #eee; padding-top: 6px;">' +
                '<em>Dades actualitzades a les ' + dataFetchedAt.toLocaleTimeString() + '</em>' +
                '</div>' +
                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                '🚲 Servei Bicing - Ajuntament de Barcelona' +
                '</div>' +
                '</div>';

            stationMarker.bindPopup(popupContent);

            // Add station marker to map
            stationMarker.addTo(map);
            bicingStationsMarkers.push(stationMarker);
            totalStations++;

            console.log('✅ ADDED BICING STATION MARKER:', station.name, 'bikes:', availableBikes, 'slots:', totalSlots);
        }
    });

    console.log('🎯 TOTAL BICING STATION MARKERS CREATED:', totalStations);

    // Update status
    updateBicingStationsStatus('🚲 Mostrant ' + totalStations + ' estacions Bicing amb temps real');

    console.log('🎉 BICING STATIONS WITH REAL-TIME DATA DISPLAY COMPLETED SUCCESSFULLY!');
}

// Make functions globally accessible
window.startBicycleInfrastructure = startBicycleInfrastructure;
window.stopBicycleInfrastructure = stopBicycleInfrastructure;
window.startBicingStations = startBicingStations;
window.stopBicingStations = stopBicingStations;
window.manualBicycleQuery = manualBicycleQuery;
window.stopBicycleQuery = stopBicycleQuery;
window.updateBicycleQueryButton = updateBicycleQueryButton;
