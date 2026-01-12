 // Traffic functions for DGT DATEX2 data

// Global variables
let trafficMarkers = [];
let currentFilter = 'all';

// Initialize traffic functions when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Traffic functions are ready
    console.log('Traffic functions loaded');
});

// Load traffic data from DGT API and GENCAT APIs
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

        // Fetch data from all sources in parallel
        const [dgtResponse, rssResponse, gmlResponse] = await Promise.allSettled([
            fetch(getApiUrl('/api/dgt-traffic')),
            fetch(getApiUrl('/api/gencat-rss-traffic')),
            fetch(getApiUrl('/api/gencat-gml-traffic'))
        ]);

        let allIncidents = [];

        // Process DGT data
        if (dgtResponse.status === 'fulfilled' && dgtResponse.value.ok) {
            const dgtXmlText = await dgtResponse.value.text();
            console.log('✅ DGT traffic XML data received');
            const dgtIncidents = parseDGTXML(dgtXmlText);
            allIncidents = allIncidents.concat(dgtIncidents.map(incident => ({ ...incident, source: 'DGT' })));
        } else {
            console.warn('⚠️ Failed to fetch DGT data:', dgtResponse.status === 'rejected' ? dgtResponse.reason : dgtResponse.value.statusText);
        }

        // Process GENCAT RSS data
        if (rssResponse.status === 'fulfilled' && rssResponse.value.ok) {
            const rssXmlText = await rssResponse.value.text();
            console.log('✅ GENCAT RSS traffic XML data received');
            const rssIncidents = parseGENCATRSS(rssXmlText);
            console.log('📊 GENCAT RSS parsed incidents:', rssIncidents.length);
            allIncidents = allIncidents.concat(rssIncidents.map(incident => ({ ...incident, source: 'GENCAT_RSS' })));
        } else {
            console.warn('⚠️ Failed to fetch GENCAT RSS data:', rssResponse.status === 'rejected' ? rssResponse.reason : rssResponse.value.statusText);
        }

        // Process GENCAT GML data
        if (gmlResponse.status === 'fulfilled' && gmlResponse.value.ok) {
            const gmlXmlText = await gmlResponse.value.text();
            console.log('✅ GENCAT GML traffic XML data received');
            const gmlIncidents = parseGENCATGML(gmlXmlText);
            console.log('📊 GENCAT GML parsed incidents:', gmlIncidents.length);
            allIncidents = allIncidents.concat(gmlIncidents.map(incident => ({ ...incident, source: 'GENCAT_GML' })));
        } else {
            console.warn('⚠️ Failed to fetch GENCAT GML data:', gmlResponse.status === 'rejected' ? gmlResponse.reason : gmlResponse.value.statusText);
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

// Parse DGT DATEX2 XML data
function parseDGTXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const incidents = [];

    // Find all situation records
    const situationRecords = xmlDoc.querySelectorAll('situationRecord');
    console.log('Found', situationRecords.length, 'situation records in XML');

    // Count record types
    const recordTypes = {};
    situationRecords.forEach(record => {
        const recordType = record.getAttribute('xsi:type');
        recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
    });
    console.log('Record types found:', recordTypes);

    situationRecords.forEach((record, index) => {
        try {
            const incident = parseSituationRecord(record, index);
            if (incident) {
                incidents.push(incident);
                console.log('Parsed incident:', incident.category, incident.title);
            }
        } catch (error) {
            console.warn('Error parsing situation record:', error);
        }
    });

    console.log('Successfully parsed', incidents.length, 'incidents');
    return incidents;
}

