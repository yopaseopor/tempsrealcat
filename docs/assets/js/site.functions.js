var query = ''; // Global query variable for Overpass queries

function get_poi(element) {
    if ($('#expert-mode').is(':checked'))
        return {
            name: 'Custom Query',
            iconName: 'notvisited'
        }

    // TODO: improve this
    var type = ''
    if (element.tags.internet_access) type = 'internet_access';
    if (element.tags.highway) {
        if (type == '') type = element.tags.highway;
    }
    if (element.tags.amenity) {
        if (type == '') type = element.tags.amenity;
    }
    if (element.tags.tourism) {
        if (type == '') type = element.tags.tourism;
    }
    if (element.tags.shop) {
        if (element.tags.car_repair == 'wheel_repair') type = 'wheel_repair';
        if (type == '') type = element.tags.shop;
    }
    if (element.tags.sport) {
        if (element.tags.shooting == 'paintball') type = 'paintball';
        if (type == '') type = element.tags.shooting;
    }
    if (element.tags.leisure) {
        if (type == '') type = element.tags.leisure;
    }
    if (element.tags.office) {
        if (type == '') type = element.tags.office;
    }
    if (element.tags.craft) {
        if (type == '') type = element.tags.craft;
    }
    if (element.tags.historic) {
        if (type == '') type = element.tags.historic;
    }

    var poi = pois[type];
    return poi;
}


// https://github.com/kartenkarsten/leaflet-layer-overpass
function callback(data) {
    if (spinner > 0) spinner -= 1;
    if (spinner == 0) $('#spinner').hide();

    for(i=0; i < data.elements.length; i++) {
        var e = data.elements[i];

        if (e.id in this.instance._ids) return;
        this.instance._ids[e.id] = true;

        var pos = (e.type == 'node') ?
            new L.LatLng(e.lat, e.lon) :
            new L.LatLng(e.center.lat, e.center.lon);

        var poi = get_poi(e)
        // skip this undefined icon
        if (!poi) {
            console.info('Skipping undefined icon for element with id ' + e.id);
            continue;
        }

        var markerIcon  = L.icon({
            iconUrl: 'assets/img/icons/' + poi.iconName + '.png',
            iconSize: [32, 37],
            iconAnchor: [18.5, 35],
            popupAnchor: [0, -27]
        });
        var marker = L.marker(pos, {
            icon: markerIcon,
            keyboard: false
        })

        // show a label next to the icon on mouse hover
        if (e.tags.name) {
            marker.bindLabel(
                e.tags.name,
                {direction: 'auto', offset: [27, -32]}
            );
        }

        // used to show the expert mode panel side
        marker._element = e;
        marker.on('click', function(e) {
            var element = e.target._element;
            $('#developer > .tags').html(develop_parser(element));
        });

        if (poi.tagParser) var markerPopup = poi.tagParser(e);
        else var markerPopup = generic_poi_parser(e, poi.name);

        marker.bindPopup(markerPopup);
        marker.addTo(this.instance);
    }
}

function build_overpass_query() {
    query = '(';
    $('#pois input:checked').each(function(i, element) {
        query += 'node(BBOX)' + pois[element.dataset.key].query + ';';
        query += 'way(BBOX)' + pois[element.dataset.key].query + ';';
        query += 'relation(BBOX)' + pois[element.dataset.key].query + ';';
    });
    query += ');out center;';
}

function setting_changed() {
    // remove pois from current map
    if (typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.clearLayers === 'function') {
        iconLayer.clearLayers();
    }
    // uncheck the expert mode
    $('#expert-mode').attr('checked', false);
    $('#expert-form').hide();
    build_overpass_query();
    show_overpass_layer();
}

function show_pois_checkboxes() {
    // build the content for the "Home" sidebar pane
    var i = 0;
    var content = '';
    content += '<table>';
    for (poi in pois) {
        if (i % 2 == 0) content += '<tr>';
        content += '<td>';
        var checkbox = Mustache.render(
            '<div class="poi-checkbox"> \
                <label> \
                    <img src="assets/img/icons/{{icon}}.png"></img> \
                    <input type="checkbox" data-key="{{key}}" onclick="setting_changed()"><span>{{name}}</span> \
                </label> \
            </div>',
            {key: poi, name: pois[poi].name, icon: pois[poi].iconName}
        );
        content += checkbox;
        content += '</td>';
        i++;
        if (i % 2 == 0) content += '</tr>';
    }
    content += '</table>';
    $('#pois').append(content);
}

function show_overpass_layer() {
    // remove tags from expert mode
    $('#develop p.tags').html('');

    if (query == '' || query == '();out center;') {
        console.debug('There is nothing selected to filter by.');
        return;
    }

    try {
        var opl = new L.OverPassLayer({
            query: query,
            callback: callback,
            minzoom: 14
        });

        if (typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.addLayer === 'function') {
            iconLayer.addLayer(opl);
        } else {
            console.warn('iconLayer is not available; cannot add OverPassLayer');
        }
    } catch (err) {
        console.error('Failed to create or add OverPassLayer:', err);
    }
}

function get_permalink() {
    var uri = URI(window.location.href);
    var selectedPois = [];
    $('#pois input:checked').each(function(i, element) {
        selectedPois.push(element.dataset.key);
    });

    uri.query({'pois': selectedPois, 'norestoreview': true});
    return uri.href();
}

function update_permalink() {
    var link = get_permalink();
    $('#permalink').attr('href', link);
}

function expert_call() {
    // Prefer the explicit expert input, fallback to legacy selector
    var value = (typeof $ !== 'undefined' && $('#expert-query').length) ? $('#expert-query').val() : $('input[name=query]').attr('value');
    value = value || '';

    try {
        query = '(';
        query += 'node(BBOX){{value}};';
        query += 'way(BBOX){{value}};';
        query += 'relation(BBOX){{value}};';
        query += ');out center;';
        query = Mustache.render(query, {value: value});
        console.debug(query);
        // uncheck all the POIs to avoid confusion
        // $('#pois input').attr('checked', false);
        if (typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.clearLayers === 'function') {
            iconLayer.clearLayers();
        }
        show_overpass_layer();
    } catch (err) {
        console.error('Error executing expert query:', err);
    }
}

function expert_mode_init() {
    $('#expert-form').submit(function (e) {
        e.preventDefault();
        expert_call();
    });

    $('#expert-mode').attr('checked', false);
    $('#expert-mode').click(function (e) {
        $('#expert-form').toggle();
    });

}

function manualPoiQuery() {
    // Only start queries - stopping is handled by separate stopQuery() function

    // Only make queries if POIs are actually selected
    var checkedPois = $('#pois input:checked');
    if (checkedPois.length === 0) {
        alert(getTranslation('poi_select_at_least_one') || 'Selecciona almenys un punt d\'interès abans de fer la consulta.');
        return;
    }

    // If too many POIs selected, automatically deselect some to avoid query failures
    if (checkedPois.length > 5) {
        // Keep only the first 5 selected POIs
        $('#pois input:checked').slice(5).prop('checked', false);
        alert(getTranslation('poi_too_many_selected') || 'S\'han seleccionat massa punts d\'interès. S\'han desmarcat alguns automàticament per evitar errors de consulta.');
        checkedPois = $('#pois input:checked');
    }

    // Cancel any existing query first
    if (isQueryRunning && currentOverPassLayer && typeof currentOverPassLayer.abortActiveRequests === 'function') {
        currentOverPassLayer.abortActiveRequests();
    }

    // Reset spinner counter and set timeout to force stop if needed
    spinner = 0;
    $('#spinner').show();

    // Set a timeout to force stop the spinner after 30 seconds (in case of hanging queries)
    if (window.queryTimeout) {
        clearTimeout(window.queryTimeout);
    }
    window.queryTimeout = setTimeout(function() {
        if (isQueryRunning) {
            console.warn('Query timeout - forcing stop');
            $('#spinner').hide();
            isQueryRunning = false;
            updateQueryButton();
            if (currentOverPassLayer && typeof currentOverPassLayer.abortActiveRequests === 'function') {
                currentOverPassLayer.abortActiveRequests();
            }
        }
    }, 30000); // 30 second timeout

    // Set query running flag
    isQueryRunning = true;
    updateQueryButton();

    // Clear existing POIs and make new query
    iconLayer.clearLayers();
    build_overpass_query();
    show_overpass_layer();
}

function stopQuery() {
    // Stop the current query and abort active requests
    isQueryRunning = false;
    $('#spinner').hide();
    updateQueryButton();

    // Clear the timeout if it's still active
    if (window.queryTimeout) {
        clearTimeout(window.queryTimeout);
        window.queryTimeout = null;
    }

    // Abort any ongoing requests in the current OverPassLayer
    if (currentOverPassLayer && typeof currentOverPassLayer.abortActiveRequests === 'function') {
        currentOverPassLayer.abortActiveRequests();
    }
}

