// Traffic functions for SCT (Servei Català de Trànsit) data

// Global variables
let trafficMarkers = [];
let currentFilter = 'all';

// Initialize traffic functions when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Traffic functions are ready
    console.log('Traffic functions loaded');
});

// Load traffic data from SCT APIs only
async function loadTrafficData() {
    const statusText = document.getElementById('status-text');
    const loadBtn = document.getElementById('load-traffic-btn');
    const clearBtn = document.getElementById('clear-traffic-btn');

    try {
        statusText.textContent = 'Carregant dades del trànsit...';
        loadBtn.disabled = true;
        loadBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Carregant...';

        // Detect deployment environment for API calls
        var hostname = window.location.hostname;
        var isGitHubPages = hostname.includes('github.io');
        var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

        // Function to get API URL based on environment
        function getApiUrl(endpoint) {
            if (isVercel) {
                // Use Vercel API
                return endpoint;
            } else if (isGitHubPages) {
                // Use Vercel proxy from GitHub Pages
                return 'https://tempsrealcat.vercel.app' + endpoint;
            } else {
                // Local development
                return endpoint;
            }
        }

        // Fetch data from SCT sources only
        const [rssResponse, gmlResponse] = await Promise.allSettled([
            fetch(getApiUrl('/api/gencat-rss-traffic')),
            fetch(getApiUrl('/api/gencat-gml-traffic'))
        ]);

        let allIncidents = [];

        // Process GENCAT RSS data (SCT)
        if (rssResponse.status === 'fulfilled' && rssResponse.value.ok) {
            const rssXmlText = await rssResponse.value.text();
            console.log('✅ SCT RSS traffic XML data received');
            const rssIncidents = parseRSSXML(rssXmlText);
            allIncidents = allIncidents.concat(rssIncidents.map(incident => ({ ...incident, source: 'SCT_RSS' })));
        } else {
            console.warn('⚠️ Failed to fetch SCT RSS data:', rssResponse.status === 'rejected' ? rssResponse.reason : rssResponse.value.statusText);
        }

        // Process GENCAT GML data (SCT)
        if (gmlResponse.status === 'fulfilled' && gmlResponse.value.ok) {
            const gmlXmlText = await gmlResponse.value.text();
            console.log('✅ SCT GML traffic XML data received');
            const gmlIncidents = parseGENCATGML(gmlXmlText);
            allIncidents = allIncidents.concat(gmlIncidents.map(incident => ({ ...incident, source: 'SCT_GML' })));
        } else {
            console.warn('⚠️ Failed to fetch SCT GML data:', gmlResponse.status === 'rejected' ? gmlResponse.reason : gmlResponse.value.statusText);
        }

        // Combine and deduplicate incidents based on road reference and PK
        const combinedIncidents = combineTrafficIncidents(allIncidents);

        if (combinedIncidents.length === 0) {
            statusText.textContent = 'No s\'han trobat incidents de trànsit actius';
        } else {
            statusText.textContent = `S\'han carregat ${combinedIncidents.length} incidents`;
            displayTrafficIncidents(combinedIncidents);
        }

        clearBtn.style.display = 'inline-block';
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fa fa-sync"></i> Carregar dades';

    } catch (error) {
        console.error('❌ Error loading traffic data:', error);
        statusText.textContent = `Error: ${error.message}`;
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fa fa-sync"></i> Carregar dades';
    }
}

// Parse RSS XML data (SCT)
function parseRSSXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const incidents = [];

    // Find all item elements
    const items = xmlDoc.querySelectorAll('item');
    console.log('Found', items.length, 'items in RSS XML');

    items.forEach(item => {
        try {
            const incident = parseRSSItem(item);
            if (incident) {
                incidents.push(incident);
                console.log('Parsed incident:', incident.category, incident.title);
            }
        } catch (error) {
            console.warn('Error parsing RSS item:', error);
        }
    });

    console.log('Successfully parsed', incidents.length, 'incidents');
    return incidents;
}

// Parse individual RSS item
function parseRSSItem(item) {
    const title = item.querySelector('title');
    const description = item.querySelector('description');
    const link = item.querySelector('link');
    const pubDate = item.querySelector('pubDate');
    const category = item.querySelector('category');

    if (!title || !description || !link || !pubDate || !category) return null;

    const incident = {
        id: link.textContent,
        title: title.textContent,
        description: description.textContent,
        category: category.textContent,
        pubDate: pubDate.textContent
    };

    // Extract location information
    const location = extractLocationInfo(item);
    incident.location = location;

    // Determine level and color based on incident category
    let level = 1;
    let levelColor = '#28a745'; // Green for level 1

    switch (incident.category) {
        case 'Obres':
            incident.icon = '🔧';
            level = 2;
            levelColor = '#ffc107'; // Yellow for level 2
            break;

        case 'Incident':
            incident.icon = '🚨';
            level = 4;
            levelColor = '#dc3545'; // Red for level 4
            break;

        case 'Circulació':
            incident.icon = '🚗';
            level = 3;
            levelColor = '#fd7e14'; // Orange for level 3
            break;

        default:
            incident.icon = '⚠️';
            level = 1;
            levelColor = '#28a745'; // Green for level 1
    }

    incident.level = level;
    incident.color = levelColor;

    return incident;
}

// Extract location information from the RSS item
function extractLocationInfo(item) {
    const location = {};

    // Extract road information
    const roadName = item.querySelector('roadName');
    if (roadName) {
        location.road = roadName.textContent;
    }

    const roadNumber = item.querySelector('roadNumber');
    if (roadNumber) {
        location.roadNumber = roadNumber.textContent;
    }

    // Extract direction information
    const direction = item.querySelector('direction');
    if (direction) {
        location.direction = direction.textContent;
    }

    // Get description and parse it to extract municipality
    const description = item.querySelector('description');
    if (description && description.textContent) {
        const descText = description.textContent.trim();
        const parts = descText.split(' | ').map(part => part.trim());
        
        if (parts.length >= 2) {
            // Format is: ROAD | MUNICIPALITY | DIRECTION | PK_RANGE | SPECIFIC_LOCATION
            // Municipality is the second element
            location.town = parts[1];
        }
    }

    return location;
}

// Geocode incidents without coordinates using server API
async function geocodeIncidentsWithoutCoordinates(incidents, container) {
    console.log(`Attempting to geocode ${incidents.length} incidents without coordinates`);

    // Debug: Check how many incidents have coordinates vs don't
    const withCoords = incidents.filter(inc => inc.location.hasCoordinates);
    const withoutCoords = incidents.filter(inc => !inc.location.hasCoordinates);

    console.log(`Incidents with coordinates: ${withCoords.length}`);
    console.log(`Incidents without coordinates: ${withoutCoords.length}`);

    // Count by source
    const bySource = {};
    withoutCoords.forEach(inc => {
        bySource[inc.source] = (bySource[inc.source] || 0) + 1;
    });
    console.log('Incidents without coordinates by source:', bySource);

    // Only geocode incidents that actually need coordinates (don't have them) AND have road references
    const incidentsNeedingGeocoding = incidents.filter(inc =>
        !inc.location.hasCoordinates && inc.location.roadNumber
    );

    console.log(`Found ${incidentsNeedingGeocoding.length} incidents that need geocoding (have road refs but no coords)`);

    for (const incident of incidentsNeedingGeocoding) {
        try {
            // Use server geocoding endpoint instead of direct Overpass calls
            const coordinates = await geocodeViaServer(incident.location.roadNumber);

            if (coordinates) {
                incident.location.lat = coordinates.lat;
                incident.location.lng = coordinates.lng;
                incident.location.hasCoordinates = true;
                incident.location.geocoded = true; // Mark as geocoded

                // Add marker for geocoded incident
                addTrafficMarker(incident);
                console.log(`✅ Server-geocoded incident ${incident.id}: ${coordinates.lat}, ${coordinates.lng}`);
            } else {
                // Fallback for accidents without coordinates
                if (incident.category === 'accident') {
                    incident.location.lat = 41.5912; // Center of Catalonia
                    incident.location.lng = 1.5209;
                    incident.location.hasCoordinates = true;
                    incident.location.geocoded = false; // Mark as fallback
                    addTrafficMarker(incident);
                    console.log(`📍 Placed accident ${incident.id} at Catalonia center (fallback)`);
                }
            }

        } catch (error) {
            console.warn(`❌ Failed to geocode incident ${incident.id}:`, error);
            // For accidents, still add marker at fallback location
            if (incident.category === 'accident') {
                incident.location.lat = 41.5912; // Center of Catalonia
                incident.location.lng = 1.5209;
                incident.location.hasCoordinates = true;
                incident.location.geocoded = false; // Mark as fallback
                addTrafficMarker(incident);
                console.log(`📍 Placed accident ${incident.id} at Catalonia center (error fallback)`);
            }
        }
    }

    // Add table rows for ALL incidents (whether geocoded or not)
    incidents.forEach(incident => {
        addIncidentToTable(incident, container);
    });

    console.log(`✅ Added ${incidents.length} incidents to table (${incidentsNeedingGeocoding.length} geocoded)`);
}