// Parse individual situation record
function parseSituationRecord(record, index) {
    const recordType = record.getAttribute('xsi:type');
    const situationId = record.closest('situation')?.getAttribute('id') || `incident-${index}`;

    // Extract basic information
    const validity = record.querySelector('validity');
    const isActive = validity?.querySelector('validityStatus')?.textContent === 'active';

    if (!isActive) return null;

    // Extract location information
    const location = extractLocationInfo(record);
    // Don't filter out incidents without coordinates - they can still be displayed in the list

    // Extract incident details based on type
    let incidentDetails = {
        id: situationId,
        type: recordType,
        location: location,
        active: true
    };

    // Determine level and color based on incident type (1=lowest to 5=highest severity)
    let level = 1;
    let levelColor = '#28a745'; // Green for level 1

    switch (recordType) {
        case '_0:MaintenanceWorks':
            incidentDetails.category = 'maintenance';
            incidentDetails.title = 'Obres de manteniment';
            incidentDetails.description = extractMaintenanceInfo(record);
            incidentDetails.icon = '🔧';
            level = 2;
            levelColor = '#ffc107'; // Yellow for level 2
            break;

        case '_0:AbnormalTraffic':
            incidentDetails.category = 'congestion';
            incidentDetails.title = 'Trànsit anormal';
            incidentDetails.description = extractAbnormalTrafficInfo(record);
            incidentDetails.icon = '🚗';
            level = 3;
            levelColor = '#fd7e14'; // Orange for level 3
            break;

        case '_0:Accident':
            incidentDetails.category = 'accident';
            incidentDetails.title = 'Accident';
            incidentDetails.description = extractAccidentInfo(record);
            incidentDetails.icon = '🚨';
            level = 4;
            levelColor = '#dc3545'; // Red for level 4
            console.log('Found DGT accident incident:', incidentDetails.id);
            break;

        case '_0:Obstruction':
            const obstructionType = extractObstructionType(record);
            incidentDetails.category = obstructionType.category;
            incidentDetails.title = obstructionType.title;
            incidentDetails.description = obstructionType.description;
            incidentDetails.icon = obstructionType.icon;
            level = 3;
            levelColor = '#fd7e14'; // Orange for level 3
            break;

        case '_0:PoorRoadInfrastructure':
            incidentDetails.category = 'maintenance';
            incidentDetails.title = 'Infraestructura danyada';
            incidentDetails.description = extractPoorInfrastructureInfo(record);
            incidentDetails.icon = '⚠️';
            level = 2;
            levelColor = '#ffc107'; // Yellow for level 2
            break;

        case '_0:NetworkManagement':
            incidentDetails.category = 'closure';
            incidentDetails.title = 'Gestió de xarxa';
            incidentDetails.description = extractNetworkManagementInfo(record);
            incidentDetails.icon = '🔄';
            level = 5;
            levelColor = '#000000'; // Black for level 5
            break;

        case '_0:PoorEnvironmentConditions':
            incidentDetails.category = 'weather';
            incidentDetails.title = 'Condicions ambientals adverses';
            incidentDetails.description = extractPoorEnvironmentInfo(record);
            incidentDetails.icon = '🌤️';
            level = 5;
            levelColor = '#000000'; // Black for level 5
            break;

        case '_0:SignSetting':
            incidentDetails.category = 'other';
            incidentDetails.title = 'Senyalització';
            incidentDetails.description = extractSignSettingInfo(record);
            incidentDetails.icon = '📋';
            level = 1;
            levelColor = '#17a2b8'; // Blue for level 1
            break;

        case '_0:RoadsideAssistance':
            incidentDetails.category = 'other';
            incidentDetails.title = 'Assistència en carretera';
            incidentDetails.description = extractRoadsideAssistanceInfo(record);
            incidentDetails.icon = '🚐';
            level = 1;
            levelColor = '#28a745'; // Green for level 1
            break;

        case '_0:Activities':
            incidentDetails.category = 'other';
            incidentDetails.title = 'Activitats';
            incidentDetails.description = extractActivitiesInfo(record);
            incidentDetails.icon = '👷';
            level = 1;
            levelColor = '#28a745'; // Green for level 1
            break;

        default:
            incidentDetails.category = 'other';
            incidentDetails.title = `Incident: ${recordType}`;
            incidentDetails.description = 'Tipus d\'incident no identificat';
            incidentDetails.icon = '⚠️';
            level = 1;
            levelColor = '#28a745'; // Green for level 1
    }

    incidentDetails.level = level;
    incidentDetails.color = levelColor;

    return incidentDetails;
}

