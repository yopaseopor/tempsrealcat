// Panoramax Functions
// Global variables for Panoramax
var panoramaxLayer;
var panoramaxLoading = false;
var panoramaxLastBounds = null;
var panoramaxImageCount = 0;
var panoramaxActive = false; // Manual control flag

// Initialize Panoramax layer and functionality
function initPanoramax() {
    // Initialize Panoramax layer
    panoramaxLayer = L.geoJson(null, {
        onEachFeature: onEachPanoramaxFeature
    });
    panoramaxLayer.addTo(map);

    // Set up automatic loading when map moves (only if active)
    map.on('moveend', function() {
        if (panoramaxActive) {
            loadPanoramaxImages();
        }
    });

    map.on('zoomend', function() {
        if (panoramaxActive) {
            loadPanoramaxImages();
        }
    });

    console.log('Panoramax initialized');
}

// Panoramax popup function
function onEachPanoramaxFeature(feature, layer) {
    var thumbUrl = feature.properties.thumb_url || '';
    var fullUrl = feature.properties.url || '';
    var coords = feature.geometry.coordinates;

    // Debug coordinates
    console.log('Panoramax feature coordinates:', coords);

    // GeoJSON standard is [longitude, latitude], but let's verify
    var lng = coords[0];
    var lat = coords[1];

    // Check if coordinates seem valid
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.warn('Invalid coordinates detected:', lat, lng);
        return; // Skip invalid coordinates
    }

    var panoramaxLink = 'https://api.panoramax.xyz/?focus=map&map=17.8/' + lat + '/' + lng + '&speed=250';

    var content = '<div style="text-align: center; max-width: 250px;">';
    content += '<div style="margin-bottom: 10px;">';
    content += '<img src="' + thumbUrl + '" style="max-width: 100%; height: auto; border-radius: 4px;" alt="Panoramax image" />';
    content += '</div>';
    content += '<div style="font-size: 12px; color: #666; margin-bottom: 8px;">';
    content += 'Imatge de carrer - Panoramax<br>';
    content += '<small>Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4) + '</small>';
    content += '</div>';
    content += '<div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">';
    content += '<button onclick="viewPanoramaxImage(\'' + fullUrl + '\', ' + lat + ', ' + lng + ')" style="background:#007acc; color:white; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; font-size: 11px;">';
    content += '<i class="fa fa-eye"></i> Veure';
    content += '</button>';
    content += '<a href="' + panoramaxLink + '" target="_blank" style="background:#2a2a2a; color:white; padding:4px 8px; border:none; border-radius:3px; cursor:pointer; font-size: 11px; text-decoration: none; display: inline-block;">';
    content += '<i class="fa fa-external-link"></i> Panoramax';
    content += '</a>';
    content += '</div>';
    content += '</div>';

    layer.bindPopup(content);
}

