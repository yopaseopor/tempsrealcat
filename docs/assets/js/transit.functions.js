// Transit Integration Functions
var transitLayers = [];
var transitMarkers = [];
var transitLegend = null;
var transitStatusInterval = null;

// Start transit visualization
function loadTransitType(type) {
    console.log('🚇 Loading transit type:', type);

    // Clear existing transit layers first
    clearTransitLayers();

    // Update status
    updateTransitStatus('Carregant dades de ' + getTransitTypeName(type) + '...');

    // Load specific transit type
    switch(type) {
        case 'metro':
            loadMetroTransit();
            break;
        case 'bus':
            loadBusTransit();
            break;
        case 'train':
            loadTrainTransit();
            break;
        case 'bicycle':
            loadBicycleTransit();
            break;
        case 'traffic':
            loadTrafficTransit();
            break;
        default:
            console.warn('Unknown transit type:', type);
            updateTransitStatus('Tipus de transport desconegut');
    }
}

// Load all transit types simultaneously
function loadAllTransit() {
    console.log('🚇 Loading all transit types...');

    // Clear existing layers
    clearTransitLayers();

    // Update status
    updateTransitStatus('Carregant tot el transport públic...');

    // Load all transit types in parallel
    var promises = [
        loadMetroTransit(),
        loadBusTransit(),
        loadTrainTransit(),
        loadBicycleTransit(),
        loadTrafficTransit()
    ];

    Promise.all(promises).then(function() {
        console.log('✅ All transit types loaded');
        updateTransitStatus('Tots els transports carregats');
        createTransitLegend();
        showTransitLegend();
    }).catch(function(error) {
        console.error('❌ Error loading transit:', error);
        updateTransitStatus('Error carregant transports');
    });
}

// Clear all transit layers
function clearAllTransit() {
    console.log('🧹 Clearing all transit...');
    clearTransitLayers();
    hideTransitLegend();
    updateTransitStatus('Preparat');
}

// Individual transit type loaders
function loadMetroTransit() {
    return new Promise(function(resolve, reject) {
        console.log('🚇 Loading metro transit...');

        // Check if metro functions exist
        if (typeof startTMBMetroStops === 'function') {
            try {
                startTMBMetroStops();
                console.log('✅ Metro loaded successfully');
                resolve();
            } catch (error) {
                console.warn('❌ Metro load failed:', error);
                reject(error);
            }
        } else {
            console.warn('Metro functions not available');
            resolve(); // Don't fail if metro not available
        }
    });
}

function loadBusTransit() {
    return new Promise(function(resolve, reject) {
        console.log('🚌 Loading bus transit...');

        // Check if bus functions exist
        if (typeof startTMBBusStops === 'function') {
            try {
                startTMBBusStops();
                console.log('✅ Bus loaded successfully');
                resolve();
            } catch (error) {
                console.warn('❌ Bus load failed:', error);
                reject(error);
            }
        } else {
            console.warn('Bus functions not available');
            resolve(); // Don't fail if bus not available
        }
    });
}

function loadTrainTransit() {
    return new Promise(function(resolve, reject) {
        console.log('🚆 Loading train transit...');

        // Check if train functions exist
        if (typeof startRealtimeTrains === 'function') {
            try {
                startRealtimeTrains();
                console.log('✅ Train loaded successfully');
                resolve();
            } catch (error) {
                console.warn('❌ Train load failed:', error);
                reject(error);
            }
        } else {
            console.warn('Train functions not available');
            resolve(); // Don't fail if train not available
        }
    });
}

function loadBicycleTransit() {
    return new Promise(function(resolve, reject) {
        console.log('🚴 Loading bicycle transit...');

        // Check if bicycle functions exist
        if (typeof startRealtimeBicing === 'function') {
            try {
                startRealtimeBicing();
                console.log('✅ Bicycle loaded successfully');
                resolve();
            } catch (error) {
                console.warn('❌ Bicycle load failed:', error);
                reject(error);
            }
        } else {
            console.warn('Bicycle functions not available');
            resolve(); // Don't fail if bicycle not available
        }
    });
}