// Extract location information from the record
function extractLocationInfo(record) {
    const location = {};

    // DATEX2 Location Types Support
    // 1. PointByCoordinates - Geographic coordinates
    const pointCoordinates = record.querySelector('pointCoordinates');
    if (pointCoordinates) {
        const latitude = pointCoordinates.querySelector('latitude');
        const longitude = pointCoordinates.querySelector('longitude');

        if (latitude && longitude) {
            location.lat = parseFloat(latitude.textContent);
            location.lng = parseFloat(longitude.textContent);
            location.hasCoordinates = true;
            location.locationType = 'PointByCoordinates';
        }
    }

    // 2. ReferencePoint - Road reference points (PK)
    const referencePoint = record.querySelector('referencePoint');
    if (referencePoint && !location.hasCoordinates) {
        const roadNumber = referencePoint.querySelector('roadNumber');
        const referencePointIdentifier = referencePoint.querySelector('referencePointIdentifier');
        const referencePointDistance = referencePoint.querySelector('referencePointDistance');

        if (roadNumber) location.roadNumber = roadNumber.textContent;
        if (referencePointIdentifier) location.referencePointId = referencePointIdentifier.textContent;
        if (referencePointDistance) location.distance = parseFloat(referencePointDistance.textContent);

        location.locationType = 'ReferencePoint';
        location.description = `PK ${location.distance || 'unknown'} - Carretera ${location.roadNumber || 'unknown'}`;
        console.log('ReferencePoint location found (no coordinates):', location.description);
    }

    // 3. AlertCPoint - AlertC table reference
    const alertCPoint = record.querySelector('alertCPoint');
    if (alertCPoint && !location.hasCoordinates) {
        const alertCLocation = alertCPoint.querySelector('alertCLocation');
        if (alertCLocation) {
            location.alertCLocation = alertCLocation.textContent;
        }
        location.locationType = 'AlertCPoint';
        location.description = `Referència AlertC: ${location.alertCLocation || 'unknown'}`;
        console.log('AlertCPoint location found (no coordinates):', location.description);
    }

    // 4. TPEGPointLocation - TPEG-Loc structure
    const tpegPointLocation = record.querySelector('tpegPointLocation');
    if (tpegPointLocation && !location.hasCoordinates) {
        location.locationType = 'TPEGPointLocation';
        location.description = 'Localització TPEG (sense coordenades disponibles)';
        console.log('TPEGPointLocation found (no coordinates)');
    }

    // 5. Linear locations (ReferencePointLinear, AlertCLinear, TPEGLinearLocation)
    const linearLocation = record.querySelector('referencePointLinear') ||
                          record.querySelector('alertCLinear') ||
                          record.querySelector('tpegLinearLocation');
    if (linearLocation && !location.hasCoordinates) {
        const fromPoint = linearLocation.querySelector('from referencePoint');
        const toPoint = linearLocation.querySelector('to referencePoint');

        location.locationType = 'Linear';
        location.description = 'Secció lineal de carretera (sense coordenades disponibles)';
        console.log('Linear location found (no coordinates)');
    }

    // 6. Area locations (AlertCArea, TPEGAreaLocation)
    const areaLocation = record.querySelector('alertCArea') ||
                        record.querySelector('tpegAreaLocation');
    if (areaLocation && !location.hasCoordinates) {
        location.locationType = 'Area';
        location.description = 'Àrea geogràfica (sense coordenades disponibles)';
        console.log('Area location found (no coordinates)');
    }

    // Extract road information
    const roadName = record.querySelector('roadName value');
    if (roadName) {
        location.road = roadName.textContent;
    }

    const roadNumber = record.querySelector('roadNumber');
    if (roadNumber && !location.roadNumber) {
        location.roadNumber = roadNumber.textContent;
    }

    // Extract town name
    const townName = record.querySelector('townName value');
    if (townName) {
        location.town = townName.textContent;
    }

    // Extract direction information
    const directionBound = record.querySelector('directionBound');
    if (directionBound) {
        location.direction = directionBound.textContent;
    }

    // For locations without coordinates, create a description
    if (!location.hasCoordinates && location.locationType) {
        location.displayText = location.description ||
                              `${location.locationType}: ${location.roadNumber || ''} ${location.road || ''}`.trim() ||
                              'Localització sense coordenades';
    }

    // Always return location object, even without coordinates - incidents can still be displayed in cards
    return location;
}

