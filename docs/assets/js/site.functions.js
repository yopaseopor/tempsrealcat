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
    if (spinner == 0) {
        $('#spinner').hide();
        // Query completed
        onPoiQueryComplete();
    }

    for(i=0; i < data.elements.length; i++) {
        e = data.elements[i];

        if (e.id in this.instance._ids) return;
        this.instance._ids[e.id] = true;

        var pos = (e.type == 'node') ?
            new L.LatLng(e.lat, e.lon) :
            new L.LatLng(e.center.lat, e.center.lon);

        var poi = get_poi(e)
        // skip this undefined icon
        if (!poi) {
            console.info('Skipping undefined icon: "' + type + '"');
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

    // Remove existing OverPassLayer instances to prevent duplicates
    if (currentOverPassLayer && typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.removeLayer === 'function') {
        try {
            iconLayer.removeLayer(currentOverPassLayer);
            currentOverPassLayer = null;
        } catch (err) {
            console.warn('Error removing existing OverPassLayer:', err);
        }
    }

    try {
        var opl = new L.OverPassLayer({
            query: query,
            callback: callback,
            minzoom: 10,
            autoQuery: false // Disable auto-querying on map move
        });

        if (typeof iconLayer !== 'undefined' && iconLayer && typeof iconLayer.addLayer === 'function') {
            iconLayer.addLayer(opl);
            currentOverPassLayer = opl; // Store reference for cancellation
            // Reset query time to allow immediate manual query
            opl._lastQueryTime = 0;
            // Manually trigger the query
            opl.onMoveEnd();
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

// Update the query completion handler to reset state
function onPoiQueryComplete() {
    isQueryRunning = false;
    updateQueryButton();
    $('#spinner').hide();
    if (window.queryTimeout) {
        clearTimeout(window.queryTimeout);
        window.queryTimeout = null;
    }
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

    // Detect deployment environment for API calls
    var hostname = window.location.hostname;
    var isGitHubPages = hostname.includes('github.io');
    var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

    // Function to get API URL based on environment
    function getApiUrl(endpoint) {
        if (isVercel) {
            return endpoint;
        } else if (isGitHubPages) {
            return 'https://openlocalmap2.vercel.app' + endpoint;
        } else {
            return endpoint;
        }
    }

    // Fetch datasets from Mobility Database API via Vercel proxy
    fetch(getApiUrl('/api/gtfs-datasets?limit=10'))
        .then(response => {
            if (!response.ok) {
                throw new Error('API request failed: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            gtfsDatasets = data || [];
            displayGtfsDatasets(gtfsDatasets);
        })
        .catch(error => {
            console.error('Error loading GTFS datasets:', error);
            $('#gtfs-dataset-list').html('<div style="color: red; padding: 10px;">Error carregant dades GTFS. L\'API pot requerir autenticació o tenir límits de consulta.<br><small>' + error.message + '</small></div>');
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

    // Filter local datasets or fetch from API with search
    if (gtfsDatasets.length > 0) {
        // Filter existing datasets
        var filtered = gtfsDatasets.filter(function(dataset) {
            var searchableText = [
                dataset.provider_name || '',
                dataset.name || '',
                dataset.location.country || '',
                dataset.location.subdivision_name || '',
                dataset.location.municipality || ''
            ].join(' ').toLowerCase();

            return searchableText.includes(searchTerm);
        });

        displayGtfsDatasets(filtered);
        hideGtfsLoading();
    } else {
        // Fetch and filter via Vercel proxy (smaller limit to avoid size issues)
        fetch(getApiUrl('/api/gtfs-datasets?limit=10'))
            .then(response => {
                if (!response.ok) {
                    throw new Error('API request failed: ' + response.status);
                }
                return response.json();
            })
            .then(data => {
                gtfsDatasets = data || [];
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
            })
            .catch(error => {
                console.error('Error searching GTFS datasets:', error);
                $('#gtfs-dataset-list').html('<div style="color: red; padding: 10px;">Error en la cerca. Torna-ho a intentar.</div>');
            })
            .finally(() => {
                hideGtfsLoading();
            });
    }
}

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

        html += '<div class="gtfs-dataset-item" style="border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 10px; cursor: pointer; transition: background-color 0.2s;" onclick="selectGtfsDataset(' + dataset.id + ')">';
        html += '<h4 style="margin: 0 0 8px 0; color: #007acc;">' + (dataset.name || 'Sense nom') + '</h4>';
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

    // Update details view
    $('#gtfs-dataset-title').text(currentGtfsDataset.name || 'Sense nom');
    $('#gtfs-provider').text(currentGtfsDataset.provider_name || 'Desconegut');
    $('#gtfs-country').text(currentGtfsDataset.location?.country || 'N/A');
    $('#gtfs-location').text(formatGtfsLocation(currentGtfsDataset.location));
    $('#gtfs-last-updated').text(currentGtfsDataset.latest_dataset?.downloaded_at ?
        new Date(currentGtfsDataset.latest_dataset.downloaded_at).toLocaleDateString() : 'N/A');

    var description = currentGtfsDataset.description || 'Sense descripció disponible.';
    $('#gtfs-description').text(description);

    // Show details, hide list
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

    $('#gtfs-content-title').text('Rutes disponibles');
    $('#gtfs-content-list').html('<div style="text-align: center; padding: 20px;">Carregant rutes...</div>');
    $('#gtfs-details').hide();
    $('#gtfs-content').show();

    // For demo purposes, we'll show a message about routes
    // In a real implementation, you would fetch route data from the GTFS dataset
    var html = '<div style="padding: 20px; text-align: center;">';
    html += '<h4>Informació de rutes</h4>';
    html += '<p>Les rutes del conjunt de dades GTFS seleccionat inclouen:</p>';
    html += '<ul style="text-align: left; display: inline-block;">';
    html += '<li>Autobusos urbans i interurbans</li>';
    html += '<li>Línies de metro i tramvia</li>';
    html += '<li>Serveis especials i nocturns</li>';
    html += '<li>Informació d\'horaris i freqüències</li>';
    html += '</ul>';
    html += '<p style="margin-top: 20px;"><em>Per accedir a les dades completes, descarrega el fitxer GTFS.</em></p>';
    html += '</div>';

    $('#gtfs-content-list').html(html);
}

function exploreGtfsStops() {
    if (!currentGtfsDataset) return;

    $('#gtfs-content-title').text('Parades disponibles');
    $('#gtfs-content-list').html('<div style="text-align: center; padding: 20px;">Carregant parades...</div>');
    $('#gtfs-details').hide();
    $('#gtfs-content').show();

    // For demo purposes, we'll show a message about stops
    var html = '<div style="padding: 20px; text-align: center;">';
    html += '<h4>Informació de parades</h4>';
    html += '<p>Les parades del conjunt de dades GTFS inclouen:</p>';
    html += '<ul style="text-align: left; display: inline-block;">';
    html += '<li>Coordenades GPS precises</li>';
    html += '<li>Noms i identificadors de parades</li>';
    html += '<li>Informació d\'accessibilitat</li>';
    html += '<li>Tipus de parada (bus, metro, etc.)</li>';
    html += '</ul>';
    html += '<p style="margin-top: 20px;"><em>Per visualitzar les parades al mapa, descarrega el fitxer GTFS i utilitza eines especialitzades.</em></p>';
    html += '</div>';

    $('#gtfs-content-list').html(html);
}

function downloadGtfsData() {
    if (!currentGtfsDataset || !currentGtfsDataset.latest_dataset) {
        alert('No hi ha dades disponibles per descarregar.');
        return;
    }

    var downloadUrl = currentGtfsDataset.latest_dataset.downloaded_at ?
        'https://api.mobilitydatabase.org/v1/datasets/' + currentGtfsDataset.id + '/download' :
        null;

    if (downloadUrl) {
        window.open(downloadUrl, '_blank');
    } else {
        alert('URL de descàrrega no disponible.');
    }
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

// Make GTFS functions globally accessible
window.loadAllGtfsDatasets = loadAllGtfsDatasets;
window.searchGtfsDatasets = searchGtfsDatasets;
window.selectGtfsDataset = selectGtfsDataset;
window.exploreGtfsRoutes = exploreGtfsRoutes;
window.exploreGtfsStops = exploreGtfsStops;
window.downloadGtfsData = downloadGtfsData;
window.backToGtfsDetails = backToGtfsDetails;
