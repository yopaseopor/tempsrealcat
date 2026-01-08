// Global variables
var currentSelectedRoute = null;
var routesCache = {}; // Cache for routes data
var currentRoutesData = { walking: [], biking: [], public_transport: [] }; // Store current routes
var routeLayer = null; // Layer to display route geometry on map
var activeRoutes = {}; // Store which routes are currently displayed on map
var routeCheckboxes = {}; // Store checkbox states for routes

// Function to initialize routes for current location
function initializeRoutes() {
    // Check if a location has been selected
    if (typeof baseLocation === 'undefined' || !baseLocation.name) {
        // No location selected - hide routes completely
        document.getElementById('routes-title').textContent = getTranslation('routes_title');
        document.getElementById('routes-content').innerHTML = '';
        return;
    }

    var locationName = baseLocation.name;
    var locationBounds = baseLocation.bounds;

    // Update title
    document.getElementById('routes-title').textContent = getTranslation('routes_title_dynamic').replace('{location}', locationName);

    // Update route type buttons with current translations
    var walkingBtn = document.querySelector('.route-type-btn.fa.fa-walking');
    var bikingBtn = document.querySelector('.route-type-btn.fa.fa-bicycle');

    if (walkingBtn) {
        walkingBtn.innerHTML = '<i class="fa fa-walking"></i> ' + getTranslation('routes_walking_title_short');
    }
    if (bikingBtn) {
        bikingBtn.innerHTML = '<i class="fa fa-bicycle"></i> ' + getTranslation('routes_biking_title_short');
    }

    // Load routes from Overpass API
    loadRoutesFromOverpass(locationBounds);
}

// Function to load routes from Overpass API
function loadRoutesFromOverpass(bounds) {
    // Show loading message
    document.getElementById('routes-content').innerHTML = '<p><i class="fa fa-spinner fa-spin"></i> ' + getTranslation('routes_loading') + '</p>';

    // If no bounds available, use default area around Vilanova i la Geltrú
    if (!bounds) {
        bounds = L.latLngBounds([41.2, 1.7], [41.25, 1.75]);
    }

    // Build Overpass query for different route types
    var bbox = bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast();

    // Debug: Log the bounds being used
    console.log('Querying routes for bounds:', bbox);

    // More comprehensive queries - use correct Overpass bbox syntax
    // Query for walking routes (hiking relations, foot paths, and any paths)
    var walkingQuery = '[out:json][timeout:30];' +
        '(relation(' + bbox + ')[type=route][route=hiking];' +
        'relation(' + bbox + ')[type=route][route=foot];' +
        'way(' + bbox + ')[highway=path];' +
        'way(' + bbox + ')[highway=footway];' +
        'way(' + bbox + ')[highway=track][tracktype=grade1];' +
        'way(' + bbox + ')[highway=steps];);' +
        'out tags;';

    // Query for cycling routes - more comprehensive
    var bikingQuery = '[out:json][timeout:30];' +
        '(relation(' + bbox + ')[type=route][route=bicycle];' +
        'relation(' + bbox + ')[type=route][route=mtb];' +
        'way(' + bbox + ')[highway=cycleway];' +
        'way(' + bbox + ')[cycleway];' +
        'way(' + bbox + ')[highway=path][bicycle=yes];);' +
        'out tags;';

    // Query for public transport routes - more comprehensive
    var transportQuery = '[out:json][timeout:30];' +
        '(relation(' + bbox + ')[type=route][route=bus];' +
        'relation(' + bbox + ')[type=route][route=tram];' +
        'relation(' + bbox + ')[type=route][route=subway];' +
        'relation(' + bbox + ')[type=route][route=train];' +
        'relation(' + bbox + ')[type=route][route=light_rail];);' +
        'out tags;';

    // Execute queries
    Promise.all([
        fetchOverpassData(walkingQuery),
        fetchOverpassData(bikingQuery),
        fetchOverpassData(transportQuery)
    ]).then(function(results) {
        var walkingRoutes = processWalkingRoutes(results[0]);
        var bikingRoutes = processBikingRoutes(results[1]);
        var transportRoutes = processTransportRoutes(results[2]);

        console.log('Routes found:', {
            walking: walkingRoutes.length,
            biking: bikingRoutes.length,
            transport: transportRoutes.length
        });

        // If no routes found, try expanding the search area
        if (walkingRoutes.length === 0 && bikingRoutes.length === 0 && transportRoutes.length === 0) {
            console.log('No routes found, trying expanded search...');
            // Expand bounds by 2x
            var expandedBounds = L.latLngBounds([
                [bounds.getSouth() - (bounds.getNorth() - bounds.getSouth()) * 0.5],
                [bounds.getWest() - (bounds.getEast() - bounds.getWest()) * 0.5]
            ], [
                [bounds.getNorth() + (bounds.getNorth() - bounds.getSouth()) * 0.5],
                [bounds.getEast() + (bounds.getEast() - bounds.getWest()) * 0.5]
            ]);

            loadRoutesFromOverpassExpanded(expandedBounds);
        } else {
            displayRoutes(walkingRoutes, bikingRoutes, transportRoutes);
        }
    }).catch(function(error) {
        console.error('Error loading routes:', error);

        // Handle specific Overpass API errors
        var errorMessage = '<p>Error carregant les rutes. ';

        if (error.message && error.message.includes('504')) {
            errorMessage += 'El servidor d\'OpenStreetMap està sobrecarregat. Proveu-ho més tard o amb una zona més petita.</p>';
        } else if (error.message && error.message.includes('429')) {
            errorMessage += 'Massa consultes. Espereu uns minuts abans de tornar-ho a intentar.</p>';
        } else {
            errorMessage += 'Torneu-ho a intentar.</p>';
        }

        errorMessage += '<p><button onclick="reloadRoutes()" style="background:#2a2a2a; color:white; padding:5px 10px; border:none; border-radius:3px; cursor:pointer;">Reintentar</button></p>';

        document.getElementById('routes-content').innerHTML = errorMessage;
    });
}

// Function to load routes with expanded search area
function loadRoutesFromOverpassExpanded(bounds) {
    console.log('Trying expanded search with bounds:', bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast());

    // Build expanded queries
    var bbox = bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast();

    // More inclusive queries for expanded search
    var walkingQuery = '[out:json][timeout:40];' +
        '(way(' + bbox + ')[highway=path];' +
        'way(' + bbox + ')[highway=footway];' +
        'way(' + bbox + ')[highway=track];' +
        'way(' + bbox + ')[highway=steps];);' +
        'out tags;';

    var bikingQuery = '[out:json][timeout:40];' +
        '(way(' + bbox + ')[highway=cycleway];' +
        'way(' + bbox + ')[cycleway];' +
        'way(' + bbox + ')[highway=path][bicycle=yes];);' +
        'out tags;';

    var transportQuery = '[out:json][timeout:40];' +
        '(node(' + bbox + ')[highway=bus_stop];' +
        'node(' + bbox + ')[public_transport=stop_position];);' +
        'out tags;';

    // Execute expanded queries
    Promise.all([
        fetchOverpassData(walkingQuery),
        fetchOverpassData(bikingQuery),
        fetchOverpassData(transportQuery)
    ]).then(function(results) {
        var walkingRoutes = processWalkingRoutes(results[0]);
        var bikingRoutes = processBikingRoutes(results[1]);
        var transportStops = processTransportStops(results[2]);

        console.log('Expanded search results:', {
            walking: walkingRoutes.length,
            biking: bikingRoutes.length,
            stops: transportStops.length
        });

        // Create mock transport routes from stops
        var transportRoutes = createTransportRoutesFromStops(transportStops);

        displayRoutes(walkingRoutes, bikingRoutes, transportRoutes);
    }).catch(function(error) {
        console.error('Error in expanded search:', error);
        displayRoutes([], [], []);
    });
}

// Function to process transport stops (for expanded search)
function processTransportStops(data) {
    var stops = [];

    if (data && data.elements) {
        data.elements.forEach(function(element) {
            if (element.type === 'node') {
            stops.push({
                name: getLocalizedName(element.tags) || getTranslation('routes_stop_generic'),
                lat: element.lat,
                lon: element.lon,
                tags: element.tags
            });
            }
        });
    }

    return stops;
}

// Function to create transport routes from stops (for expanded search)
function createTransportRoutesFromStops(stops) {
    // Group stops by potential routes (this is a simplified approach)
    var routes = [];

    if (stops.length > 0) {
        // Create a generic bus route for the area
        routes.push({
            id: 'generated_bus_route',
            name: getTranslation('routes_bus_lines_local'),
            description: getTranslation('routes_bus_stops_local_desc'),
            frequency: 'Variable',
            type: 'public_transport',
            route_type: 'bus',
            osm_id: 'generated',
            osm_type: 'generated',
            stops: stops
        });
    }

    return routes;
}

// Function to fetch data from Overpass API
function fetchOverpassData(query) {
    console.log('Sending Overpass query:', query);

    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                console.log('Overpass response status:', xhr.status);
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Overpass response data:', data);
                        resolve(data);
                    } catch (e) {
                        console.error('JSON parse error:', e);
                        reject(e);
                    }
                } else {
                    console.error('Overpass error response:', xhr.responseText);
                    reject(new Error('HTTP ' + xhr.status + ': ' + xhr.responseText));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(query));
    });
}

// Process walking routes from Overpass response
function processWalkingRoutes(data) {
    var routes = [];

    if (data && data.elements) {
        // First, collect named routes (relations)
        var namedRoutes = data.elements.filter(function(element) {
            return element.type === 'relation' && (element.tags.name || element.tags.ref);
        });

        // If we have named routes, use them
        if (namedRoutes.length > 0) {
            namedRoutes.forEach(function(element) {
                var route = {
                    id: 'relation_' + element.id,
                    name: getLocalizedName(element.tags) || element.tags.ref || getTranslation('routes_type_walking'),
                    description: element.tags.description || '',
                    distance: element.tags.distance || 'N/A',
                    elevation: element.tags.ele || '',
                    difficulty: element.tags.difficulty || '',
                    duration: element.tags.duration || '',
                    type: 'walking',
                    osm_id: element.id,
                    osm_type: element.type,
                    tags: element.tags // Store tags for color access
                };
                routes.push(route);
            });
        } else {
            // If no named routes, create a synthetic route from all found paths
            var pathCount = data.elements.filter(function(element) {
                return element.type === 'way';
            }).length;

            if (pathCount > 0) {
                routes.push({
                    id: 'walking_paths_synthetic',
                    name: getTranslation('routes_walking_synthetic'),
                    description: getTranslation('routes_walking_synthetic_desc'),
                    distance: 'Variable',
                    elevation: 'Variable',
                    difficulty: 'Variable',
                    duration: 'Variable',
                    type: 'walking',
                    osm_id: 'synthetic',
                    osm_type: 'synthetic',
                    tags: {} // Empty tags for synthetic routes
                });
            }
        }
    }

    return routes;
}