// Extract maintenance works information
function extractMaintenanceInfo(record) {
    let info = 'Obres de manteniment en curs.';

    // Add any additional details if available
    const roadworksType = record.querySelector('roadworksTypeOfWork');
    if (roadworksType) {
        info += ` Tipus: ${roadworksType.textContent}.`;
    }

    return info;
}

// Extract abnormal traffic information
function extractAbnormalTrafficInfo(record) {
    let info = 'Circulació anormal detectada.';

    const abnormalTrafficType = record.querySelector('abnormalTrafficType');
    if (abnormalTrafficType) {
        const trafficType = abnormalTrafficType.textContent;
        switch (trafficType) {
            case 'stopAndGo':
                info = 'Trànsit molt dens amb parades i arrencades.';
                break;
            case 'queuingTraffic':
                info = 'Cua de vehicles significativa.';
                break;
            case 'slowTraffic':
                info = 'Trànsit lent.';
                break;
        }
    }

    return info;
}

// Extract accident information
function extractAccidentInfo(record) {
    let info = 'Accident de trànsit.';

    // Add accident type if available
    const accidentType = record.querySelector('accidentType');
    if (accidentType) {
        info += ` Tipus: ${accidentType.textContent}.`;
    }

    return info;
}

// Extract rerouting information
function extractReroutingInfo(record) {
    let info = 'Desviament de trànsit actiu.';

    // Add rerouting details if available
    const reroutingType = record.querySelector('reroutingTypeOfWork');
    if (reroutingType) {
        info += ` Tipus: ${reroutingType.textContent}.`;
    }

    return info;
}

// Extract obstruction type and information
function extractObstructionType(record) {
    // Check for obstruction cause
    const animalPresence = record.querySelector('animalPresenceTypeOfObstruction');
    const environmentalObstruction = record.querySelector('environmentalObstructionType');
    const equipmentDamage = record.querySelector('equipmentDamageType');
    const vehicleObstruction = record.querySelector('vehicleObstructionType');

    if (animalPresence) {
        return {
            category: 'accident',
            title: 'Obstrucció per animals',
            description: `Presència d'animals a la carretera: ${animalPresence.textContent}`,
            icon: '🦌',
            color: '#fd7e14'
        };
    }

    if (environmentalObstruction) {
        return {
            category: 'closure',
            title: 'Obstrucció ambiental',
            description: `Obstrucció per causes ambientals: ${environmentalObstruction.textContent}`,
            icon: '🌊',
            color: '#20c997'
        };
    }

    if (equipmentDamage) {
        return {
            category: 'maintenance',
            title: 'Equipament danyat',
            description: `Equipament danyat: ${equipmentDamage.textContent}`,
            icon: '⚙️',
            color: '#ffc107'
        };
    }

    if (vehicleObstruction) {
        return {
            category: 'accident',
            title: 'Obstrucció per vehicle',
            description: `Obstrucció causada per vehicle: ${vehicleObstruction.textContent}`,
            icon: '🚧',
            color: '#dc3545'
        };
    }

    // Default obstruction
    return {
        category: 'closure',
        title: 'Obstrucció de carretera',
        description: 'Obstrucció general de la carretera',
        icon: '🚧',
        color: '#6c757d'
    };
}