// Geocode via server endpoint
async function geocodeViaServer(roadRef) {
    try {
        const response = await fetch(`/api/geocode-road?ref=${encodeURIComponent(roadRef)}`);
        if (!response.ok) {
            console.warn(`Server geocoding failed for ${roadRef}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        return data.coordinates || null;
    } catch (error) {
        console.warn(`Server geocoding error for ${roadRef}:`, error);
        return null;
    }
}

// Display traffic incidents on the map and in the list
async function displayTrafficIncidents(incidents) {
    // Clear existing markers
    clearTrafficData();

    // Get separate containers for table and cards
    const tableContainer = document.getElementById('table-container');
    const cardsContainer = document.getElementById('cards-container');
    const tableSection = document.getElementById('traffic-table-section');
    const cardsSection = document.getElementById('traffic-cards-section');

    // Clear containers
    tableContainer.innerHTML = '';
    cardsContainer.innerHTML = '';

    // Create table container with scrolling
    const scrollableTableContainer = document.createElement('div');
    scrollableTableContainer.style.cssText = `
        max-height: 450px;
        overflow: auto;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        margin-bottom: 20px;
        scrollbar-width: thin;
        scrollbar-color: #888 #f1f1f1;
    `;

    // Add custom scrollbar styles for webkit browsers
    const style = document.createElement('style');
    style.textContent = `
        #table-container > div::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        #table-container > div::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
        }
        #table-container > div::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }
        #table-container > div::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
    `;
    document.head.appendChild(style);

    // Create table with road references and locate buttons
    const table = document.createElement('table');
    table.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        background: white;
        min-width: 500px;
        position: relative;
        table-layout: fixed;
    `;

    const thead = document.createElement('thead');
    thead.style.cssText = `
        position: sticky;
        top: 0;
        z-index: 10;
        background: white;
    `;
    thead.innerHTML = `
        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 0; width: 20px; border: 1px solid #dee2e6;"></th>
            <th style="padding: 6px; text-align: center; border: 1px solid #dee2e6; cursor: pointer; width: 30px;" onclick="sortTable(1)" id="sort-level"># ▼</th>
            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; cursor: pointer; width: 60px; min-width: 60px;" onclick="sortTable(2)" id="sort-road">${getTranslation('traffic_via')} ▼</th>
            <th style="padding: 6px; text-align: center; border: 1px solid #dee2e6; cursor: pointer; width: 70px;" onclick="sortTable(3)" id="sort-pk">${getTranslation('traffic_km_inici_fi')} ▼</th>
            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; cursor: pointer; width: 70px;" onclick="sortTable(4)" id="sort-reason">${getTranslation('traffic_causa')} ▼</th>
            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; cursor: pointer; width: 100px;" onclick="sortTable(5)" id="sort-type">${getTranslation('traffic_tipus')} ▼</th>
            <th style="padding: 6px; text-align: center; border: 1px solid #dee2e6; cursor: pointer; width: 40px;" onclick="sortTable(6)" id="sort-length">${getTranslation('traffic_long')} ▼</th>
            <th style="padding: 6px; text-align: center; border: 1px solid #dee2e6; cursor: pointer; width: 50px;" onclick="sortTable(7)" id="sort-direction">${getTranslation('traffic_sentit')} ▼</th>
            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; cursor: pointer; width: 80px;" onclick="sortTable(8)" id="sort-municipi">${getTranslation('traffic_municipality')} ▼</th>
            <th style="padding: 6px; text-align: left; border: 1px solid #dee2e6; cursor: pointer; width: 120px;" onclick="sortTable(9)" id="sort-dest">${getTranslation('traffic_cap_a')} / ${getTranslation('traffic_observacions')} ▼</th>
            <th style="padding: 6px; text-align: center; border: 1px solid #dee2e6; cursor: pointer; width: 80px;" onclick="sortTable(10)" id="sort-start">${getTranslation('traffic_inici')} ▼</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Create correctly sized card layout
    const cardGrid = document.createElement('div');
    cardGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
    `;

    // Process all incidents
    incidents.forEach(incident => {
        if (!incident || !incident.location) return;

        // Add marker if incident has coordinates
        if (incident.location.hasCoordinates) {
            addTrafficMarker(incident);
        }

        // Add row to table with locate button
        addIncidentToTableWithLocate(incident, tbody);

        // Add card to layout
        addIncidentCard(incident, cardGrid);
    });

    table.appendChild(tbody);
    scrollableTableContainer.appendChild(table);
    tableContainer.appendChild(scrollableTableContainer);
    cardsContainer.appendChild(cardGrid);

    // Show both sections
    tableSection.style.display = 'block';
    cardsSection.style.display = 'block';

    console.log('✅ Table and cards in separate sections created with', incidents.length, 'incidents');

    // Apply current filter
    filterTrafficIncidents();
}

// Add traffic marker to map
function addTrafficMarker(incident) {
    let lat, lng;

    if (incident.location.hasCoordinates) {
        lat = incident.location.lat;
        lng = incident.location.lng;
    } else if (incident.category === 'accident') {
        // For accidents without coordinates, place marker at approximate center of Catalonia
        // This is a fallback so accidents are visible on the map
        lat = 41.5912; // Center of Catalonia
        lng = 1.5209;
        console.log('Placing accident marker without coordinates at center of Catalonia:', incident.id);
    } else {
        return; // Don't add markers for other incidents without coordinates
    }

    // Create colored circle marker with emoji
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            html: `<div style="background: ${incident.color}; border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${incident.icon}</div>`,
            className: 'traffic-marker',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        })
    });

    // Store incident data with marker for filtering
    marker.incidentData = incident;

    // Create popup content
    const sourceMap = {
        'SCT_RSS': 'SCT (Servei Català de Trànsit - RSS)',
        'SCT_GML': 'SCT (Servei Català de Trànsit - GML)'
    };
    const sourceDisplay = sourceMap[incident.source] || incident.source;

    let popupContent = `<div style="max-width: 250px;">
        <h4 style="margin: 0 0 8px 0; color: ${incident.color};">${incident.icon} ${incident.title}</h4>
        <p style="margin: 4px 0; font-size: 11px; color: #666;"><strong>Font:</strong> ${sourceDisplay}</p>
        <p style="margin: 4px 0; font-size: 12px;">${incident.description}</p>`;

    if (incident.location.road || incident.location.roadNumber) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Carretera:</strong> ${incident.location.roadNumber || ''} ${incident.location.road || ''}</p>`;
    }

    if (incident.location.town) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Municipi:</strong> ${incident.location.town}</p>`;
    }

    if (incident.location.direction) {
        const directionText = incident.location.direction === 'northBound' ? 'Sentit nord' :
                             incident.location.direction === 'southBound' ? 'Sentit sud' :
                             incident.location.direction === 'eastBound' ? 'Sentit est' :
                             incident.location.direction === 'westBound' ? 'Sentit oest' : incident.location.direction;
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Direcció:</strong> ${directionText}</p>`;
    }

    // Show geocoding status
    if (incident.location.geocoded === false) {
        popupContent += `<p style="margin: 4px 0; font-size: 11px; color: #856404; background: #fff3cd; padding: 4px; border-radius: 3px;"><strong>📍 Ubicació aproximada</strong> (sense coordenades exactes)</p>`;
    } else if (incident.location.geocoded === true) {
        popupContent += `<p style="margin: 4px 0; font-size: 11px; color: #155724; background: #d4edda; padding: 4px; border-radius: 3px;"><strong>✅ Ubicació geocodificada</strong> (des d'OSM)</p>`;
    }

    // Add GML observations if available
    if (incident.source === 'GENCAT_GML' && incident.observations) {
        const obs = incident.observations;
        popupContent += `<div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px; border: 1px solid #dee2e6;">
            <h5 style="margin: 0 0 6px 0; font-size: 12px; color: #495057;"><strong>📋 Observacions GML:</strong></h5>`;
        
        if (obs.dataInici) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Data inici:</strong> ${obs.dataInici}</p>`;
        }
        if (obs.dataFi) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Data fi:</strong> ${obs.dataFi}</p>`;
        }
        if (obs.fase) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Fase:</strong> ${obs.fase}</p>`;
        }
        if (obs.tipusCirculacio) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Tipus circulació:</strong> ${obs.tipusCirculacio}</p>`;
        }
        if (obs.tipusAfectacio) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Tipus afectació:</strong> ${obs.tipusAfectacio}</p>`;
        }
        if (obs.tipusIncidencia) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Tipus incidència:</strong> ${obs.tipusIncidencia}</p>`;
        }
        if (obs.causa) {
            popupContent += `<p style="margin: 2px 0; font-size: 11px;"><strong>Causa:</strong> ${obs.causa}</p>`;
        }
        
        popupContent += `</div>`;
    }

    popupContent += `<p style="margin: 4px 0; font-size: 11px; color: #666;">ID: ${incident.id}</p>
        </div>`;

    marker.bindPopup(popupContent);
    marker.addTo(map);
    trafficMarkers.push(marker);
}

// Add incident to the list
function addIncidentToList(incident, container) {
    const incidentDiv = document.createElement('div');
    incidentDiv.className = `incident-item ${incident.category}`;
    incidentDiv.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 10px;
        margin-bottom: 8px;
        background: #f9f9f9;
        cursor: pointer;
        transition: background-color 0.2s;
    `;

    incidentDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 8px;">
            <span style="font-size: 16px;">${incident.icon}</span>
            <div style="flex: 1;">
                <div style="font-weight: bold; color: ${incident.color}; margin-bottom: 2px;">${incident.title}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 2px;">${incident.description}</div>
                <div style="font-size: 11px; color: #888;">
                    ${incident.location.roadNumber ? incident.location.roadNumber : ''}
                    ${incident.location.road ? incident.location.road : ''}
                    ${incident.location.town ? ` - ${incident.location.town}` : ''}
                </div>
            </div>
        </div>
    `;

    // Click handler to zoom to incident or show location info
    incidentDiv.onclick = () => {
        if (incident.location.hasCoordinates) {
            map.setView([incident.location.lat, incident.location.lng], 15);
            // Find and open the corresponding marker popup
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
        } else {
            // Show location information popup if no coordinates
            const locationInfo = `
                <div style="padding: 10px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">${getTranslation('traffic_location_info_title')}</h4>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                        <strong>${getTranslation('traffic_location_road')}</strong> ${incident.location.roadNumber || 'Desconeguda'}<br>
                        <strong>${getTranslation('traffic_location_pk')}</strong> ${incident.location.pkStart || 'N/A'} - ${incident.location.pkEnd || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_direction')}</strong> ${incident.location.direction || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_description')}</strong> ${incident.location.description || 'N/A'}
                    </div>
                    <div style="font-size: 12px; color: #666; font-style: italic;">
                        <i class="fa fa-info-circle"></i> ${getTranslation('traffic_location_no_gps')}
                    </div>
                </div>
            `;
            
            // Create a temporary popup at the center of the map
            const centerLat = map.getCenter().lat;
            const centerLng = map.getCenter().lng;
            
            const tempPopup = L.popup()
                .setLatLng([centerLat, centerLng])
                .setContent(locationInfo)
                .openOn(map);
            
            // Auto-close after 5 seconds
            setTimeout(() => {
                map.closePopup(tempPopup);
            }, 5000);
        }
    };

    container.appendChild(incidentDiv);
}

// Filter traffic incidents
function filterTrafficIncidents() {
    const filterSelect = document.getElementById('traffic-filter');
    currentFilter = filterSelect.value;

    const incidentItems = document.querySelectorAll('.incident-item');

    incidentItems.forEach(item => {
        if (currentFilter === 'all' || item.classList.contains(currentFilter)) {
            // Use appropriate display style based on element type
            if (item.tagName === 'TR') {
                item.style.display = 'table-row'; // For table rows
            } else {
                item.style.display = 'grid'; // For grid cards
            }
        } else {
            item.style.display = 'none';
        }
    });

    // Also filter markers on map using stored incident data
    trafficMarkers.forEach(marker => {
        const incident = marker.incidentData;
        if (incident && incident.category && (currentFilter === 'all' || incident.category === currentFilter)) {
            map.addLayer(marker);
            console.log('Showing marker for category:', incident.category);
        } else {
            map.removeLayer(marker);
        }
    });

    console.log('Current filter:', currentFilter, 'Total markers:', trafficMarkers.length);
}

// Parse GENCAT RSS XML data
function parseGENCATRSS(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const incidents = [];

    // Find all items in the RSS feed
    const items = xmlDoc.querySelectorAll('item');
    console.log('Found', items.length, 'items in GENCAT RSS');

    items.forEach((item, index) => {
        try {
            const incident = parseGENCATRSSItem(item, index);
            if (incident) {
                incidents.push(incident);
                console.log('Parsed GENCAT RSS incident:', incident.title);
            }
        } catch (error) {
            console.warn('Error parsing GENCAT RSS item:', error);
        }
    });

    console.log('Successfully parsed', incidents.length, 'GENCAT RSS incidents');
    return incidents;
}

// Parse individual GENCAT RSS item
function parseGENCATRSSItem(item, index) {
    const guid = item.querySelector('guid')?.textContent || `gencat-rss-${index}`;
    const title = item.querySelector('title')?.textContent || 'Incident sense títol';
    const description = item.querySelector('description')?.textContent || '';

    // Parse description format: "ROAD | MUNICIPALITY | DIRECTION | PK_RANGE | SPECIFIC_LOCATION"
    const descParts = description.split(' | ').map(part => part.trim());
    console.log('RSS Description parts:', descParts);
    
    if (descParts.length < 4) {
        console.warn('Invalid GENCAT RSS description format:', description);
        return null;
    }

    // Ensure we have the correct number of parts, even if specificLocation is missing
    const roadRef = descParts[0];
    const municipality = descParts[1];  // This is the value we want in the Tram field
    const direction = descParts[2];
    const pkRange = descParts[3];
    const specificLocation = descParts[4] || '';  // Optional specific location
    
    console.log('RSS Parsed:', { 
        roadRef, 
        municipality,  // Should go to Tram field
        direction, 
        pkRange, 
        specificLocation  // Should go to Cap a/Observacions field
    });
    
    // Store municipality as town for Tram field

    // Extract road reference and PK from pkRange (e.g., "Punt km. 545-544.2")
    const pkMatch = pkRange.match(/Punt km\. (.+)/);
    let pkStart = null, pkEnd = null;
    if (pkMatch) {
        const pkParts = pkMatch[1].split('-').map(p => parseFloat(p.trim()));
        if (pkParts.length >= 1) {
            pkStart = pkParts[0];
            pkEnd = pkParts[1] || pkParts[0];
        }
    }

    // Check if RSS description contains coordinates (some RSS feeds might include them)
    let hasCoords = false;
    let lat = null, lng = null;

    // Look for coordinate patterns in the description
    const coordMatch = description.match(/(\d+\.\d+),\s*(\d+\.\d+)/);
    if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
        hasCoords = true;
        console.log(`✅ Found coordinates in GENCAT RSS: lat=${lat}, lng=${lng}`);
    }

    // Create location object
    const incidentLocation = {
        roadNumber: roadRef,
        town: municipality,
        comarca: municipality, // Store municipality in comarca for Tram field
        direction: direction,
        pkStart: pkStart,
        pkEnd: pkEnd,
        lat: lat,
        lng: lng,
        cap_a: specificLocation || '', // Only store specific location in cap_a
        description: `${roadRef} - ${municipality} (${pkRange})`,
        hasCoordinates: hasCoords,
        displayText: `${roadRef} - ${municipality} (${pkRange})`
    };

    // Determine level and color based on severity (1=lowest to 5=highest)
    let level = 1;
    let category = 'other';
    let icon = '⚠️';
    let levelColor = '#28a745'; // Green for level 1

    const titleLower = title.toLowerCase();
    if (titleLower.includes('obres') || titleLower.includes('manteniment') || titleLower.includes('reparaci') ||
       titleLower.includes('treballs') || titleLower.includes('millora') || titleLower.includes('construcció') ||
       titleLower.includes('instal·lacions') || titleLower.includes('ferm') || titleLower.includes('reforçament')) {
        category = 'maintenance';
        icon = '🔧';
        level = 2; // Maintenance is medium severity
        levelColor = '#ffc107'; // Yellow for level 2
    } else if (titleLower.includes('accident') || titleLower.includes('col·lisió')) {
        category = 'accident';
        icon = '🚨';
        level = 4; // Accidents are high severity
        levelColor = '#dc3545'; // Red for level 4
    } else if (titleLower.includes('tall') || titleLower.includes('tancat') || titleLower.includes('tallada') ||
               titleLower.includes('cortada') || titleLower.includes('tallat') || titleLower.includes('tancada') ||
               titleLower.includes('desviament') || titleLower.includes('desvi') || titleLower.includes('desviament')) {
        category = 'closure';
        icon = '🚧';
        level = 5; // Closures are highest severity
        levelColor = '#000000'; // Black for level 5
        console.log('🚧 RSS Closure detected - Level 5 (Black):', title);
    } else if (titleLower.includes('manifestaci') || titleLower.includes('retenci') || titleLower.includes('retenció') ||
               titleLower.includes('congestió') || titleLower.includes('densitat')) {
        category = 'congestion';
        icon = '🚗';
        level = 3; // Congestion is medium-high severity
        levelColor = '#fd7e14'; // Orange for level 3
    } else if (titleLower.includes('neu') || titleLower.includes('meteorol') || titleLower.includes('cadenes')) {
        category = 'weather';
        icon = '❄️';
        level = 4; // Snow/weather incidents are level 4 when road is open
        levelColor = '#dc3545'; // Red for level 4
        console.log('❄️ RSS/DGT Snow/Weather incident detected - Level 4 (Red, road open):', title);
    }

    return {
        id: guid,
        title: title,
        description: description,
        category: category,
        icon: icon,
        color: levelColor,
        level: level,
        location: incidentLocation,
        active: true
    };
}