// Process biking routes from Overpass response
function processBikingRoutes(data) {
    var routes = [];

    if (data && data.elements) {
        // First, collect named routes (relations)
        var namedRoutes = data.elements.filter(function(element) {
            return element.type === 'relation' && (element.tags.name || element.tags.ref);
        });

        // If we have named routes, use them
        if (namedRoutes.length > 0) {
            namedRoutes.forEach(function(element) {
                var route = {
                    id: 'relation_' + element.id,
                    name: getLocalizedName(element.tags) || element.tags.ref || getTranslation('routes_type_biking'),
                    description: element.tags.description || '',
                    distance: element.tags.distance || 'N/A',
                    elevation: element.tags.ele || '',
                    difficulty: element.tags.difficulty || '',
                    duration: element.tags.duration || '',
                    type: 'biking',
                    osm_id: element.id,
                    osm_type: element.type,
                    tags: element.tags // Store tags for color access
                };
                routes.push(route);
            });
        } else {
            // If no named routes, create a synthetic route from all found cycling paths
            var pathCount = data.elements.filter(function(element) {
                return element.type === 'way';
            }).length;

            if (pathCount > 0) {
                routes.push({
                    id: 'cycling_paths_synthetic',
                    name: getTranslation('routes_biking_synthetic'),
                    description: getTranslation('routes_biking_synthetic_desc'),
                    distance: 'Variable',
                    elevation: 'Variable',
                    difficulty: 'Variable',
                    duration: 'Variable',
                    type: 'biking',
                    osm_id: 'synthetic',
                    osm_type: 'synthetic',
                    tags: {} // Empty tags for synthetic routes
                });
            }
        }
    }

    return routes;
}

// Process public transport routes from Overpass response
function processTransportRoutes(data) {
    var routes = [];

    if (data && data.elements) {
        // Process routes synchronously first
        data.elements.forEach(function(element) {
            if (element.type === 'relation') {
                var route = {
                    id: 'relation_' + element.id,
                    name: getLocalizedName(element.tags) || getTranslation('routes_unnamed_line'),
                    description: element.tags.description || '',
                    frequency: element.tags.interval || '',
                    type: 'public_transport',
                    route_type: element.tags.route,
                    osm_id: element.id,
                    osm_type: element.type,
                    from: element.tags.from || '',
                    to: element.tags.to || '',
                    stops: null, // Will be populated lazily when needed
                    tags: element.tags // Store tags for expert mode
                };

                // Add wikidata tag if present in OSM data
                if (element.tags && element.tags.wikidata) {
                    route.wikidata = element.tags.wikidata;
                }

                // Add to routes if it has a name
                if (route.name !== getTranslation('routes_unnamed_line')) {
                    routes.push(route);
                }
            }
        });

        // Don't fetch stops automatically - they will be loaded lazily when needed
        console.log('Found', routes.length, 'public transport routes - stops will be loaded on demand');
    }

    return routes;
}

// Function to fetch stops for a public transport route
function fetchRouteStops(routeId, osmId) {
    return new Promise(function(resolve, reject) {
        // Query to get the relation with its members (stops in order)
        var stopsQuery = '[out:json][timeout:20];' +
            'relation(' + osmId + ');' +
            'out;>;out;';

        console.log('Fetching ordered stops for route relation:', osmId);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Route stops response for', osmId, ':', data);

                        var stops = [];
                        var stopNodes = {};

                        if (data && data.elements) {
                            // First, collect all node elements
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    stopNodes[element.id] = element;
                                }
                            });

                            // Then find the relation and extract stops in order
                            var relation = data.elements.find(function(element) {
                                return element.type === 'relation' && element.id == osmId;
                            });

                            if (relation && relation.members) {
                                console.log('Found', relation.members.length, 'relation members');

                                relation.members.forEach(function(member, index) {
                                    if (member.type === 'node' &&
                                        (member.role === 'stop' ||
                                         member.role === 'stop_entry_only' ||
                                         member.role === 'stop_exit_only' ||
                                         member.role === 'platform' ||
                                         member.role === 'platform_entry_only' ||
                                         member.role === 'platform_exit_only')) {

                                        var node = stopNodes[member.ref];
                                        if (node) {
                                            stops.push({
                                                name: getLocalizedName(node.tags) || 'Parada ' + (index + 1),
                                                lat: node.lat,
                                                lon: node.lon,
                                                order: index + 1,
                                                role: member.role,
                                                tags: node.tags
                                            });
                                            console.log('Added stop:', index + 1, node.tags ? getLocalizedName(node.tags) : 'Unnamed');
                                        }
                                    }
                                });
                            }

                            // If no ordered stops found, fall back to old method
                            if (stops.length === 0) {
                                console.log('No ordered stops found, falling back to unordered method');
                                data.elements.forEach(function(element) {
                                    if (element.type === 'node' &&
                                        (element.tags.public_transport === 'stop_position' ||
                                         element.tags.highway === 'bus_stop' ||
                                         element.tags.railway === 'tram_stop')) {
                                        stops.push({
                                            name: getLocalizedName(element.tags) || 'Parada sense nom',
                                            lat: element.lat,
                                            lon: element.lon,
                                            tags: element.tags
                                        });
                                    }
                                });
                            }
                        }

                        console.log('Returning', stops.length, 'stops for route', osmId);
                        resolve(stops);
                    } catch (e) {
                        console.error('Error parsing route stops response:', e);
                        reject(e);
                    }
                } else {
                    console.error('HTTP error fetching route stops:', xhr.status);
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(stopsQuery));
    });
}

// Function to display routes in the interface
function displayRoutes(walkingRoutes, bikingRoutes, transportRoutes) {
    // Store routes data globally
    currentRoutesData = {
        walking: walkingRoutes || [],
        biking: bikingRoutes || [],
        public_transport: transportRoutes || []
    };

    var contentHtml = '';

    // Walking routes
    if (walkingRoutes && walkingRoutes.length > 0) {
        contentHtml += '<h3><i class="fa fa-walking"></i> ' + getTranslation('routes_walking_title_short') + ' (' + walkingRoutes.length + ')</h3>';
        contentHtml += '<div class="routes-list">';
        walkingRoutes.slice(0, 10).forEach(function(route) { // Limit to 10 routes
            contentHtml += createRouteItem(route);
        });
        contentHtml += '</div>';
    }

    // Biking routes
    if (bikingRoutes && bikingRoutes.length > 0) {
        contentHtml += '<h3><i class="fa fa-bicycle"></i> ' + getTranslation('routes_biking_title_short') + ' (' + bikingRoutes.length + ')</h3>';
        contentHtml += '<div class="routes-list">';
        bikingRoutes.slice(0, 10).forEach(function(route) {
            contentHtml += createRouteItem(route);
        });
        contentHtml += '</div>';
    }

    // Public transport
    if (transportRoutes && transportRoutes.length > 0) {
        contentHtml += '<h3><i class="fa fa-bus"></i> ' + getTranslation('routes_transport_title_short') + ' (' + transportRoutes.length + ')</h3>';
        contentHtml += '<div class="routes-list">';
        transportRoutes.slice(0, 10).forEach(function(route) {
            contentHtml += createRouteItem(route);
        });
        contentHtml += '</div>';
    }

    // If no routes available, show a helpful message
    if (contentHtml === '') {
        contentHtml = '<div class="no-routes-message">' +
            '<p><i class="fa fa-info-circle"></i> No s\'han trobat rutes etiquetades específicament per aquesta ubicació.</p>' +
            '<p>Això pot ser degut a:</p>' +
            '<ul>' +
            '<li>La zona seleccionada és massa petita</li>' +
            '<li>Les rutes no estan etiquetades correctament a OpenStreetMap</li>' +
            '<li>Les rutes existeixen però amb etiquetes diferents</li>' +
            '</ul>' +
            '<p>Proveu amb una ciutat més gran o amb més zones turístiques.</p>' +
            '</div>';
    }

    document.getElementById('routes-content').innerHTML = contentHtml;
}

// Function to create HTML for a single route item
function createRouteItem(route) {
    var iconClass = getRouteIcon(route.type, route.route_type);
    var typeName = getRouteTypeName(route.type, route.route_type);
    var isChecked = routeCheckboxes[route.id] || false;

    // Escape route ID for use in onclick attributes (JavaScript string escaping)
    var escapedRouteId = route.id.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '\\"');

    // Escape route name for safe HTML display (prevent XSS and JS injection)
    var escapedRouteName = route.name.replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&#39;');

    var html = '<div class="route-item">';
    html += '<div class="route-checkbox">';
    html += '<input type="checkbox" id="route_' + route.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleRouteDisplay(\'' + escapedRouteId + '\')">';
    html += '<label for="route_' + route.id + '"></label>';
    html += '</div>';
    html += '<div class="route-header" onclick="showRouteDetails(\'' + escapedRouteId + '\')">';
    html += '<i class="fa ' + iconClass + '"></i>';
    html += '<span class="route-name">' + escapedRouteName + '</span>';
    html += '<span class="route-type">' + typeName + '</span>';
    html += '</div>';
    html += '<div class="route-summary" onclick="showRouteDetails(\'' + escapedRouteId + '\')">';
    html += '<span class="route-distance"><i class="fa fa-route"></i> ' + (route.tags && route.tags.ref ? route.tags.ref : route.distance) + '</span>';
    if (route.elevation) {
        html += '<span class="route-elevation"><i class="fa fa-mountain"></i> ' + route.elevation + '</span>';
    }
    if (route.frequency) {
        html += '<span class="route-frequency"><i class="fa fa-clock-o"></i> ' + route.frequency + '</span>';
    }
    html += '</div>';
    html += '<div class="route-actions">';
    html += '<button class="route-details-btn" onclick="showRouteDetails(\'' + escapedRouteId + '\')">' + getTranslation('routes_details') + '</button>';
    html += '<button class="route-remove-btn" onclick="removeRoute(\'' + escapedRouteId + '\')">' + getTranslation('routes_remove') + '</button>';
    html += '</div>';
    html += '</div>';

    return html;
}