// Mock traffic data for testing when DGT API fails
function getMockTrafficIncidents() {
    return [
        {
            id: 'mock-1',
            type: 'Roadworks',
            severity: 'medium',
            lat: 41.3851,
            lng: 2.1734,
            road: 'C-31',
            direction: 'bothWays',
            description: 'Obres de millora de la via',
            startTime: new Date().toISOString(),
            endTime: null,
            source: 'Mock Data'
        },
        {
            id: 'mock-2',
            type: 'MaintenanceWorks',
            severity: 'low',
            lat: 41.5467,
            lng: 2.1089,
            road: 'C-58',
            direction: 'westBound',
            description: 'Treballs de manteniment',
            startTime: new Date().toISOString(),
            endTime: null,
            source: 'Mock Data'
        }
    ];
}

// Parse custom DGT format (compressed DATEX II)
function parseCustomDGTFormat(textData) {
    console.log('🔍 Parsing custom DGT format...');

    var incidents = [];
    var lines = textData.split('noRestriction real');

    console.log('📊 Found', lines.length - 1, 'potential incident entries');

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        try {
            // Parse the custom format
            // Format: ID dates... segment LAT LNG ROAD...
            var parts = line.split(/\s+/);

            // Find segment and coordinates
            var segmentIndex = parts.indexOf('segment');
            if (segmentIndex === -1 || segmentIndex + 2 >= parts.length) {
                console.warn('⚠️ No segment found in line:', line.substring(0, 100));
                continue;
            }

            var lat = parseFloat(parts[segmentIndex + 1]);
            var lng = parseFloat(parts[segmentIndex + 2]);

            if (isNaN(lat) || isNaN(lng)) {
                console.warn('⚠️ Invalid coordinates:', lat, lng, 'in line:', parts.slice(segmentIndex, segmentIndex + 5));
                continue;
            }

            // Extract road information (usually after townName)
            var road = 'Desconeguda';
            var townIndex = -1;
            for (var j = segmentIndex; j < parts.length; j++) {
                if (parts[j] === 'linkName') {
                    townIndex = j;
                    break;
                }
            }

            if (townIndex !== -1 && townIndex + 1 < parts.length) {
                road = parts[townIndex + 1];
            }

            // Extract incident type (usually at the end before coordinates)
            var incidentType = 'Unknown';
            var typeKeywords = ['roadworks', 'maintenanceWork', 'repairWork', 'bridge', 'laneClosures', 'carriagewayClosures'];
            for (var k = 0; k < typeKeywords.length; k++) {
                var typeIndex = parts.indexOf(typeKeywords[k]);
                if (typeIndex !== -1) {
                    incidentType = typeKeywords[k];
                    break;
                }
            }

            // Map to our incident types
            var mappedType = 'MaintenanceWorks';
            if (incidentType === 'roadworks') mappedType = 'Roadworks';
            else if (incidentType === 'laneClosures' || incidentType === 'carriagewayClosures') mappedType = 'Obstruction';
            else if (incidentType === 'bridge') mappedType = 'MaintenanceWorks';

            var incident = {
                id: 'dgt-' + parts[0],
                type: mappedType,
                severity: getSeverityFromType(mappedType),
                lat: lat,
                lng: lng,
                road: road,
                direction: 'bothWays', // Default assumption
                description: getDescriptionFromType(mappedType),
                startTime: new Date().toISOString(), // Current time as fallback
                endTime: null,
                source: 'DGT DATEX II'
            };

            incidents.push(incident);
            console.log('✅ Parsed incident:', incident.id, incident.type, 'at', incident.lat + ',' + incident.lng, 'road:', incident.road);

        } catch (error) {
            console.warn('❌ Error parsing line:', line.substring(0, 100), error);
        }
    }

    console.log('✅ Parsed', incidents.length, 'traffic incidents from custom DGT format');
    return incidents;
}