// Parse GENCAT GML XML data
function parseGENCATGML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const incidents = [];

    // Find all feature members in the GML
    const featureMembers = xmlDoc.querySelectorAll('gml\\:featureMember, featureMember');
    console.log('Found', featureMembers.length, 'feature members in GENCAT GML');

    featureMembers.forEach((member, index) => {
        try {
            const incident = parseGENCATGMLFeature(member, index);
            if (incident) {
                incidents.push(incident);
                console.log('Parsed GENCAT GML incident:', incident.title);
            }
        } catch (error) {
            console.warn('Error parsing GENCAT GML feature:', error);
        }
    });

    console.log('Successfully parsed', incidents.length, 'GENCAT GML incidents');
    return incidents;
}

// Parse individual GENCAT GML feature
function parseGENCATGMLFeature(member, index) {
    const mct2Data = member.querySelector('cite\\:mct2_v_afectacions_data, mct2_v_afectacions_data');

    if (!mct2Data) return null;

    const identificador = mct2Data.querySelector('cite\\:identificador, identificador')?.textContent;
    const carretera = mct2Data.querySelector('cite\\:carretera, carretera')?.textContent;
    const pkInici = parseFloat(mct2Data.querySelector('cite\\:pk_inici, pk_inici')?.textContent || '0');
    const pkFi = parseFloat(mct2Data.querySelector('cite\\:pk_fi, pk_fi')?.textContent || '0');
    const causa = mct2Data.querySelector('cite\\:causa, causa')?.textContent;
    const descripcio = mct2Data.querySelector('cite\\:descripcio, descripcio')?.textContent;
    const descripcioTipus = mct2Data.querySelector('cite\\:descripcio_tipus, descripcio_tipus')?.textContent;
    const sentit = mct2Data.querySelector('cite\\:sentit, sentit')?.textContent;
    const cap_a = mct2Data.querySelector('cite\\:cap_a, cap_a')?.textContent; // Missing field!
    const nivell = parseInt(mct2Data.querySelector('cite\\:nivell, nivell')?.textContent || '1');
    
    // Extract region/province information
    const municipi = mct2Data.querySelector('cite\\:municipi, municipi')?.textContent;
    const comarca = mct2Data.querySelector('cite\\:comarca, comarca')?.textContent;
    const provincia = mct2Data.querySelector('cite\\:provincia, provincia')?.textContent;
    const regio = mct2Data.querySelector('cite\\:regio, regio')?.textContent;
    const demarcacio = mct2Data.querySelector('cite\\:demarcacio, demarcacio')?.textContent;
    
    // Extract additional observation fields
    const dataInici = mct2Data.querySelector('cite\\:data_inici, data_inici')?.textContent;
    const dataFi = mct2Data.querySelector('cite\\:data_fi, data_fi')?.textContent;
    const data = mct2Data.querySelector('cite\\:data, data')?.textContent;
    const dataPublicacio = mct2Data.querySelector('cite\\:data_publicacio, data_publicacio')?.textContent;
    const dataActualitzacio = mct2Data.querySelector('cite\\:data_actualitzacio, data_actualitzacio')?.textContent;
    const horaInici = mct2Data.querySelector('cite\\:hora_inici, hora_inici')?.textContent;
    const horaFi = mct2Data.querySelector('cite\\:hora_fi, hora_fi')?.textContent;
    const fase = mct2Data.querySelector('cite\\:fase, fase')?.textContent;
    const tipusIncidencia = mct2Data.querySelector('cite\\:tipus_incidencia, tipus_incidencia')?.textContent;
    const tipusAfectacio = mct2Data.querySelector('cite\\:tipus_afectacio, tipus_afectacio')?.textContent;
    const tipusCirculacio = mct2Data.querySelector('cite\\:tipus_circulacio, tipus_circulacio')?.textContent;

    // Extract coordinates - try multiple possible locations and formats
    let coordinates = null;
    let lat = null, lng = null;

    // Try different coordinate element selectors - expanded search
    const coordSelectors = [
        'gml\\:coordinates',
        'coordinates',
        'gml\\:pos',
        'pos',
        'gml\\:Point gml\\:coordinates',
        'gml\\:Point coordinates',
        'gml\\:MultiPoint gml\\:pointMember gml\\:Point gml\\:coordinates',
        'gml\\:MultiPoint gml\\:pointMember gml\\:Point coordinates',
        'gml\\:geometryProperty gml\\:Point gml\\:coordinates',
        'gml\\:geometryProperty gml\\:Point coordinates',
        // Additional selectors for different XML structures
        'gml\\:boundedBy gml\\:Box gml\\:coordinates',
        'gml\\:boundedBy gml\\:Envelope gml\\:coordinates',
        'cite\\:geom gml\\:Point gml\\:coordinates',
        'cite\\:geom gml\\:Point coordinates',
        'geom gml\\:Point gml\\:coordinates',
        'geom gml\\:Point coordinates'
    ];

    for (const selector of coordSelectors) {
        coordinates = mct2Data.querySelector(selector)?.textContent;
        if (coordinates) {
            console.log(`✅ Found coordinates with selector "${selector}":`, coordinates);
            break;
        }
    }

    // Also try looking for geometry in different ways - more comprehensive search
    if (!coordinates) {
        const allElements = mct2Data.querySelectorAll('*');
        for (const elem of allElements) {
            const tagName = elem.tagName || '';
            const text = elem.textContent?.trim() || '';

            // Look for elements that might contain coordinates
            if ((tagName.includes('coord') || tagName.includes('pos') ||
                 tagName.includes('point') || tagName.includes('geom') ||
                 tagName.includes('location') || tagName.includes('position')) &&
                text && /\d/.test(text) && (text.includes(',') || text.includes(' ') || text.includes(';'))) {

                // More sophisticated coordinate detection
                const numbers = text.match(/-?\d+\.?\d+/g);
                if (numbers && numbers.length >= 2) {
                    const num1 = parseFloat(numbers[0]);
                    const num2 = parseFloat(numbers[1]);

                    // Check if they look like coordinates (latitude/longitude ranges)
                    if (num1 >= -90 && num1 <= 90 && num2 >= -180 && num2 <= 180) {
                        coordinates = text;
                        console.log(`✅ Found potential coordinates in ${tagName}:`, coordinates);
                        break;
                    }
                }
            }
        }
    }

    // Final attempt: look in the entire XML text for coordinate-like patterns
    if (!coordinates) {
        const xmlText = mct2Data.outerHTML || mct2Data.innerHTML || '';
        const coordPatterns = [
            /(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)/g,  // "lat,lng" or "lat;lng"
            /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,         // "lat lng"
            /(\d{1,3}\.\d{1,10})\s*,\s*(\d{1,3}\.\d{1,10})/g,  // More specific lat,lng pattern
        ];

        for (const pattern of coordPatterns) {
            const matches = xmlText.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const parts = match.split(/[,;\s]+/).map(p => parseFloat(p.trim()));
                    if (parts.length >= 2 && parts.every(p => !isNaN(p))) {
                        const p1 = parts[0], p2 = parts[1];
                        // Check if they look like coordinates (latitude/longitude ranges)
                        if (p1 >= -90 && p1 <= 90 && p2 >= -180 && p2 <= 180) {
                            coordinates = match;
                            console.log(`✅ Found coordinates in XML text with pattern:`, coordinates);
                            break;
                        }
                    }
                }
                if (coordinates) break;
            }
        }
    }

    // Additional check: look for coordinate attributes in any element
    if (!coordinates) {
        const allElements = mct2Data.querySelectorAll('*');
        for (const elem of allElements) {
            // Check for coordinate-related attributes
            const attrs = ['coordinates', 'pos', 'lat', 'lon', 'longitude', 'latitude'];
            for (const attr of attrs) {
                if (elem.hasAttribute(attr)) {
                    const value = elem.getAttribute(attr);
                    if (value && /\d/.test(value) && (value.includes(',') || value.includes(' '))) {
                        coordinates = value;
                        console.log(`✅ Found coordinates in attribute ${attr}:`, coordinates);
                        break;
                    }
                }
            }
            if (coordinates) break;
        }
    }

    if (coordinates) {
        // Try different coordinate formats
        let coordParts = [];

        // Format 1: "lng,lat" (comma-separated)
        if (coordinates.includes(',')) {
            coordParts = coordinates.split(',').map(c => parseFloat(c.trim()));
        }
        // Format 2: "lng lat" (space-separated)
        else if (coordinates.includes(' ')) {
            coordParts = coordinates.split(/\s+/).map(c => parseFloat(c.trim()));
        }

        if (coordParts.length >= 2 && !isNaN(coordParts[0]) && !isNaN(coordParts[1])) {
            let first = coordParts[0], second = coordParts[1];

            // Validate coordinates are in Catalonia region and determine order
            const isValidCataloniaLatLng = (lat, lng) =>
                lat >= 40.5 && lat <= 42.8 && lng >= 0.15 && lng <= 3.35;
            const isValidCataloniaLngLat = (lng, lat) =>
                lat >= 40.5 && lat <= 42.8 && lng >= 0.15 && lng <= 3.35;

            // Check both possible orders
            if (isValidCataloniaLatLng(first, second)) {
                // First is lat, second is lng
                lat = first;
                lng = second;
            } else if (isValidCataloniaLngLat(first, second)) {
                // First is lng, second is lat
                lng = first;
                lat = second;
            } else {
                // Not in Catalonia range, check which combination makes more sense
                const distToCataloniaLatLng = Math.abs(first - 41.5) + Math.abs(second - 1.5);
                const distToCataloniaLngLat = Math.abs(second - 41.5) + Math.abs(first - 1.5);

                if (distToCataloniaLatLng < distToCataloniaLngLat) {
                    // Closer to lat,lng assumption
                    lat = first;
                    lng = second;
                } else {
                    // Closer to lng,lat assumption
                    lng = first;
                    lat = second;
                }

                console.log(`Coordinates outside Catalonia range, using distance-based assumption: lat=${lat}, lng=${lng} from "${coordinates}"`);
            }

            // Final validation
            if (lat < 40 || lat > 43 || lng < -1 || lng > 4) {
                console.warn(`Invalid Catalonia coordinates: lat=${lat}, lng=${lng} from "${coordinates}"`);
                lat = null;
                lng = null;
            } else {
                console.log(`✅ Valid Catalonia coordinates: lat=${lat}, lng=${lng} from "${coordinates}"`);
            }
        }
    }

    // Also check for geometry elements
    if (!coordinates) {
        const geom = mct2Data.querySelector('gml\\:geometry, geometry');
        if (geom) {
            console.log('Found geometry element but no coordinates parsed');
        }
    }

    // Create location object
    const incidentLocation = {
        roadNumber: carretera,
        pkStart: pkInici,
        pkEnd: pkFi,
        direction: sentit,
        hasCoordinates: (lat !== null && lng !== null),
        lat: lat,
        lng: lng,
        town: municipi,
        comarca: comarca,
        region: regio || demarcacio || provincia || comarca,
        province: provincia,
        demarcacio: demarcacio,
        cap_a: cap_a,
        dataInici: dataInici,
        dataFi: dataFi,
        data: data,
        dataPublicacio: dataPublicacio,
        dataActualitzacio: dataActualitzacio,
        horaInici: horaInici,
        horaFi: horaFi,
        fase: fase,
        description: `${carretera || 'Unknown'} - PK ${pkInici}-${pkFi}`,
        displayText: `${carretera || 'Unknown'} - PK ${pkInici}-${pkFi} (${sentit || ''})`
    };

    // Comprehensive incident classification using all text fields
    function classifyIncidentComprehensive(incident) {
        const causa = (incident.causa || '').toLowerCase();
        const descripcio = (incident.descripcio || '').toLowerCase();
        const descripcioTipus = (incident.descripcio_tipus || '').toLowerCase();
        const cap_a = (incident.cap_a || '').toLowerCase();
        const nivell = parseInt(incident.nivell || '1');
        
        // Combine all text for comprehensive analysis
        const allText = `${causa} ${descripcio} ${descripcioTipus} ${cap_a}`;
        
        // Priority 1: Road closures (Level 5)
        if (isRoadClosure(allText, descripcio, descripcioTipus, causa)) {
            return {
                category: 'closure',
                level: 5,
                icon: '🚧',
                color: '#000000',
                reason: extractClosureReason(allText, causa, descripcio),
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Priority 2: Snow/Weather incidents (Level 4 when open, Level 5 when closed)
        if (isSnowWeatherIncident(allText, causa, descripcioTipus)) {
            const isClosed = isRoadClosure(allText, descripcio, descripcioTipus, causa);
            return {
                category: 'weather',
                level: isClosed ? 5 : 4,
                icon: '❄️',
                color: isClosed ? '#000000' : '#dc3545',
                reason: extractWeatherReason(allText, causa, descripcio),
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Priority 3: Accidents (Level 4)
        if (isAccident(allText, causa, descripcio)) {
            return {
                category: 'accident',
                level: 4,
                icon: '🚨',
                color: '#dc3545',
                reason: extractAccidentReason(allText, causa, descripcio),
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Priority 4: Congestion/Traffic issues (Level 3)
        if (isCongestion(allText, descripcioTipus, causa)) {
            return {
                category: 'congestion',
                level: 3,
                icon: '🚗',
                color: '#fd7e14',
                reason: extractCongestionReason(allText, descripcioTipus),
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Priority 5: Maintenance/Works (Level 2)
        if (isMaintenance(allText, causa, descripcioTipus)) {
            return {
                category: 'maintenance',
                level: 2,
                icon: '🔧',
                color: '#ffc107',
                reason: extractMaintenanceReason(allText, causa, descripcioTipus),
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Priority 6: Use nivell from XML if high (Level 4+)
        if (nivell >= 4) {
            return {
                category: 'other',
                level: 5,
                icon: '⚠️',
                color: '#000000',
                reason: `High severity incident (Level ${nivell})`,
                observations: extractObservations(descripcio, cap_a, descripcioTipus)
            };
        }
        
        // Default: Low severity (Level 1)
        return {
            category: 'other',
            level: 1,
            icon: '⚠️',
            color: '#28a745',
            reason: extractGeneralReason(allText, causa, descripcioTipus),
            observations: extractObservations(descripcio, cap_a, descripcioTipus)
        };
    }

    // Road closure detection
    function isRoadClosure(allText, descripcio, descripcioTipus, causa) {
        const closureKeywords = [
            'tallada', 'tallat', 'tancat', 'tancada', 'cortada', 'cortat',
            'calçada tallada', 'via tallada', 'carretera tallada',
            'desviament', 'desvi', 'desviament senyalitzat',
            'pas alternatiu', 'passe alternatiu'
        ];
        
        // Check for closure keywords
        const hasClosureKeywords = closureKeywords.some(keyword => 
            allText.includes(keyword) || 
            descripcio.includes(keyword) ||
            descripcioTipus.includes(keyword) ||
            causa.includes(keyword)
        );
        
        // But exclude cases where it's just "obligatori cadenes" (chains required) - not a closure
        const isChainsOnly = allText.includes('obligatori cadenes') && 
                            !allText.includes('tallada') && 
                            !allText.includes('tancat') &&
                            !allText.includes('cortat');
        
        return hasClosureKeywords && !isChainsOnly;
    }

    // Snow/Weather detection
    function isSnowWeatherIncident(allText, causa, descripcioTipus) {
        const weatherKeywords = [
            'neu', 'neu/gel', 'gel', 'meteorologia', 'meterologia',
            'cadenes', 'obligatori cadenes', 'cadena',
            'inundacions', 'inundació', 'aiguades',
            'tempesta', 'vent', 'pluja intensa'
        ];
        
        return weatherKeywords.some(keyword => 
            allText.includes(keyword) || 
            causa.includes(keyword) ||
            descripcioTipus.includes(keyword)
        );
    }

    // Accident detection
    function isAccident(allText, causa, descripcio) {
        const accidentKeywords = [
            'accident', 'col·lisió', 'xoc', 'abocament',
            'vehicle accidentat', 'cotxe accidentat',
            'sinistre', 'incident', 'emergència'
        ];
        
        return accidentKeywords.some(keyword => 
            allText.includes(keyword) || 
            causa.includes(keyword) ||
            descripcio.includes(keyword)
        );
    }

    // Congestion detection
    function isCongestion(allText, descripcioTipus, causa) {
        const congestionKeywords = [
            'retenció', 'retencions', 'retenci', 'congestió', 'densitat',
            'circulació intensa', 'circulació amb retencions',
            'trànsit dens', 'trànsit intens', 'engarrot'
        ];
        
        return congestionKeywords.some(keyword => 
            allText.includes(keyword) || 
            descripcioTipus.includes(keyword) ||
            causa.includes(keyword)
        );
    }

    // Maintenance detection
    function isMaintenance(allText, causa, descripcioTipus) {
        const maintenanceKeywords = [
            'obres', 'treballs', 'manteniment', 'reparació',
            'construcció', 'millora', 'neteja', 'reforçament',
            'reasfaltat', 'asfalt', 'ferm', 'jardineria',
            'senyalització', 'barrera', 'mur', 'talús',
            'rotonda', 'pont', 'túnel', 'canalització',
            'instal·lació', 'sondejos', 'electric'
        ];
        
        return maintenanceKeywords.some(keyword => 
            allText.includes(keyword) || 
            causa.includes(keyword) ||
            descripcioTipus.includes(keyword)
        );
    }

    // Extract closure reason - return full text
    function extractClosureReason(allText, causa, descripcio) {
        if (causa) {
            if (descripcio && descripcio.trim()) {
                return `${causa}: ${descripcio}`;
            }
            return causa;
        }
        return descripcio || 'Calçada tallada';
    }

    // Extract weather reason - return full text
    function extractWeatherReason(allText, causa, descripcio) {
        if (causa) {
            if (descripcio && descripcio.trim()) {
                return `${causa}: ${descripcio}`;
            }
            return causa;
        }
        return descripcio || 'Condicions meteorològiques';
    }

    // Extract accident reason - return full text
    function extractAccidentReason(allText, causa, descripcio) {
        if (causa) {
            if (descripcio && descripcio.trim()) {
                return `${causa}: ${descripcio}`;
            }
            return causa;
        }
        return descripcio || 'Accident';
    }

    // Extract congestion reason - return full text
    function extractCongestionReason(allText, descripcioTipus) {
        if (descripcioTipus && descripcioTipus.trim()) {
            return descripcioTipus;
        }
        return 'Trànsit dens';
    }

    // Extract maintenance reason - return full text
    function extractMaintenanceReason(allText, causa, descripcioTipus) {
        if (causa) {
            if (descripcioTipus && descripcioTipus.trim()) {
                return `${causa} (${descripcioTipus})`;
            }
            return causa;
        }
        return descripcioTipus || 'Treballs de manteniment';
    }

    // Extract general reason - return full text
    function extractGeneralReason(allText, causa, descripcioTipus) {
        if (causa) {
            if (descripcioTipus && descripcioTipus.trim()) {
                return `${causa} (${descripcioTipus})`;
            }
            return causa;
        }
        return descripcioTipus || 'Incident de trànsit';
    }

    // Extract observations (additional details) - return complete text
    function extractObservations(descripcio, cap_a, descripcioTipus) {
        const observations = [];
        
        if (descripcio && descripcio.trim()) {
            observations.push(descripcio);
        }
        
        if (cap_a && cap_a.trim()) {
            observations.push(`Direcció: ${cap_a}`);
        }
        
        if (descripcioTipus && descripcioTipus.trim()) {
            observations.push(`Tipus: ${descripcioTipus}`);
        }
        
        return observations.join(' | ');
    }

    // Use comprehensive classifier
    const classification = classifyIncidentComprehensive({
        causa: causa,
        descripcio: descripcio,
        descripcio_tipus: descripcioTipus,
        cap_a: cap_a,
        nivell: nivell
    });

    const title = `${descripcio || 'Incident'} - ${carretera || 'Unknown'}`;

    return {
        id: identificador || `gencat-gml-${index}`,
        title: title,
        description: `${descripcio || 'Sense descripció'} (${descripcioTipus || 'Sense tipus'})`,
        category: classification.category,
        icon: classification.icon,
        color: classification.color,
        level: classification.level,
        location: incidentLocation,
        nivell: nivell, // Store the level for table display
        active: true,
        reason: classification.reason,
        observations: classification.observations,
        // GML observation fields for detailed display
        gmlObservations: {
            dataInici: dataInici,
            dataFi: dataFi,
            fase: fase,
            tipusIncidencia: tipusIncidencia,
            tipusAfectacio: tipusAfectacio,
            tipusCirculacio: tipusCirculacio,
            causa: causa,
            descripcio: descripcio,
            descripcioTipus: descripcioTipus,
            sentit: sentit
        }
    };
}

// Combine and deduplicate traffic incidents from multiple sources with priority order
function combineTrafficIncidents(allIncidents) {
    // Data source priority: 1=SCT_RSS, 2=SCT_GML (temporarily reversed for testing)
    const sourcePriority = {
        'SCT_RSS': 1,
        'SCT_GML': 2
    };

    const incidentMap = new Map();

    allIncidents.forEach(incident => {
        // Create a unique key based on road reference and PK range
        const roadKey = incident.location.roadNumber || incident.location.road || 'unknown';
        const pkKey = `${incident.location.pkStart || 'unknown'}-${incident.location.pkEnd || 'unknown'}`;
        const uniqueKey = `${roadKey}-${pkKey}`;

        const existingIncident = incidentMap.get(uniqueKey);

        if (!existingIncident) {
            // First incident for this location
            incidentMap.set(uniqueKey, incident);
        } else {
            // Compare priorities - keep the higher priority source (lower number)
            const existingPriority = sourcePriority[existingIncident.source] || 99;
            const currentPriority = sourcePriority[incident.source] || 99;

            if (currentPriority < existingPriority) {
                // Current incident has higher priority, but merge fields from RSS if needed
                const mergedIncident = { ...incident };
                
                // Preserve town (municipality) from RSS if current incident (GML) doesn't have it
                if (!mergedIncident.location?.town && existingIncident.location?.town) {
                    if (!mergedIncident.location) mergedIncident.location = {};
                    mergedIncident.location.town = existingIncident.location.town;
                }
                
                // Preserve comarca from RSS if current incident (GML) doesn't have it
                if (!mergedIncident.location?.comarca && existingIncident.location?.comarca) {
                    if (!mergedIncident.location) mergedIncident.location = {};
                    mergedIncident.location.comarca = existingIncident.location.comarca;
                }
                
                // Preserve other fields that might be missing
                if (!mergedIncident.location?.cap_a && existingIncident.location?.cap_a) {
                    if (!mergedIncident.location) mergedIncident.location = {};
                    mergedIncident.location.cap_a = existingIncident.location.cap_a;
                }
                
                incidentMap.set(uniqueKey, mergedIncident);
            } else {
                // Keep existing incident (higher priority), but merge fields from current if needed
                if (!existingIncident.location?.town && incident.location?.town) {
                    if (!existingIncident.location) existingIncident.location = {};
                    existingIncident.location.town = incident.location.town;
                }
                
                if (!existingIncident.location?.comarca && incident.location?.comarca) {
                    if (!existingIncident.location) existingIncident.location = {};
                    existingIncident.location.comarca = incident.location.comarca;
                }
                
                if (!existingIncident.location?.cap_a && incident.location?.cap_a) {
                    if (!existingIncident.location) existingIncident.location = {};
                    existingIncident.location.cap_a = incident.location.cap_a;
                }
            }
        }
    });

    const combined = Array.from(incidentMap.values());
    console.log(`Combined ${allIncidents.length} incidents into ${combined.length} unique incidents using priority order: SCT_GML > SCT_RSS`);
    return combined;
}

// Add incident card with modern design
function addIncidentCard(incident, container) {
    const card = document.createElement('div');
    card.className = `incident-item ${incident.category}`;
    card.style.cssText = `
        background: white;
        border-radius: 12px;
        border: 2px solid ${incident.color};
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        padding: 16px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
    `;

    // Determine level based on incident properties (consistent across all functions)
    let level = '1'; // Default level
    if (incident.level) {
        level = incident.level.toString();
    } else if (incident.nivell) {
        level = incident.nivell.toString();
    } else if (incident.category === 'closure') {
        level = '5';
    } else if (incident.category === 'accident') {
        level = '4';
    } else if (incident.category === 'weather') {
        level = '3';
    } else if (incident.category === 'congestion') {
        level = '2';
    }

    // REF (Road reference) - use raw data from location first, then fallback
    let ref = incident.location.roadNumber || incident.location.road || 'Unknown';

    // CITY - use raw data from location first, then fallback
    let city = incident.location.town || 'Unknown';

    // PK (Kilometric point range) - use raw data from location first, then fallback
    let pk = '';
    if (incident.location.pkStart !== null && incident.location.pkStart !== undefined) {
        pk = incident.location.pkEnd && incident.location.pkEnd !== incident.location.pkStart
            ? `${incident.location.pkStart}-${incident.location.pkEnd}`
            : incident.location.pkStart.toString();
    } else if (incident.location.distance) {
        pk = incident.location.distance.toString();
    } else {
        pk = 'Unknown';
    }

    // DIRECTION - translate direction names properly
    let direction = incident.location.direction || 'Unknown';
    // Translate DATEX2 direction names to Catalan
    if (direction === 'northBound') direction = 'Sentit nord';
    else if (direction === 'southBound') direction = 'Sentit sud';
    else if (direction === 'eastBound') direction = 'Sentit est';
    else if (direction === 'westBound') direction = 'Sentit oest';
    else if (direction === 'bothWays') direction = 'Ambdós sentits';
    else if (direction === 'clockwise') direction = 'Sentit horari';
    else if (direction === 'counterclockwise') direction = 'Sentit antihorari';

    // For GENCAT RSS, parse the raw description to extract the structured data
    if (incident.source === 'GENCAT_RSS' && incident.description) {
        const descParts = incident.description.split(' | ').map(part => part.trim());
        if (descParts.length >= 4) {
            ref = descParts[0] || ref; // ROAD
            city = descParts[1] || city; // LOCATION
            direction = descParts[2] || direction; // DIRECTION

            // Extract PK from the 4th part (e.g., "Punt km. 545-544.2")
            const pkRange = descParts[3] || '';
            const pkMatch = pkRange.match(/Punt km\. (.+)/);
            if (pkMatch) {
                pk = pkMatch[1] || pk;
            }
        }
    }

    // For GENCAT GML, use the raw data
    if (incident.source === 'GENCAT_GML') {
        ref = incident.location.roadNumber || 'Unknown';
        pk = (incident.location.pkStart !== undefined && incident.location.pkEnd !== undefined)
            ? `${incident.location.pkStart}-${incident.location.pkEnd}`
            : incident.location.pkStart !== undefined ? incident.location.pkStart.toString() : 'Unknown';
        direction = incident.location.direction || 'Unknown';
        city = 'Unknown'; // GML doesn't have city info
    }

    // For DGT, extract location data properly
    if (incident.source === 'DGT') {
        // DGT location data should be extracted in extractLocationInfo
        city = incident.location.town || 'Unknown';
        ref = incident.location.roadNumber || incident.location.road || 'Unknown';
        direction = incident.location.direction || 'Unknown';

        // Extract PK/distance for DGT - use distance field for ReferencePoint locations
        if (incident.location.distance !== undefined) {
            pk = incident.location.distance.toString();
        } else if (incident.location.pkStart !== undefined) {
            pk = incident.location.pkEnd && incident.location.pkEnd !== incident.location.pkStart
                ? `${incident.location.pkStart}-${incident.location.pkEnd}`
                : incident.location.pkStart.toString();
        } else {
            pk = 'Unknown';
        }
    }

    // REASON - use the comprehensive reason field
    let reason = 'Unknown';
    if (incident.reason && incident.reason.trim()) {
        reason = incident.reason; // Use the full reason from comprehensive classifier
    } else if (incident.source === 'GENCAT_GML') {
        reason = incident.title || 'Unknown'; // Fallback to title for GML
    } else if (incident.source === 'GENCAT_RSS') {
        reason = incident.title || 'Unknown'; // Fallback to title for RSS
    } else {
        reason = incident.description || 'Unknown'; // Fallback to description for DGT
    }

    // OBSERVATIONS - use the comprehensive observations field
    let observations = '';
    if (incident.observations && incident.observations.trim()) {
        observations = incident.observations; // Use the full observations from comprehensive classifier
    } else if (incident.description && incident.description.trim()) {
        observations = incident.description; // Fallback to description
    }

    // SUBTOPIC - specific subcategory (like "NEU.", "OBRES", etc.)
    let subtopic = '';
    if (incident.source === 'GENCAT_GML' && incident.title) {
        // Extract subtopic from title, e.g., "NEU. Calçada tallada (Meteorologia)" -> "NEU."
        const titleParts = incident.title.split('. ');
        if (titleParts.length > 1) {
            subtopic = titleParts[0] + '.';
        }
    }

    // TOPIC - the full category description
    let topic = 'Unknown';
    if (incident.source === 'GENCAT_GML') {
        // For GML, extract the part in parentheses, e.g., "(Meteorologia)"
        const parenMatch = incident.title.match(/\(([^)]+)\)/);
        if (parenMatch) {
            topic = parenMatch[1];
        }
    } else {
        // For RSS and DGT, use a simplified category name
        switch (incident.category) {
            case 'maintenance': topic = 'Obres'; break;
            case 'accident': topic = 'Accident'; break;
            case 'congestion': topic = 'Retenció'; break;
            case 'closure': topic = 'Tancament'; break;
            case 'weather': topic = 'Meteorologia'; break;
            default: topic = 'Altres'; break;
        }
    }

    // Icon for the card
    const icon = incident.icon || '⚠️';

    // Create data source indicator
    const sourceIndicator = document.createElement('div');
    const sourceMap = {
        'DGT': 'DGT',
        'GENCAT_RSS': 'GENCAT',
        'GENCAT_GML': 'GENCAT'
    };
    const sourceDisplay = sourceMap[incident.source] || incident.source;
    sourceIndicator.style.cssText = `
        position: absolute;
        top: 12px;
        left: 12px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 2px 6px;
        font-size: 9px;
        color: #495057;
        font-weight: bold;
        text-transform: uppercase;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;
    sourceIndicator.textContent = sourceDisplay;

    // Create rounded color indicator (moved to accommodate source indicator)
    const colorIndicator = document.createElement('div');
    colorIndicator.style.cssText = `
        position: absolute;
        top: 12px;
        right: 12px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: ${incident.color};
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
        font-weight: bold;
    `;
    colorIndicator.textContent = level;

    card.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div style="font-size: 24px; line-height: 1;">${icon}</div>
            <div style="flex: 1;">
                <div style="font-weight: bold; color: ${incident.color}; font-size: 14px; margin-bottom: 4px;">${reason}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.4;">${subtopic} ${topic}</div>
                ${observations ? `<div style="font-size: 11px; color: #555; margin-bottom: 8px; line-height: 1.3; font-style: italic;">${observations}</div>` : ''}
            </div>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 12px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #555;">
                <div><strong>REF:</strong> ${ref}</div>
                <div><strong>PK:</strong> ${pk}</div>
                <div><strong>PLACE:</strong> ${city}</div>
                <div><strong>DIRECTION:</strong> ${direction}</div>
            </div>
        </div>
    `;

    card.appendChild(colorIndicator);

    // Hover effects
    card.onmouseover = () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
    };

    card.onmouseout = () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    };

    // Click handler to zoom to incident or show location info
    card.onclick = () => {
        if (incident.location.hasCoordinates) {
            // Zoom to location if coordinates are available
            map.setView([incident.location.lat, incident.location.lng], 15);
            // Find and open the corresponding marker popup
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
        } else {
            // Show location information popup if no coordinates
            const locationInfo = `
                <div style="padding: 10px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">${getTranslation('traffic_location_info_title')}</h4>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                        <strong>${getTranslation('traffic_location_road')}</strong> ${incident.location.roadNumber || 'Desconeguda'}<br>
                        <strong>${getTranslation('traffic_location_pk')}</strong> ${incident.location.pkStart || 'N/A'} - ${incident.location.pkEnd || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_direction')}</strong> ${incident.location.direction || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_description')}</strong> ${incident.location.description || 'N/A'}
                    </div>
                    <div style="font-size: 12px; color: #666; font-style: italic;">
                        <i class="fa fa-info-circle"></i> ${getTranslation('traffic_location_no_gps')}
                    </div>
                </div>
            `;
            
            // Create a temporary popup at the center of the map
            const centerLat = map.getCenter().lat;
            const centerLng = map.getCenter().lng;
            
            const tempPopup = L.popup()
                .setLatLng([centerLat, centerLng])
                .setContent(locationInfo)
                .openOn(map);
            
            // Auto-close after 5 seconds
            setTimeout(() => {
                map.closePopup(tempPopup);
            }, 5000);
        }
    };

    container.appendChild(card);
}

// Add incident to table with locate button
function addIncidentToTableWithLocate(incident, tbody) {
    const row = document.createElement('tr');
    row.className = `incident-item ${incident.category}`;
    row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';

    // Get road reference
    const road = incident.location.roadNumber || incident.location.road || 'Unknown';

    // Get location info - prioritize coordinates, then place names, not PK
    let location = 'Unknown';
    if (incident.location.hasCoordinates && incident.location.lat && incident.location.lng) {
        // Show coordinates if available
        location = `${incident.location.lat.toFixed(4)}, ${incident.location.lng.toFixed(4)}`;
    } else if (incident.location.town) {
        // Show town name
        location = incident.location.town;
    } else if (incident.location.description && !incident.location.description.includes('PK')) {
        // Show description if it doesn't contain PK info (avoid duplication)
        location = incident.location.description.length > 25 ?
            incident.location.description.substring(0, 22) + '...' :
            incident.location.description;
    } else {
        // Fallback to general location info
        location = incident.location.displayText || 'Sense localització';
    }

    // Get full reason from comprehensive classifier
    let reason = incident.reason || incident.title || incident.description || 'Unknown';
    
    // Remove text between square brackets [] from reason (already in Tipus field)
    reason = reason.replace(/\s*\[.*?\]\s*/g, ' ').trim();
    
    // Extract type information from observations for Tipus field
    let tipus = incident.descripcioTipus || incident.category || '';
    
    // If tipus is empty, try to extract from observations using CATALAN keywords
    if (!tipus) {
        // Look for type patterns in observations using CATALAN
        const obsText = (incident.observations || '').toLowerCase();
        if (obsText.includes('retenció') || obsText.includes('congestió') || obsText.includes('trànsit intens')) {
            tipus = 'congestion';
        } else if (obsText.includes('calçada tallada') || obsText.includes('via tallada') || obsText.includes('cortada')) {
            tipus = 'closure';
        } else if (obsText.includes('obra') || obsText.includes('treballs') || obsText.includes('manteniment')) {
            tipus = 'maintenance';
        } else if (obsText.includes('accident') || obsText.includes('col·lisió') || obsText.includes('xoc')) {
            tipus = 'accident';
        } else if (obsText.includes('neu') || obsText.includes('gel') || obsText.includes('pluja') || obsText.includes('meteorologia')) {
            tipus = 'weather';
        } else if (obsText.includes('objecte') || obsText.includes('obstrucció') || obsText.includes('vehicle aturat')) {
            tipus = 'Obstrucció';
        }
    }
    
    // Get translated type for display
    const translatedType = getTranslation(`traffic_category_${tipus.toLowerCase()}`) || tipus;
    
    // Get FROM/TO location data (cap_a field) - extract specific location from cap_a
    let fromTo = '';
    
    // Get Cap a / Observacions from cap_a field (extract after " - ")
    if (incident.location && incident.location.cap_a) {
        // cap_a might contain "Tram - Specific Location", extract just the specific location
        const cap_aText = incident.location.cap_a;
        const dashIndex = cap_aText.indexOf(' - ');
        if (dashIndex > 0) {
            fromTo = cap_aText.substring(dashIndex + 3).trim(); // Get the part after " - "
        } else {
            fromTo = cap_aText;
        }
    }
    
    // Get date/time information - try all possible date fields from GML and RSS
    let inici = '';
    
    // Try GML date fields first
    if (incident.location && incident.location.dataInici) {
        inici = incident.location.dataInici;
    } else if (incident.location && incident.location.data) {
        inici = incident.location.data;
    } else if (incident.location && incident.location.dataPublicacio) {
        inici = incident.location.dataPublicacio;
    } else if (incident.location && incident.location.dataActualitzacio) {
        inici = incident.location.dataActualitzacio;
    }
    // Try RSS date field
    else if (incident.pubDate) {
        inici = incident.pubDate;
    }
    
    // Remove day of week for proper sorting
    if (inici) {
        inici = inici.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i, ''); // Remove "Mon, " etc.
        inici = inici.replace(/^(Dilluns|Dimarts|Dimecres|Dijous|Divendres|Dissabte|Diumenge),\s*/i, ''); // Remove Catalan days
        inici = inici.replace(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo),\s*/i, ''); // Remove Spanish days
        
        // Convert month names to numbers for proper sorting
        inici = inici.replace(/Jan(uary)?/gi, '01');
        inici = inici.replace(/Feb(ruary)?/gi, '02');
        inici = inici.replace(/Mar(ch)?/gi, '03');
        inici = inici.replace(/Apr(il)?/gi, '04');
        inici = inici.replace(/May/gi, '05');
        inici = inici.replace(/Jun(e)?/gi, '06');
        inici = inici.replace(/Jul(y)?/gi, '07');
        inici = inici.replace(/Aug(ust)?/gi, '08');
        inici = inici.replace(/Sep(tember)?/gi, '09');
        inici = inici.replace(/Oct(ober)?/gi, '10');
        inici = inici.replace(/Nov(ember)?/gi, '11');
        inici = inici.replace(/Dec(ember)?/gi, '12');
        
        // Catalan months
        inici = inici.replace(/gen(er)?/gi, '01');
        inici = inici.replace(/febr(er)?/gi, '02');
        inici = inici.replace(/mar(ç)?/gi, '03');
        inici = inici.replace(/abr(il)?/gi, '04');
        inici = inici.replace(/maig/gi, '05');
        inici = inici.replace(/jun(y)?/gi, '06');
        inici = inici.replace(/jul(iol)?/gi, '07');
        inici = inici.replace(/ag(ost)?/gi, '08');
        inici = inici.replace(/set(embre)?/gi, '09');
        inici = inici.replace(/oct(ubre)?/gi, '10');
        inici = inici.replace(/nov(embre)?/gi, '11');
        inici = inici.replace(/des(embre)?/gi, '12');
        
        // Spanish months
        inici = inici.replace(/ene(ro)?/gi, '01');
        inici = inici.replace(/feb(rero)?/gi, '02');
        inici = inici.replace(/mar(zo)?/gi, '03');
        inici = inici.replace(/abr(il)?/gi, '04');
        inici = inici.replace(/may(o)?/gi, '05');
        inici = inici.replace(/jun(io)?/gi, '06');
        inici = inici.replace(/jul(io)?/gi, '07');
        inici = inici.replace(/ag(osto)?/gi, '08');
        inici = inici.replace(/sep(tiembre)?/gi, '09');
        inici = inici.replace(/oct(ubre)?/gi, '10');
        inici = inici.replace(/nov(iembre)?/gi, '11');
        inici = inici.replace(/dic(iembre)?/gi, '12');
        
        // Convert to YYYY-MM-DD format for proper sorting
        // Handle different date formats
        const dateMatch = inici.match(/(\d{1,4})[\/\-\s](\d{1,2})[\/\-\s](\d{1,4})/);
        if (dateMatch) {
            const part1 = dateMatch[1];
            const part2 = dateMatch[2];
            const part3 = dateMatch[3];
            
            // Determine which part is year (4 digits)
            let year, month, day;
            if (part1.length === 4) {
                // Format: YYYY-MM-DD or YYYY/MM/DD
                year = part1;
                month = part2.padStart(2, '0');
                day = part3.padStart(2, '0');
            } else if (part3.length === 4) {
                // Format: DD-MM-YYYY or DD/MM/YYYY (convert to YYYY-MM-DD)
                year = part3;
                month = part2.padStart(2, '0');
                day = part1.padStart(2, '0');
            } else {
                // Default assumption: DD-MM-YYYY
                year = part3;
                month = part2.padStart(2, '0');
                day = part1.padStart(2, '0');
            }
            
            inici = inici.replace(dateMatch[0], `${year}-${month}-${day}`);
        }
        
        // Clean up extra spaces and format dates
        inici = inici.replace(/\s+/g, ' ').trim();
    }
    
    // Add time if available from GML
    if (inici && incident.location && incident.location.horaInici) {
        inici += ' ' + incident.location.horaInici;
    }
    
    // Extract PK values for length calculation
    const pkStart = incident.location.pkStart || 0;
    const pkEnd = incident.location.pkEnd || pkStart;
    const length = Math.abs(parseFloat(pkEnd) - parseFloat(pkStart)).toFixed(2);
    
    // Build GML observations string if available (fallback for old data)
    let gmlObservations = '';
    if (incident.source === 'GENCAT_GML' && incident.gmlObservations) {
        const obs = incident.gmlObservations;
        const obsParts = [
            obs.dataInici || '',
            obs.dataFi || '',
            obs.fase || '',
            obs.tipusCirculacio || '',
            obs.tipusAfectacio || '',
            obs.tipusIncidencia || ''
        ].filter(part => part.trim() !== '');
        gmlObservations = obsParts.join(' ');
    }
    
    // Create minimal locate button with map marker icon
    const locateBtn = document.createElement('button');
    locateBtn.innerHTML = '<i class="fas fa-map-marker-alt" style="display: block; margin: -1px 0 0 -1px;"></i>';
    locateBtn.style.cssText = `
        padding: 0;
        margin: 0;
        background: ${incident.color};
        color: white;
        border: none;
        border-radius: 0;
        cursor: pointer;
        font-size: 10px;
        width: 16px;
        height: 18px;
        line-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    `;

    locateBtn.onmouseover = () => locateBtn.style.background = '#555';
    locateBtn.onmouseout = () => locateBtn.style.background = incident.color;

    locateBtn.onclick = (e) => {
        e.stopPropagation(); // Prevent row click
        if (incident.location.hasCoordinates) {
            map.setView([incident.location.lat, incident.location.lng], 15);
            // Find and open the corresponding marker popup
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
        } else {
            // Show location information popup if no coordinates
            const locationInfo = `
                <div style="padding: 10px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">${getTranslation('traffic_location_info_title')}</h4>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                        <strong>${getTranslation('traffic_location_road')}</strong> ${incident.location.roadNumber || 'Desconeguda'}<br>
                        <strong>${getTranslation('traffic_location_pk')}</strong> ${incident.location.pkStart || 'N/A'} - ${incident.location.pkEnd || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_direction')}</strong> ${incident.location.direction || 'N/A'}<br>
                        <strong>${getTranslation('traffic_location_description')}</strong> ${incident.location.description || 'N/A'}
                    </div>
                    <div style="font-size: 12px; color: #666; font-style: italic;">
                        <i class="fa fa-info-circle"></i> ${getTranslation('traffic_location_no_gps')}
                    </div>
                </div>
            `;
            
            // Create a temporary popup at the center of the map
            const centerLat = map.getCenter().lat;
            const centerLng = map.getCenter().lng;
            
            const tempPopup = L.popup()
                .setLatLng([centerLat, centerLng])
                .setContent(locationInfo)
                .openOn(map);
            
            // Auto-close after 5 seconds
            setTimeout(() => {
                map.closePopup(tempPopup);
            }, 5000);
        }
    };

    // Determine level for display
    let displayLevel = '1';
    if (incident.level) {
        displayLevel = incident.level.toString();
    } else if (incident.nivell) {
        displayLevel = incident.nivell.toString();
    } else if (incident.category === 'closure') {
        displayLevel = '5';
    } else if (incident.category === 'accident') {
        displayLevel = '4';
    } else if (incident.category === 'weather') {
        displayLevel = '3';
    } else if (incident.category === 'congestion') {
        displayLevel = '2';
    }

    // Get PK information
    let pk = 'Unknown';
    if (incident.location.pkStart !== null && incident.location.pkStart !== undefined) {
        pk = incident.location.pkEnd && incident.location.pkEnd !== incident.location.pkStart
            ? `${incident.location.pkStart}-${incident.location.pkEnd}`
            : incident.location.pkStart.toString();
    } else if (incident.location.distance) {
        pk = incident.location.distance.toString();
    }

    // Get direction information
    let direction = incident.location.direction || 'Unknown';
    // Translate DATEX2 direction names using translation system
    if (direction === 'northBound') direction = getTranslation('traffic_direction_north');
    else if (direction === 'southBound') direction = getTranslation('traffic_direction_south');
    else if (direction === 'eastBound') direction = getTranslation('traffic_direction_east');
    else if (direction === 'westBound') direction = getTranslation('traffic_direction_west');
    else if (direction === 'bothWays') direction = getTranslation('traffic_direction_both');
    else if (direction === 'clockwise') direction = getTranslation('traffic_direction_clockwise');
    else if (direction === 'counterclockwise') direction = getTranslation('traffic_direction_counterclockwise');

    // Get source
    const sourceMap = {
        'DGT': 'DGT',
        'GENCAT_RSS': 'GENCAT',
        'GENCAT_GML': 'GENCAT'
    };
    const source = sourceMap[incident.source] || incident.source;

    // Get municipality information
    let municipality = '';
    if (incident.location && incident.location.town) {
        // Use the town field that was extracted during RSS parsing
        municipality = incident.location.town;
    } else if (incident.source === 'SCT_RSS' && incident.description) {
        // Fallback: extract directly from description for RSS data
        const descParts = incident.description.split(' | ').map(part => part.trim());
        if (descParts.length >= 2) {
            municipality = descParts[1];
        }
    }
    
    row.innerHTML = `
        <td style="padding: 0; margin: 0; border: 1px solid #dee2e6; width: 18px; height: 20px; text-align: center; vertical-align: middle; overflow: hidden;"></td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px; font-weight: bold; background: ${incident.color}; color: white; border-left: 3px solid ${incident.color};">${displayLevel}</td>
        <td style="padding: 8px 4px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; font-weight: bold; color: ${incident.color}; width: 60px; min-width: 60px; max-width: 60px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${road}">${road}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${pk}</td>
        <td style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 200px; word-wrap: break-word;">${reason.replace(/\s*\[.*?\]\s*/g, ' ').trim()}</td>
        <td style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 200px; min-width: 100px; word-wrap: break-word;">${translatedType}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${length}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${direction}</td>
        <td style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 120px; min-width: 80px; word-wrap: break-word;">${municipality || ''}</td>
        <td style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 240px; min-width: 120px; word-wrap: break-word;">${fromTo}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${inici}</td>
    `;

    // Add the button to the first cell (LOCATE column)
    const firstCell = row.querySelector('td:first-child');
    firstCell.appendChild(locateBtn);

    tbody.appendChild(row);
}

// Add incident to summary table at top
function addIncidentToSummaryTable(incident, tbody) {
    const row = document.createElement('tr');
    row.className = `incident-item ${incident.category}`;
    row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';

    // Determine level
    let level = '1';
    if (incident.nivell) {
        level = incident.nivell.toString();
    } else if (incident.category === 'closure') level = '5';
    else if (incident.category === 'accident') level = '4';
    else if (incident.category === 'weather') level = '3';
    else if (incident.category === 'congestion') level = '2';

    // Get road reference
    const road = incident.location.roadNumber || incident.location.road || 'Unknown';

    // Get location info
    let location = 'Unknown';
    if (incident.location.town) {
        location = incident.location.town;
    } else if (incident.location.pkStart) {
        location = `PK ${incident.location.pkStart}${incident.location.pkEnd ? '-' + incident.location.pkEnd : ''}`;
    } else if (incident.location.description) {
        // Truncate long descriptions for table
        location = incident.location.description.length > 30 ?
            incident.location.description.substring(0, 27) + '...' :
            incident.location.description;
    }

    // Get description (truncated for table)
    const description = (incident.description || incident.title || 'Unknown');
    const shortDesc = description.length > 50 ? description.substring(0, 47) + '...' : description;

    // Get source
    const sourceMap = {
        'DGT': 'DGT',
        'GENCAT_RSS': 'GENCAT',
        'GENCAT_GML': 'GENCAT'
    };
    const source = sourceMap[incident.source] || incident.source;

    row.innerHTML = `
        <td style="padding: 4px; text-align: center; border: 1px solid #dee2e6; font-weight: bold; color: ${incident.color}; font-size: 11px;">${level}</td>
        <td style="padding: 4px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${road}</td>
        <td style="padding: 4px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${location}</td>
        <td style="padding: 4px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 300px; word-wrap: break-word;">${shortDesc}</td>
        <td style="padding: 4px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${source}</td>
    `;

    // Click handler
    row.onclick = () => {
        if (incident.location.hasCoordinates) {
            map.setView([incident.location.lat, incident.location.lng], 15);
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
        }
    };

    tbody.appendChild(row);
}

// Add incident to simple table
function addIncidentToTable(incident, tbody) {
    const row = document.createElement('tr');
    row.className = `incident-item ${incident.category}`;
    row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';

    // Determine level
    let level = '1';
    if (incident.nivell) {
        level = incident.nivell.toString();
    } else if (incident.category === 'closure') level = '5';
    else if (incident.category === 'accident') level = '4';
    else if (incident.category === 'weather') level = '3';
    else if (incident.category === 'congestion') level = '2';

    // Get road reference
    const road = incident.location.roadNumber || incident.location.road || 'Unknown';

    // Get location info
    let location = 'Unknown';
    if (incident.location.town) {
        location = incident.location.town;
    } else if (incident.location.description) {
        location = incident.location.description;
    } else if (incident.location.pkStart) {
        location = `PK ${incident.location.pkStart}${incident.location.pkEnd ? '-' + incident.location.pkEnd : ''}`;
    }

    // Get description
    const description = incident.description || incident.title || 'Unknown';

    // Get source
    const sourceMap = {
        'DGT': 'DGT',
        'GENCAT_RSS': 'GENCAT',
        'GENCAT_GML': 'GENCAT'
    };
    const source = sourceMap[incident.source] || incident.source;

    // Build GML observations string if available
    let gmlObservations = '';
    if (incident.source === 'GENCAT_GML' && incident.observations) {
        const obs = incident.observations;
        const obsParts = [
            obs.dataInici || '',
            obs.dataFi || '',
            obs.fase || '',
            obs.tipusCirculacio || '',
            obs.tipusAfectacio || '',
            obs.tipusIncidencia || ''
        ].filter(part => part.trim() !== '');
        gmlObservations = obsParts.join(' ');
    }

    row.innerHTML = `
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6; font-weight: bold; color: ${incident.color};">${level}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6;">${road}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6;">${location}</td>
        <td style="padding: 6px; text-align: left; border: 1px solid #dee2e6; max-width: 300px; word-wrap: break-word;">${description}</td>
        <td style="padding: 6px; text-align: left; border: 1px solid #dee2e6; max-width: 200px; word-wrap: break-word; font-size: 12px;">${gmlObservations}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6;">${source}</td>
    `;

    // Click handler
    row.onclick = () => {
        if (incident.location.hasCoordinates) {
            map.setView([incident.location.lat, incident.location.lng], 15);
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
        }
    };

    tbody.appendChild(row);
}

// Sort table by column - simplified and reliable
let currentSortColumn = -1;
let currentSortDirection = 'asc';

function sortTable(columnIndex) {
    const table = document.querySelector('#table-container table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const headers = table.querySelectorAll('th');

    // Determine sort direction
    if (currentSortColumn === columnIndex) {
        // Same column clicked - toggle direction
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column clicked - start with ascending
        currentSortColumn = columnIndex;
        currentSortDirection = 'asc';
    }

    // Update header indicators
    headers.forEach((header, index) => {
        const baseText = header.getAttribute('data-original-text') || header.textContent.replace(' ▲', '').replace(' ▼', '');
        header.setAttribute('data-original-text', baseText);

        if (index === columnIndex) {
            header.textContent = baseText + (currentSortDirection === 'asc' ? ' ▲' : ' ▼');
        } else {
            header.textContent = baseText;
        }
    });

    // Sort rows
    rows.sort((a, b) => {
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];

        if (!aCell || !bCell) return 0;

        const aValue = aCell.textContent.trim().toLowerCase();
        const bValue = bCell.textContent.trim().toLowerCase();

        let comparison = 0;

        // Determine sorting type based on column
        if (columnIndex === 1) {
            // LEVEL column - always numeric
            const aNum = parseFloat(aValue.replace(/[^\d.-]/g, '')) || 0;
            const bNum = parseFloat(bValue.replace(/[^\d.-]/g, '')) || 0;
            comparison = aNum - bNum;
        } else if (columnIndex === 2) {
            // VIA column - road references (AP-7, C-58, etc.) - sort by road type first, then number
            const aMatch = aValue.match(/^([A-Z]{1,3})-?(\d+)$/i);
            const bMatch = bValue.match(/^([A-Z]{1,3})-?(\d+)$/i);
            if (aMatch && bMatch) {
                const aType = aMatch[1];
                const bType = bMatch[1];
                const aNum = parseInt(aMatch[2]);
                const bNum = parseInt(bMatch[2]);
                
                if (aType !== bType) {
                    comparison = aType.localeCompare(bType);
                } else {
                    comparison = aNum - bNum;
                }
            } else {
                comparison = aValue.localeCompare(bValue);
            }
        } else if (columnIndex === 3) {
            // KM. INICI-FI column - handle ranges like "545-544.2" or single values
            const aNum = parseFloat(aValue.split('-')[0].replace(/[^\d.-]/g, '')) || 0;
            const bNum = parseFloat(bValue.split('-')[0].replace(/[^\d.-]/g, '')) || 0;
            comparison = aNum - bNum;
        } else if (columnIndex === 8) {
            // MUNICIPALITY column - string sorting
            comparison = aValue.localeCompare(bValue);
        } else if (columnIndex === 9) {
            // CAP A / OBSERVACIONS column - string sorting
            comparison = aValue.localeCompare(bValue);
        } else if (columnIndex === 10) {
            // INICI column - date sorting
            const aDate = new Date(aValue);
            const bDate = new Date(bValue);
            comparison = aDate - bDate;
        } else {
            // String sorting for all other columns
            comparison = aValue.localeCompare(bValue);
        }

        // Apply sort direction
        return currentSortDirection === 'asc' ? comparison : -comparison;
    });

    // Clear and re-append sorted rows
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// Clear traffic data from map and list
function clearTrafficData() {
    // Remove all markers from map
    trafficMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    trafficMarkers = [];
    
    // Clear cameras as well
    clearTrafficCameras();

    // Hide clear button and traffic sections
    document.getElementById('clear-traffic-btn').style.display = 'none';
    document.getElementById('traffic-table-section').style.display = 'none';
    document.getElementById('traffic-cards-section').style.display = 'none';
    document.getElementById('status-text').textContent = 'Preparat per carregar dades';
}

// Update status display
function updateStatus(message) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Traffic cameras functionality
let trafficCameraMarkers = [];

// Load traffic cameras from GENCAT
async function loadTrafficCameras() {
    try {
        console.log('📹 Loading traffic cameras from GENCAT...');
        updateStatus('Carregant càmeres de trànsit...');
        
        // Detect deployment environment for API calls
        var hostname = window.location.hostname;
        var isGitHubPages = hostname.includes('github.io');
        var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

        // Function to get API URL based on environment
        function getApiUrl(endpoint) {
            if (isVercel) {
                // Use Vercel API
                return endpoint;
            } else if (isGitHubPages) {
                // Use Vercel proxy from GitHub Pages
                return 'https://tempsrealcat.vercel.app' + endpoint;
            } else {
                // Local development
                return endpoint;
            }
        }
        
        // Fetch cameras XML data using proxy to avoid CORS
        const camerasUrl = 'https://www.gencat.cat/transit/opendata/cameres.xml';
        const proxyUrl = getApiUrl(`/api/proxy?url=${encodeURIComponent(camerasUrl)}`);
        
        console.log('📡 Fetching cameras from:', proxyUrl);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const xmlText = await response.text();
        console.log('✅ Successfully fetched cameras XML');
        
        // Parse cameras
        const cameras = parseCamerasXML(xmlText);
        console.log(`📹 Found ${cameras.length} cameras`);
        
        // Display cameras
        displayTrafficCameras(cameras);
        
        // Show cameras section
        document.getElementById('traffic-cameras-section').style.display = 'block';
        document.getElementById('clear-traffic-btn').style.display = 'inline-block';
        
        updateStatus(`S'han carregat ${cameras.length} càmeres de trànsit`);
        
    } catch (error) {
        console.error('❌ Error loading traffic cameras:', error);
        updateStatus(`Error carregant càmeres: ${error.message}`);
    }
}

// Parse cameras XML data
function parseCamerasXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const cameras = [];
    
    // Find all camera elements (GENCAT uses cite:cameres)
    const cameraElements = xmlDoc.querySelectorAll('cite\\:cameres, cameres');
    console.log(`Found ${cameraElements.length} camera elements`);
    
    cameraElements.forEach((camera, index) => {
        try {
            const cameraData = parseCameraElement(camera, index);
            if (cameraData) {
                cameras.push(cameraData);
            }
        } catch (error) {
            console.warn(`Error parsing camera ${index}:`, error);
        }
    });
    
    return cameras;
}

// Parse individual camera element
function parseCameraElement(camera, index) {
    // Extract camera information from GENCAT structure
    const id = camera.getAttribute('fid') || camera.querySelector('cite\\:id, id')?.textContent || `camera-${index}`;
    const road = camera.querySelector('cite\\:carretera, carretera')?.textContent;
    const municipality = camera.querySelector('cite\\:municipi, municipi')?.textContent;
    const pk = camera.querySelector('cite\\:pk, pk')?.textContent;
    const imageUrl = camera.querySelector('cite\\:link, link, cite\\:font, font')?.textContent;
    
    // Extract coordinates from gml:coordinates
    let latitude = null, longitude = null;
    const coordinates = camera.querySelector('gml\\:coordinates, coordinates')?.textContent;
    if (coordinates) {
        const coords = coordinates.split(',');
        if (coords.length >= 2) {
            longitude = parseFloat(coords[0].trim());
            latitude = parseFloat(coords[1].trim());
        }
    }
    
    // Validate coordinates
    if (isNaN(latitude) || isNaN(longitude)) {
        console.warn(`Camera ${id} has invalid coordinates: lat=${latitude}, lng=${longitude}`);
        return null;
    }
    
    // Check if coordinates are in reasonable range for Catalonia
    if (latitude < 40 || latitude > 43 || longitude < 0 || longitude > 4) {
        console.warn(`Camera ${id} has coordinates outside Catalonia: lat=${latitude}, lng=${longitude}`);
        return null;
    }
    
    // Create name from available information
    const name = municipality || road || `Càmera ${index}`;
    const description = `${road || ''} ${pk ? `PK ${pk}` : ''} ${municipality ? `(${municipality})` : ''}`.trim();
    
    return {
        id: id,
        name: name,
        lat: latitude,
        lng: longitude,
        imageUrl: imageUrl,
        road: road,
        pk: pk,
        municipality: municipality,
        direction: '', // Not available in this XML
        description: description
    };
}

// Display traffic cameras on map and in list
function displayTrafficCameras(cameras) {
    // Clear existing camera markers
    clearTrafficCameras();
    
    const camerasContainer = document.getElementById('cameras-container');
    camerasContainer.innerHTML = '';
    
    // Create grid layout for camera thumbnails
    const cameraGrid = document.createElement('div');
    cameraGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
    `;
    
    cameras.forEach(camera => {
        // Add marker to map
        addCameraMarker(camera);
        
        // Add thumbnail to list
        addCameraThumbnail(camera, cameraGrid);
    });
    
    camerasContainer.appendChild(cameraGrid);
    
    console.log(`✅ Displayed ${cameras.length} traffic cameras`);
}

// Add camera marker to map
function addCameraMarker(camera) {
    const marker = L.marker([camera.lat, camera.lng], {
        icon: L.divIcon({
            html: `<div style="background: #17a2b8; border: 2px solid white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">📹</div>`,
            className: 'camera-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    });
    
    // Create popup content
    let popupContent = `<div style="max-width: 250px;">
        <h4 style="margin: 0 0 8px 0; color: #17a2b8;">📹 ${camera.name}</h4>`;
    
    if (camera.road) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Carretera:</strong> ${camera.road}</p>`;
    }
    
    if (camera.municipality) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Municipi:</strong> ${camera.municipality}</p>`;
    }
    
    if (camera.pk) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>PK:</strong> ${camera.pk}</p>`;
    }
    
    if (camera.imageUrl) {
        popupContent += `<p style="margin: 8px 0;"><img src="${camera.imageUrl}" alt="${camera.name}" style="max-width: 100%; border-radius: 4px; border: 1px solid #ddd;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <span style="display: none; color: #666; font-size: 11px;">Imatge no disponible</span></p>`;
        popupContent += `<p style="margin: 4px 0;"><a href="${camera.imageUrl}" target="_blank" style="color: #17a2b8; text-decoration: none; font-size: 12px;">🔗 Obrir imatge en finestra nova</a></p>`;
    }
    
    popupContent += `<p style="margin: 4px 0; font-size: 11px; color: #666;">ID: ${camera.id}</p>
        <p style="margin: 4px 0; font-size: 10px; color: #999;">${camera.lat.toFixed(4)}, ${camera.lng.toFixed(4)}</p>
        </div>`;
    
    marker.bindPopup(popupContent);
    marker.addTo(map);
    trafficCameraMarkers.push(marker);
}

// Add camera thumbnail to list
function addCameraThumbnail(camera, container) {
    const thumbnail = document.createElement('div');
    thumbnail.style.cssText = `
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 10px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    thumbnail.innerHTML = `
        <div style="font-weight: bold; color: #17a2b8; margin-bottom: 5px; font-size: 12px;">📹 ${camera.name}</div>
        <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${camera.description || 'Sense descripció'}</div>
        ${camera.imageUrl ? `<img src="${camera.imageUrl}" alt="${camera.name}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" onerror="this.style.display='none';">` : '<div style="width: 100%; height: 80px; background: #f8f9fa; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px;">Sense imatge</div>'}
        <div style="margin-top: 8px; font-size: 10px; color: #999;">${camera.lat.toFixed(4)}, ${camera.lng.toFixed(4)}</div>
    `;
    
    // Hover effects
    thumbnail.onmouseover = () => {
        thumbnail.style.transform = 'translateY(-2px)';
        thumbnail.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    };
    
    thumbnail.onmouseout = () => {
        thumbnail.style.transform = 'translateY(0)';
        thumbnail.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    };
    
    // Click to zoom to camera
    thumbnail.onclick = () => {
        map.setView([camera.lat, camera.lng], 16);
        // Find and open the corresponding marker popup
        trafficCameraMarkers.forEach(marker => {
            const markerLatLng = marker.getLatLng();
            if (Math.abs(markerLatLng.lat - camera.lat) < 0.0001 && 
                Math.abs(markerLatLng.lng - camera.lng) < 0.0001) {
                marker.openPopup();
            }
        });
    };
    
    container.appendChild(thumbnail);
}

// Clear traffic cameras from map and list
function clearTrafficCameras() {
    // Remove all camera markers from map
    trafficCameraMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    trafficCameraMarkers = [];
    
    // Hide cameras section
    document.getElementById('traffic-cameras-section').style.display = 'none';
}

// Load Andorra cameras from mobilitat.ad API
async function loadAndorraCameras() {
    try {
        console.log('🇦🇩 Loading Andorra cameras from mobilitat.ad...');
        updateStatus('Carregant càmeres d\'Andorra...');
        
        // Detect deployment environment for API calls
        var hostname = window.location.hostname;
        var isGitHubPages = hostname.includes('github.io');
        var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

        // Function to get API URL based on environment
        function getApiUrl(endpoint) {
            if (isVercel) {
                // Use Vercel API
                return endpoint;
            } else if (isGitHubPages) {
                // Use Vercel proxy from GitHub Pages
                return 'https://tempsrealcat.vercel.app' + endpoint;
            } else {
                // Local development
                return endpoint;
            }
        }
        
        // Fetch Andorra cameras API data using proxy
        const andorraApiUrl = 'https://app.mobilitat.ad/api/v1/cameras';
        const proxyUrl = getApiUrl(`/api/proxy?url=${encodeURIComponent(andorraApiUrl)}`);
        
        console.log('📡 Fetching Andorra cameras from:', proxyUrl);
        const response = await fetch(proxyUrl, {
            headers: {
                'token': '0b48426d-af88-45cf-8caa-8cb3b9858266'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Successfully fetched Andorra cameras data');
        
        // Parse cameras from the API response
        const cameras = parseAndorraCameras(data);
        console.log(`🇦🇩 Found ${cameras.length} Andorra cameras`);
        
        // Display cameras
        displayAndorraCameras(cameras);
        
        // Show cameras section
        document.getElementById('traffic-cameras-section').style.display = 'block';
        document.getElementById('clear-traffic-btn').style.display = 'inline-block';
        
        updateStatus(`S'han carregat ${cameras.length} càmeres d'Andorra`);
        
    } catch (error) {
        console.error('❌ Error loading Andorra cameras:', error);
        updateStatus(`Error carregant càmeres d'Andorra: ${error.message}`);
    }
}

// Parse Andorra cameras API response
function parseAndorraCameras(data) {
    const cameras = [];
    
    if (!data.success || !data.result || !Array.isArray(data.result)) {
        console.warn('Invalid Andorra cameras API response format');
        return cameras;
    }
    
    data.result.forEach((camera, index) => {
        try {
            const cameraData = {
                id: camera.id || `andorra-${index}`,
                name: camera.title || `Càmera Andorra ${index}`,
                lat: parseFloat(camera.lat),
                lng: parseFloat(camera.lng),
                imageUrl: camera.url_gif,
                road: extractRoadFromTitle(camera.title),
                pk: extractPKFromTitle(camera.title),
                altitude: extractAltitudeFromTitle(camera.title),
                categoryId: camera.category_id,
                categoryOrder: camera.category_order,
                cameraOrder: camera.camera_order,
                icon: camera.icon,
                source: 'ANDORRA',
                description: camera.title || 'Sense descripció'
            };
            
            // Validate coordinates
            if (isNaN(cameraData.lat) || isNaN(cameraData.lng)) {
                console.warn(`Andorra camera ${cameraData.id} has invalid coordinates: lat=${cameraData.lat}, lng=${cameraData.lng}`);
                return;
            }
            
            // Check if coordinates are in reasonable range for Andorra
            if (cameraData.lat < 42.4 || cameraData.lat > 42.7 || cameraData.lng < 1.4 || cameraData.lng > 1.8) {
                console.warn(`Andorra camera ${cameraData.id} has coordinates outside Andorra: lat=${cameraData.lat}, lng=${cameraData.lng}`);
                return;
            }
            
            cameras.push(cameraData);
        } catch (error) {
            console.warn(`Error parsing Andorra camera ${index}:`, error);
        }
    });
    
    return cameras;
}

// Extract road information from Andorra camera title
function extractRoadFromTitle(title) {
    if (!title) return '';
    const roadMatch = title.match(/(CG\d+|CS\d+|C\d+)/);
    return roadMatch ? roadMatch[1] : '';
}

// Extract PK information from Andorra camera title
function extractPKFromTitle(title) {
    if (!title) return '';
    const pkMatch = title.match(/PK\s*([\d\+\-]+)/);
    return pkMatch ? pkMatch[1] : '';
}

// Extract altitude from Andorra camera title
function extractAltitudeFromTitle(title) {
    if (!title) return '';
    const altitudeMatch = title.match(/([\d,]+)\s*metres/);
    return altitudeMatch ? altitudeMatch[1] : '';
}

// Display Andorra cameras on map and in list
function displayAndorraCameras(cameras) {
    // Clear existing camera markers
    clearTrafficCameras();
    
    const camerasContainer = document.getElementById('cameras-container');
    camerasContainer.innerHTML = '';
    
    // Add header for Andorra cameras
    const header = document.createElement('div');
    header.innerHTML = '<h4 style="color: #e83e8c; margin-bottom: 10px;">🇦🇩 Càmeres d\'Andorra</h4>';
    camerasContainer.appendChild(header);
    
    // Create grid layout for camera thumbnails
    const cameraGrid = document.createElement('div');
    cameraGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 15px;
    `;
    
    cameras.forEach(camera => {
        // Add marker to map
        addAndorraCameraMarker(camera);
        
        // Add thumbnail to list
        addAndorraCameraThumbnail(camera, cameraGrid);
    });
    
    camerasContainer.appendChild(cameraGrid);
    
    console.log(`✅ Displayed ${cameras.length} Andorra traffic cameras`);
}

// Add Andorra camera marker to map
function addAndorraCameraMarker(camera) {
    const marker = L.marker([camera.lat, camera.lng], {
        icon: L.divIcon({
            html: `<div style="background: #e83e8c; border: 2px solid white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🇦🇩</div>`,
            className: 'andorra-camera-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    });
    
    // Create popup content
    let popupContent = `<div style="max-width: 250px;">
        <h4 style="margin: 0 0 8px 0; color: #e83e8c;">🇦🇩 ${camera.name}</h4>`;
    
    if (camera.road) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Carretera:</strong> ${camera.road}</p>`;
    }
    
    if (camera.pk) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>PK:</strong> ${camera.pk}</p>`;
    }
    
    if (camera.altitude) {
        popupContent += `<p style="margin: 4px 0; font-size: 12px;"><strong>Altitud:</strong> ${camera.altitude} metres</p>`;
    }
    
    if (camera.imageUrl) {
        popupContent += `<p style="margin: 8px 0;"><img src="${camera.imageUrl}" alt="${camera.name}" style="max-width: 100%; border-radius: 4px; border: 1px solid #ddd;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <span style="display: none; color: #666; font-size: 11px;">Imatge no disponible</span></p>`;
        popupContent += `<p style="margin: 4px 0;"><a href="${camera.imageUrl}" target="_blank" style="color: #e83e8c; text-decoration: none; font-size: 12px;">🔗 Obrir imatge en finestra nova</a></p>`;
    }
    
    popupContent += `<p style="margin: 4px 0; font-size: 11px; color: #666;">ID: ${camera.id}</p>
        <p style="margin: 4px 0; font-size: 10px; color: #999;">${camera.lat.toFixed(4)}, ${camera.lng.toFixed(4)}</p>
        </div>`;
    
    marker.bindPopup(popupContent);
    marker.addTo(map);
    trafficCameraMarkers.push(marker);
}