// Function to show detailed information for a selected route
function showRouteDetails(routeId) {
    var allRoutes = [...currentRoutesData.walking, ...currentRoutesData.biking, ...currentRoutesData.public_transport];
    var route = allRoutes.find(r => r.id === routeId);

    if (!route) return;

    currentSelectedRoute = route;

    // Update Wikipedia content to show route-specific information
    if (typeof updateWikipediaContent === 'function') {
        updateWikipediaContent();
    }

    // For public transport routes, always try to show stops
    if (route.type === 'public_transport') {
        document.getElementById('route-stops').style.display = 'block';
        if (route.stops && route.stops.length > 0) {
            // Show stops that were already loaded
            updateRouteStopsDisplay(route);
        } else if (route.osm_type !== 'generated') {
            // For real OSM routes, fetch stops synchronously
            document.getElementById('route-stops-list').innerHTML = '<li><i class="fa fa-spinner fa-spin"></i> Carregant parades...</li>';

            // Fetch stops synchronously (don't use async here)
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://overpass-api.de/api/interpreter', false); // Synchronous request
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

            try {
                var stopsQuery = '[out:json][timeout:20];' +
                    'relation(' + route.osm_id + ');' +
                    'out;>;out;';

                xhr.send('data=' + encodeURIComponent(stopsQuery));

                if (xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    console.log('Route stops response for', route.osm_id, ':', data);

                    var stops = [];
                    if (data && data.elements) {
                        var stopNodes = {};
                        data.elements.forEach(function(element) {
                            if (element.type === 'node') {
                                stopNodes[element.id] = element;
                            }
                        });

                        var relation = data.elements.find(function(element) {
                            return element.type === 'relation' && element.id == route.osm_id;
                        });

                        if (relation && relation.members) {
                            relation.members.forEach(function(member, index) {
                                if (member.type === 'node' &&
                                    (member.role === 'stop' ||
                                     member.role === 'stop_entry_only' ||
                                     member.role === 'stop_exit_only' ||
                                     member.role === 'platform' ||
                                     member.role === 'platform_entry_only' ||
                                     member.role === 'platform_exit_only')) {

                                    var node = stopNodes[member.ref];
                                    if (node) {
                                        stops.push({
                                            name: getLocalizedName(node.tags) || 'Parada ' + (index + 1),
                                            lat: node.lat,
                                            lon: node.lon,
                                            order: index + 1,
                                            role: member.role,
                                            tags: node.tags
                                        });
                                    }
                                }
                            });
                        }

                        // Fallback if no ordered stops found
                        if (stops.length === 0) {
                            data.elements.forEach(function(element) {
                                if (element.type === 'node' &&
                                    (element.tags.public_transport === 'stop_position' ||
                                     element.tags.highway === 'bus_stop' ||
                                     element.tags.railway === 'tram_stop')) {
                                    stops.push({
                                        name: getLocalizedName(element.tags) || 'Parada sense nom',
                                        lat: element.lat,
                                        lon: element.lon,
                                        tags: element.tags
                                    });
                                }
                            });
                        }
                    }

                    route.stops = stops;
                    console.log('Loaded', stops.length, 'stops for route:', route.name);
                    updateRouteStopsDisplay(route);
                } else {
                    console.error('HTTP error fetching stops:', xhr.status);
                    document.getElementById('route-stops-list').innerHTML = '<li>Error carregant parades</li>';
                }
            } catch (error) {
                console.error('Error loading stops:', error);
                document.getElementById('route-stops-list').innerHTML = '<li>Error carregant parades</li>';
            }
        } else {
            document.getElementById('route-stops-list').innerHTML = '<li>No hi ha parades disponibles</li>';
        }
    }

    // Update route details
    document.getElementById('route-detail-title').textContent = route.name;
    document.getElementById('route-detail-description').textContent = route.description || getTranslation('routes_no_description');

    // Update route info
    document.getElementById('route-distance').textContent = route.distance || 'N/A';
    document.getElementById('route-elevation').textContent = route.elevation || '';
    document.getElementById('route-difficulty').textContent = route.difficulty || '';
    document.getElementById('route-duration').textContent = route.duration || '';
    document.getElementById('route-frequency').textContent = route.frequency || '';
    document.getElementById('route-first-service').textContent = route.first_bus || route.first_metro || '';
    document.getElementById('route-last-service').textContent = route.last_bus || route.last_metro || '';

    // Hide/show fields based on route type
    var infoItems = document.querySelectorAll('.route-info-item');
    infoItems.forEach(function(item) {
        item.style.display = 'block';
    });

    // Hide irrelevant fields for different route types
    if (route.type === 'public_transport') {
        document.querySelector('.route-info-item:nth-child(2)').style.display = 'none'; // elevation
        document.querySelector('.route-info-item:nth-child(3)').style.display = 'none'; // difficulty
        document.querySelector('.route-info-item:nth-child(4)').style.display = 'none'; // duration
    } else {
        document.querySelector('.route-info-item:nth-child(5)').style.display = 'none'; // frequency
        document.querySelector('.route-info-item:nth-child(6)').style.display = 'none'; // first service
        document.querySelector('.route-info-item:nth-child(7)').style.display = 'none'; // last service
    }

    // Show stops if available (or loading for public transport)
    if (route.type === 'public_transport') {
        document.getElementById('route-stops').style.display = 'block';
        if (route.stops && route.stops.length > 0) {
            updateRouteStopsDisplay(route);
        }
        // Loading message is already shown above
    } else {
        document.getElementById('route-stops').style.display = 'none';
    }

    // Update show route button
    var showBtn = document.getElementById('show-route-btn');
    if (route.type === 'public_transport') {
        if (route.stops && route.stops.length > 0) {
            showBtn.textContent = getTranslation('routes_show_stops_and_route');
            showBtn.onclick = function() { showPublicTransportRoute(route); };
            showBtn.style.display = 'inline-block';
        } else {
            showBtn.textContent = getTranslation('routes_show_route_only');
            showBtn.onclick = function() { showSelectedRoute(); };
            showBtn.style.display = 'inline-block';
        }
    } else if (route.osm_type !== 'synthetic') {
        showBtn.textContent = getTranslation('routes_show_route_only');
        showBtn.onclick = function() { showSelectedRoute(); };
        showBtn.style.display = 'inline-block';
    } else {
        // Hide button for synthetic routes without geometry
        showBtn.style.display = 'none';
    }

    // Show download link for walking/biking routes
    var downloadLink = document.getElementById('route-download-link');
    if (route.type !== 'public_transport' && route.id.startsWith('track')) {
        downloadLink.innerHTML = '<a href="assets/gpx/' + route.id + '.gpx" target="_blank"><i class="fa fa-download"></i> Descarrega GPX</a>';
        downloadLink.style.display = 'block';
    } else {
        downloadLink.style.display = 'none';
    }

    // Show details, hide list
    document.getElementById('routes-content').style.display = 'none';
    document.getElementById('route-details').style.display = 'block';
}

// Function to update stops display for a route
function updateRouteStopsDisplay(route) {
    var stopsList = document.getElementById('route-stops-list');

    if (route.stops && route.stops.length > 0) {
        stopsList.innerHTML = '';
        route.stops.forEach(function(stop) {
            var li = document.createElement('li');
            li.textContent = stop.name;
            stopsList.appendChild(li);
        });
    } else {
        stopsList.innerHTML = '<li>No hi ha parades disponibles</li>';
    }
}

// Function to show public transport stops on map
function showPublicTransportStops(route) {
    if (!route.stops || route.stops.length === 0) return;

    console.log('Showing public transport stops on map for route:', route.name);
    console.log('Stops data:', route.stops);

    // Clear existing route markers (use a separate layer for route stops)
    if (typeof window.routeStopsLayer === 'undefined') {
        window.routeStopsLayer = L.layerGroup().addTo(map);
    } else {
        window.routeStopsLayer.clearLayers();
    }

    // Filter stops with valid coordinates
    var validStops = route.stops.filter(function(stop) {
        return stop && typeof stop.lat === 'number' && typeof stop.lon === 'number' && !isNaN(stop.lat) && !isNaN(stop.lon);
    });

    console.log('Valid stops found:', validStops.length);

    if (validStops.length === 0) {
        alert('No hi ha parades amb coordenades vàlides per mostrar al mapa.');
        return;
    }

    // Add markers for each valid stop
    validStops.forEach(function(stop, index) {
        console.log('Adding marker for stop:', stop.name, 'at coordinates:', [stop.lat, stop.lon]);
        var marker = L.marker([stop.lat, stop.lon]).addTo(window.routeStopsLayer);
        marker.bindPopup('<b>' + stop.name + '</b><br/>Parada de ' + route.name + '<br/>Posició: ' + (index + 1));
    });

    console.log('Added', validStops.length, 'stop markers to map');

    // Fit map to show all valid stops
    var bounds = L.latLngBounds(validStops.map(stop => [stop.lat, stop.lon]));
    if (typeof map !== 'undefined') {
        map.fitBounds(bounds, { padding: [20, 20] });
        console.log('Fitted map bounds to show all stops');
    }

    // Close sidebar
    if (typeof sidebar !== 'undefined') {
        sidebar.close();
    }
}

// Function to hide route details and show list
function hideRouteDetails() {
    document.getElementById('route-details').style.display = 'none';
    document.getElementById('routes-content').style.display = 'block';
    currentSelectedRoute = null;

    // Update Wikipedia content to return to base location information
    if (typeof updateWikipediaContent === 'function') {
        updateWikipediaContent();
    }
}

// Function to initialize route layer
function initializeRouteLayer() {
    if (!routeLayer) {
        routeLayer = L.layerGroup().addTo(map);
    }
}