function updateQueryButton() {
    // Handle both query buttons (top and bottom)
    var startBtns = document.querySelectorAll('.manual-query-btn');
    var stopBtns = document.querySelectorAll('.manual-stop-btn');

    if (isQueryRunning) {
        // Show stop buttons when query is running
        stopBtns.forEach(function(btn) {
            btn.style.display = "inline-block";
            btn.textContent = getTranslation("poi_stop_search") || "Atura consulta";
        });
        // Disable and hide start buttons
        startBtns.forEach(function(btn) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
            btn.style.display = "none";
        });
    } else {
        // Hide stop buttons when no query is running
        stopBtns.forEach(function(btn) {
            btn.style.display = "none";
        });
        // Enable and show start buttons
        startBtns.forEach(function(btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.style.display = "inline-block";
            btn.textContent = getTranslation("poi_manual_search") || "Carrega punts d'interès";
        });
    }
}

// Global variables for query management
var isQueryRunning = false;
var currentOverPassLayer = null; // Reference to current OverPassLayer for cancellation
var spinner = 0;

// Make key functions globally accessible
window.show_pois_checkboxes = show_pois_checkboxes;
window.update_permalink = update_permalink;
window.manualPoiQuery = manualPoiQuery;
window.stopQuery = stopQuery;
window.updateQueryButton = updateQueryButton;

// OSRM Routing functionality
var currentRouteType = 'driving'; // Default to car routing
var routeStartPoint = null;
var routeEndPoint = null;
var routeLayer = null; // Layer to hold the route line
var routeMarkers = []; // Array to hold start/end markers

// Make functions globally accessible
window.setRouteType = function(type) {
    currentRouteType = type;

    // Update button styles
    $('.route-type-btn').removeClass('active');
    $('#route-' + type).addClass('active');

    // Clear any existing route
    clearRoute();
};

window.calculateRoute = function() {
    var startInput = document.getElementById('route-start').value.trim();
    var endInput = document.getElementById('route-end').value.trim();

    // If no text inputs, use clicked points
    if (!startInput && !endInput) {
        if (!routeStartPoint || !routeEndPoint) {
            alert('Si us plau, indica el punt d\'origen i destí fent clic al mapa o introduint les adreces.');
            return;
        }
    }

    // Show loading
    $('#route-results').hide();
    $('#route-info').html('<p>Calculant ruta...</p>');
    $('#route-results').show();

    // If we have text inputs, geocode them first
    if (startInput || endInput) {
        geocodeAddresses(startInput, endInput);
    } else {
        // Use clicked points directly
        callOSRMAPI(routeStartPoint, routeEndPoint);
    }
}

function geocodeAddresses(startAddr, endAddr) {
    var geocodePromises = [];

    if (startAddr) {
        geocodePromises.push(geocodeAddress(startAddr, 'start'));
    } else if (routeStartPoint) {
        geocodePromises.push(Promise.resolve({type: 'start', point: routeStartPoint}));
    }

    if (endAddr) {
        geocodePromises.push(geocodeAddress(endAddr, 'end'));
    } else if (routeEndPoint) {
        geocodePromises.push(Promise.resolve({type: 'end', point: routeEndPoint}));
    }

    Promise.all(geocodePromises).then(function(results) {
        var startPoint = null;
        var endPoint = null;

        results.forEach(function(result) {
            if (result.type === 'start') {
                startPoint = result.point;
            } else if (result.type === 'end') {
                endPoint = result.point;
            }
        });

        if (startPoint && endPoint) {
            callOSRMAPI(startPoint, endPoint);
        } else {
            $('#route-info').html('<p>Error: No s\'han pogut geocodificar les adreces.</p>');
        }
    }).catch(function(error) {
        $('#route-info').html('<p>Error en la geocodificació: ' + error + '</p>');
    });
}

function geocodeAddress(address, type) {
    return new Promise(function(resolve, reject) {
        var currentLang = currentLanguage || 'ca';
        var langParam = currentLang === 'ca' ? 'ca' : currentLang === 'es' ? 'es' : 'en';

        $.getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=' + langParam + '&q=' + encodeURIComponent(address), function(data) {
            if (data && data.length > 0) {
                var point = [data[0].lon, data[0].lat];
                resolve({type: type, point: point});
            } else {
                reject('No s\'ha trobat l\'adreça: ' + address);
            }
        }).fail(function() {
            reject('Error en la geocodificació');
        });
    });
}

function callOSRMAPI(startPoint, endPoint) {
    // OSRM API endpoint
    var osrmUrl = 'https://router.project-osrm.org/route/v1/' + currentRouteType + '/' +
                  startPoint[0] + ',' + startPoint[1] + ';' +
                  endPoint[0] + ',' + endPoint[1];

    // Add options for overview and steps
    osrmUrl += '?overview=full&geometries=geojson&steps=true';

    $.getJSON(osrmUrl, function(data) {
        if (data.routes && data.routes.length > 0) {
            displayRoute(data.routes[0], startPoint, endPoint);
        } else {
            $('#route-info').html('<p>No s\'ha trobat cap ruta entre aquests punts.</p>');
        }
    }).fail(function(error) {
        $('#route-info').html('<p>Error en la consulta OSRM: ' + error.statusText + '</p>');
    });
}

function displayRoute(routeData, startPoint, endPoint) {
    // Clear any existing route
    clearRoute();

    // Create route line
    var routeCoords = routeData.geometry.coordinates.map(function(coord) {
        return [coord[1], coord[0]]; // OSRM returns [lng, lat], Leaflet expects [lat, lng]
    });

    routeLayer = L.polyline(routeCoords, {
        color: '#007acc',
        weight: 6,
        opacity: 0.8
    }).addTo(map);

    // Create start and end markers
    var startIcon = L.icon({
        iconUrl: 'assets/img/pin-icon-start.png',
        iconSize: [32, 37],
        iconAnchor: [18.5, 35],
        popupAnchor: [0, -27]
    });

    var endIcon = L.icon({
        iconUrl: 'assets/img/pin-icon-end.png',
        iconSize: [32, 37],
        iconAnchor: [18.5, 35],
        popupAnchor: [0, -27]
    });

    var startMarker = L.marker([startPoint[1], startPoint[0]], {icon: startIcon})
        .bindPopup('Origen')
        .addTo(map);

    var endMarker = L.marker([endPoint[1], endPoint[0]], {icon: endIcon})
        .bindPopup('Destí')
        .addTo(map);

    routeMarkers = [startMarker, endMarker];

    // Fit map to show the entire route
    map.fitBounds(routeLayer.getBounds(), {padding: [20, 20]});

    // Display route information
    var distance = (routeData.distance / 1000).toFixed(2); // Convert to km
    var duration = Math.round(routeData.duration / 60); // Convert to minutes

    var routeTypeName = '';
    switch(currentRouteType) {
        case 'driving': routeTypeName = 'Cotxe'; break;
        case 'cycling': routeTypeName = 'Bicicleta'; break;
        case 'walking': routeTypeName = 'A peu'; break;
    }

    var html = '<div style="padding: 10px;">';
    html += '<h4>Ruta en ' + routeTypeName + '</h4>';
    html += '<p><strong>Distància:</strong> ' + distance + ' km</p>';
    html += '<p><strong>Temps estimat:</strong> ' + duration + ' min</p>';

    if (routeData.legs && routeData.legs[0] && routeData.legs[0].steps) {
        html += '<h5>Instruccions:</h5>';
        html += '<ol style="font-size: 12px; margin: 5px 0; padding-left: 20px;">';
        routeData.legs[0].steps.forEach(function(step) {
            var instruction = step.maneuver && step.maneuver.modifier ?
                getTurnInstruction(step.maneuver.type, step.maneuver.modifier) :
                step.name || 'Continua recte';
            var distance = (step.distance < 1000) ?
                Math.round(step.distance) + ' m' :
                (step.distance / 1000).toFixed(1) + ' km';
            html += '<li>' + instruction + ' (' + distance + ')</li>';
        });
        html += '</ol>';
    }

    html += '</div>';

    $('#route-info').html(html);
}

function getTurnInstruction(type, modifier) {
    var instructions = {
        'turn': {
            'left': 'Gira a l\'esquerra',
            'right': 'Gira a la dreta',
            'sharp left': 'Gira bruscament a l\'esquerra',
            'sharp right': 'Gira bruscament a la dreta',
            'slight left': 'Gira suaument a l\'esquerra',
            'slight right': 'Gira suaument a la dreta'
        },
        'new name': 'Continua per ',
        'depart': 'Inicia',
        'arrive': 'Arriba a destí',
        'merge': 'Incorpora\'t',
        'on ramp': 'Agafa la incorporació',
        'off ramp': 'Pren la sortida',
        'fork': 'A la bifurcació',
        'end of road': 'Al final del carrer'
    };

    if (type === 'turn' && modifier) {
        return instructions.turn[modifier] || 'Gira';
    }

    return instructions[type] || type;
}