// Load Panoramax images for current map bounds
function loadPanoramaxImages() {
    // Don't load if panoramax is not active or already loading
    if (panoramaxLoading) {
        return;
    }

    var currentZoom = map.getZoom();
    var currentBounds = map.getBounds();
    var boundsString = currentBounds.toBBoxString();

    // Only load Panoramax when sufficiently zoomed in (zoom level 12+)
    if (currentZoom < 12) {
        updatePanoramaxStatus('Fes zoom per carregar imatges (nivell ' + currentZoom + ' - necessita 12+)', false);
        panoramaxLoading = false;
        return;
    }

    // Check if bounds haven't changed significantly
    if (panoramaxLastBounds && panoramaxLastBounds === boundsString) {
        return;
    }

    panoramaxLastBounds = boundsString;
    panoramaxLoading = true;

    // Debug: Log current map bounds and bbox
    console.log('Current map bounds:', currentBounds);
    console.log('Bounds string:', boundsString);
    console.log('West:', currentBounds.getWest(), 'South:', currentBounds.getSouth(), 'East:', currentBounds.getEast(), 'North:', currentBounds.getNorth());
    console.log('Map center:', map.getCenter());
    console.log('Zoom level:', map.getZoom());

    // Update status
    updatePanoramaxStatus('Carregant imatges...', true);

    // Clear existing markers
    clearPanoramaxLayer();

    // Fetch Panoramax collections and load from collections relevant to current area
    $.ajax({
        dataType: "json",
        url: "https://api.panoramax.xyz/api/collections",
        success: function(collections) {
            if (collections && collections.collections && collections.collections.length > 0) {
                // Filter collections to prioritize local/regional ones
                var currentCenter = map.getCenter();
                var currentLat = currentCenter.lat;
                var currentLng = currentCenter.lng;

                // Determine likely country based on current location
                var likelyCountry = '';
                if (currentLat >= 35 && currentLat <= 44 && currentLng >= -10 && currentLng <= 5) {
                    likelyCountry = 'Spain'; // Iberian peninsula
                } else if (currentLat >= 41 && currentLat <= 51 && currentLng >= -2 && currentLng <= 10) {
                    likelyCountry = 'France'; // France (excluding Iberian peninsula)
                } else if (currentLat >= 36 && currentLat <= 47 && currentLng >= 6 && currentLng <= 19) {
                    likelyCountry = 'Italy'; // Italy
                }

                console.log('Current location suggests country:', likelyCountry);

                // Debug: Log all available collections
                console.log('Available collections:');
                collections.collections.forEach(function(coll, idx) {
                    console.log(idx + ':', coll.title || coll.id, '-', coll.description || 'no description');
                });

                // For Barcelona area, prioritize collections that might contain local images
                // Use more collections to ensure we get Barcelona images
                var relevantCollections = [];

                if (likelyCountry === 'Spain') {
                    // In Spain, try more collections to find Barcelona images
                    console.log('In Spain - trying to find Barcelona collections...');

                    // Look for collections that might contain Barcelona/Catalonia images
                    relevantCollections = collections.collections.filter(function(collection) {
                        var title = (collection.title || '').toLowerCase();
                        var description = (collection.description || '').toLowerCase();
                        var id = (collection.id || '').toLowerCase();

                        // Keep if it mentions Spain or is generic
                        var isSpanish = title.includes('spain') || description.includes('spain') || id.includes('spain');
                        var isGeneric = !title.includes('france') && !title.includes('italy') && !title.includes('germany') &&
                                       !description.includes('france') && !description.includes('italy') && !description.includes('germany') &&
                                       !id.includes('france') && !id.includes('italy') && !id.includes('germany');

                        if (isSpanish || isGeneric) {
                            console.log('✓ Keeping for Spain:', title || id);
                            return true;
                        }

                        console.log('✗ Rejecting for Spain:', title || id);
                        return false;
                    });
                } else {
                    // For other countries, use the original logic
                    relevantCollections = collections.collections.filter(function(collection) {
                        var title = (collection.title || '').toLowerCase();
                        var description = (collection.description || '').toLowerCase();

                        // Keep collections that mention the likely country or are generic
                        if (likelyCountry) {
                            var countryLower = likelyCountry.toLowerCase();
                            if (title.includes(countryLower) || description.includes(countryLower)) {
                                return true;
                            }
                        }

                        // Keep generic collections
                        var hasOtherCountries = title.includes('france') || title.includes('spain') ||
                                              title.includes('italy') || title.includes('germany') ||
                                              description.includes('france') || description.includes('spain') ||
                                              description.includes('italy') || description.includes('germany');

                        return !hasOtherCountries;
                    });
                }

                console.log('Filtered to', relevantCollections.length, 'relevant collections');

                // Use more collections for Spain to ensure we get Barcelona images
                var maxCollections = (likelyCountry === 'Spain') ? 5 : 3;
                if (relevantCollections.length === 0) {
                    relevantCollections = collections.collections.slice(0, maxCollections);
                    console.log('No country-specific collections found, using first', maxCollections, 'collections');
                } else {
                    relevantCollections = relevantCollections.slice(0, maxCollections);
                    console.log('Using', relevantCollections.length, 'relevant collections');
                }

                var collectionsToLoad = relevantCollections;
                var loadedCollections = 0;
                var totalCollections = collectionsToLoad.length;

                collectionsToLoad.forEach(function(collection) {
                    // CORRECT BBOX CALCULATION: Ensure proper format for Panoramax API
                    var west = Math.max(currentBounds.getWest(), -180);
                    var south = Math.max(currentBounds.getSouth(), -90);
                    var east = Math.min(currentBounds.getEast(), 180);
                    var north = Math.min(currentBounds.getNorth(), 90);

                    // Panoramax expects: west,south,east,north (standard GeoJSON bbox format)
                    var bboxString = [west, south, east, north].join(',');
                    console.log('Calculated bbox for', collection.id + ':', bboxString);
                    console.log('Map center:', map.getCenter().lat, map.getCenter().lng);
                    console.log('Zoom level:', map.getZoom());

                    // Fetch items from this collection (try with bbox first, fallback without)
                    var tryWithBbox = true;

                    function fetchCollectionItems(useBbox) {
                        var ajaxData = useBbox ? {
                            'bbox': bboxString,
                            'limit': 50  // Higher limit when using bbox
                        } : {
                            'limit': 100  // Higher limit when fetching all and filtering client-side
                        };

                        $.ajax({
                            dataType: "json",
                            url: "https://api.panoramax.xyz/api/collections/" + collection.id + "/items",
                            data: ajaxData,
                            success: function(data) {
                                if (data && data.features) {
                                    console.log('Received', data.features.length, 'features from collection', collection.id);

                                    $(data.features).each(function(key, feature) {
                                        var coords = feature.geometry.coordinates;
                                        var lng = coords[0];
                                        var lat = coords[1];

                                        // STRICT CLIENT-SIDE FILTERING: Only show images within current map bounds
                                        // This prevents any cross-border contamination regardless of API behavior
                                        if (lng >= currentBounds.getWest() && lng <= currentBounds.getEast() &&
                                            lat >= currentBounds.getSouth() && lat <= currentBounds.getNorth()) {

                                            // Additional country-specific filtering for Barcelona area
                                            var currentCenter = map.getCenter();
                                            var centerLat = currentCenter.lat;
                                            var centerLng = currentCenter.lng;

                                            // If we're in Barcelona area (Spain), reject French coordinates
                                            var isBarcelonaArea = centerLat >= 41 && centerLat <= 42 && centerLng >= 1 && centerLng <= 3;
                                            var isFrenchCoords = lng >= 0 && lng <= 10 && lat >= 42 && lat <= 52; // Rough France bounds

                                            if (isBarcelonaArea && isFrenchCoords) {
                                                console.log('❌ Rejected French coordinates in Barcelona area:', lat, lng);
                                                return; // Skip this feature
                                            }

                                            console.log('✅ Adding image at:', lat, lng);
                                            panoramaxLayer.addData(feature);
                                        } else {
                                            console.log('❌ Image outside map bounds:', lat, lng, '- Bounds:', currentBounds);
                                        }
                                    });
                                }
                                loadedCollections++;
                                if (loadedCollections >= totalCollections) {
                                    panoramaxLoading = false;
                                    // Update status after all collections are loaded
                                    setTimeout(updatePanoramaxImageCount, 100);
                                }
                            },
                            error: function(xhr, status, error) {
                                console.error('Error fetching Panoramax items from collection ' + collection.id + ':', error);
                                // If bbox failed, try without bbox
                                if (tryWithBbox && useBbox) {
                                    console.log('Retrying collection', collection.id, 'without bbox');
                                    tryWithBbox = false;
                                    fetchCollectionItems(false);
                                    return;
                                }
                                loadedCollections++;
                                if (loadedCollections >= totalCollections) {
                                    panoramaxLoading = false;
                                    // Update status after all collections are loaded
                                    setTimeout(updatePanoramaxImageCount, 100);
                                }
                            }
                        });
                    }

                    fetchCollectionItems(true);
                });
            } else {
                console.warn('No collections found in Panoramax');
                panoramaxLoading = false;
                updatePanoramaxStatus('No s\'han trobat col·leccions', false);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error fetching Panoramax collections:', error);
            panoramaxLoading = false;
            updatePanoramaxStatus('Error carregant col·leccions', false);
        }
    });
}

// Clear Panoramax layer
function clearPanoramaxLayer() {
    if (panoramaxLayer) {
        for (var id in panoramaxLayer._layers) {
            panoramaxLayer.removeLayer(id);
        }
    }
}

// Start Panoramax loading
function startPanoramax() {
    panoramaxActive = true;
    updatePanoramaxButtons(true);
    updatePanoramaxStatus('Panoramax activat - fes clic a "Recarrega" per carregar imatges', false);
    console.log('Panoramax started');
}

// Stop Panoramax loading
function stopPanoramax() {
    panoramaxActive = false;
    clearPanoramaxLayer();
    updatePanoramaxButtons(false);
    updatePanoramaxStatus('Panoramax desactivat', false);
    console.log('Panoramax stopped');
}

// Update button states
function updatePanoramaxButtons(isActive) {
    var startBtn = document.getElementById('panoramax-start-btn');
    var stopBtn = document.getElementById('panoramax-stop-btn');
    var reloadBtn = document.getElementById('panoramax-reload-btn');

    if (startBtn) startBtn.style.display = isActive ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = isActive ? 'inline-block' : 'none';
    if (reloadBtn) reloadBtn.style.display = isActive ? 'inline-block' : 'none';
}

// Manual refresh function (for compatibility)
function refreshPanoramax() {
    if (panoramaxActive) {
        loadPanoramaxImages();
    }
}

// Update Panoramax status display
function updatePanoramaxStatus(message, isLoading) {
    var statusElement = document.getElementById('panoramax-status');
    if (statusElement) {
        var statusSpan = statusElement.querySelector('span');
        if (statusSpan) {
            statusSpan.textContent = message;
        }
        if (isLoading !== undefined) {
            statusElement.style.color = isLoading ? '#007acc' : '#28a745';
        }
    }
}

// View Panoramax image inline
function viewPanoramaxImage(imageUrl, lat, lng) {
    if (!imageUrl) {
        alert('No hi ha URL d\'imatge disponible');
        return;
    }

    var viewer = document.getElementById('panoramax-viewer');
    var container = document.getElementById('panoramax-image-container');

    if (viewer && container) {
        // Create image element
        var img = document.createElement('img');
        img.src = imageUrl;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '300px';
        img.style.borderRadius = '4px';
        img.alt = 'Panoramax image';

        // Add loading indicator
        container.innerHTML = '<div style="padding: 20px;">Carregant imatge...</div>';
        img.onload = function() {
            container.innerHTML = '';
            container.appendChild(img);

            // Add location info
            var locationInfo = document.createElement('div');
            locationInfo.style.marginTop = '10px';
            locationInfo.style.fontSize = '12px';
            locationInfo.style.color = '#666';
            locationInfo.innerHTML = 'Ubicació: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '<br>' +
                '<a href="https://api.panoramax.xyz/?focus=map&map=17.8/' + lat + '/' + lng + '&speed=250" target="_blank" style="color: #007acc;">Veure a Panoramax</a>';
            container.appendChild(locationInfo);
        };
        img.onerror = function() {
            container.innerHTML = '<div style="padding: 20px; color: #cc0000;">Error carregant la imatge</div>';
        };

        // Show viewer
        viewer.style.display = 'block';

        // Scroll to viewer
        viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Close Panoramax image viewer
function closePanoramaxViewer() {
    var viewer = document.getElementById('panoramax-viewer');
    if (viewer) {
        viewer.style.display = 'none';
        var container = document.getElementById('panoramax-image-container');
        if (container) {
            container.innerHTML = '';
        }
    }
}

// Update image count display
function updatePanoramaxImageCount() {
    if (panoramaxLayer) {
        var count = Object.keys(panoramaxLayer._layers).length;
        panoramaxImageCount = count;

        var statusText = count > 0 ?
            count + ' imatge' + (count !== 1 ? 's' : '') + ' carregada' + (count !== 1 ? 's' : '') :
            'Cap imatge carregada';

        updatePanoramaxStatus(statusText, false);
    }
}

// Initialize when document is ready
$(document).ready(function() {
    initPanoramax();
});