function loadTrafficTransit() {
    return new Promise(function(resolve, reject) {
        console.log('🚨 Loading traffic incidents from DGT DATEX II...');

        // Use proxy endpoint to avoid CORS issues
        var datexUrl = '/api/dgt-traffic';

        // Fetch DATEX II data
        fetch(datexUrl)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                return response.text();
            })
            .then(function(textData) {
                console.log('✅ DGT data fetched successfully');
                console.log('📄 Raw data (first 500 chars):', textData.substring(0, 500));

                var incidents = [];

                // Try XML parsing first
                try {
                    incidents = parseDatexII(textData);
                } catch (xmlError) {
                    console.warn('❌ XML parsing failed, trying custom format:', xmlError);
                }

                // If XML parsing failed or returned no results, try custom format
                if (incidents.length === 0) {
                    console.log('🔄 Trying custom DGT format parsing...');
                    incidents = parseCustomDGTFormat(textData);
                }

                return incidents;
            })
            .then(function(incidents) {
                displayTrafficIncidents(incidents);
                console.log('✅ Traffic incidents loaded successfully:', incidents.length, 'incidents');
                resolve();
            })
            .catch(function(error) {
                console.error('❌ Error loading traffic data:', error);
                updateTransitStatus('Error carregant dades de trànsit');
                reject(error);
            });
    });
}

// Parse DATEX II XML format to extract traffic incidents
function parseDatexII(xmlText) {
    console.log('🔍 Parsing DATEX II XML...');

    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    var incidents = [];

    // Find all situation records
    var situations = xmlDoc.getElementsByTagName('situation');

    for (var i = 0; i < situations.length; i++) {
        var situation = situations[i];

        try {
            var situationId = situation.getAttribute('id') || 'unknown';
            var situationRecord = situation.getElementsByTagName('situationRecord')[0];

            if (!situationRecord) continue;

            var recordId = situationRecord.getAttribute('id') || situationId;
            var situationType = getSituationType(situationRecord);

            // Extract location information
            var location = extractLocation(situationRecord);
            if (!location || !location.lat || !location.lng) {
                console.warn('⚠️ No valid location found for situation:', recordId);
                continue;
            }

            // Extract validity time
            var validity = extractValidity(situationRecord);

            // Extract comments/description
            var comments = extractComments(situationRecord);

            var incident = {
                id: recordId,
                type: situationType.type,
                severity: situationType.severity,
                lat: location.lat,
                lng: location.lng,
                road: location.road || 'Desconeguda',
                direction: location.direction || '',
                description: comments || situationType.description || 'Incident sense descripció',
                startTime: validity.startTime,
                endTime: validity.endTime,
                source: 'DGT DATEX II'
            };

            incidents.push(incident);
            console.log('📍 Parsed incident:', incident.id, incident.type, 'at', incident.lat + ',' + incident.lng);

        } catch (error) {
            console.warn('❌ Error parsing situation:', situationId, error);
        }
    }

    console.log('✅ Parsed', incidents.length, 'traffic incidents from DATEX II');
    return incidents;
}

// Extract situation type from DATEX II
function getSituationType(situationRecord) {
    // Check for different situation types
    var situationTypes = [
        'Accident',
        'Roadworks',
        'WeatherCondition',
        'Obstruction',
        'TrafficJam',
        'PoorRoadConditions',
        'MaintenanceWorks'
    ];

    for (var i = 0; i < situationTypes.length; i++) {
        var typeElements = situationRecord.getElementsByTagName(situationTypes[i]);
        if (typeElements.length > 0) {
            return {
                type: situationTypes[i],
                severity: getSeverityFromType(situationTypes[i]),
                description: getDescriptionFromType(situationTypes[i])
            };
        }
    }

    // Check for general situation record type
    var recordType = situationRecord.getAttribute('xsi:type');
    if (recordType) {
        return {
            type: recordType.replace('SituationRecord', ''),
            severity: 'medium',
            description: 'Situació de trànsit'
        };
    }

    return {
        type: 'Unknown',
        severity: 'low',
        description: 'Situació desconeguda'
    };
}