function clearRoute() {
    // Remove route line
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }

    // Remove markers
    routeMarkers.forEach(function(marker) {
        map.removeLayer(marker);
    });
    routeMarkers = [];

    // Clear route results
    $('#route-results').hide();
    $('#route-info').html('');

    // Clear input fields
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';

    // Reset clicked points
    routeStartPoint = null;
    routeEndPoint = null;
}

// Map click handler for setting route points - moved to site.js to avoid initialization issues

// GTFS functionality
var currentGtfsDataset = null;
var gtfsDatasets = [];
var gtfsRoutes = [];
var gtfsStops = [];

// GTFS API functions
function loadAllGtfsDatasets() {
    showGtfsLoading();
    $('#gtfs-search').val(''); // Clear search

    // Load GTFS feeds from the Mobility Database API
    fetch('https://api.mobilitydatabase.org/v1/gtfs_feeds')
        .then(response => {
            if (!response.ok) {
                throw new Error('API request failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            // Convert API response to our expected format
            gtfsDatasets = data.map(function(feed) {
                return {
                    id: feed.id,
                    name: feed.name,
                    provider_name: feed.provider,
                    location: {
                        country: feed.location?.country_code,
                        subdivision_name: feed.location?.subdivision_name,
                        municipality: feed.location?.municipality
                    },
                    description: feed.note || feed.name,
                    status: feed.status,
                    features: feed.features,
                    urls: {
                        direct_download: feed.urls?.direct_download,
                        latest: feed.urls?.latest,
                        license: feed.urls?.license
                    },
                    bounding_box: feed.location?.bounding_box ? {
                        minimum_latitude: feed.location.bounding_box.minimum_latitude,
                        maximum_latitude: feed.location.bounding_box.maximum_latitude,
                        minimum_longitude: feed.location.bounding_box.minimum_longitude,
                        maximum_longitude: feed.location.bounding_box.maximum_longitude
                    } : null,
                    latest_dataset: feed.latest_dataset
                };
            });
            displayGtfsDatasets(gtfsDatasets);
        })
        .catch(error => {
            console.error('Error loading GTFS datasets:', error);
            // Show error message with instructions
            var helpHtml = '';
            helpHtml += '<div style="color: red; padding: 15px; border: 1px solid #ff6b6b; border-radius: 5px; background: #ffeaea;">';
            helpHtml += '<h4 style="margin-top: 0; color: #d63031;">❌ Error Loading GTFS Data</h4>';
            helpHtml += '<p>Unable to load GTFS datasets from Mobility Database API.</p>';
            helpHtml += '<p><strong>Error:</strong> ' + error.message + '</p>';
            helpHtml += '<p><strong>Troubleshooting:</strong></p>';
            helpHtml += '<ol style="margin: 10px 0; padding-left: 20px;">';
            helpHtml += '<li>Check your internet connection</li>';
            helpHtml += '<li>The Mobility Database API may be temporarily unavailable</li>';
            helpHtml += '<li>Try again later or contact support if the problem persists</li>';
            helpHtml += '</ol>';
            helpHtml += '<p><strong>Alternatives:</strong></p>';
            helpHtml += '<ul style="margin: 10px 0; padding-left: 20px;">';
            helpHtml += '<li>Download GTFS data directly from transit agency websites</li>';
            helpHtml += '<li>Use <a href="https://gtfs.org/" target="_blank">GTFS.org</a> or <a href="https://transit.land/" target="_blank">Transit.land</a></li>';
            helpHtml += '</ul>';
            helpHtml += '<button onclick="loadAllGtfsDatasets()" style="background:#007acc; color:white; padding:8px 15px; border:none; border-radius:3px; cursor:pointer; margin-top: 10px;">Retry</button>';
            helpHtml += '</div>';

            $('#gtfs-dataset-list').html(helpHtml);
        })
        .finally(() => {
            hideGtfsLoading();
        });
}

function searchGtfsDatasets() {
    var searchTerm = $('#gtfs-search').val().toLowerCase().trim();
    if (!searchTerm) {
        loadAllGtfsDatasets();
        return;
    }

    showGtfsLoading();

    // If we have loaded datasets, search locally
    if (gtfsDatasets && gtfsDatasets.length > 0) {
        var filtered = gtfsDatasets.filter(function(dataset) {
            var searchableText = [
                dataset.provider_name || '',
                dataset.name || '',
                dataset.location?.country || '',
                dataset.location?.subdivision_name || '',
                dataset.location?.municipality || ''
            ].join(' ').toLowerCase();

            return searchableText.includes(searchTerm);
        });

        displayGtfsDatasets(filtered);
        hideGtfsLoading();
    } else {
        // If no datasets loaded yet, load all first then filter
        fetch('assets/csv/feeds_v2.csv')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Local CSV file not found: ' + response.status);
                }
                return response.text();
            })
            .then(csvText => {
                // Parse CSV and filter results
                gtfsDatasets = parseGtfsCsv(csvText);
                var filtered = gtfsDatasets.filter(function(dataset) {
                    var searchableText = [
                        dataset.provider_name || '',
                        dataset.name || '',
                        dataset.location?.country || '',
                        dataset.location?.subdivision_name || '',
                        dataset.location?.municipality || '',
                        dataset.description || ''
                    ].join(' ').toLowerCase();

                    return searchableText.includes(searchTerm);
                });

                displayGtfsDatasets(filtered);
            })
            .catch(error => {
                console.error('Error searching GTFS datasets:', error);
                // Show error message with search term
                var helpHtml = '';
                helpHtml += '<div style="color: red; padding: 15px; border: 1px solid #ff6b6b; border-radius: 5px; background: #ffeaea;">';
                helpHtml += '<h4 style="margin-top: 0; color: #d63031;">❌ Error Searching GTFS Data</h4>';
                helpHtml += '<p>Unable to search for "' + searchTerm + '" in the local CSV file.</p>';
                helpHtml += '<p><strong>Error:</strong> ' + error.message + '</p>';
                helpHtml += '<p><strong>Troubleshooting:</strong></p>';
                helpHtml += '<ol style="margin: 10px 0; padding-left: 20px;">';
                helpHtml += '<li>The local CSV file may be missing or corrupted</li>';
                helpHtml += '<li>Download the latest feeds_v2.csv from <a href="https://files.mobilitydatabase.org/feeds_v2.csv" target="_blank">Mobility Database</a></li>';
                helpHtml += '<li>Place it in the assets/csv/ directory</li>';
                helpHtml += '</ol>';
                helpHtml += '<p><strong>Alternatives:</strong></p>';
                helpHtml += '<ul style="margin: 10px 0; padding-left: 20px;">';
                helpHtml += '<li>Download GTFS data directly from transit agency websites</li>';
                helpHtml += '<li>Use <a href="https://gtfs.org/" target="_blank">GTFS.org</a> or <a href="https://transit.land/" target="_blank">Transit.land</a></li>';
                helpHtml += '</ul>';
                helpHtml += '<button onclick="searchGtfsDatasets()" style="background:#007acc; color:white; padding:8px 15px; border:none; border-radius:3px; cursor:pointer; margin-top: 10px;">Retry Search</button>';
                helpHtml += ' <button onclick="loadAllGtfsDatasets()" style="background:#666; color:white; padding:8px 15px; border:none; border-radius:3px; cursor:pointer; margin-top: 10px;">Show All</button>';
                helpHtml += '</div>';

                $('#gtfs-dataset-list').html(helpHtml);
            })
            .finally(() => {
                hideGtfsLoading();
            });
    }
}

// ---------------------- Mobility Database Auth Helpers ----------------------

function setRefreshToken(token, persist) {
    if (!token) return;
    // store refresh token in memory and optionally in localStorage
    window._mobility_refresh_token = token;
    if (persist) localStorage.setItem('mobility_refresh_token', token);
}

function getStoredRefreshToken() {
    return window._mobility_refresh_token || localStorage.getItem('mobility_refresh_token') || null;
}

function clearStoredRefreshToken() {
    window._mobility_refresh_token = null;
    localStorage.removeItem('mobility_refresh_token');
    // also clear access token cache
    localStorage.removeItem('mobility_access_token');
    localStorage.removeItem('mobility_token_expiry');
}