// Extract poor road infrastructure information
function extractPoorInfrastructureInfo(record) {
    let info = 'Infraestructura de carretera en mal estat.';

    const malfunctioningControls = record.querySelector('malfunctioningTrafficControls');
    if (malfunctioningControls) {
        info += ' Controls de trànsit defectuosos.';
    }

    return info;
}

// Extract network management information
function extractNetworkManagementInfo(record) {
    let info = 'Gestió de la xarxa de carreteres activa.';

    // Add management type if available
    const managementType = record.querySelector('networkManagementType');
    if (managementType) {
        info += ` Tipus: ${managementType.textContent}.`;
    }

    return info;
}

// Extract sign setting information
function extractSignSettingInfo(record) {
    let info = 'Informació de senyalització variable.';

    const message = record.querySelector('message');
    if (message) {
        info += ` Missatge: ${message.textContent}`;
    }

    return info;
}

// Extract roadside assistance information
function extractRoadsideAssistanceInfo(record) {
    let info = 'Servei d\'assistència en carretera disponible.';

    const assistanceType = record.querySelector('roadsideAssistanceType');
    if (assistanceType) {
        info += ` Tipus: ${assistanceType.textContent}.`;
    }

    return info;
}

// Extract activities information
function extractActivitiesInfo(record) {
    let info = 'Activitats que afecten el trànsit.';

    const activityType = record.querySelector('activityType');
    if (activityType) {
        info += ` Tipus: ${activityType.textContent}.`;
    }

    return info;
}