// Function to fetch route geometry and display on map
function fetchAndDisplayRouteGeometry(route) {
    if (!route) return;

    // Clear existing route layer
    if (routeLayer) {
        routeLayer.clearLayers();
    }

    // For relations, fetch the geometry of all ways in the relation
    if (route.osm_type === 'relation') {
        fetchRouteGeometry(route.osm_id).then(function(geometry) {
            if (geometry && geometry.length > 0) {
                displayRouteGeometry(geometry, route);
            } else {
                console.log('No geometry found for route:', route.name);
                // Try alternative geometry fetching for relations
                fetchRouteGeometryAlternative(route.osm_id, route).then(function(geometry) {
                    if (geometry && geometry.length > 0) {
                        displayRouteGeometry(geometry, route);
                    } else {
                        alert('No s\'ha pogut carregar la geometria d\'aquesta ruta.');
                    }
                }).catch(function(error) {
                    console.error('Error in alternative geometry fetch:', error);
                    alert('Error carregant la geometria de la ruta.');
                });
            }
        }).catch(function(error) {
            console.error('Error fetching route geometry:', error);
            alert('Error carregant la geometria de la ruta.');
        });
    } else if (route.osm_type === 'way') {
        // For direct ways, fetch the way geometry
        fetchWayGeometry(route.osm_id).then(function(geometry) {
            if (geometry && geometry.length > 0) {
                displayRouteGeometry([geometry], route);
            } else {
                alert('No s\'ha pogut carregar la geometria d\'aquesta ruta.');
            }
        }).catch(function(error) {
            console.error('Error fetching way geometry:', error);
            alert('Error carregant la geometria de la ruta.');
        });
    } else {
        // For synthetic routes, try to find ways with matching tags
        if (route.type === 'walking' || route.type === 'biking') {
            fetchSyntheticRouteGeometry(route).then(function(geometry) {
                if (geometry && geometry.length > 0) {
                    displayRouteGeometry(geometry, route);
                } else {
                    alert('No s\'ha pogut carregar la geometria d\'aquesta ruta.');
                }
            }).catch(function(error) {
                console.error('Error fetching synthetic route geometry:', error);
                alert('Error carregant la geometria de la ruta.');
            });
        } else {
            alert('Aquesta ruta no té geometria disponible per mostrar al mapa.');
        }
    }
}

// Function to fetch route geometry from Overpass API
function fetchRouteGeometry(osmId) {
    return new Promise(function(resolve, reject) {
        // Get all ways that are members of the route relation with geometry
        var geometryQuery = '[out:json][timeout:30];' +
            'relation(' + osmId + ');' +
            'way(r);' +
            'out geom;';

        console.log('Fetching route geometry for relation:', osmId);
        console.log('Query:', geometryQuery);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Route geometry response for', osmId, ':', data);

                        if (data && data.elements) {
                            // Filter to get only ways (not the relation itself)
                            var ways = data.elements.filter(function(element) {
                                return element.type === 'way';
                            });

                            console.log('Found', ways.length, 'ways in route relation', osmId);

                            if (ways.length > 0) {
                                // Extract coordinates directly from the ways
                                var coordinates = [];
                                ways.forEach(function(way) {
                                    if (way.geometry && way.geometry.length > 0) {
                                        // Convert geometry to lat/lng pairs
                                        var wayCoords = way.geometry.map(function(geom) {
                                            return [geom.lat, geom.lon];
                                        });
                                        if (wayCoords.length > 1) {
                                            coordinates.push(wayCoords);
                                            console.log('Added way geometry with', wayCoords.length, 'points');
                                        }
                                    }
                                });

                                if (coordinates.length > 0) {
                                    console.log('Returning', coordinates.length, 'way geometries for route', osmId);
                                    resolve(coordinates);
                                } else {
                                    console.log('No valid coordinates found, trying alternative approach for route', osmId);
                                    // Try alternative approach for public transport routes
                                    fetchPublicTransportGeometryAlternative(osmId).then(function(altCoordinates) {
                                        resolve(altCoordinates);
                                    }).catch(function(error) {
                                        console.error('Alternative geometry fetch also failed:', error);
                                        resolve([]);
                                    });
                                }
                            } else {
                                console.log('No ways found in route relation', osmId, '- trying alternative approach');
                                // Try alternative approach for public transport routes
                                fetchPublicTransportGeometryAlternative(osmId).then(function(altCoordinates) {
                                    resolve(altCoordinates);
                                }).catch(function(error) {
                                    console.error('Alternative geometry fetch also failed:', error);
                                    resolve([]);
                                });
                            }
                        } else {
                            console.log('No elements in response for route', osmId);
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('Error parsing route geometry response:', e);
                        reject(e);
                    }
                } else {
                    console.error('HTTP error fetching route geometry:', xhr.status, xhr.responseText);
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(geometryQuery));
    });
}

// Alternative geometry fetching for public transport routes
function fetchPublicTransportGeometryAlternative(osmId) {
    return new Promise(function(resolve, reject) {
        console.log('Trying alternative geometry fetch for public transport route:', osmId);

        // First, get the stops from the relation
        var stopsQuery = '[out:json][timeout:20];' +
            'relation(' + osmId + ');' +
            'node(r);' +
            'out;';

        console.log('Fetching stops for PT route geometry:', stopsQuery);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Stops data for PT route geometry:', data);

                        if (data && data.elements) {
                            // Find the relation and its stop nodes
                            var relation = data.elements.find(function(el) {
                                return el.type === 'relation' && el.id == osmId;
                            });

                            if (relation && relation.members) {
                                var stopNodes = [];
                                data.elements.forEach(function(element) {
                                    if (element.type === 'node') {
                                        stopNodes[element.id] = element;
                                    }
                                });

                                // Collect stop coordinates in order
                                var stopCoords = [];
                                relation.members.forEach(function(member) {
                                    if (member.type === 'node' &&
                                        (member.role === 'stop' ||
                                         member.role === 'stop_entry_only' ||
                                         member.role === 'stop_exit_only' ||
                                         member.role === 'platform' ||
                                         member.role === 'platform_entry_only' ||
                                         member.role === 'platform_exit_only') &&
                                        stopNodes[member.ref]) {
                                        var node = stopNodes[member.ref];
                                        stopCoords.push([node.lat, node.lon]);
                                    }
                                });

                                console.log('Found', stopCoords.length, 'stop coordinates for route', osmId);

                                if (stopCoords.length >= 2) {
                                    // Now try to find actual transport infrastructure connecting these stops
                                    findTransportWaysBetweenStops(stopCoords).then(function(wayCoordinates) {
                                        if (wayCoordinates && wayCoordinates.length > 0) {
                                            console.log('Found actual transport ways:', wayCoordinates.length, 'segments');
                                            resolve(wayCoordinates);
                                        } else {
                                            console.log('No transport ways found, falling back to straight lines');
                                            resolve([stopCoords]);
                                        }
                                    }).catch(function(error) {
                                        console.error('Error finding transport ways:', error);
                                        console.log('Falling back to straight lines');
                                        resolve([stopCoords]);
                                    });
                                } else {
                                    console.log('Not enough stops to create route geometry');
                                    resolve([]);
                                }
                            } else {
                                console.log('No relation or members found for', osmId);
                                resolve([]);
                            }
                        } else {
                            console.log('No data elements in response for', osmId);
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('Error parsing stops data:', e);
                        reject(e);
                    }
                } else {
                    console.error('HTTP error fetching stops:', xhr.status);
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(stopsQuery));
    });
}

// Function to find actual transport ways connecting stops
function findTransportWaysBetweenStops(stopCoords) {
    return new Promise(function(resolve, reject) {
        if (!stopCoords || stopCoords.length < 2) {
            resolve([]);
            return;
        }

        console.log('Finding transport ways between', stopCoords.length, 'stops');

        // Calculate bounding box around all stops with some padding
        var lats = stopCoords.map(coord => coord[0]);
        var lons = stopCoords.map(coord => coord[1]);
        var minLat = Math.min(...lats) - 0.005; // ~500m padding
        var maxLat = Math.max(...lats) + 0.005;
        var minLon = Math.min(...lons) - 0.005;
        var maxLon = Math.max(...lons) + 0.005;

        var bbox = minLat + ',' + minLon + ',' + maxLat + ',' + maxLon;

        // Query for transport ways in the area around stops
        var waysQuery = '[out:json][timeout:25];' +
            '(way(' + bbox + ')[highway=motorway];' +
            'way(' + bbox + ')[highway=trunk];' +
            'way(' + bbox + ')[highway=primary];' +
            'way(' + bbox + ')[highway=secondary];' +
            'way(' + bbox + ')[highway=tertiary];' +
            'way(' + bbox + ')[highway=unclassified];' +
            'way(' + bbox + ')[highway=residential];' +
            'way(' + bbox + ')[railway=rail];' +
            'way(' + bbox + ')[railway=tram];' +
            'way(' + bbox + ')[railway=subway];' +
            'way(' + bbox + ')[railway=light_rail];);' +
            'node(w);' +
            'out geom;';

        console.log('Querying transport ways in bbox:', bbox);
        console.log('Ways query:', waysQuery);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Transport ways response:', data);

                        if (data && data.elements) {
                            var coordinates = [];
                            var nodes = {};

                            // Extract all nodes
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            console.log('Found', Object.keys(nodes).length, 'nodes from transport ways');

                            // Extract way coordinates
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates.push(wayCoords);
                                    }
                                }
                            });

                            console.log('Extracted', coordinates.length, 'transport way segments');
                            resolve(coordinates);
                        } else {
                            console.log('No transport ways data found');
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('Error parsing transport ways:', e);
                        reject(e);
                    }
                } else {
                    console.error('HTTP error fetching transport ways:', xhr.status);
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(waysQuery));
    });
}

// Fetch nearby ways with public transport tags
function fetchNearbyPublicTransportWays(stopCoords) {
    return new Promise(function(resolve, reject) {
        if (!stopCoords || stopCoords.length === 0) {
            resolve([]);
            return;
        }

        // Calculate center of stops
        var centerLat = 0, centerLon = 0;
        stopCoords.forEach(function(coord) {
            centerLat += coord[0];
            centerLon += coord[1];
        });
        centerLat /= stopCoords.length;
        centerLon /= stopCoords.length;

        console.log('Searching for PT ways around center:', centerLat, centerLon);

        // Search for ways with public transport tags around the center
        var nearbyQuery = '[out:json][timeout:25];' +
            'way(around:500,' + centerLat + ',' + centerLon + ')[highway];' +
            'way(around:500,' + centerLat + ',' + centerLon + ')[railway];' +
            'node(w);' +
            'out geom;';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        console.log('Nearby PT ways response:', data);

                        if (data && data.elements) {
                            var coordinates = [];

                            // Extract coordinates from nodes
                            var nodes = {};
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            // Build polylines from ways
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates.push(wayCoords);
                                    }
                                }
                            });

                            console.log('Found', coordinates.length, 'nearby transport ways');
                            resolve(coordinates);
                        } else {
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('Error parsing nearby PT ways:', e);
                        reject(e);
                    }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(nearbyQuery));
    });
}

