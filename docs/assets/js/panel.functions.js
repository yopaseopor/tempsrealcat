// Panel data extraction functions for GENCAT WFS
// These functions can be used to extract traffic panel information

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
        
        // Pictograms
        pictograms: [
            props.codi_pictograma_1,
            props.codi_pictograma_2,
            props.codi_pictograma_3,
            props.codi_pictograma_4
        ].filter(code => code && code !== 0),
        
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

// Get all panels for a specific road
async function getAllPanelsForRoad(roadCode) {
    try {
        console.log('🚦 Getting all panels for road:', roadCode);
        
        // Construct WFS URL for all panels on a road
        const wfsUrl = `http://mct.gencat.cat/sct-gis/wfs?service=WFS&version=1.0.0&request=GetFeature&maxFeatures=2000&outputFormat=json&srsName=EPSG:4326&typeName=cite:mct2_panells&filter=<ogc:Filter xmlns:ogc="http://ogc.org" xmlns:gml="http://www.opengis.net/gml"><ogc:PropertyIsEqualTo><ogc:PropertyName>codi_carretera</ogc:PropertyName><ogc:Literal>${roadCode}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>&_=${Date.now()}`;
        
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
        console.log(`✅ Found ${data.features.length} panels for ${roadCode}`);
        
        if (data.type === 'FeatureCollection') {
            const panels = data.features.map(feature => parsePanelFeature(feature));
            return panels;
        } else {
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error getting panels for road:', error);
        return [];
    }
}

// Display panel information
function displayPanelInfo(panel) {
    if (!panel) {
        console.log('No panel data to display');
        return;
    }
    
    console.log('🚦 Panel Information:');
    console.log(`📍 Road: ${panel.road} PK ${panel.pk}`);
    console.log(`📝 Message: "${panel.fullMessage}"`);
    console.log(`📅 Updated: ${panel.updateDate}`);
    console.log(`🔄 Status: ${panel.status}`);
    
    if (panel.lines.length > 0) {
        console.log('\n📋 Message Lines:');
        panel.lines.forEach((line, index) => {
            console.log(`  ${index + 1}. ${line}`);
        });
    }
    
    if (panel.pictograms.length > 0) {
        console.log('\n🎨 Pictograms:', panel.pictograms);
    }
}

// Example usage:
// extractPanelData('55-PIV-1 AP-7').then(panel => displayPanelInfo(panel));
// getAllPanelsForRoad('AP-7').then(panels => console.log('All AP-7 panels:', panels));