// Extract poor environment conditions information
function extractPoorEnvironmentInfo(record) {
    let info = 'Condicions ambientals adverses detectades.';

    // Check for specific environmental conditions
    const poorEnvironmentType = record.querySelector('poorEnvironmentType');
    if (poorEnvironmentType) {
        const condition = poorEnvironmentType.textContent;
        switch (condition) {
            case 'badWeather':
                info = 'Mal temps que afecta la circulació.';
                break;
            case 'blizzard':
                info = 'Tempesta de neu intensa.';
                break;
            case 'damagingHail':
                info = 'Calamarsa danyina.';
                break;
            case 'denseFog':
                info = 'Boira densa que redueix la visibilitat.';
                break;
            case 'extremeCold':
                info = 'Fred extrem que afecta les condicions de circulació.';
                break;
            case 'extremeHeat':
                info = 'Calor extrema que afecta les condicions de circulació.';
                break;
            case 'flooding':
                info = 'Inundacions que afecten la carretera.';
                break;
            case 'gales':
                info = 'Vent fort (galerna) que afecta la circulació.';
                break;
            case 'heavyRain':
                info = 'Pluja intensa.';
                break;
            case 'heavySnowfall':
                info = 'Nevada intensa.';
                break;
            case 'snowfall':
                info = 'Nevada en curs.';
                break;
            case 'lowVisibility':
                info = 'Baixa visibilitat per condicions meteorològiques.';
                break;
            case 'precipitation':
                info = 'Precipitació que afecta la circulació.';
                break;
            case 'severeFrost':
                info = 'Gelada severa.';
                break;
            case 'smoke':
                info = 'Fum que redueix la visibilitat.';
                break;
            case 'strongWinds':
                info = 'Vent fort que afecta la circulació.';
                break;
            default:
                info = `Condició ambiental adversa: ${condition}.`;
        }
    }

    return info;
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

// Geocode a single incident using Overpass API
async function geocodeIncidentLocation(incident) {
    const roadRef = incident.location.roadNumber || incident.location.road;
    const placeName = incident.location.town;

    if (!roadRef) {
        console.log(`Cannot geocode incident ${incident.id}: no road reference`);
        return null;
    }

    try {
        // Try multiple Overpass servers to avoid timeouts
        const overpassServers = [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter'
        ];

        let response = null;
        let serverTried = null;

        for (const server of overpassServers) {
            try {
                // Build simpler Overpass query to avoid timeouts
                const overpassQuery = `
                    [out:json][timeout:15];
                    way["highway"]["ref"="${roadRef}"](around:30000,41.5912,1.5209);
                    out center;
                `;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

                response = await fetch(server, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: `data=${encodeURIComponent(overpassQuery)}`,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                serverTried = server;

                if (response.ok) break; // Use first successful response

            } catch (error) {
                console.warn(`Overpass server ${server} failed:`, error.message);
                continue;
            }
        }

        if (!response || !response.ok) {
            throw new Error(`All Overpass servers failed or returned ${response?.status}`);
        }

        if (!response.ok) {
            throw new Error(`Overpass API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.elements && data.elements.length > 0) {
            // Return the center coordinates of the first matching element
            const element = data.elements[0];
            return {
                lat: element.center ? element.center.lat : element.lat,
                lng: element.center ? element.center.lon : element.lon
            };
        }

        console.log(`No OSM data found for road ${roadRef}`);
        return null;

    } catch (error) {
        console.warn(`Overpass API error for road ${roadRef}:`, error);
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

    // Create table with road references and locate buttons
    const table = document.createElement('table');
    table.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        background: white;
        min-width: 700px;
    `;

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; width: 40px; cursor: pointer;" onclick="sortTable(0)" id="sort-level">LEVEL ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(1)" id="sort-road">ROAD REF ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(2)" id="sort-location">LOCATION ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(3)" id="sort-pk">PK ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(4)" id="sort-direction">DIRECTION ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(5)" id="sort-description">DESCRIPTION ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; cursor: pointer;" onclick="sortTable(6)" id="sort-source">SOURCE ▼</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; width: 120px;">LOCATE</th>
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
    tableContainer.appendChild(table);
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
        'DGT': 'DGT (Dirección General de Tráfico)',
        'GENCAT_RSS': 'GENCAT (Generalitat de Catalunya - RSS)',
        'GENCAT_GML': 'GENCAT (Generalitat de Catalunya - GML)'
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

    // Click handler to zoom to incident
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

    // Parse description format: "ROAD | LOCATION | DIRECTION | PK_RANGE | TIME"
    const descParts = description.split(' | ').map(part => part.trim());
    if (descParts.length < 4) {
        console.warn('Invalid GENCAT RSS description format:', description);
        return null;
    }

    const [roadRef, location, direction, pkRange] = descParts;

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
        town: location,
        direction: direction,
        pkStart: pkStart,
        pkEnd: pkEnd,
        lat: lat,
        lng: lng,
        description: `${roadRef} - ${location} (${pkRange})`,
        hasCoordinates: hasCoords, // Check if coordinates were found
        displayText: `${roadRef} - ${location} (${pkRange})`
    };

    // Determine level and color based on severity (1=lowest to 5=highest)
    let level = 1;
    let category = 'other';
    let icon = '⚠️';
    let levelColor = '#28a745'; // Green for level 1

    const titleLower = title.toLowerCase();
    if (titleLower.includes('obres') || titleLower.includes('manteniment') || titleLower.includes('reparaci')) {
        category = 'maintenance';
        icon = '🔧';
        level = 2; // Maintenance is medium severity
        levelColor = '#ffc107'; // Yellow for level 2
    } else if (titleLower.includes('accident') || titleLower.includes('col·lisió')) {
        category = 'accident';
        icon = '🚨';
        level = 4; // Accidents are high severity
        levelColor = '#dc3545'; // Red for level 4
    } else if (titleLower.includes('tall') || titleLower.includes('tancat')) {
        category = 'closure';
        icon = '🚧';
        level = 5; // Closures are highest severity
        levelColor = '#6f42c1'; // Purple for level 5
    } else if (titleLower.includes('manifestaci') || titleLower.includes('retenci')) {
        category = 'congestion';
        icon = '🚗';
        level = 3; // Congestion is medium-high severity
        levelColor = '#fd7e14'; // Orange for level 3
    } else if (titleLower.includes('neu') || titleLower.includes('meteorol')) {
        category = 'weather';
        icon = '❄️';
        level = 5; // Weather incidents are high severity
        levelColor = '#6f42c1'; // Purple for level 5
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
    const nivell = parseInt(mct2Data.querySelector('cite\\:nivell, nivell')?.textContent || '1');

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
        description: `${carretera || 'Unknown'} - PK ${pkInici}-${pkFi}`,
        displayText: `${carretera || 'Unknown'} - PK ${pkInici}-${pkFi} (${sentit || ''})`
    };

    // Determine level and color based on severity (consistent with DGT and RSS logic)
    let level = 1;
    let category = 'other';
    let icon = '⚠️';
    let levelColor = '#28a745'; // Green for level 1

    const causaLower = (causa || '').toLowerCase();
    const descLower = (descripcio || '').toLowerCase();
    const tipusLower = (descripcioTipus || '').toLowerCase();

    if (causaLower.includes('neu') || tipusLower.includes('meteorol')) {
        category = 'weather';
        icon = '❄️';
        level = 5; // Weather incidents are highest severity
        levelColor = '#000000'; // Black for level 5
    } else if (descLower.includes('tall') || descLower.includes('tancat') || nivell >= 5) {
        category = 'closure';
        icon = '🚧';
        level = 5; // Closures are highest severity
        levelColor = '#000000'; // Black for level 5
    } else if (tipusLower.includes('accident') || causaLower.includes('accident')) {
        category = 'accident';
        icon = '🚨';
        level = 4; // Accidents are high severity
        levelColor = '#dc3545'; // Red for level 4
    } else if (tipusLower.includes('retenci') || causaLower.includes('circulaci') || causaLower.includes('manifestaci')) {
        category = 'congestion';
        icon = '🚗';
        level = 3; // Congestion is medium-high severity
        levelColor = '#fd7e14'; // Orange for level 3
    } else if (tipusLower.includes('obres') || causaLower.includes('manteniment') || causaLower.includes('reparaci')) {
        category = 'maintenance';
        icon = '🔧';
        level = 2; // Maintenance is medium severity
        levelColor = '#ffc107'; // Yellow for level 2
    } else if (nivell >= 4) {
        // High level incidents from XML
        category = 'closure';
        icon = '🚧';
        level = 4;
        levelColor = '#dc3545'; // Red for level 4
    } else {
        // Low severity incidents
        category = 'other';
        icon = '⚠️';
        level = 1;
        levelColor = '#28a745'; // Green for level 1
    }

    const title = `${descripcio || 'Incident'} - ${carretera || 'Unknown'}`;

    return {
        id: identificador || `gencat-gml-${index}`,
        title: title,
        description: `${descripcio || 'Sense descripció'} (${descripcioTipus || 'Sense tipus'})`,
        category: category,
        icon: icon,
        color: levelColor,
        level: level,
        location: incidentLocation,
        nivell: nivell, // Store the level for table display
        active: true
    };
}

// Combine and deduplicate traffic incidents from multiple sources with priority order
function combineTrafficIncidents(allIncidents) {
    // Data source priority: 1=DGT, 2=GENCAT_GML, 3=GENCAT_RSS
    const sourcePriority = {
        'DGT': 1,
        'GENCAT_GML': 2,
        'GENCAT_RSS': 3
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
                // Current incident has higher priority, replace existing
                console.log(`Replacing ${existingIncident.source} with ${incident.source} for ${uniqueKey}`);
                incidentMap.set(uniqueKey, incident);
            } else {
                // Keep existing incident (higher priority)
                console.log(`Keeping ${existingIncident.source}, discarding ${incident.source} for ${uniqueKey}`);
            }
        }
    });

    const combined = Array.from(incidentMap.values());
    console.log(`Combined ${allIncidents.length} incidents into ${combined.length} unique incidents using priority order: DGT > GENCAT_GML > GENCAT_RSS`);
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

    // REASON - the main cause/description
    let reason = 'Unknown';
    if (incident.source === 'GENCAT_GML') {
        reason = incident.title || 'Unknown'; // Use the title for GML
    } else if (incident.source === 'GENCAT_RSS') {
        reason = incident.title || 'Unknown'; // Use the title for RSS
    } else {
        reason = incident.description || 'Unknown'; // Use description for DGT
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

    // Click handler to zoom to incident if it has coordinates
    card.onclick = () => {
        if (incident.location.hasCoordinates) {
            map.setView([incident.location.lat, incident.location.lng], 15);
            // Find and open the corresponding marker popup
            trafficMarkers.forEach(marker => {
                const markerLatLng = marker.getLatLng();
                if (markerLatLng.lat === incident.location.lat && markerLatLng.lng === incident.location.lng) {
                    marker.openPopup();
                }
            });
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

    // Get description (truncated for table)
    const description = (incident.description || incident.title || 'Unknown');
    const shortDesc = description.length > 60 ? description.substring(0, 57) + '...' : description;

    // Create locate button
    const locateBtn = document.createElement('button');
    locateBtn.textContent = 'Locate';
    locateBtn.style.cssText = `
        padding: 4px 8px;
        background: ${incident.color};
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 10px;
        font-weight: bold;
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
            alert('This incident does not have location coordinates available.');
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
    // Translate DATEX2 direction names to Catalan
    if (direction === 'northBound') direction = 'Sentit nord';
    else if (direction === 'southBound') direction = 'Sentit sud';
    else if (direction === 'eastBound') direction = 'Sentit est';
    else if (direction === 'westBound') direction = 'Sentit oest';
    else if (direction === 'bothWays') direction = 'Ambdós sentits';
    else if (direction === 'clockwise') direction = 'Sentit horari';
    else if (direction === 'counterclockwise') direction = 'Sentit antihorari';

    // Get source
    const sourceMap = {
        'DGT': 'DGT',
        'GENCAT_RSS': 'GENCAT',
        'GENCAT_GML': 'GENCAT'
    };
    const source = sourceMap[incident.source] || incident.source;

    row.innerHTML = `
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px; font-weight: bold; background: ${incident.color}; color: white; border-left: 3px solid ${incident.color};">${displayLevel}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px; font-weight: bold; color: ${incident.color};">${road}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${location}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${pk}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${direction}</td>
        <td style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 11px; max-width: 300px; word-wrap: break-word;">${shortDesc}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 11px;">${source}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;"></td>
    `;

    // Add the button to the last cell
    const lastCell = row.querySelector('td:last-child');
    lastCell.appendChild(locateBtn);

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

    row.innerHTML = `
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6; font-weight: bold; color: ${incident.color};">${level}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6;">${road}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #dee2e6;">${location}</td>
        <td style="padding: 6px; text-align: left; border: 1px solid #dee2e6; max-width: 300px; word-wrap: break-word;">${description}</td>
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

        // Numeric sorting for LEVEL (column 0) and PK (column 3)
        if (columnIndex === 0 || columnIndex === 3) {
            const aNum = parseFloat(aValue.replace(/[^\d.-]/g, '')) || 0;
            const bNum = parseFloat(bValue.replace(/[^\d.-]/g, '')) || 0;
            comparison = aNum - bNum;
        } else {
            // String sorting for other columns
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

    // Hide clear button and traffic sections
    document.getElementById('clear-traffic-btn').style.display = 'none';
    document.getElementById('traffic-table-section').style.display = 'none';
    document.getElementById('traffic-cards-section').style.display = 'none';
    document.getElementById('status-text').textContent = 'Preparat per carregar dades';
}