// Get severity based on situation type
function getSeverityFromType(type) {
    var severityMap = {
        'Accident': 'high',
        'Roadworks': 'medium',
        'MaintenanceWorks': 'medium',
        'Obstruction': 'high',
        'TrafficJam': 'medium',
        'WeatherCondition': 'medium',
        'PoorRoadConditions': 'low'
    };
    return severityMap[type] || 'low';
}

// Get description based on situation type
function getDescriptionFromType(type) {
    var descriptionMap = {
        'Accident': ' Accident de trànsit',
        'Roadworks': 'Obres a la carretera',
        'MaintenanceWorks': 'Treballs de manteniment',
        'Obstruction': 'Obstrucció a la via',
        'TrafficJam': 'Embussos de trànsit',
        'WeatherCondition': 'Condicions meteorològiques adverses',
        'PoorRoadConditions': 'Mal estat de la carretera'
    };
    return descriptionMap[type] || 'Situació de trànsit';
}

// Extract location information from DATEX II
function extractLocation(situationRecord) {
    // Look for locationReference
    var locationRef = situationRecord.getElementsByTagName('locationReference')[0];
    if (!locationRef) return null;

    // Try to find coordinates in different possible structures
    // First, try coordinatesForDisplay (if it exists)
    var coordinates = locationRef.getElementsByTagName('coordinatesForDisplay')[0];
    if (coordinates) {
        var lat = coordinates.getElementsByTagName('latitude')[0];
        var lng = coordinates.getElementsByTagName('longitude')[0];

        if (lat && lng) {
            var latVal = parseFloat(lat.textContent);
            var lngVal = parseFloat(lng.textContent);

            if (!isNaN(latVal) && !isNaN(lngVal)) {
                return {
                    lat: latVal,
                    lng: lngVal
                };
            }
        }
    }

    // Try to find coordinates in segment or point structures
    var segment = locationRef.getElementsByTagName('segment')[0];
    if (segment) {
        // Look for latitude and longitude directly in segment
        var latElements = segment.getElementsByTagName('latitude');
        var lngElements = segment.getElementsByTagName('longitude');

        if (latElements.length > 0 && lngElements.length > 0) {
            var latVal = parseFloat(latElements[0].textContent);
            var lngVal = parseFloat(lngElements[0].textContent);

            if (!isNaN(latVal) && !isNaN(lngVal)) {
                return {
                    lat: latVal,
                    lng: lngVal
                };
            }
        }
    }

    // Try to find coordinates in point structure
    var point = locationRef.getElementsByTagName('point')[0];
    if (point) {
        var latElements = point.getElementsByTagName('latitude');
        var lngElements = point.getElementsByTagName('longitude');

        if (latElements.length > 0 && lngElements.length > 0) {
            var latVal = parseFloat(latElements[0].textContent);
            var lngVal = parseFloat(lngElements[0].textContent);

            if (!isNaN(latVal) && !isNaN(lngVal)) {
                return {
                    lat: latVal,
                    lng: lngVal
                };
            }
        }
    }

    // If no coordinates found, try to extract road information only
    var roadInfo = extractRoadInfo(locationRef);
    if (roadInfo) {
        return roadInfo;
    }

    return null;
}

// Extract road information
function extractRoadInfo(locationReference) {
    // This is a simplified version - real DATEX II parsing would be more complex
    var roadNumber = locationReference.getElementsByTagName('roadNumber')[0];
    var roadName = locationReference.getElementsByTagName('roadName')[0];

    var road = '';
    if (roadNumber) {
        road = roadNumber.textContent;
    } else if (roadName) {
        road = roadName.textContent;
    }

    // Try to get direction
    var direction = '';
    var directionElements = locationReference.getElementsByTagName('alertCDirection');
    if (directionElements.length > 0) {
        direction = directionElements[0].textContent;
    }

    return {
        road: road,
        direction: direction
        // Note: lat/lng would need to be calculated from road references in a full implementation
    };
}