function requestAccessToken(refreshToken) {
    return fetch('https://api.mobilitydatabase.org/v1/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    }).then(response => {
        if (!response.ok) throw new Error('Token request failed: ' + response.status);
        return response.json();
    }).then(data => {
        // response shape may vary; try common fields
        var accessToken = data.access_token || data.token || (data.data && data.data.access_token);
        var expiresIn = data.expires_in || data.expires || 3600;
        if (!accessToken) throw new Error('No access token in response');
        var expiry = Date.now() + (expiresIn * 1000);
        localStorage.setItem('mobility_access_token', accessToken);
        localStorage.setItem('mobility_token_expiry', String(expiry));
        return accessToken;
    });
}

function getValidAccessToken() {
    return new Promise((resolve, reject) => {
        var token = localStorage.getItem('mobility_access_token');
        var expiry = parseInt(localStorage.getItem('mobility_token_expiry') || '0', 10);
        if (token && expiry && Date.now() + 60000 < expiry) {
            resolve(token);
            return;
        }

        var refresh = getStoredRefreshToken();
        if (!refresh) {
            reject(new Error('No refresh token configured. Please paste your Mobility Database refresh token in the GTFS panel.'));
            return;
        }

        requestAccessToken(refresh).then(resolve).catch(err => {
            // clear cached tokens on failure
            localStorage.removeItem('mobility_access_token');
            localStorage.removeItem('mobility_token_expiry');
            reject(err);
        });
    });
}

function authFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    return getValidAccessToken().then(token => {
        options.headers['Authorization'] = 'Bearer ' + token;
        return fetch(url, options);
    }).catch(err => {
        // If no refresh token is configured or token request fails, fall back to an unauthenticated fetch
        console.warn('authFetch: proceeding without Authorization header:', err.message || err);
        return fetch(url, options);
    });
}

// Expose auth helpers to UI
window.setRefreshToken = setRefreshToken;
window.getStoredRefreshToken = getStoredRefreshToken;
window.clearStoredRefreshToken = clearStoredRefreshToken;
window.getValidAccessToken = getValidAccessToken;
window.authFetch = authFetch;

// ---------------------- End Mobility Database Auth Helpers ----------------------

function displayGtfsDatasets(datasets) {
    $('#gtfs-results').show();
    $('#gtfs-details').hide();
    $('#gtfs-content').hide();

    if (!datasets || datasets.length === 0) {
        $('#gtfs-dataset-list').html('<div style="padding: 20px; text-align: center; color: #666;">No s\'han trobat conjunts de dades.</div>');
        return;
    }

    var html = '';
    datasets.forEach(function(dataset) {
        var provider = dataset.provider_name || 'Desconegut';
        var location = formatGtfsLocation(dataset.location);
        var lastUpdated = dataset.latest_dataset?.downloaded_at ?
            new Date(dataset.latest_dataset.downloaded_at).toLocaleDateString() : 'N/A';
        var escapedId = String(dataset.id).replace(/'/g, "\\'").replace(/"/g, '\\"');

        html += '<div class="gtfs-dataset-item" style="border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 10px; transition: background-color 0.2s;">';
        html += '<h4 style="margin: 0 0 8px 0; color: #007acc; cursor: pointer;" onclick="selectGtfsDataset(\'' + escapedId + '\')">' + (dataset.name || 'Sense nom') + '</h4>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; font-size: 14px; color: #666;">';
        html += '<div><strong>Proveïdor:</strong> ' + provider + '</div>';
        html += '<div><strong>Ubicació:</strong> ' + location + '</div>';
        html += '<div><strong>Última actualització:</strong> ' + lastUpdated + '</div>';
        html += '</div>';
        html += '<div style="margin-top: 10px; font-size: 13px; color: #888;">ID: ' + dataset.id + '</div>';
        html += '</div>';
    });

    $('#gtfs-dataset-list').html(html);
}

function selectGtfsDataset(datasetId) {
    currentGtfsDataset = gtfsDatasets.find(d => d.id === datasetId);
    if (!currentGtfsDataset) return;

    $('#gtfs-dataset-title').text(currentGtfsDataset.name || 'Sense nom');
    $('#gtfs-provider').text(currentGtfsDataset.provider_name || 'Desconegut');
    $('#gtfs-country').text(currentGtfsDataset.location?.country || 'N/A');
    $('#gtfs-location').text(formatGtfsLocation(currentGtfsDataset.location));
    $('#gtfs-last-updated').text(currentGtfsDataset.bounding_box?.extracted_on ?
        new Date(currentGtfsDataset.bounding_box.extracted_on).toLocaleDateString() : 'N/A');

    var description = currentGtfsDataset.description || 'Sense descripció disponible.';
    if (currentGtfsDataset.status) {
        description += ' (Estat: ' + currentGtfsDataset.status + ')';
    }
    if (currentGtfsDataset.features) {
        description += '\nCaracterístiques: ' + currentGtfsDataset.features;
    }
    $('#gtfs-description').text(description);

    $('#gtfs-results').hide();
    $('#gtfs-details').show();
}

function formatGtfsLocation(location) {
    if (!location) return 'N/A';

    var parts = [];
    if (location.municipality) parts.push(location.municipality);
    if (location.subdivision_name) parts.push(location.subdivision_name);
    if (location.country && location.country !== location.subdivision_name) parts.push(location.country);

    return parts.join(', ') || 'N/A';
}

function exploreGtfsRoutes() {
    if (!currentGtfsDataset) return;

    $('#gtfs-content-title').text('Informació sobre rutes GTFS');
    $('#gtfs-content-list').html('<div style="text-align: center; padding: 20px;">Carregant informació...</div>');
    $('#gtfs-details').hide();
    $('#gtfs-content').show();

    // Show general information about GTFS routes
    displayGtfsRoutesInfo(currentGtfsDataset);
}

function exploreGtfsStops() {
    if (!currentGtfsDataset) return;

    $('#gtfs-content-title').text('Informació sobre parades GTFS');
    $('#gtfs-content-list').html('<div style="text-align: center; padding: 20px;">Carregant informació...</div>');
    $('#gtfs-details').hide();
    $('#gtfs-content').show();

    // Show general information about GTFS stops
    displayGtfsStopsInfo(currentGtfsDataset);
}



function displayGtfsRoutesInfo(feed) {
    var html = '<div style="padding: 20px;">';
    html += '<h4>Informació sobre rutes GTFS</h4>';
    html += '<p>Les rutes en un fitxer GTFS defineixen les línies de transport públic disponibles. Cada ruta té informació com:</p>';
    html += '<ul style="margin: 10px 0; padding-left: 20px;">';
    html += '<li><strong>Nom curt i llarg:</strong> Identificadors de la ruta (ex: "R2", "Línia 1")</li>';
    html += '<li><strong>Tipus de ruta:</strong> Autobús (3), metro (1), tren (2), etc.</li>';
    html += '<li><strong>Descripció:</strong> Informació addicional sobre la ruta</li>';
    html += '<li><strong>Colors:</strong> Per a la visualització en mapes i aplicacions</li>';
    html += '</ul>';

    html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">';
    html += '<h4 style="margin-top: 0; color: #d63031;">🔍 Per cercar rutes específiques</h4>';
    html += '<p>Actualment, per cercar informació sobre una línia específica, cal descarregar i processar el fitxer GTFS. Aquí tens com fer-ho:</p>';
    html += '<ol style="margin: 10px 0; padding-left: 20px;">';
    html += '<li><strong>Descarrega les dades:</strong> Fes clic al botó "Download data" per obtenir el fitxer GTFS</li>';
    html += '<li><strong>Obre routes.txt:</strong> Aquest fitxer conté totes les rutes disponibles</li>';
    html += '<li><strong>Cerca la teva línia:</strong> Busca per nom, ID o descripció</li>';
    html += '<li><strong>Informació disponible:</strong> ID, nom, tipus, colors, agencia, etc.</li>';
    html += '</ol>';
    html += '<p><strong>Eines recomanades per processar GTFS:</strong></p>';
    html += '<ul style="margin: 10px 0; padding-left: 20px;">';
    html += '<li><a href="https://gtfs.org/schedule/reference/#routestxt" target="_blank">Especificació GTFS routes.txt</a></li>';
    html += '<li><a href="https://www.transit.land/" target="_blank">Transit.land</a> - Cercador de dades de transport</li>';
    html += '<li><a href="https://github.com/google/transit" target="_blank">GTFS libraries</a> - Eines de processament</li>';
    html += '</ul>';



    html += '<p style="margin-top: 20px;"><strong>Proveïdor seleccionat:</strong> ' + (feed.provider_name || 'Desconegut') + '</p>';
    html += '<p><strong>Dataset:</strong> ' + (feed.name || 'Sense nom') + ' (ID: ' + feed.id + ')</p>';

    if (feed.features) {
        html += '<p><strong>Característiques:</strong> ' + feed.features + '</p>';
    }

    html += '<p style="margin-top: 20px; color: #666;"><em>Nota: Aquesta aplicació mostra informació general sobre GTFS. Per a cerques detallades de rutes, descarrega les dades i utilitza eines especialitzades.</em></p>';
    html += '</div>';

    $('#gtfs-content-list').html(html);
}