// Function to fetch geometry for multiple ways
function fetchWaysGeometry(wayIds) {
    return new Promise(function(resolve, reject) {
        if (wayIds.length === 0) {
            resolve([]);
            return;
        }

        // Build query for all ways
        var waysQuery = '[out:json][timeout:25];';
        wayIds.forEach(function(wayId) {
            waysQuery += 'way(' + wayId + ');';
        });
        waysQuery += 'node(w);out geom;';

        console.log('Fetching geometry for ways:', wayIds.length, 'ways');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        var coordinates = [];

                        if (data && data.elements) {
                            // Extract coordinates from nodes
                            var nodes = {};
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            console.log('Found', Object.keys(nodes).length, 'nodes');

                            // Build polylines from ways
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates.push(wayCoords);
                                        console.log('Added way with', wayCoords.length, 'coordinates');
                                    }
                                }
                            });
                        }

                        console.log('Returning', coordinates.length, 'way geometries');
                        resolve(coordinates);
                    } catch (e) {
                        console.error('Error parsing ways geometry response:', e);
                        reject(e);
                    }
                } else {
                    console.error('HTTP error fetching ways geometry:', xhr.status);
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(waysQuery));
    });
}

// Alternative geometry fetching for relations that might have different structures
function fetchRouteGeometryAlternative(osmId, route) {
    return new Promise(function(resolve, reject) {
        // Try fetching ways that have route-related tags
        var routeType = route.type === 'walking' ? 'hiking' : (route.type === 'biking' ? 'bicycle' : 'bus');
        var alternativeQuery = '[out:json][timeout:25];' +
            'way(around:1000,' + baseLocation.lat + ',' + baseLocation.lng + ')[route=' + routeType + '];' +
            'way(around:1000,' + baseLocation.lat + ',' + baseLocation.lng + ')[highway=path];' +
            'way(around:1000,' + baseLocation.lat + ',' + baseLocation.lng + ')[highway=footway];' +
            'way(around:1000,' + baseLocation.lat + ',' + baseLocation.lng + ')[highway=cycleway];' +
            'node(w);' +
            'out geom;';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        var coordinates = [];

                        if (data && data.elements) {
                            // Extract coordinates from nodes
                            var nodes = {};
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            // Build polylines from ways
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates.push(wayCoords);
                                    }
                                }
                            });
                        }

                        resolve(coordinates);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(alternativeQuery));
    });
}

// Function to fetch geometry for a single way
function fetchWayGeometry(wayId) {
    return new Promise(function(resolve, reject) {
        var wayQuery = '[out:json][timeout:15];' +
            'way(' + wayId + ');' +
            'node(w);' +
            'out geom;';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        var coordinates = [];

                        if (data && data.elements) {
                            // Extract coordinates from nodes
                            var nodes = {};
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            // Build polyline from the way
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates = wayCoords;
                                    }
                                }
                            });
                        }

                        resolve(coordinates);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(wayQuery));
    });
}

// Function to fetch geometry for synthetic routes
function fetchSyntheticRouteGeometry(route) {
    return new Promise(function(resolve, reject) {
        var bounds = baseLocation.bounds;
        if (!bounds) {
            resolve([]);
            return;
        }

        var bbox = bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast();
        var syntheticQuery = '[out:json][timeout:20];';

        if (route.type === 'walking') {
            syntheticQuery += '(way(' + bbox + ')[highway=path];way(' + bbox + ')[highway=footway];);';
        } else if (route.type === 'biking') {
            syntheticQuery += '(way(' + bbox + ')[highway=cycleway];way(' + bbox + ')[cycleway];);';
        }

        syntheticQuery += 'node(w);out geom;';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://overpass-api.de/api/interpreter', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        var coordinates = [];

                        if (data && data.elements) {
                            // Extract coordinates from nodes
                            var nodes = {};
                            data.elements.forEach(function(element) {
                                if (element.type === 'node') {
                                    nodes[element.id] = [element.lat, element.lon];
                                }
                            });

                            // Build polylines from ways
                            data.elements.forEach(function(element) {
                                if (element.type === 'way' && element.nodes) {
                                    var wayCoords = [];
                                    element.nodes.forEach(function(nodeId) {
                                        if (nodes[nodeId]) {
                                            wayCoords.push(nodes[nodeId]);
                                        }
                                    });
                                    if (wayCoords.length > 1) {
                                        coordinates.push(wayCoords);
                                    }
                                }
                            });
                        }

                        resolve(coordinates);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.send('data=' + encodeURIComponent(syntheticQuery));
    });
}

// Function to display route geometry on map
function displayRouteGeometry(coordinates, route) {
    if (!routeLayer || !coordinates || coordinates.length === 0) return;

    // Clear existing route
    routeLayer.clearLayers();

    console.log('Displaying route geometry for:', route.name);
    console.log('Route tags:', route.tags);
    console.log('Route color will be:', getRouteColor(route.type, route));

    // Add polylines for each way in the route
    coordinates.forEach(function(wayCoords, index) {
        if (wayCoords.length > 1) {
            var color = getRouteColor(route.type, route);
            var polyline = L.polyline(wayCoords, {
                color: color,
                weight: 5,
                opacity: 0.8
            }).addTo(routeLayer);

            // Create popup with route information
            var popupContent = '<b>' + route.name + '</b><br/>';
            popupContent += '<small>' + getRouteTypeName(route.type) + '</small><br/>';

            if (route.tags) {
                if (route.tags.ref) {
                    popupContent += '<small>Ref: ' + route.tags.ref + '</small><br/>';
                }
                if (route.tags.colour || route.tags.color) {
                    var routeColor = route.tags.colour || route.tags.color;
                    popupContent += '<small>Color: ' + routeColor + '</small><br/>';
                }
            }

            // Add expert mode link like POIs have
            var escapedRouteId = route.id.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '\\"');
            popupContent += '<br/><a href="#" onclick="javascript: showRouteExpertInfo(\'' + escapedRouteId + '\'); return false;" data-i18n="[title]route_detailed_info">Informació al detall (expert)</a>';

            polyline.bindPopup(popupContent);
            console.log('Added polyline', index + 1, 'with', wayCoords.length, 'points and color', color);
        }
    });

    // Fit map to show the entire route
    if (coordinates.length > 0) {
        var allCoords = coordinates.flat();
        var bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [20, 20] });
    }

    console.log('Successfully displayed route geometry for:', route.name, 'with', coordinates.length, 'segments');
}

// Function to get route color based on type and OSM tags
function getRouteColor(type, route) {
    // Check if route has a specific color defined in OSM tags
    if (route && route.tags) {
        if (route.tags.colour) return route.tags.colour;
        if (route.tags.color) return route.tags.color;
    }

    // Default colors based on route type
    switch(type) {
        case 'walking': return '#FF6B35'; // Orange for walking
        case 'biking': return '#4ECDC4'; // Teal for biking
        case 'public_transport': return '#45B7D1'; // Blue for transport
        default: return '#666';
    }
}

// Function to get stop color based on transport type
function getTransportStopColor(route_type) {
    switch(route_type) {
        case 'bus': return '#FF4444'; // Red for buses
        case 'tram': return '#44FF44'; // Green for trams
        case 'subway': return '#4444FF'; // Blue for subway
        case 'train': return '#FFFF44'; // Yellow for trains
        case 'light_rail': return '#FF44FF'; // Magenta for light rail
        default: return '#45B7D1'; // Default blue
    }
}

// Function to show public transport route (stops + geometry)
function showPublicTransportRoute(route) {
    if (!route) return;

    console.log('Showing public transport route:', route.name, 'ID:', route.id);
    console.log('Route has', route.stops ? route.stops.length : 0, 'stops');

    // Initialize route layer if needed
    initializeRouteLayer();

    // Clear existing markers and routes
    if (typeof iconLayer !== 'undefined') {
        iconLayer.clearLayers();
    }
    if (routeLayer) {
        routeLayer.clearLayers();
    }

    // First show the stops
    if (route.stops && route.stops.length > 0) {
        console.log('Showing', route.stops.length, 'stops for route:', route.name);
        showPublicTransportStops(route);
    } else {
        console.log('No stops available for route:', route.name);
    }

    // For public transport routes, first try to fetch the actual route geometry like walking routes
    console.log('Fetching actual route geometry for public transport route:', route.name);
    fetchAndDisplayRouteGeometry(route).then(function(success) {
        console.log('Route geometry display completed for public transport:', route.name);
    }).catch(function(error) {
        console.error('Error displaying route geometry for public transport:', error);
        // Fallback: create straight-line geometry from stops
        if (route.stops && route.stops.length >= 2) {
            console.log('Falling back to straight-line geometry from stops');

            // Extract coordinates from stops in order
            var stopCoords = route.stops.map(function(stop) {
                return [stop.lat, stop.lon];
            });

            console.log('Stop coordinates for route:', stopCoords);

            // Display the route geometry as straight lines between stops
            displayRouteGeometry([stopCoords], route);
            console.log('Route geometry displayed as straight lines from stops');
        } else {
            console.log('No geometry available for public transport route');
        }
    });

    // Close sidebar
    if (typeof sidebar !== 'undefined') {
        sidebar.close();
    }
}

// Function to show selected route on map
function showSelectedRoute() {
    if (!currentSelectedRoute) return;

    // Initialize route layer if needed
    initializeRouteLayer();

    // For walking/biking routes, fetch and display geometry
    if (currentSelectedRoute.type !== 'public_transport') {
        fetchAndDisplayRouteGeometry(currentSelectedRoute);
    }

    // For GPX routes (fallback), load the GPX file
    if (currentSelectedRoute.type !== 'public_transport' && currentSelectedRoute.id.startsWith('track')) {
        var gpxUrl = 'assets/gpx/' + currentSelectedRoute.id + '.gpx';
        addgpx(gpxUrl);
    }

    // Close the sidebar to show the map
    if (typeof sidebar !== 'undefined') {
        sidebar.close();
    }
}

// Function to clear current route
function clearRoute() {
    cleargpx(); // Clear GPX layers
    if (routeLayer) {
        routeLayer.clearLayers(); // Clear route geometry
    }

    // Clear the selected route and update Wikipedia
    currentSelectedRoute = null;
    if (typeof updateWikipediaContent === 'function') {
        updateWikipediaContent();
    }

    if (typeof sidebar !== 'undefined') {
        sidebar.close();
    }
}