// Extract validity time information
function extractValidity(situationRecord) {
    var validity = {
        startTime: null,
        endTime: null
    };

    var validityElements = situationRecord.getElementsByTagName('validity');
    if (validityElements.length > 0) {
        var validityElement = validityElements[0];

        // Look for overallStartTime
        var startTimeElements = validityElement.getElementsByTagName('overallStartTime');
        if (startTimeElements.length > 0) {
            validity.startTime = startTimeElements[0].textContent;
        }

        // Look for overallEndTime
        var endTimeElements = validityElement.getElementsByTagName('overallEndTime');
        if (endTimeElements.length > 0) {
            validity.endTime = endTimeElements[0].textContent;
        }
    }

    return validity;
}

// Extract comments/description
function extractComments(situationRecord) {
    var comments = '';

    // Look for comment elements
    var commentElements = situationRecord.getElementsByTagName('comment');
    if (commentElements.length > 0) {
        for (var i = 0; i < commentElements.length; i++) {
            var comment = commentElements[i];
            var valueElements = comment.getElementsByTagName('value');
            if (valueElements.length > 0) {
                comments += valueElements[0].textContent + ' ';
            }
        }
    }

    return comments.trim();
}

// Display traffic incidents on the map
function displayTrafficIncidents(incidents) {
    console.log('🚨 Displaying', incidents.length, 'traffic incidents on map...');

    incidents.forEach(function(incident) {
        if (incident.lat && incident.lng && !isNaN(incident.lat) && !isNaN(incident.lng)) {
            // Create marker based on severity
            var markerColor = getIncidentColor(incident.severity);
            var iconHtml = getIncidentIcon(incident.type);

            var marker = L.marker([incident.lat, incident.lng], {
                icon: L.divIcon({
                    html: iconHtml,
                    className: 'traffic-incident-marker',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                })
            });

            // Create detailed popup
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: ' + markerColor + '; border-bottom: 2px solid ' + markerColor + '; padding-bottom: 4px;">' +
                '🚨 Incident de Trànsit</h4>' +
                '<div style="background: ' + markerColor + '15; border: 1px solid ' + markerColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                '<strong>Tipus:</strong> ' + incident.type + '<br>' +
                '<strong>Severitat:</strong> ' + getSeverityText(incident.severity) + '<br>' +
                '<strong>Carretera:</strong> ' + (incident.road || 'Desconeguda') + '<br>' +
                '<strong>Direcció:</strong> ' + (incident.direction || 'N/A') + '<br>' +
                '<strong>Descripció:</strong> ' + incident.description + '<br>';

            if (incident.startTime) {
                popupContent += '<strong>Inici:</strong> ' + formatDateTime(incident.startTime) + '<br>';
            }
            if (incident.endTime) {
                popupContent += '<strong>Fi:</strong> ' + formatDateTime(incident.endTime) + '<br>';
            }

            popupContent += '<strong>Font:</strong> ' + incident.source +
                '</div>' +
                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                'Dades proporcionades per la DGT' +
                '</div>' +
                '</div>';

            marker.bindPopup(popupContent);
            marker.addTo(map);
            transitMarkers.push(marker);

            console.log('✅ Added traffic incident marker:', incident.id, 'at', incident.lat + ',' + incident.lng);
        } else {
            console.warn('⚠️ Invalid coordinates for incident:', incident.id, incident.lat, incident.lng);
        }
    });

    console.log('🎯 TOTAL TRAFFIC INCIDENT MARKERS CREATED:', transitMarkers.length);
}

// Get color based on incident severity
function getIncidentColor(severity) {
    var colors = {
        'high': '#dc3545',    // Red for accidents, obstructions
        'medium': '#ffc107', // Yellow for roadworks, traffic jams
        'low': '#17a2b8'     // Blue for weather, poor conditions
    };
    return colors[severity] || '#6c757d';
}

// Get icon based on incident type
function getIncidentIcon(type) {
    var icons = {
        'Accident': '🚨',
        'Roadworks': '🚧',
        'MaintenanceWorks': '🔧',
        'Obstruction': '🚧',
        'TrafficJam': '🚗',
        'WeatherCondition': '🌧️',
        'PoorRoadConditions': '❄️'
    };

    var icon = icons[type] || '⚠️';

    return '<div style="font-size: 24px; text-align: center; line-height: 30px;">' + icon + '</div>';
}