function displayGtfsRoutes(data) {
    var html = '<div style="padding: 20px;">';
    html += '<h4>Rutes trobades: ' + (data.length || 0) + '</h4>';

    if (data && data.length > 0) {
        html += '<div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; padding: 10px;">';
        data.slice(0, 50).forEach(function(route) { // Limit to first 50 routes
            html += '<div style="border-bottom: 1px solid #eee; padding: 8px 0;">';
            html += '<div style="font-weight: bold; color: #007acc;">' + (route.route_short_name || '') + ' ' + (route.route_long_name || '') + '</div>';
            if (route.route_desc) {
                html += '<div style="font-size: 12px; color: #666;">' + route.route_desc + '</div>';
            }
            html += '<div style="font-size: 11px; color: #888;">ID: ' + route.route_id + ' | Tipus: ' + route.route_type + '</div>';
            html += '</div>';
        });

        if (data.length > 50) {
            html += '<div style="text-align: center; padding: 10px; color: #666;">... i ' + (data.length - 50) + ' rutes més</div>';
        }

        html += '</div>';
    } else {
        html += '<p>No s\'han trobat rutes en aquest conjunt de dades.</p>';
    }

    html += '<p style="margin-top: 20px;"><em>Per obtenir totes les rutes i dades detallades, descarrega el fitxer GTFS complet.</em></p>';
    html += '</div>';

    $('#gtfs-content-list').html(html);
}

function displayGtfsStops(data) {
    var html = '<div style="padding: 20px;">';
    html += '<h4>Parades trobades: ' + (data.length || 0) + '</h4>';

    if (data && data.length > 0) {
        html += '<div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; padding: 10px;">';
        data.slice(0, 50).forEach(function(stop) { // Limit to first 50 stops
            html += '<div style="border-bottom: 1px solid #eee; padding: 8px 0;">';
            html += '<div style="font-weight: bold; color: #007acc;">' + (stop.stop_name || 'Sense nom') + '</div>';
            if (stop.stop_desc) {
                html += '<div style="font-size: 12px; color: #666;">' + stop.stop_desc + '</div>';
            }
            html += '<div style="font-size: 11px; color: #888;">ID: ' + stop.stop_id;
            if (stop.stop_lat && stop.stop_lon) {
                html += ' | Coordenades: ' + stop.stop_lat + ', ' + stop.stop_lon;
            }
            html += '</div>';
            html += '</div>';
        });

        if (data.length > 50) {
            html += '<div style="text-align: center; padding: 10px; color: #666;">... i ' + (data.length - 50) + ' parades més</div>';
        }

        html += '</div>';
    } else {
        html += '<p>No s\'han trobat parades en aquest conjunt de dades.</p>';
    }

    html += '<p style="margin-top: 20px;"><em>Per obtenir totes les parades i dades detallades, descarrega el fitxer GTFS complet.</em></p>';
    html += '</div>';

    $('#gtfs-content-list').html(html);
}

function downloadGtfsData() {
    if (!currentGtfsDataset || !currentGtfsDataset.urls?.latest) {
        alert('No hi ha dades disponibles per descarregar.');
        return;
    }

    var downloadUrl = currentGtfsDataset.urls.latest;

    // Create a temporary link to trigger the download
    var link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.download = currentGtfsDataset.id + '-gtfs.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show success message
    alert('Descarregant dades GTFS de: ' + currentGtfsDataset.name);
}

function backToGtfsDetails() {
    $('#gtfs-content').hide();
    $('#gtfs-details').show();
}

function showGtfsLoading() {
    $('#gtfs-loading').show();
}

function hideGtfsLoading() {
    $('#gtfs-loading').hide();
}