// Add Andorra camera thumbnail to list
function addAndorraCameraThumbnail(camera, container) {
    const thumbnail = document.createElement('div');
    thumbnail.style.cssText = `
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 10px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    thumbnail.innerHTML = `
        <div style="font-weight: bold; color: #e83e8c; margin-bottom: 5px; font-size: 12px;">🇦🇩 ${camera.name}</div>
        <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${camera.description}</div>
        ${camera.imageUrl ? `<img src="${camera.imageUrl}" alt="${camera.name}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" onerror="this.style.display='none';">` : '<div style="width: 100%; height: 80px; background: #f8f9fa; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px;">Sense imatge</div>'}
        <div style="margin-top: 8px; font-size: 10px; color: #999;">${camera.lat.toFixed(4)}, ${camera.lng.toFixed(4)}</div>
    `;
    
    // Hover effects
    thumbnail.onmouseover = () => {
        thumbnail.style.transform = 'translateY(-2px)';
        thumbnail.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    };
    
    thumbnail.onmouseout = () => {
        thumbnail.style.transform = 'translateY(0)';
        thumbnail.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    };
    
    // Click to zoom to camera
    thumbnail.onclick = () => {
        map.setView([camera.lat, camera.lng], 16);
        // Find and open the corresponding marker popup
        trafficCameraMarkers.forEach(marker => {
            const markerLatLng = marker.getLatLng();
            if (Math.abs(markerLatLng.lat - camera.lat) < 0.0001 && 
                Math.abs(markerLatLng.lng - camera.lng) < 0.0001) {
                marker.openPopup();
            }
        });
    };
    
    container.appendChild(thumbnail);
}