// Function to get route icon based on type
function getRouteIcon(type) {
    switch(type) {
        case 'walking': return 'fa-walking';
        case 'biking': return 'fa-bicycle';
        case 'public_transport': return 'fa-bus';
        default: return 'fa-route';
    }
}

// Function to get route type name
function getRouteTypeName(type) {
    switch(type) {
        case 'walking': return 'Ruta a peu';
        case 'biking': return 'Ruta en bicicleta';
        case 'public_transport': return 'Transport públic';
        default: return 'Ruta';
    }
}

// Function to manually reload routes
function reloadRoutes() {
    console.log('Manually reloading routes for location:', baseLocation.name);
    initializeRoutes();
}

// Function to update route button texts when language changes
function updateRouteButtonTranslations() {
    // Update main route type buttons
    var walkingBtn = document.querySelector('.route-type-btn.fa.fa-walking');
    var bikingBtn = document.querySelector('.route-type-btn.fa.fa-bicycle');

    if (walkingBtn) {
        walkingBtn.innerHTML = '<i class="fa fa-walking"></i> ' + getTranslation('routes_walking_title_short');
    }
    if (bikingBtn) {
        bikingBtn.innerHTML = '<i class="fa fa-bicycle"></i> ' + getTranslation('routes_biking_title_short');
    }

    // Update transport type buttons
    var transportButtons = document.querySelectorAll('.transport-type-btn');
    transportButtons.forEach(function(btn) {
        var icon = btn.querySelector('i');
        var textNode = btn.lastChild;

        // Skip the "Tots"/"Todos"/"All" button (it has fa fa-bus class on the button itself)
        if (btn.classList.contains('fa') && btn.classList.contains('fa-bus')) {
            btn.innerHTML = '<i class="fa fa-bus"></i> ' + getTranslation('routes_transport_all');
            return;
        }

        if (icon && textNode && textNode.nodeType === Node.TEXT_NODE) {
            var text = textNode.textContent.trim();

            // Map button text to translation keys
            var translationKey = '';
            switch(text) {
                case 'Bus':
                case 'Autobus':
                case 'Autobús':
                    translationKey = 'routes_button_bus';
                    break;
                case 'Tram':
                case 'Tranvía':
                case 'Tramvia':
                    translationKey = 'routes_button_tram';
                    break;
                case 'Metro':
                case 'Subway':
                    translationKey = 'routes_button_metro';
                    break;
                case 'Tren':
                case 'Train':
                    translationKey = 'routes_button_tren';
                    break;
                case 'Tram lleuger':
                case 'Tranvía ligero':
                case 'Light Rail':
                    translationKey = 'routes_button_tram_lleuger';
                    break;
            }

            if (translationKey) {
                textNode.textContent = ' ' + getTranslation(translationKey);
            }
        }
    });

    // Update transport header
    var transportHeader = document.querySelector('#routes h4');
    if (transportHeader) {
        transportHeader.textContent = getTranslation('routes_transport_header');
    }
}

// Global variables for pagination
var currentPage = 1;
var routesPerPage = 10;
var currentRouteType = 'all';

// Function to load walking routes manually
function loadWalkingRoutes() {
    console.log('Loading walking routes manually...');
    loadSpecificRouteType('walking');
}

// Function to load biking routes manually
function loadBikingRoutes() {
    console.log('Loading biking routes manually...');
    loadSpecificRouteType('biking');
}

// Function to load public transport routes manually
function loadPublicTransportRoutes() {
    console.log('Loading public transport routes manually...');
    loadSpecificRouteType('public_transport');
}

// Function to load specific transport routes
function loadSpecificTransportRoutes(transportType) {
    console.log('Loading specific transport routes:', transportType);

    // Check if a location has been selected
    if (typeof baseLocation === 'undefined' || !baseLocation.name) {
        alert('Seleccioneu primer una ubicació al mapa.');
        return;
    }

    var locationBounds = baseLocation.bounds;

    // Show loading message
    document.getElementById('routes-content').innerHTML = '<p><i class="fa fa-spinner fa-spin"></i> ' + getTranslation('routes_loading_transport').replace('{type}', transportType) + '</p>';

    // Build query for specific transport type
    var bbox = locationBounds.getSouth() + ',' + locationBounds.getWest() + ',' + locationBounds.getNorth() + ',' + locationBounds.getEast();

    var query;
    if (transportType === 'bus') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=bus];);' +
            'out tags;';
    } else if (transportType === 'tram') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=tram];);' +
            'out tags;';
    } else if (transportType === 'subway') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=subway];);' +
            'out tags;';
    } else if (transportType === 'train') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=train];);' +
            'out tags;';
    } else if (transportType === 'light_rail') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=light_rail];);' +
            'out tags;';
    }

    // Execute query
    fetchOverpassData(query).then(function(data) {
        var routes = processTransportRoutes(data);
        console.log('Loaded', routes.length, transportType, 'routes');

        // Filter routes by the specific transport type
        var filteredRoutes = routes.filter(function(route) {
            return route.route_type === transportType;
        });

        console.log('Filtered to', filteredRoutes.length, transportType, 'routes');

        // Update current routes data
        currentRoutesData.public_transport = filteredRoutes;
        currentRouteType = transportType;

        // Reset pagination
        currentPage = 1;

        // Display routes with pagination
        displayRoutesWithPagination(filteredRoutes, transportType);

    }).catch(function(error) {
        console.error('Error loading', transportType, 'routes:', error);

        var errorMessage = '<p>Error carregant les rutes de ' + transportType + '. ';

        if (error.message && error.message.includes('504')) {
            errorMessage += 'El servidor d\'OpenStreetMap està sobrecarregat. Proveu-ho més tard.</p>';
        } else if (error.message && error.message.includes('429')) {
            errorMessage += 'Massa consultes. Espereu uns minuts abans de tornar-ho a intentar.</p>';
        } else {
            errorMessage += 'Torneu-ho a intentar.</p>';
        }

        errorMessage += '<p><button onclick="loadSpecificTransportRoutes(\'' + transportType + '\')" style="background:#2a2a2a; color:white; padding:5px 10px; border:none; border-radius:3px; cursor:pointer;">Reintentar</button></p>';

        document.getElementById('routes-content').innerHTML = errorMessage;
    });
}

// Function to load a specific route type
function loadSpecificRouteType(routeType) {
    // Check if a location has been selected
    if (typeof baseLocation === 'undefined' || !baseLocation.name) {
        alert('Seleccioneu primer una ubicació al mapa.');
        return;
    }

    var locationBounds = baseLocation.bounds;

    // Show loading message
    document.getElementById('routes-content').innerHTML = '<p><i class="fa fa-spinner fa-spin"></i> Carregant rutes de ' + getRouteTypeName(routeType).toLowerCase() + '...</p>';

    // Build query based on route type
    var bbox = locationBounds.getSouth() + ',' + locationBounds.getWest() + ',' + locationBounds.getNorth() + ',' + bounds.getEast();

    var query;
    if (routeType === 'walking') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=hiking];' +
            'relation(' + bbox + ')[type=route][route=foot];' +
            'way(' + bbox + ')[highway=path];' +
            'way(' + bbox + ')[highway=footway];' +
            'way(' + bbox + ')[highway=track][tracktype=grade1];' +
            'way(' + bbox + ')[highway=steps];);' +
            'out tags;';
    } else if (routeType === 'biking') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=bicycle];' +
            'relation(' + bbox + ')[type=route][route=mtb];' +
            'way(' + bbox + ')[highway=cycleway];' +
            'way(' + bbox + ')[cycleway];' +
            'way(' + bbox + ')[highway=path][bicycle=yes];);' +
            'out tags;';
    } else if (routeType === 'public_transport') {
        query = '[out:json][timeout:30];' +
            '(relation(' + bbox + ')[type=route][route=bus];' +
            'relation(' + bbox + ')[type=route][route=tram];' +
            'relation(' + bbox + ')[type=route][route=subway];' +
            'relation(' + bbox + ')[type=route][route=train];' +
            'relation(' + bbox + ')[type=route][route=light_rail];);' +
            'out tags;';
    }

    // Execute query
    fetchOverpassData(query).then(function(data) {
        var routes = [];
        if (routeType === 'walking') {
            routes = processWalkingRoutes(data);
        } else if (routeType === 'biking') {
            routes = processBikingRoutes(data);
        } else if (routeType === 'public_transport') {
            routes = processTransportRoutes(data);
        }

        console.log('Loaded', routes.length, routeType, 'routes');

        // Update current routes data
        currentRoutesData[routeType] = routes;

        // Display only the requested route type
        var contentHtml = '';
        if (routes && routes.length > 0) {
            contentHtml += '<h3><i class="fa ' + getRouteIcon(routeType) + '"></i> ' + getRouteTypeName(routeType) + ' (' + routes.length + ')</h3>';
            contentHtml += '<div class="routes-list">';
            routes.slice(0, 20).forEach(function(route) {
                contentHtml += createRouteItem(route);
            });
            contentHtml += '</div>';
        } else {
            contentHtml = '<div class="no-routes-message">' +
                '<p><i class="fa fa-info-circle"></i> No s\'han trobat rutes de ' + getRouteTypeName(routeType).toLowerCase() + ' per aquesta ubicació.</p>' +
                '<p>Proveu amb una zona més gran o amb àrees turístiques.</p>' +
                '</div>';
        }

        document.getElementById('routes-content').innerHTML = contentHtml;

    }).catch(function(error) {
        console.error('Error loading', routeType, 'routes:', error);

        var errorMessage = '<p>Error carregant les rutes de ' + getRouteTypeName(routeType).toLowerCase() + '. ';

        if (error.message && error.message.includes('504')) {
            errorMessage += 'El servidor d\'OpenStreetMap està sobrecarregat. Proveu-ho més tard.</p>';
        } else if (error.message && error.message.includes('429')) {
            errorMessage += 'Massa consultes. Espereu uns minuts abans de tornar-ho a intentar.</p>';
        } else {
            errorMessage += 'Torneu-ho a intentar.</p>';
        }

        errorMessage += '<p><button onclick="load' + routeType.charAt(0).toUpperCase() + routeType.slice(1) + 'Routes()" style="background:#2a2a2a; color:white; padding:5px 10px; border:none; border-radius:3px; cursor:pointer;">Reintentar</button></p>';

        document.getElementById('routes-content').innerHTML = errorMessage;
    });
}