// Get severity text in Catalan
function getSeverityText(severity) {
    var texts = {
        'high': 'Alta',
        'medium': 'Mitjana',
        'low': 'Baixa'
    };
    return texts[severity] || severity;
}

// Format datetime for display
function formatDateTime(dateTimeString) {
    try {
        var date = new Date(dateTimeString);
        return date.toLocaleString('ca-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateTimeString;
    }
}

// Utility functions
function clearTransitLayers() {
    // Clear all transit markers
    transitMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    transitMarkers = [];

    // Clear transit layers
    transitLayers.forEach(function(layer) {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    transitLayers = [];
}

function updateTransitStatus(status) {
    var statusElement = document.getElementById('transit-status');
    if (statusElement) {
        var statusText = document.querySelector('#transit-status span:last-child');
        if (statusText) {
            statusText.textContent = status;
        }
    }
}

function getTransitTypeName(type) {
    var names = {
        'metro': 'Metro',
        'bus': 'Bus',
        'train': 'Tren',
        'bicycle': 'Bicicleta',
        'traffic': 'Trànsit'
    };
    return names[type] || type;
}

// Transit legend functions
function createTransitLegend() {
    var legendData = {
        '🚇 Metro': '#ff4444',
        '🚌 Bus': '#4444ff',
        '🚆 Tren': '#44ff44',
        '🚴 Bicicleta': '#ffaa00',
        '🚨 Trànsit': '#dc3545'
    };

    var legendContent = '';
    Object.keys(legendData).forEach(function(type) {
        var color = legendData[type];
        legendContent += '<div style="display: flex; align-items: center; margin-bottom: 5px;">' +
            '<div style="width: 16px; height: 16px; background: ' + color + '; border-radius: 50%; margin-right: 8px; border: 2px solid #fff;"></div>' +
            '<span style="font-size: 12px;">' + type + '</span>' +
            '</div>';
    });

    var legendElement = document.getElementById('transit-legend-content');
    if (legendElement) {
        legendElement.innerHTML = legendContent;
    }
}

function showTransitLegend() {
    var legendElement = document.getElementById('transit-legend');
    if (legendElement) {
        legendElement.style.display = 'block';
    }
}

function hideTransitLegend() {
    var legendElement = document.getElementById('transit-legend');
    if (legendElement) {
        legendElement.style.display = 'none';
    }
}

// Copy transit instructions function
function copyTransitInstructions() {
    var instructions = "INSTRUCCIONS PER UTILITZAR EL PANELL DE TRANSIT:\n\n";
    instructions += "1. Selecciona el tipus de transport que vols visualitzar\n";
    instructions += "2. Oprem 'Carregar tot el transit' per veure-ho tot simultàniament\n";
    instructions += "3. Cada tipus de transport es mostra amb colors diferents:\n";
    instructions += "   - Metro: Vermell\n";
    instructions += "   - Bus: Blau\n";
    instructions += "   - Tren: Verd\n";
    instructions += "   - Bicicleta: Taronja\n";
    instructions += "   - Trànsit: Vermell (accidents i incidents)\n";
    instructions += "4. Clica als marcadors per obtenir informació detallada\n";
    instructions += "5. Utilitza 'Netejar tot' per amagar tots els transports\n\n";
    instructions += "Els transports públics provenen de les APIs oficials dels diferents operadors.\n";
    instructions += "Les dades de trànsit provenen del servei DATEX II de la DGT (Dirección General de Tráfico).";

    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(instructions).then(function() {
            alert('📋 Instruccions copiades al porta-retalls!');
        }).catch(function() {
            alert('Error copiant. Instruccions:\n\n' + instructions);
        });
    } else {
        // Fallback for older browsers
        var tempTextarea = document.createElement('textarea');
        tempTextarea.value = instructions;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextarea);
        alert('📋 Instruccions copiades al porta-retalls!');
    }
}

// Make functions globally accessible
window.loadTransitType = loadTransitType;
window.loadAllTransit = loadAllTransit;
window.clearAllTransit = clearAllTransit;
window.copyTransitInstructions = copyTransitInstructions;