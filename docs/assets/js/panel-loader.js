// Panel loader script - adds panel functions to global scope
// This file should be loaded after traffic.functions.js

let currentRoadPanels = [];

// Extract panel data from GENCAT WFS
async function extractPanelData(panelId) {
    try {
        console.log('🚦 Extracting panel data for:', panelId);
        
        // Construct WFS URL for specific panel
        const wfsUrl = `http://mct.gencat.cat/sct-gis/wfs?service=WFS&version=1.0.0&request=GetFeature&maxFeatures=2000&outputFormat=json&srsName=EPSG:4326&typeName=cite:mct2_panells&filter=<ogc:Filter xmlns:ogc="http://ogc.org" xmlns:gml="http://www.opengis.net/gml"><ogc:FeatureId fid="${panelId}"/></ogc:Filter>&_=${Date.now()}`;
        
        console.log('📡 Fetching panel data from:', wfsUrl);
        
        // Use proxy for CORS if needed
        var hostname = window.location.hostname;
        var isGitHubPages = hostname.includes('github.io');
        var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

        function getApiUrl(endpoint) {
            if (isVercel) {
                return endpoint;
            } else if (isGitHubPages) {
                return 'https://tempsrealcat.vercel.app' + endpoint;
            } else {
                return endpoint;
            }
        }
        
        const proxyUrl = getApiUrl(`/api/proxy?url=${encodeURIComponent(wfsUrl)}`);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Successfully fetched panel data');
        
        if (data.type === 'FeatureCollection' && data.features.length > 0) {
            const panel = parsePanelFeature(data.features[0]);
            console.log('🚦 Parsed panel data:', panel);
            return panel;
        } else {
            console.warn('No panel data found for ID:', panelId);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error extracting panel data:', error);
        return null;
    }
}

// Parse individual panel feature from WFS response
function parsePanelFeature(feature) {
    const props = feature.properties;
    
    // Extract pictogram codes
    const pictograms = [
        props.codi_pictograma_1,
        props.codi_pictograma_2,
        props.codi_pictograma_3,
        props.codi_pictograma_4
    ].filter(code => code && code !== 0);
    
    return {
        id: feature.id,
        panelId: props.codi_segment || feature.id.split('.').pop(),
        road: props.codi_carretera,
        pk: props.pk,
        direction: props.sentit === 0 ? 'Bidirectional' : props.sentit === 1 ? 'North' : 'South',
        date: props.data,
        updateDate: props.data_actualitzacio,
        status: props.status === 1 ? 'Active' : 'Inactive',
        dataSource: props.id_font,
        
        // Message lines
        lines: [
            props.linia_text_1,
            props.linia_text_2,
            props.linia_text_3,
            props.linia_text_4,
            props.linia_text_5,
            props.linia_text_6
        ].filter(line => line && line.trim() !== ''),
        
        // Pictograms (codes)
        pictogramCodes: pictograms,
        
        // Full message
        fullMessage: [
            props.linia_text_1,
            props.linia_text_2,
            props.linia_text_3,
            props.linia_text_4,
            props.linia_text_5,
            props.linia_text_6
        ].filter(line => line && line.trim() !== '').join(' '),
        
        // Raw properties for debugging
        raw: props
    };
}

// Convert pictogram codes to icons/images
function getPictogramDisplay(codes) {
    if (!codes || codes.length === 0) {
        return '<span style="color: #999; font-size: 11px;">Sense icones</span>';
    }
    
    // Common traffic pictogram mappings (based on Spanish traffic sign standards)
    const pictogramMap = {
        1: '⚠️', // Warning
        2: '🚫', // Prohibition
        3: '🛑', // Stop
        4: '➡️', // Direction right
        5: '⬅️', // Direction left
        6: '⬆️', // Direction up
        7: '⬇️', // Direction down
        8: '🚗', // Car
        9: '🚚', // Truck
        10: '🏭', // Industrial
        11: '🌧️', // Rain
        12: '❄️', // Snow
        13: '🌫️', // Fog
        14: '💨', // Wind
        15: '🔧', // Construction
        16: '🚧', // Road work
        17: '⛔', // Closed
        18: '📢', // Information
        19: '⏱️', // Time
        20: '🚦', // Traffic light
        21: '🚸', // Pedestrian crossing
        22: '🚴', // Bicycle
        23: '🚌', // Bus
        24: '🚑', // Emergency
        25: '⚡', // Electric
        26: '🅿️', // Parking
        27: '⛽', // Fuel
        28: '🍽️', // Restaurant
        29: '☕', // Coffee
        30: '🛏️', // Hotel
        31: '🏥', // Hospital
        32: '📍', // Location
        33: '📱', // Phone
        34: '🚻', // Restroom
        35: '♿', // Accessible
        36: '👶', // Children
        37: '🐕', // Dog
        38: '🌳', // Park/Nature
        39: '🏖️', // Beach
        40: '⛰️', // Mountain
        41: '🏛️', // Monument
        42: '🎭', // Culture
        43: '🛍️', // Shopping
        44: '🏪', // Store
        45: '🏨', // Hotel
        46: '🍽️', // Restaurant
        47: '⛪', // Church
        48: '🕌', // Mosque
        49: '🕍', // Synagogue
        50: '⚛️', // Temple
        51: '🎓', // School
        52: '📚', // Library
        53: '🏢', // Office
        54: '🏭', // Factory
        55: '🌾', // Agriculture
        56: '🐄', // Farm
        57: '🌊', // Port
        58: '✈️', // Airport
        59: '🚂', // Train
        60: '🚇', // Metro
        61: '🚊', // Tram
        62: '🚕', // Taxi
        63: '🚲', // Rental car
        64: '🔋', // Charging station
        65: '🅿️', // Disabled parking
        66: '👮', // Police
        67: '🚒', // Fire
        68: '🏧', // ATM
        69: '🏧', // Bank
        70: '💊', // Pharmacy
        71: '🏥', // Medical
        72: '🦷', // Dentist
        73: '👁️', // Eye doctor
        74: '🩺', // Doctor
        75: '🏥', // Hospital
        76: '🚑', // Ambulance
        77: '📞', // Emergency call
        78: '🚨', // Siren
        79: '🔥', // Fire
        80: '💧', // Water
        81: '⚡', // Electricity
        82: '🔌', // Power
        83: '📡', // Radio
        84: '📺', // TV
        85: '📻', // Radio
        86: '📰', // Newspaper
        87: '📸', // Camera
        88: '🎥', // Video
        89: '🎬', // Film
        90: '🎭', // Theater
        91: '🎨', // Art
        92: '🎵', // Music
        93: '🎤', // Microphone
        94: '🎧', // Headphones
        95: '📻', // Radio
        96: '📱', // Mobile
        97: '💻', // Computer
        98: '🖥️', // Desktop
        99: '⌨️', // Keyboard
        100: '🖱️', // Mouse
    };
    
    const icons = codes.map(code => {
        const icon = pictogramMap[code] || `📋${code}`;
        return `<span style="font-size: 16px; margin: 0 2px;" title="Pictogram ${code}">${icon}</span>`;
    });
    
    return icons.join(' ');
}

// Get all panels for a specific road
async function getAllPanelsForRoad(roadCode) {
    try {
        console.log('🚦 Getting all panels for road:', roadCode);
        
        // Get ALL panels without filter (since WFS filtering is blocked)
        const wfsUrl = `http://mct.gencat.cat/sct-gis/wfs?service=WFS&version=1.0.0&request=GetFeature&maxFeatures=2000&outputFormat=json&srsName=EPSG:4326&typeName=cite:mct2_panells&_=${Date.now()}`;
        
        console.log('📡 WFS URL:', wfsUrl);
        
        // Use proxy for CORS if needed
        var hostname = window.location.hostname;
        var isGitHubPages = hostname.includes('github.io');
        var isVercel = hostname.includes('vercel.app') || hostname.includes('now.sh');

        function getApiUrl(endpoint) {
            if (isVercel) {
                return endpoint;
            } else if (isGitHubPages) {
                return 'https://tempsrealcat.vercel.app' + endpoint;
            } else {
                return endpoint;
            }
        }
        
        const proxyUrl = getApiUrl(`/api/proxy?url=${encodeURIComponent(wfsUrl)}`);
        console.log('📡 Proxy URL:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Found ${data.features.length} total panels`);
        
        if (data.type === 'FeatureCollection') {
            // Client-side filtering - match road codes with various formats
            const allPanels = data.features.map(feature => parsePanelFeature(feature));
            
            // Try different road code formats (A2 vs A-2, C31 vs C-31, etc.)
            const roadVariants = [
                roadCode,
                roadCode.replace('-', ''),
                roadCode.replace('-', '').toUpperCase(),
                roadCode.toUpperCase()
            ];
            
            console.log('🔍 Looking for road variants:', roadVariants);
            
            const filteredPanels = allPanels.filter(panel => {
                return roadVariants.some(variant => 
                    panel.road === variant || 
                    panel.road === variant.toUpperCase() ||
                    panel.road === variant.toLowerCase()
                );
            });
            
            console.log(`✅ Found ${filteredPanels.length} panels for ${roadCode} (client-side filtered)`);
            
            // Show what road codes we actually found
            const foundRoads = [...new Set(allPanels.map(p => p.road))];
            console.log('🛣️ Available road codes in database:', foundRoads);
            
            return filteredPanels;
        } else {
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error getting panels for road:', error);
        return [];
    }
}

// Load traffic panels interface
function loadTrafficPanels() {
    console.log('🚦 Loading traffic panels interface...');
    document.getElementById('traffic-panels-section').style.display = 'block';
    document.getElementById('clear-traffic-btn').style.display = 'inline-block';
    updateStatus('Selecciona una carretera per veure els panells informatius');
}

// Load panels for selected road
async function loadPanelsForSelectedRoad() {
    const roadSelect = document.getElementById('panel-road-select');
    const selectedRoad = roadSelect.value;
    
    if (!selectedRoad) {
        document.getElementById('panels-container').innerHTML = '<p style="color: #666; text-align: center;">Selecciona una carretera per veure els panells.</p>';
        return;
    }
    
    try {
        updateStatus(`Carregant panells per ${selectedRoad}...`);
        
        // Load panels for the selected road
        const panels = await getAllPanelsForRoad(selectedRoad);
        currentRoadPanels = panels;
        
        displayPanels(panels, selectedRoad);
        
        updateStatus(`S'han carregat ${panels.length} panells per ${selectedRoad}`);
        
    } catch (error) {
        console.error('Error loading panels:', error);
        updateStatus(`Error carregant panells: ${error.message}`);
    }
}

// Refresh current panels
async function refreshCurrentPanels() {
    const roadSelect = document.getElementById('panel-road-select');
    const selectedRoad = roadSelect.value;
    
    if (selectedRoad) {
        await loadPanelsForSelectedRoad();
    } else {
        updateStatus('Selecciona una carretera primer');
    }
}

// Display panels in the container
function displayPanels(panels, roadCode) {
    const container = document.getElementById('panels-container');
    
    if (panels.length === 0) {
        container.innerHTML = `<p style="color: #666; text-align: center;">No s'han trobat panells actius per ${roadCode}.</p>`;
        return;
    }
    
    let html = `<div style="margin-bottom: 15px;">
        <h5 style="color: #6f42c1; margin: 0;">🚦 Panells a ${roadCode} (${panels.length} panells)</h5>
        <div style="font-size: 11px; color: #666; margin-top: 5px;">
            <i class="fa fa-info-circle"></i> <strong>Nota:</strong> Els panells no inclouen coordenades geogràfiques. La ubicació es basa en el PK (punt quilomètric).
        </div>
    </div>`;
    
    panels.forEach((panel, index) => {
        const statusColor = panel.status === 'Active' ? '#28a745' : '#dc3545';
        const statusIcon = panel.status === 'Active' ? '✅' : '❌';
        
        // Estimate location based on road and PK (simplified)
        let locationHint = '';
        if (panel.road === 'A-2' && panel.pk > 590) {
            locationHint = ' (prop de Martorell/Figueres)';
        } else if (panel.road === 'A-2' && panel.pk > 470) {
            locationHint = ' (prop de Barcelona/Lleida)';
        } else if (panel.road === 'C-31' && panel.pk > 200) {
            locationHint = ' (prop de Mataró)';
        } else if (panel.road === 'C-58' && panel.pk < 20) {
            locationHint = ' (prop de Barcelona)';
        } else if (panel.road === 'B-30') {
            locationHint = ' (Ronda de Dalt)';
        }
        
        html += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h6 style="margin: 0; color: #6f42c1;">📍 ${panel.road} - PK ${panel.pk}${locationHint}</h6>
                    <span style="color: ${statusColor}; font-size: 12px; font-weight: bold;">${statusIcon} ${panel.status}</span>
                </div>
                
                <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #6f42c1; margin-bottom: 10px;">
                    <div style="font-weight: bold; color: #333; margin-bottom: 5px;">Missatge:</div>
                    <div style="font-size: 14px; line-height: 1.4;">${panel.fullMessage || 'Sense missatge'}</div>
                </div>
                
                ${panel.pictogramCodes && panel.pictogramCodes.length > 0 ? `
                    <div style="background: #fff9e6; padding: 10px; border-radius: 4px; border-left: 4px solid #ffc107; margin-bottom: 10px;">
                        <div style="font-weight: bold; color: #333; margin-bottom: 5px;">🎨 Icones:</div>
                        <div style="font-size: 16px; text-align: center; padding: 5px;">
                            ${getPictogramDisplay(panel.pictogramCodes)}
                        </div>
                    </div>
                ` : ''}
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; color: #666;">
                    <div><strong>Direcció:</strong> ${panel.direction}</div>
                    <div><strong>Actualitzat:</strong> ${panel.updateDate}</div>
                    <div><strong>ID:</strong> ${panel.panelId}</div>
                    <div><strong>Font:</strong> GENCAT MCT</div>
                </div>
                
                ${panel.lines.length > 0 ? `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                        <div style="font-size: 11px; color: #666; margin-bottom: 5px;"><strong>Línies del missatge (${panel.lines.length}):</strong></div>
                        ${panel.lines.map((line, i) => `<div style="font-size: 11px; color: #333; padding: 2px 0; background: ${i % 2 === 0 ? '#f9f9f9' : 'transparent'};">${i+1}. ${line}</div>`).join('')}
                    </div>
                ` : ''}
                
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-size: 10px; color: #999;">
                    <i class="fa fa-map-marker"></i> <strong>Ubicació:</strong> PK ${panel.pk} a la ${panel.road} 
                    ${locationHint ? locationHint : ''}
                    <br><i class="fa fa-exclamation-triangle"></i> <strong>Limitació:</strong> Sense coordenades GPS precises
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

console.log('🚦 Panel functions loaded successfully');