// CSV parsing function for GTFS feeds
function parseGtfsCsv(csvText) {
    var lines = csvText.split('\n');
    if (lines.length < 2) return [];

    var headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    var datasets = [];

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        // Handle CSV parsing with quoted fields
        var fields = [];
        var current = '';
        var inQuotes = false;

        for (var j = 0; j < line.length; j++) {
            var char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current.replace(/"/g, '').trim());
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current.replace(/"/g, '').trim());

        if (fields.length >= headers.length) {
            var dataset = {};
            headers.forEach(function(header, index) {
                dataset[header] = fields[index] || '';
            });

            // Convert to expected format
            var convertedDataset = {
                id: dataset.id,
                name: dataset.name,
                provider_name: dataset.provider,
                location: {
                    country: dataset['location.country_code'],
                    subdivision_name: dataset['location.subdivision_name'],
                    municipality: dataset['location.municipality']
                },
                description: dataset.note || dataset.name,
                status: dataset.status,
                features: dataset.features,
                urls: {
                    direct_download: dataset['urls.direct_download'],
                    latest: dataset['urls.latest'],
                    license: dataset['urls.license']
                },
                bounding_box: {
                    minimum_latitude: dataset['location.bounding_box.minimum_latitude'],
                    maximum_latitude: dataset['location.bounding_box.maximum_latitude'],
                    minimum_longitude: dataset['location.bounding_box.minimum_longitude'],
                    maximum_longitude: dataset['location.bounding_box.maximum_longitude']
                }
            };

            datasets.push(convertedDataset);
        }
    }

    return datasets;
}

// Make GTFS functions globally accessible
window.loadAllGtfsDatasets = loadAllGtfsDatasets;
window.searchGtfsDatasets = searchGtfsDatasets;
window.selectGtfsDataset = selectGtfsDataset;
window.exploreGtfsRoutes = exploreGtfsRoutes;
window.exploreGtfsStops = exploreGtfsStops;
window.downloadGtfsData = downloadGtfsData;
window.backToGtfsDetails = backToGtfsDetails;

// GTFS-RT Real-Time Train Visualization
var realtimeTrainInterval = null;
var realtimeTrainMarkers = [];
var realtimeTrainLayer = null;
var trainsByRoute = {}; // Global variable for legend toggle functionality
var routeInfo = {}; // Global variable for route information

// GTFS-RT Protocol Buffer definitions
var gtfsRealtimeProto = null;

// Load GTFS-RT protobuf definitions
function loadGtfsRealtimeProto() {
    if (gtfsRealtimeProto) return Promise.resolve(gtfsRealtimeProto);

    return fetch('assets/txt/gtfs-realtime.proto.txt')
        .then(response => response.text())
        .then(protoText => {
            // Parse the protobuf definition
            protobuf.parse(protoText, { keepCase: true }, function(err, root) {
                if (err) throw err;
                gtfsRealtimeProto = root;
                protobuf.roots.gtfsrt = root;
                console.log('✅ GTFS-RT protobuf definitions loaded successfully');
            });
            return gtfsRealtimeProto;
        })
        .catch(error => {
            console.warn('Could not load GTFS-RT proto definitions:', error);
            return null;
        });
}

// Basic GTFS-RT parsing (simplified - production would use proper protobuf parsing)
function parseVehiclePositionsBasic(buffer) {
    // This is a very basic implementation
    // In production, use proper protobuf parsing
    var vehicles = [];

    try {
        // Convert buffer to string and look for basic patterns
        // This is not accurate but demonstrates the concept
        var str = new Uint8Array(buffer);
        var positions = [];

        // Look for coordinate patterns (this is very simplified)
        for (var i = 0; i < str.length - 8; i++) {
            // Try to extract coordinates (latitude/longitude)
            // This is a placeholder - real implementation needs proper protobuf decoding
        }

        return positions;
    } catch (error) {
        console.error('Error parsing vehicle positions:', error);
        return [];
    }
}

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
WHY 
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

// Define global mdb object for Mobility Database API functions
window.mdb = {
    setRefreshToken: setRefreshToken,
    getStoredRefreshToken: getStoredRefreshToken,
    clearStoredRefreshToken: clearStoredRefreshToken,
    getValidAccessToken: getValidAccessToken,
    authFetch: authFetch
};

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
                    '<div style="font-family: Arial, sans-serif; min-width: 220px;">' +
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

// TMB Real-Time Bus Visualization
var tmbRealtimeBusInterval = null;
var tmbRealtimeBusMarkers = [];
var tmbRealtimeBusLayer = null;
var tmbBusesByRoute = {}; // Global variable for TMB legend toggle functionality
var tmbRouteInfo = {}; // Global variable for TMB route information

// Start TMB real-time bus visualization
function startRealtimeTMBBuses() {
    // If already running, stop it instead of starting again
    if (tmbRealtimeBusInterval) {
        stopRealtimeTMBBuses();
        return;
    }

    // Initial load
    fetchRealtimeTMBBuses().then(function(buses) {
        displayTMBRealtimeBuses(buses);
    });

    // Set up periodic updates every 30 seconds (TMB data refresh rate)
    tmbRealtimeBusInterval = setInterval(function() {
        fetchRealtimeTMBBuses().then(function(buses) {
            displayTMBRealtimeBuses(buses);
        });
    }, 30000);

    // Update UI
    document.getElementById('start-tmb-realtime-btn').style.display = 'none';
    document.getElementById('stop-tmb-realtime-btn').style.display = 'inline-block';
    document.getElementById('tmb-legend-btn').style.display = 'inline-block';
    updateTMBRealtimeStatus('Carregant autobusos TMB en temps real...');
}

// Stop TMB real-time bus visualization
function stopRealtimeTMBBuses() {
    if (tmbRealtimeBusInterval) {
        clearInterval(tmbRealtimeBusInterval);
        tmbRealtimeBusInterval = null;
    }

    // Clear all bus markers
    tmbRealtimeBusMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    tmbRealtimeBusMarkers = [];

    // Update UI
    document.getElementById('start-tmb-realtime-btn').style.display = 'inline-block';
    document.getElementById('stop-tmb-realtime-btn').style.display = 'none';
    updateTMBRealtimeStatus('Inactiu');
}

// Update TMB real-time status display
function updateTMBRealtimeStatus(status) {
    var statusElement = document.getElementById('tmb-realtime-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch real-time TMB bus positions
function fetchRealtimeTMBBuses() {
    // Detect deployment environment
    var hostname = window.location.hostname;
    var isGitHubPages = hostname.includes('github.io');
    var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

    // Use appropriate API endpoint based on environment
    var apiUrl;
    if (isVercel) {
        // Use Vercel-deployed API
        apiUrl = '/api/tmb-buses';
        console.log('🚌 Fetching TMB bus data via Vercel API...');
    } else if (isGitHubPages) {
        // On GitHub Pages, use our Vercel deployment as proxy
        apiUrl = 'https://openlocalmap2.vercel.app/api/tmb-buses';
        console.log('🚌 Fetching TMB bus data via openlocalmap2.vercel.app proxy from GitHub Pages...');
    } else {
        // Local development
        apiUrl = '/api/tmb-buses';
        console.log('🚌 Fetching TMB bus data via local proxy server...');
    }

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('TMB API proxy failed: ' + response.status + ' ' + response.statusText);
            }
            return response.json();
        })
        .then(jsonData => {
            console.log('✅ TMB API proxy succeeded! Processing TMB bus data...');

            // Check if the response contains an error
            if (jsonData.error) {
                throw new Error('TMB API Error: ' + jsonData.message);
            }

            var buses = [];

            // Process TMB iBus API response
            // TMB API returns data about nearby stops with bus arrivals
            if (jsonData && jsonData.data && jsonData.data.nearstops) {
                jsonData.data.nearstops.forEach(function(stop) {
                    if (stop.buses && Array.isArray(stop.buses)) {
                        stop.buses.forEach(function(bus, index) {
                            try {
                                console.log('🔍 Processing TMB bus', index, 'at stop', stop.street_name, ':', bus);

                                // TMB provides bus line information but not exact GPS positions
                                // We'll create bus markers at stop locations for visualization
                                var lat = stop.lat;
                                var lng = stop.lon;
                                var routeId = bus.line || 'Unknown';
                                var busId = bus.bus || index.toString();
                                var destination = bus.destination || '';
                                var timeArrival = bus['t-in-min'] || bus['t-in-s'] || 0;

                                // Validate coordinates
                                if (typeof lat === 'number' && typeof lng === 'number' &&
                                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
                                    lat !== 0 && lng !== 0) {

                                    buses.push({
                                        id: busId + '-' + stop.code,
                                        label: routeId + ' → ' + destination,
                                        lat: lat,
                                        lng: lng,
                                        route: routeId,
                                        destination: destination,
                                        stopName: stop.street_name || '',
                                        stopCode: stop.code || '',
                                        timeToArrival: timeArrival,
                                        status: 'At stop',
                                        timestamp: new Date().getTime()
                                    });

                                    console.log('✅ Processed TMB bus:', busId, routeId, 'at', lat, lng);
                                } else {
                                    console.warn('❌ Invalid coordinates for TMB bus at stop:', stop.code, '- lat:', lat, 'lng:', lng);
                                }
                            } catch (error) {
                                console.warn('Error processing TMB bus at stop', stop.code, ':', error, bus);
                            }
                        });
                    }
                });
            } else {
                console.warn('❌ TMB API proxy response format unexpected:', jsonData);
            }

            if (buses.length > 0) {
                console.log('🚌 SUCCESS: Extracted', buses.length, 'TMB buses from API proxy!');
                return buses;
            } else {
                console.warn('Proxy returned data but no buses found');
                alert('🚌 No s\'han trobat autobusos TMB a les parades properes. L\'API pot estar temporalment indisponible o no hi ha parades properes.\n\nUtilitza l\'opció "📝 Introduir Dades Manualment" per provar amb dades d\'exemple.');
                return [];
            }
        })
        .catch(error => {
            console.error('❌ TMB API proxy failed:', error.message);

            // Fallback options - same CORS proxy system as RENFE and FGC
            if (isGitHubPages) {
                // On GitHub Pages, try CORS proxies
                console.log('🔄 Falling back to CORS proxies for TMB...');
                return fetchRealtimeTMBBusesFallback();
            } else if (isVercel) {
                // On Vercel, show manual fallback option
                alert('🚌 API proxy temporarily unavailable. Use manual data entry:\n\n1. Open: https://developer.tmb.cat/api-docs/v1/ibus\n2. Copy JSON data\n3. Use "📝 Introduir Dades Manualment"');
                return Promise.resolve([]);
            } else {
                // Local development - try CORS proxies
                console.log('🔄 Local development - API proxy failed, trying CORS proxies...');
                return fetchRealtimeTMBBusesFallback();
            }
        });
}

// Display TMB bus positions on map with colored route visualization
function displayTMBRealtimeBuses(buses) {
    console.log('🚌 DISPLAYING', buses.length, 'TMB BUSES ON MAP...');

    // Clear existing markers and layers
    tmbRealtimeBusMarkers.forEach(function(marker) {
        try {
            map.removeLayer(marker);
        } catch (e) {}
    });
    tmbRealtimeBusMarkers = [];

    // Group buses by route for better visualization
    var tmbBusesByRoute = {};
    buses.forEach(function(bus) {
        if (bus.route && bus.route !== 'Unknown') {
            if (!tmbBusesByRoute[bus.route]) {
                tmbBusesByRoute[bus.route] = [];
            }
            tmbBusesByRoute[bus.route].push(bus);
        } else {
            // Put unknown routes in a separate group
            if (!tmbBusesByRoute['Unknown']) {
                tmbBusesByRoute['Unknown'] = [];
            }
            tmbBusesByRoute['Unknown'].push(bus);
        }
    });

// Define colors and names for different TMB bus routes - official TMB colors from their website
    var tmbRouteInfo = {
        // TMB Metro lines (for reference)
        'L1': {name: 'L1', color: '#FF0000', type: 'Metro'}, // Red
        'L2': {name: 'L2', color: '#9C5B00', type: 'Metro'}, // Purple
        'L3': {name: 'L3', color: '#00A000', type: 'Metro'}, // Green
        'L4': {name: 'L4', color: '#FFD800', type: 'Metro'}, // Yellow
        'L5': {name: 'L5', color: '#00A0E9', type: 'Metro'}, // Blue

        // TMB Bus lines - common Barcelona bus lines with their colors
        '1': {name: 'Línia 1', color: '#FF6B6B', type: 'Bus'}, // Red
        '2': {name: 'Línia 2', color: '#4ECDC4', type: 'Bus'}, // Teal
        '3': {name: 'Línia 3', color: '#45B7D1', type: 'Bus'}, // Blue
        '4': {name: 'Línia 4', color: '#FFA07A', type: 'Bus'}, // Light Salmon
        '5': {name: 'Línia 5', color: '#98D8C8', type: 'Bus'}, // Mint
        '6': {name: 'Línia 6', color: '#F7DC6F', type: 'Bus'}, // Yellow
        '7': {name: 'Línia 7', color: '#BB8FCE', type: 'Bus'}, // Purple
        '8': {name: 'Línia 8', color: '#85C1E9', type: 'Bus'}, // Light Blue
        '9': {name: 'Línia 9', color: '#F8C471', type: 'Bus'}, // Orange
        '10': {name: 'Línia 10', color: '#95A5A6', type: 'Bus'}, // Gray

        // More bus lines
        '11': {name: 'Línia 11', color: '#E74C3C', type: 'Bus'}, // Red
        '12': {name: 'Línia 12', color: '#3498DB', type: 'Bus'}, // Blue
        '13': {name: 'Línia 13', color: '#2ECC71', type: 'Bus'}, // Green
        '14': {name: 'Línia 14', color: '#9B59B6', type: 'Bus'}, // Purple
        '15': {name: 'Línia 15', color: '#F39C12', type: 'Bus'}, // Orange
        '16': {name: 'Línia 16', color: '#1ABC9C', type: 'Bus'}, // Turquoise
        '17': {name: 'Línia 17', color: '#E67E22', type: 'Bus'}, // Carrot
        '18': {name: 'Línia 18', color: '#34495E', type: 'Bus'}, // Dark Gray
        '19': {name: 'Línia 19', color: '#16A085', type: 'Bus'}, // Green
        '20': {name: 'Línia 20', color: '#8E44AD', type: 'Bus'}, // Purple

        // Aerobus lines
        'A1': {name: 'Aerobus A1', color: '#FF0000', type: 'Aerobus'}, // Red
        'A2': {name: 'Aerobus A2', color: '#0000FF', type: 'Aerobus'}, // Blue

        // Nitbus (Night bus)
        'N1': {name: 'Nitbus N1', color: '#FF1493', type: 'Nitbus'}, // Pink
        'N2': {name: 'Nitbus N2', color: '#00FF00', type: 'Nitbus'}, // Green
        'N3': {name: 'Nitbus N3', color: '#FFFF00', type: 'Nitbus'}, // Yellow

        'Unknown': {name: 'Línia desconeguda', color: '#95A5A6', type: 'Bus'} // Gray
    };

    var totalTMBBuses = 0;

    // Create markers for each bus, grouped by route
    Object.keys(tmbBusesByRoute).forEach(function(routeId) {
        var routeBuses = tmbBusesByRoute[routeId];
        var routeData = tmbRouteInfo[routeId];
        if (!routeData) {
            // Use the route code directly if not in mapping
            routeData = {
                name: routeId,
                color: '#95A5A6', // Gray for unknown routes
                type: 'Bus'
            };
        }
        var routeColor = routeData.color;
        var routeName = routeData.name;
        var routeType = routeData.type;

        routeBuses.forEach(function(bus) {
            if (bus.lat && bus.lng && !isNaN(bus.lat) && !isNaN(bus.lng)) {
                // Create modern bus icon with colored route label
                var marker = L.marker([bus.lat, bus.lng], {
                    icon: L.divIcon({
                        html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.7));">' +
                              '<rect x="2" y="4" width="20" height="12" rx="2" fill="#333"/>' +
                              '<circle cx="6" cy="18" r="2" fill="#666"/>' +
                              '<circle cx="18" cy="18" r="2" fill="#666"/>' +
                              '<rect x="4" y="6" width="4" height="6" rx="0.5" fill="#999"/>' +
                              '<rect x="10" y="6" width="4" height="6" rx="0.5" fill="#999"/>' +
                              '<rect x="16" y="6" width="4" height="6" rx="0.5" fill="#999"/>' +
                              '</svg>' +
                              '<div style="position: absolute; top: -6px; left: 50%; transform: translateX(-50%); ' +
                              'background: ' + routeColor + '; color: white; font-size: 9px; font-weight: bold; ' +
                              'padding: 1px 3px; border-radius: 2px; border: 1px solid #333; white-space: nowrap;">' +
                              routeName + '</div>',
                        className: 'tmb-bus-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 20]
                    })
                });

                // Enhanced popup with TMB bus information and color coding
                var arrivalText = '';
                if (bus.timeToArrival) {
                    if (typeof bus.timeToArrival === 'number') {
                        arrivalText = bus.timeToArrival + ' min';
                    } else {
                        arrivalText = bus.timeToArrival;
                    }
                } else {
                    arrivalText = 'N/A';
                }

                marker.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 220px;">' +
                    '<h4 style="margin: 0 0 8px 0; color: ' + routeColor + '; border-bottom: 2px solid ' + routeColor + '; padding-bottom: 4px;">' +
                    '🚌 Autobús TMB ' + (bus.id || 'Desconegut') + '</h4>' +
                    '<div style="background: ' + routeColor + '15; border: 1px solid ' + routeColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<strong>Línia:</strong> <span style="color: ' + routeColor + '; font-weight: bold;">' + routeName + '</span><br>' +
                    '<strong>Tipus:</strong> ' + routeType + '<br>' +
                    '<strong>Destí:</strong> ' + (bus.destination || 'Desconegut') + '<br>' +
                    '<strong>Parada:</strong> ' + (bus.stopName || 'Desconeguda') + ' (' + (bus.stopCode || '') + ')<br>' +
                    '<strong>Temps d\'arribada:</strong> ' + arrivalText + '<br>' +
                    '<strong>Estat:</strong> ' + bus.status + '<br>' +
                    '<strong>Posició:</strong> ' + bus.lat.toFixed(4) + ', ' + bus.lng.toFixed(4) +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                    '🕒 Actualitzat: ' + new Date().toLocaleTimeString('ca-ES') +
                    '</div>' +
                    '</div>'
                );

                // Add marker to map
                marker.addTo(map);
                tmbRealtimeBusMarkers.push(marker);
                totalTMBBuses++;

                console.log('✅ ADDED TMB BUS MARKER:', routeName, bus.id, 'at', bus.lat, bus.lng);
            } else {
                console.warn('❌ INVALID COORDS for TMB bus:', bus.id, bus.lat, bus.lng);
            }
        });
    });

    console.log('🎯 TOTAL TMB BUS MARKERS CREATED:', totalTMBBuses);

    // Create a legend for the routes
    if (totalTMBBuses > 0) {
        createTMBBusLegend(tmbBusesByRoute, tmbRouteInfo);
    }

    // Update status without zooming
    updateTMBRealtimeStatus('🚌 Mostrant ' + totalTMBBuses + ' autobusos TMB (' + Object.keys(tmbBusesByRoute).length + ' línies)');

    console.log('🎉 TMB BUS DISPLAY COMPLETED SUCCESSFULLY!');
}