// Function to update routes when location changes (disabled for manual loading)
function updateRoutesForNewLocation() {
    // Automatic route loading disabled to prevent Overpass bans
    // Routes are now loaded manually via buttons
    console.log('Automatic route loading disabled - use buttons instead');
}

// Function to parse OSMC symbol format
function parseOsmcSymbol(symbol, routeRef) {
    if (!symbol || typeof symbol !== 'string') {
        return symbol;
    }

    // OSMC symbol format: background:text:text_rotation:additional_text
    // Example: yellow:white:yellow_lower:143.1:black
    // Or: white:red::0:REF (background:text::rotation:text)
    var parts = symbol.split(':');

    try {
        var backgroundColor = parts[0] || '';
        var textColor = parts[1] || '';
        var backgroundLower = parts[2] || '';
        var textRotation = parts[3] || '';
        var additionalText = parts[4] || '';

        // Special handling: if backgroundLower is empty but we have 5 parts,
        // it might be background:text::rotation:text format
        if (!backgroundLower && parts.length >= 5 && parts[2] === '' && parts[3]) {
            // Format like "white:red::0:REF" - upper_background:lower_background::rotation:text
            backgroundLower = textColor; // Second color is lower background
            textColor = 'black'; // Default text color for symbols
            textRotation = parts[3];
            additionalText = parts[4];
        }

        // Create visual representation
        var visualHtml = createOsmcSymbolVisual(symbol, backgroundColor, textColor, backgroundLower, textRotation, additionalText, routeRef);

        return visualHtml;

    } catch (error) {
        console.error('Error parsing OSMC symbol:', symbol, error);
        return symbol + ' (error parsing)';
    }
}

// Function to create visual representation of OSMC symbol
function createOsmcSymbolVisual(symbol, backgroundColor, textColor, backgroundLower, textRotation, additionalText, routeRef) {
    var bgHex = getOsmcHexColor(backgroundColor);
    var textHex = getOsmcHexColor(textColor);

    // For the corrected format: upper_color:lower_color:other:text_color
    // Use textColor as lower background, additionalText as text color
    var lowerHex = textHex; // Second parameter becomes lower stripe color
    var finalTextColor = getOsmcHexColor(additionalText) !== '#FFFFFF' ? getOsmcHexColor(additionalText) : '#000000'; // Default to black for REF

    var visualHtml = '<div style="display: inline-block; margin-right: 10px; vertical-align: middle;" title="' + symbol + '">';

    // SVG with just the colored stripes
    visualHtml += '<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">';
    // Background rectangle (upper part)
    visualHtml += '<rect x="0" y="0" width="40" height="10" fill="' + bgHex + '" stroke="#000" stroke-width="1"/>';
    // Lower background rectangle
    visualHtml += '<rect x="0" y="10" width="40" height="10" fill="' + lowerHex + '" stroke="#000" stroke-width="1"/>';
    visualHtml += '</svg>';

    // REF text next to the stripes
    if (routeRef && routeRef !== '') {
        visualHtml += '<span style="font-weight: bold; font-size: 14px; color: ' + finalTextColor + '; margin-left: 5px; vertical-align: middle;">' + routeRef + '</span>';
    }

    visualHtml += '</div>';

    return visualHtml;
}

// Function to create text interpretation of OSMC symbol
function createOsmcSymbolText(symbol, backgroundColor, textColor, backgroundLower, textRotation, additionalText) {
    var interpretation = '<small>' + symbol + ' → ';

    // Interpret background color
    var bgDescription = getOsmcColorDescription(backgroundColor);
    interpretation += 'Fons: ' + bgDescription;

    // Interpret text/symbol color
    if (textColor) {
        var textDescription = getOsmcColorDescription(textColor);
        interpretation += ', Text/Símbol: ' + textDescription;
    }

    // Interpret lower background
    if (backgroundLower && backgroundLower !== backgroundColor) {
				if (backgroundLower.includes('_lower')) {
					var lowerColor = backgroundLower.replace('_lower', '');
					var lowerDescription = getOsmcColorDescription(lowerColor);
            interpretation += ', Part inferior: ' + lowerDescription;
        } else {
            var lowerDescription = getOsmcColorDescription(backgroundLower);
            interpretation += ', Part inferior: ' + lowerDescription;
        }
    }

    // Add rotation if present
    if (textRotation && textRotation !== '') {
        interpretation += ', Rotació: ' + textRotation + '°';
    }

    // Add additional text if present
    if (additionalText && additionalText !== '') {
        interpretation += ', Text addicional: ' + additionalText;
    }

    interpretation += '</small>';
    return interpretation;
}

// Function to get human-readable description of OSMC colors
function getOsmcColorDescription(color) {
    var colorMap = {
        'white': 'Blanc',
        'yellow': 'Groc',
        'orange': 'Taronja',
        'red': 'Vermell',
        'blue': 'Blau',
        'green': 'Verd',
        'brown': 'Marró',
        'black': 'Negre',
        'gray': 'Gris',
        'purple': 'Lila',
        'pink': 'Rosa'
    };

    return colorMap[color] || color;
}

// Function to get hex color values for OSMC colors
function getOsmcHexColor(color) {
    var hexMap = {
        'white': '#FFFFFF',
        'yellow': '#FFFF00',
        'orange': '#FFA500',
        'red': '#FF0000',
        'blue': '#0000FF',
        'green': '#008000',
        'brown': '#8B4513',
        'black': '#000000',
        'gray': '#808080',
        'purple': '#800080',
        'pink': '#FFC0CB'
    };

    return hexMap[color] || '#FFFFFF'; // Default to white if unknown
}

// Function to show route information in expert mode
function showRouteExpertInfo(routeId) {
    var allRoutes = [...currentRoutesData.walking, ...currentRoutesData.biking, ...currentRoutesData.public_transport];
    var route = allRoutes.find(r => r.id === routeId);

    if (!route) {
        console.error('Route not found for expert info:', routeId);
        return;
    }

    // Create expert mode content similar to POIs
    var expertContent = '<h2>Etiquetes de la ruta</h2>';
    expertContent += '<h3>' + route.name + '</h3>';
    expertContent += '<table>';

    // Add basic route information
    expertContent += '<tr><td><strong>OSM ID</strong></td><td>' + route.osm_id + '</td></tr>';
    expertContent += '<tr><td><strong>OSM Type</strong></td><td>' + route.osm_type + '</td></tr>';
    expertContent += '<tr><td><strong>Route Type</strong></td><td>' + route.type + '</td></tr>';

    // Add all tags from the route
    if (route.tags) {
        for (var tag in route.tags) {
            if (route.tags.hasOwnProperty(tag)) {
                var tagValue = route.tags[tag];
                var displayValue = tagValue;

                // Special handling for osmc:symbol
                if (tag === 'osmc:symbol') {
                    displayValue = parseOsmcSymbol(tagValue, route.tags.ref);
                }

                expertContent += '<tr><td><strong>' + tag + '</strong></td><td>' + displayValue + '</td></tr>';
            }
        }
    }

    expertContent += '</table>';

    // Add action links
    expertContent += '<h2>Accions</h2>';

    if (route.osm_type === 'relation') {
        // View in OpenStreetMap
        var viewLink = 'http://www.openstreetmap.org/relation/' + route.osm_id;
        expertContent += '<a href="' + viewLink + '" target="_blank">Visualitza a OpenStreetMap</a><br/>';

        // Edit in OpenStreetMap
        var editLink = 'http://www.openstreetmap.org/edit?editor=id&relation=' + route.osm_id;
        expertContent += '<a href="' + editLink + '" target="_blank">Edita a OpenStreetMap</a><br/>';
    }

    // Update the developer panel content
    $('#developer p.tags').html(expertContent);

    // Open the developer sidebar
    if (typeof sidebar !== 'undefined') {
        sidebar.open('developer');
    }

    console.log('Displayed expert info for route:', route.name, 'with OSM ID:', route.osm_id);
}

// Function to display routes with pagination
function displayRoutesWithPagination(routes, transportType) {
    var totalRoutes = routes.length;
    var totalPages = Math.ceil(totalRoutes / routesPerPage);
    var startIndex = (currentPage - 1) * routesPerPage;
    var endIndex = Math.min(startIndex + routesPerPage, totalRoutes);
    var routesToShow = routes.slice(startIndex, endIndex);

    var transportTypeName = getTransportTypeDisplayName(transportType);

    var contentHtml = '<h3><i class="fa fa-' + getTransportTypeIcon(transportType) + '"></i> ' + transportTypeName + ' (' + totalRoutes + ')</h3>';

    // Pagination info
    if (totalRoutes > routesPerPage) {
        contentHtml += '<div class="pagination-info">';
        contentHtml += getTranslation('routes_pagination_showing')
            .replace('{start}', startIndex + 1)
            .replace('{end}', endIndex)
            .replace('{total}', totalRoutes);
        contentHtml += '</div>';
    }

    // Routes list
    if (routesToShow.length > 0) {
        contentHtml += '<div class="routes-list">';
        routesToShow.forEach(function(route) {
            contentHtml += createRouteItem(route);
        });
        contentHtml += '</div>';
    } else {
        contentHtml += '<div class="no-routes-message">';
        contentHtml += '<p><i class="fa fa-info-circle"></i> ' + getTranslation('routes_no_routes_found_type').replace('{type}', transportTypeName.toLowerCase()) + '</p>';
        contentHtml += '<p>' + getTranslation('routes_no_routes_suggestion') + '</p>';
        contentHtml += '</div>';
    }

    // Pagination controls
    if (totalPages > 1) {
        contentHtml += '<div class="pagination">';
        // Previous button
        if (currentPage > 1) {
            var escapedTransportType = transportType.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '\\"');
            contentHtml += '<button onclick="changePage(' + (currentPage - 1) + ', \'' + escapedTransportType + '\')">&laquo; ' + getTranslation('routes_pagination_previous') + '</button>';
        } else {
            contentHtml += '<button disabled>&laquo; ' + getTranslation('routes_pagination_previous') + '</button>';
        }

        // Page numbers (show max 5 pages around current)
        var startPage = Math.max(1, currentPage - 2);
        var endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            contentHtml += '<button onclick="changePage(1, \'' + escapedTransportType + '\')">1</button>';
            if (startPage > 2) {
                contentHtml += '<span>...</span>';
            }
        }

        for (var i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                contentHtml += '<button class="active" onclick="changePage(' + i + ', \'' + escapedTransportType + '\')">' + i + '</button>';
            } else {
                contentHtml += '<button onclick="changePage(' + i + ', \'' + escapedTransportType + '\')">' + i + '</button>';
            }
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                contentHtml += '<span>...</span>';
            }
            contentHtml += '<button onclick="changePage(' + totalPages + ', \'' + escapedTransportType + '\')">' + totalPages + '</button>';
        }

        // Next button
        if (currentPage < totalPages) {
            contentHtml += '<button onclick="changePage(' + (currentPage + 1) + ', \'' + escapedTransportType + '\')">' + getTranslation('routes_pagination_next') + ' &raquo;</button>';
        } else {
            contentHtml += '<button disabled>' + getTranslation('routes_pagination_next') + ' &raquo;</button>';
        }

        contentHtml += '</div>';
    }

    document.getElementById('routes-content').innerHTML = contentHtml;
}