// Create a legend showing TMB bus routes and their colors, grouped by type
function createTMBBusLegend(tmbBusesByRoute, tmbRouteColors) {
    // Remove existing legend if any
    var existingLegend = document.getElementById('tmb-bus-legend');
    if (existingLegend) {
        existingLegend.remove();
    }

    // Create legend container
    var legend = document.createElement('div');
    legend.id = 'tmb-bus-legend';
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
        max-height: 450px;
        overflow-y: auto;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;

    legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; color: #c41e3a;">🚌 Línies TMB per Tipus</div>';

    // Group routes by type - TMB service types
    var services = {
        'Metro': [],
        'Bus': [],
        'Aerobus': [],
        'Nitbus': [],
        'Unknown': []
    };

    // Group routes by service type
    Object.keys(tmbBusesByRoute).forEach(function(routeId) {
        var routeData = tmbRouteColors[routeId];
        var serviceType = routeData ? routeData.type : 'Unknown';
        if (!services[serviceType]) {
            services[serviceType] = [];
        }
        services[serviceType].push(routeId);
    });

    // Display services in order
    var serviceOrder = ['Metro', 'Bus', 'Aerobus', 'Nitbus', 'Unknown'];

    serviceOrder.forEach(function(serviceName) {
        var serviceRoutes = services[serviceName];
        if (!serviceRoutes || serviceRoutes.length === 0) return;

        // Add service header
        var serviceHeader = document.createElement('div');
        serviceHeader.style.cssText = `
            font-weight: bold;
            margin: 8px 0 4px 0;
            padding: 4px 8px;
            background: #fff0f0;
            border-radius: 3px;
            color: #c41e3a;
            font-size: 11px;
        `;
        serviceHeader.textContent = serviceName;
        legend.appendChild(serviceHeader);

        // Add routes for this service
        serviceRoutes.forEach(function(routeId) {
            var count = tmbBusesByRoute[routeId].length;
            var routeData = tmbRouteColors[routeId];
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
        color: #c41e3a;
    `;
    closeBtn.onclick = function() {
        legend.remove();
    };
    legend.appendChild(closeBtn);

    // Add to map container
    document.getElementById('map').appendChild(legend);
}

// TMB Manual data entry functions
function openTMBJson() {
    // Open TMB iBus API documentation or a sample endpoint
    window.open('https://developer.tmb.cat/api-docs/v1/ibus', '_blank');
}

function showTMBDataEntry() {
    var entryDiv = document.getElementById('tmb-manual-data-entry');
    if (entryDiv) {
        entryDiv.style.display = entryDiv.style.display === 'none' ? 'block' : 'none';
    }
}

function processTMBManualJsonData() {
    var jsonTextarea = document.getElementById('tmb-manual-json-data');
    if (!jsonTextarea || !jsonTextarea.value.trim()) {
        alert('Si us plau, enganxa les dades JSON de TMB primer.');
        return;
    }

    try {
        var jsonData = JSON.parse(jsonTextarea.value.trim());
        console.log('Processing manual TMB JSON data...');

        // Process TMB iBus API format
        var buses = [];

        if (jsonData && jsonData.data && jsonData.data.nearstops) {
            jsonData.data.nearstops.forEach(function(stop) {
                if (stop.buses && Array.isArray(stop.buses)) {
                    stop.buses.forEach(function(bus, index) {
                        var lat = stop.lat;
                        var lng = stop.lon;
                        var routeId = bus.line || 'Unknown';
                        var busId = bus.bus || index.toString();

                        if (typeof lat === 'number' && typeof lng === 'number' &&
                            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {

                            buses.push({
                                id: busId + '-' + stop.code,
                                label: routeId + ' → ' + (bus.destination || ''),
                                lat: lat,
                                lng: lng,
                                route: routeId,
                                destination: bus.destination || '',
                                stopName: stop.street_name || '',
                                stopCode: stop.code || '',
                                timeToArrival: bus['t-in-min'] || bus['t-in-s'] || 0,
                                status: 'At stop',
                                timestamp: new Date().getTime()
                            });
                        }
                    });
                }
            });
        }

        if (buses.length > 0) {
            console.log('✅ Successfully processed', buses.length, 'TMB buses from manual data!');
            displayTMBRealtimeBuses(buses);

            // Clear the textarea
            jsonTextarea.value = '';

            // Hide the manual entry form
            showTMBDataEntry();

            alert('Dades processades! Veus ' + buses.length + ' autobusos TMB reals al mapa.');
        } else {
            alert('No s\'han trobat dades d\'autobusos vàlides en el JSON. Comprova que has copiat les dades correctes.');
        }
    } catch (error) {
        console.error('Error processing manual TMB JSON data:', error);
        alert('Error processant les dades JSON. Comprova que el format és correcte.');
    }
}

// Helper functions for TMB manual data entry
function copyTMBUrl() {
    var tmbUrl = 'https://api.tmb.cat/v1/ibus/stops/nearby?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1&radius=1000';
    console.log('Copying TMB URL:', tmbUrl);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tmbUrl).then(function() {
            console.log('✅ TMB URL copied using modern clipboard API');
            alert('✅ URL de TMB copiada al porta-retalls!\n\n' + tmbUrl);
        }).catch(function(err) {
            console.warn('Modern clipboard API failed, trying fallback:', err);
            fallbackTMBCopy(tmbUrl, 'URL de TMB');
        });
    } else {
        console.log('Modern clipboard API not available, using fallback');
        fallbackTMBCopy(tmbUrl, 'URL de TMB');
    }
}

function fallbackTMBCopy(text, description) {
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

function shareTMBMapUrl() {
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

function copyTMBInstructions() {
    var instructions = "PASSOS PER COPIAR LES DADES TMB:\n\n";
    instructions += "1. Ves a la pestanya TMB que s'ha obert\n";
    instructions += "2. Prem Ctrl+A (seleccionar tot)\n";
    instructions += "3. Prem Ctrl+C (copiar)\n";
    instructions += "4. Torna aquí i prem Ctrl+V (enganxar)\n";
    instructions += "5. Clica 'Processar Dades Reals'\n\n";
    instructions += "URL: https://api.tmb.cat/v1/ibus/stops/nearby?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1&radius=1000";

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

function clearTMBTextarea() {
    var jsonTextarea = document.getElementById('tmb-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = '';
        updateTMBJsonStatus('Textarea netejat. Preparat per enganxar dades.');
    }
}

function testTMBsampleData() {
    // Sample TMB iBus API data for testing
    var sampleData = {
        "status": "success",
        "data": {
            "nearstops": [
                {
                    "code": "1234",
                    "street_name": "Carrer de la Mercè",
                    "lat": 41.3805,
                    "lon": 2.1754,
                    "buses": [
                        {
                            "line": "59",
                            "bus": "1234",
                            "destination": "Pl. Catalunya",
                            "t-in-min": 3,
                            "t-in-s": 180
                        },
                        {
                            "line": "91",
                            "bus": "5678",
                            "destination": "Metropolis",
                            "t-in-min": 7,
                            "t-in-s": 420
                        }
                    ]
                },
                {
                    "code": "5678",
                    "street_name": "La Rambla",
                    "lat": 41.3788,
                    "lon": 2.1734,
                    "buses": [
                        {
                            "line": "14",
                            "bus": "9012",
                            "destination": "Pg. Colom",
                            "t-in-min": 2,
                            "t-in-s": 120
                        }
                    ]
                }
            ]
        }
    };

    var jsonTextarea = document.getElementById('tmb-manual-json-data');
    if (jsonTextarea) {
        jsonTextarea.value = JSON.stringify(sampleData, null, 2);
        updateTMBJsonStatus('Dades d\'exemple carregades. Clica "Processar Dades Reals" per veure autobusos TMB.');
    }
}

function updateTMBJsonStatus(status) {
    var statusElement = document.getElementById('tmb-json-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Toggle TMB bus legend visibility
function toggleTMBBusLegend() {
    var legend = document.getElementById('tmb-bus-legend');
    var legendBtn = document.getElementById('tmb-legend-btn');

    if (!legend) {
        // Legend doesn't exist, create it and show
        if (tmbRealtimeBusMarkers.length > 0) {
            createTMBBusLegend(tmbBusesByRoute, tmbRouteInfo);
            legendBtn.textContent = '🎨 Ocultar Llegenda';
        } else {
            alert('No hi ha autobusos al mapa. Inicia la visualització d\'autobusos TMB primer.');
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
function fetchRealtimeTMBBusesFallback() {
    var corsProxies = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ];

    var tmbUrl = 'https://api.tmb.cat/v1/itransit/bus/parades/108?app_id=8029906b&app_key=73b5ad24d1db9fa24988bf134a1523d1';

    function tryNextProxy(proxyIndex) {
        if (proxyIndex >= corsProxies.length) {
            console.warn('All CORS proxies failed for TMB - using manual fallback');
            alert('🚌 Unable to load real TMB bus data.\n\nLocal proxy server may not be running, and all external CORS proxies failed.\n\nPlease:\n1. Ensure the Node.js server is running (npm start)\n2. Or use the manual data entry option below.');
            return Promise.resolve([]);
        }

        var proxy = corsProxies[proxyIndex];
        var fullUrl = proxy + tmbUrl;

        console.log('🔄 Trying CORS proxy', proxyIndex + 1, 'of', corsProxies.length, 'for TMB:', proxy);

        return fetch(fullUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Proxy failed: ' + response.status);
                }
                return response.json();
            })
            .then(jsonData => {
                console.log('✅ CORS proxy', proxy, 'succeeded! Processing real TMB data...');

                var buses = [];

                // Process TMB iBus API response (same as main function)
                if (jsonData && jsonData.data && jsonData.data.nearstops) {
                    jsonData.data.nearstops.forEach(function(stop) {
                        if (stop.buses && Array.isArray(stop.buses)) {
                            stop.buses.forEach(function(bus, index) {
                                try {
                                    var lat = stop.lat;
                                    var lng = stop.lon;
                                    var routeId = bus.line || 'Unknown';
                                    var busId = bus.bus || index.toString();
                                    var destination = bus.destination || '';
                                    var timeArrival = bus['t-in-min'] || bus['t-in-s'] || 0;

                                    if (typeof lat === 'number' && typeof lng === 'number' &&
                                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
                                        lat !== 0 && lng !== 0) {

                                        buses.push({
                                            id: busId + '-' + stop.code,
                                            label: routeId + ' → ' + destination,
                                            lat: lat,
                                            lng: lng,
                                            route: routeId,
                                            destination: destination,
                                            stopName: stop.street_name || '',
                                            stopCode: stop.code || '',
                                            timeToArrival: timeArrival,
                                            status: 'At stop',
                                            timestamp: new Date().getTime()
                                        });
                                    }
                                } catch (error) {
                                    console.warn('Error processing TMB bus at stop', stop.code, ':', error, bus);
                                }
                            });
                        }
                    });
                }

                if (buses.length > 0) {
                    console.log('🚌 SUCCESS: Displaying', buses.length, 'REAL TMB buses via CORS proxy!');
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

// Make TMB functions globally accessible
window.startRealtimeTMBBuses = startRealtimeTMBBuses;
window.stopRealtimeTMBBuses = stopRealtimeTMBBuses;
window.openTMBJson = openTMBJson;
window.showTMBDataEntry = showTMBDataEntry;
window.processTMBManualJsonData = processTMBManualJsonData;
window.toggleTMBBusLegend = toggleTMBBusLegend;

// end of file