// Function to change page
function changePage(page, transportType) {
    currentPage = page;
    var routes = currentRoutesData.public_transport || [];
    displayRoutesWithPagination(routes, transportType);
}

// Function to get transport type display name
function getTransportTypeDisplayName(transportType) {
    switch(transportType) {
        case 'bus': return getTranslation('routes_type_bus_plural');
        case 'tram': return getTranslation('routes_type_tram_plural');
        case 'subway': return getTranslation('routes_type_subway_plural');
        case 'train': return getTranslation('routes_type_train_plural');
        case 'light_rail': return getTranslation('routes_type_light_rail_plural');
        default: return transportType;
    }
}

// Function to get transport type icon
function getTransportTypeIcon(transportType) {
    var icons = {
        'bus': 'bus',
        'tram': 'train',
        'subway': 'subway',
        'train': 'train',
        'light_rail': 'train'
    };
    return icons[transportType] || 'bus';
}

// Function to get route icon based on type and route_type
function getRouteIcon(type, route_type) {
    switch(type) {
        case 'walking': return 'fa-walking';
        case 'biking': return 'fa-bicycle';
        case 'public_transport':
            switch(route_type) {
                case 'bus': return 'fa-bus';
                case 'tram': return 'fa-train';
                case 'subway': return 'fa-subway';
                case 'train': return 'fa-train';
                case 'light_rail': return 'fa-train';
                default: return 'fa-bus';
            }
        default: return 'fa-route';
    }
}

// Function to get route type name
function getRouteTypeName(type, route_type) {
    switch(type) {
        case 'walking': return getTranslation('routes_type_walking');
        case 'biking': return getTranslation('routes_type_biking');
        case 'public_transport':
            switch(route_type) {
                case 'bus': return getTranslation('routes_type_bus');
                case 'tram': return getTranslation('routes_type_tram');
                case 'subway': return getTranslation('routes_type_subway');
                case 'train': return getTranslation('routes_type_train');
                case 'light_rail': return getTranslation('routes_type_light_rail');
                default: return getTranslation('routes_type_transport');
            }
        default: return getTranslation('routes_type_default');
    }
}

// Function to toggle route display on map
function toggleRouteDisplay(routeId) {
    var allRoutes = [...currentRoutesData.walking, ...currentRoutesData.biking, ...currentRoutesData.public_transport];
    var route = allRoutes.find(r => r.id === routeId);

    if (!route) return;

    // Toggle checkbox state
    var isChecked = routeCheckboxes[routeId] || false;
    routeCheckboxes[routeId] = !isChecked;

    if (!isChecked) {
        // Show route on map
        console.log('Showing route on map:', route.name);
        showRouteOnMap(route);
    } else {
        // Hide route from map
        console.log('Hiding route from map:', route.name);
        hideRouteFromMap(routeId);
    }
}

// Function to remove route from the list
function removeRoute(routeId) {
    // Hide from map if displayed
    hideRouteFromMap(routeId);

    // Remove from checkboxes
    delete routeCheckboxes[routeId];

    // Find and remove from currentRoutesData
    var allRoutes = [...currentRoutesData.walking, ...currentRoutesData.biking, ...currentRoutesData.public_transport];
    var routeIndex = allRoutes.findIndex(r => r.id === routeId);

    if (routeIndex !== -1) {
        var route = allRoutes[routeIndex];
        var routeType = route.type;

        // Remove from the appropriate array
        var typeArray = currentRoutesData[routeType];
        if (typeArray) {
            var typeIndex = typeArray.findIndex(r => r.id === routeId);
            if (typeIndex !== -1) {
                typeArray.splice(typeIndex, 1);
            }
        }

        // Refresh the display
        displayRoutes(currentRoutesData.walking, currentRoutesData.biking, currentRoutesData.public_transport);
    }
}

// Function to show route on map (for multiple routes)
function showRouteOnMap(route) {
    if (!route) return;

    initializeRouteLayer();

    // Create a unique layer for this route if it doesn't exist
    if (!activeRoutes[route.id]) {
        activeRoutes[route.id] = L.layerGroup().addTo(map);
    }

    var routeLayerGroup = activeRoutes[route.id];

    // Clear existing content for this route
    routeLayerGroup.clearLayers();

    // For walking/biking routes, fetch and display geometry
    if (route.type !== 'public_transport') {
        fetchAndDisplayRouteGeometryForLayer(route, routeLayerGroup);
    } else {
        // For public transport, show stops
        if (route.stops && route.stops.length > 0) {
            showPublicTransportStopsForLayer(route, routeLayerGroup);
        }
        // Also try to show geometry if available
        fetchAndDisplayRouteGeometryForLayer(route, routeLayerGroup);
    }
}

// Function to hide route from map (but keep stops visible)
function hideRouteFromMap(routeId) {
    if (activeRoutes[routeId]) {
        // Get the route object to check if it has stops
        var allRoutes = [...currentRoutesData.walking, ...currentRoutesData.biking, ...currentRoutesData.public_transport];
        var route = allRoutes.find(r => r.id === routeId);

        if (route && route.type === 'public_transport' && route.stops && route.stops.length > 0) {
            // For public transport routes, only hide the route line, keep stops
            var routeLayerGroup = activeRoutes[routeId];
            // Remove polylines but keep markers
            routeLayerGroup.eachLayer(function(layer) {
                if (layer instanceof L.Polyline) {
                    routeLayerGroup.removeLayer(layer);
                }
                // Keep markers (stop icons)
            });
        } else {
            // For other routes, clear everything
            activeRoutes[routeId].clearLayers();
            delete activeRoutes[routeId];
        }
    }
}

// Function to fetch and display route geometry for a specific layer
function fetchAndDisplayRouteGeometryForLayer(route, routeLayerGroup) {
    if (!route) return;

    // For relations, fetch the geometry of all ways in the relation
    if (route.osm_type === 'relation') {
        fetchRouteGeometry(route.osm_id).then(function(geometry) {
            if (geometry && geometry.length > 0) {
                displayRouteGeometryForLayer(geometry, route, routeLayerGroup);
            }
        }).catch(function(error) {
            console.error('Error fetching route geometry for layer:', error);
        });
    } else if (route.osm_type === 'way') {
        // For direct ways, fetch the way geometry
        fetchWayGeometry(route.osm_id).then(function(geometry) {
            if (geometry && geometry.length > 0) {
                displayRouteGeometryForLayer([geometry], route, routeLayerGroup);
            }
        }).catch(function(error) {
            console.error('Error fetching way geometry for layer:', error);
        });
    } else {
        // For synthetic routes, try to find ways with matching tags
        if (route.type === 'walking' || route.type === 'biking') {
            fetchSyntheticRouteGeometry(route).then(function(geometry) {
                if (geometry && geometry.length > 0) {
                    displayRouteGeometryForLayer(geometry, route, routeLayerGroup);
                }
            }).catch(function(error) {
                console.error('Error fetching synthetic route geometry for layer:', error);
            });
        }
    }
}

// Function to display route geometry for a specific layer
function displayRouteGeometryForLayer(coordinates, route, routeLayerGroup) {
    if (!coordinates || coordinates.length === 0 || !routeLayerGroup) return;

    console.log('Displaying route geometry for layer:', route.name);

    // Add polylines for each way in the route
    coordinates.forEach(function(wayCoords, index) {
        if (wayCoords.length > 1) {
            var color = getRouteColor(route.type, route);
            var polyline = L.polyline(wayCoords, {
                color: color,
                weight: 4,
                opacity: 0.7
            }).addTo(routeLayerGroup);

            // Create popup with route information
            var popupContent = '<b>' + route.name + '</b><br/>';
            popupContent += '<small>' + getRouteTypeName(route.type, route.route_type) + '</small><br/>';

            if (route.tags) {
                if (route.tags.ref) {
                    popupContent += '<small>Ref: ' + route.tags.ref + '</small><br/>';
                }
            }

            polyline.bindPopup(popupContent);
        }
    });
}

// Function to show public transport stops for a specific layer
function showPublicTransportStopsForLayer(route, routeLayerGroup) {
    if (!route.stops || route.stops.length === 0 || !routeLayerGroup) return;

    console.log('Showing public transport stops for layer:', route.name);

    // Filter stops with valid coordinates
    var validStops = route.stops.filter(function(stop) {
        return stop && typeof stop.lat === 'number' && typeof stop.lon === 'number' && !isNaN(stop.lat) && !isNaN(stop.lon);
    });

    if (validStops.length === 0) return;

    // Get the stop color based on transport type
    var stopColor = getTransportStopColor(route.route_type);

    // Create a custom icon with the transport-specific color
    var stopIcon = L.divIcon({
        className: 'custom-stop-icon',
        html: '<div style="background-color: ' + stopColor + '; border: 2px solid white; border-radius: 50%; width: 12px; height: 12px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    // Add markers for each valid stop
    validStops.forEach(function(stop, index) {
        var marker = L.marker([stop.lat, stop.lon], { icon: stopIcon }).addTo(routeLayerGroup);
        marker.bindPopup('<b>' + stop.name + '</b><br/>Parada de ' + route.name + '<br/><small style="color: ' + stopColor + ';">●</small> ' + getRouteTypeName(route.type, route.route_type));
    });
}

// Routes will be initialized when a location is selected via updateRoutesForNewLocation();
