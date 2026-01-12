// Fuel Stations Visualization
var fuelStationsInterval = null;
var fuelStationsMarkers = [];
var fuelStationsLayer = null;
var allFuelStations = [];
var currentFuelFilter = 'all';
var fuelSortField = 'price'; // Default sort by price
var fuelSortDirection = 'asc'; // asc or desc

// Start fuel stations visualization
function startFuelStations() {
    // If already running, stop it instead of starting again
    if (fuelStationsInterval) {
        stopFuelStations();
        return;
    }

    // Initial load
    fetchFuelStations().then(function(stations) {
        displayFuelStations(stations, true);
    });

    // Update UI
    document.getElementById('start-fuel-stations-btn').style.display = 'none';
    document.getElementById('stop-fuel-stations-btn').style.display = 'inline-block';
    updateFuelStationsStatus(getTranslation('fuel_status_loading'));
}

// Stop fuel stations visualization
function stopFuelStations() {
    // Clear all station markers
    fuelStationsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    fuelStationsMarkers = [];
    allFuelStations = [];

    // Update UI
    document.getElementById('start-fuel-stations-btn').style.display = 'inline-block';
    document.getElementById('stop-fuel-stations-btn').style.display = 'none';
    updateFuelStationsStatus(getTranslation('fuel_status_inactive'));
}

// Update fuel stations status display
function updateFuelStationsStatus(status) {
    var statusElement = document.getElementById('fuel-stations-status');
    if (statusElement) {
        statusElement.textContent = getTranslation('fuel_status') + ' ' + status;
    }
}

// Fetch fuel prices from Spanish Ministry of Energy API
function fetchFuelPrices() {
    console.log('💰 Fetching fuel prices from Spanish Ministry API...');

    var apiUrl = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ Fuel prices API response received:', data.ListaEESSPrecio ? data.ListaEESSPrecio.length : 0, 'stations with prices');

            if (data && data.ListaEESSPrecio && Array.isArray(data.ListaEESSPrecio)) {
                // Create a lookup map for easier matching
                var priceMap = {};
                data.ListaEESSPrecio.forEach(function(station) {
                    if (station && station.IDEESS) {
                        priceMap[station.IDEESS] = {
                            id: station.IDEESS,
                            name: station.Rótulo || station['Rótulo'],
                            address: station.Dirección || station['Dirección'],
                            town: station.Localidad || station['Localidad'],
                            province: station.Provincia || station['Provincia'],
                            prices: {
                                gasolina95: station['Precio Gasolina 95 E5'] || station.PrecioGasolina95E5,
                                gasolina98: station['Precio Gasolina 98 E5'] || station.PrecioGasolina98E5,
                                diesel: station['Precio Gasoleo A'] || station.PrecioGasoleoA,
                                dieselPremium: station['Precio Gasoleo Premium'] || station.PrecioGasoleoPremium,
                                biodiesel: station['Precio Biodiesel'] || station.PrecioBiodiesel,
                                bioethanol: station['Precio Bioetanol'] || station.PrecioBioetanol,
                                lpg: station['Precio Gases licuados del petróleo'] || station.PrecioGasesLicuadosPetroleo,
                                cng: station['Precio Gas Natural Comprimido'] || station.PrecioGasNaturalComprimido,
                                lng: station['Precio Gas Natural Licuado'] || station.PrecioGasNaturalLicuado,
                                hydrogen: station['Precio Hidrógeno'] || station.PrecioHidrogeno
                            },
                            schedule: station.Horario || station['Horario'],
                            lastUpdate: station['Fecha de extracción'] || station.FechaExtraccion
                        };
                    }
                });

                console.log('💰 Processed fuel price data for', Object.keys(priceMap).length, 'stations');
                return priceMap;
            } else {
                console.warn('⚠️ Unexpected fuel prices API response format');
                return {};
            }
        })
        .catch(error => {
            console.error('❌ Fuel prices API fetch failed:', error);
            console.log('🔄 Continuing without fuel price data');
            return {};
        });
}

// Fetch fuel stations from OpenStreetMap using Overpass API
function fetchFuelStations() {
    console.log('⛽ Fetching fuel stations from OpenStreetMap...');

    // Get current map bounds
    var bounds = map.getBounds();
    var bbox = bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast();

    // Overpass query for fuel stations and charging stations
    var query = '[out:json][timeout:25];(' +
        // Fuel stations
        'node["amenity"="fuel"](' + bbox + ');' +
        'way["amenity"="fuel"](' + bbox + ');' +
        'relation["amenity"="fuel"](' + bbox + ');' +
        // Charging stations
        'node["amenity"="charging_station"](' + bbox + ');' +
        'way["amenity"="charging_station"](' + bbox + ');' +
        'relation["amenity"="charging_station"](' + bbox + ');' +
        ');out center;';

    var overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    return fetch(overpassUrl)
        .then(response => response.json())
        .then(data => {
            console.log('✅ Overpass API response received:', data.elements.length, 'elements');

            var stations = [];

            data.elements.forEach(function(element) {
                try {
                    var lat, lng, name, amenity, brand, operator, address;

                    // Get coordinates
                    if (element.type === 'node') {
                        lat = element.lat;
                        lng = element.lon;
                    } else if (element.center) {
                        lat = element.center.lat;
                        lng = element.center.lon;
                    } else {
                        return; // Skip elements without coordinates
                    }

                    // Validate coordinates
                    if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        console.warn('⚠️ Invalid coordinates for fuel station:', lat, lng);
                        return;
                    }

                    // Get properties
                    amenity = element.tags ? element.tags.amenity : null;
                    name = element.tags ? (element.tags.name || element.tags.brand || element.tags.operator || 'Estació sense nom') : 'Estació sense nom';
                    brand = element.tags ? element.tags.brand : null;
                    operator = element.tags ? element.tags.operator : null;

                    // Build address from available tags
                    var addressParts = [];
                    if (element.tags) {
                        if (element.tags['addr:street']) addressParts.push(element.tags['addr:street']);
                        if (element.tags['addr:housenumber']) addressParts.push(element.tags['addr:housenumber']);
                        if (element.tags['addr:city']) addressParts.push(element.tags['addr:city']);
                        if (element.tags['addr:postcode']) addressParts.push(element.tags['addr:postcode']);
                    }
                    address = addressParts.length > 0 ? addressParts.join(', ') : null;

                    // Additional info for fuel stations
                    var fuelTypes = [];
                    if (element.tags && amenity === 'fuel') {
                        if (element.tags.fuel && element.tags.fuel !== 'yes') fuelTypes.push(element.tags.fuel);
                        // Common fuel types
                        ['diesel', 'gasoline', 'lpg', 'electricity', 'hydrogen'].forEach(function(fuel) {
                            if (element.tags[fuel] === 'yes') fuelTypes.push(fuel);
                        });
                    }

                    // Additional info for charging stations
                    var chargingInfo = null;
                    if (element.tags && amenity === 'charging_station') {
                        chargingInfo = {
                            network: element.tags.network,
                            operator: element.tags.operator,
                            capacity: element.tags.capacity,
                            socket_type: element.tags.socket_type || element.tags['socket:type'],
                            voltage: element.tags.voltage,
                            amperage: element.tags.amperage
                        };
                    }

                    var station = {
                        id: element.id,
                        type: element.type,
                        amenity: amenity,
                        name: name,
                        brand: brand,
                        operator: operator,
                        address: address,
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                        fuelTypes: fuelTypes.length > 0 ? fuelTypes : null,
                        chargingInfo: chargingInfo,
                        tags: element.tags,
                        timestamp: new Date().getTime()
                    };

                    stations.push(station);
                    console.log('✅ Processed fuel station:', station.name, 'at', station.lat + ',' + station.lng, 'type:', amenity);

                } catch (error) {
                    console.warn('❌ Error processing fuel station element:', error, element);
                }
            });

            console.log('⛽ Successfully processed', stations.length, 'fuel stations from Overpass API');

            // Now fetch fuel prices and match with stations
            return fetchFuelPrices().then(function(priceMap) {
                // Match OSM stations with price data
                stations.forEach(function(station) {
                    if (station.amenity === 'fuel') {
                        // Try to match by name/address similarity
                        var matchedPrice = findMatchingPrice(station, priceMap);
                        if (matchedPrice) {
                            station.prices = matchedPrice.prices;
                            station.priceLastUpdate = matchedPrice.lastUpdate;
                            station.priceSchedule = matchedPrice.schedule;
                            console.log('💰 Matched prices for station:', station.name);
                        }
                    }
                });

                if (stations.length > 0) {
                    console.log('⛽ SUCCESS: Retrieved', stations.length, 'fuel stations!');
                    return stations;
                } else {
                    console.warn('No fuel stations found in current map bounds');
                    alert('⛽ No s\'han trobat estacions de servei a la zona visible del mapa. Prova d\'apropar-te o canviar de zona.');
                    return [];
                }
            });
        })
        .catch(error => {
            console.error('❌ Overpass API fetch failed:', error);

            // Try fallback server
            var fallbackUrl = 'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query);
            console.log('🔄 Trying fallback Overpass server...');

            return fetch(fallbackUrl)
                .then(response => response.json())
                .then(data => {
                    console.log('✅ Fallback Overpass server succeeded');

                    var stations = [];

                    data.elements.forEach(function(element) {
                        try {
                            var lat, lng;

                            if (element.type === 'node') {
                                lat = element.lat;
                                lng = element.lon;
                            } else if (element.center) {
                                lat = element.center.lat;
                                lng = element.center.lon;
                            } else {
                                return;
                            }

                            if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                                return;
                            }

                            var amenity = element.tags ? element.tags.amenity : null;
                            var name = element.tags ? (element.tags.name || element.tags.brand || element.tags.operator || 'Estació sense nom') : 'Estació sense nom';

                            stations.push({
                                id: element.id,
                                type: element.type,
                                amenity: amenity,
                                name: name,
                                lat: parseFloat(lat),
                                lng: parseFloat(lng),
                                tags: element.tags,
                                timestamp: new Date().getTime()
                            });

                        } catch (error) {
                            console.warn('Error processing element at fallback:', error);
                        }
                    });

                    return stations;
                })
                .catch(fallbackError => {
                    console.error('❌ Fallback Overpass server also failed:', fallbackError);
                    alert('⛽ Error carregant les estacions de servei. L\'API d\'OpenStreetMap no està disponible temporalment.');
                    return [];
                });
        });
}

// Display fuel stations on map
function displayFuelStations(stations, isInitialLoad = false) {
    console.log('⛽ DISPLAYING', stations.length, 'FUEL STATIONS ON MAP...');

    // Store all stations only on initial load
    if (isInitialLoad) {
        allFuelStations = stations;
    }

    // Calculate rankings based on ALL fuel stations (not just the filtered ones)
    var allFuelStationsWithPrices = allFuelStations.filter(s => s.amenity === 'fuel' && s.prices);

    // Create Gas 95 ranking from all stations
    var gas95Ranking = allFuelStationsWithPrices.slice().sort(function(a, b) {
        var aPrice = a.prices && a.prices.gasolina95 ? parseFloat(a.prices.gasolina95.replace(',', '.')) : Infinity;
        var bPrice = b.prices && b.prices.gasolina95 ? parseFloat(b.prices.gasolina95.replace(',', '.')) : Infinity;
        return aPrice - bPrice;
    });

    // Create Diesel ranking from all stations
    var dieselRanking = allFuelStationsWithPrices.slice().sort(function(a, b) {
        var aPrice = a.prices && a.prices.diesel ? parseFloat(a.prices.diesel.replace(',', '.')) : Infinity;
        var bPrice = b.prices && b.prices.diesel ? parseFloat(b.prices.diesel.replace(',', '.')) : Infinity;
        return aPrice - bPrice;
    });

    // Add rankings to ALL fuel stations
    allFuelStationsWithPrices.forEach(function(station) {
        if (station.amenity === 'fuel' && station.prices) {
            station.gas95Rank = gas95Ranking.findIndex(s => s.id === station.id) + 1;
            station.dieselRank = dieselRanking.findIndex(s => s.id === station.id) + 1;
        }
    });

    // Sort stations by fuel prices (cheapest Gas 95 first, then cheapest Diesel)
    stations.sort(function(a, b) {
        // Stations with fuel prices come first
        var aHasPrices = a.amenity === 'fuel' && a.prices;
        var bHasPrices = b.amenity === 'fuel' && b.prices;

        if (aHasPrices && !bHasPrices) return -1;
        if (!aHasPrices && bHasPrices) return 1;
        if (!aHasPrices && !bHasPrices) return 0;

        // For fuel stations with prices, sort by Gas 95 price first
        var aGas95Price = a.prices && a.prices.gasolina95 ? parseFloat(a.prices.gasolina95.replace(',', '.')) : Infinity;
        var bGas95Price = b.prices && b.prices.gasolina95 ? parseFloat(b.prices.gasolina95.replace(',', '.')) : Infinity;

        if (aGas95Price !== bGas95Price) {
            return aGas95Price - bGas95Price; // Lower price first
        }

        // If Gas 95 prices are equal (or both missing), sort by Diesel price
        var aDieselPrice = a.prices && a.prices.diesel ? parseFloat(a.prices.diesel.replace(',', '.')) : Infinity;
        var bDieselPrice = b.prices && b.prices.diesel ? parseFloat(b.prices.diesel.replace(',', '.')) : Infinity;

        return aDieselPrice - bDieselPrice; // Lower price first
    });

    console.log('⛽ STATIONS SORTED BY PRICE: Gas 95 → Diesel');

    // Clear existing markers
    fuelStationsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    fuelStationsMarkers = [];

    stations.forEach(function(station, index) {
        if (station.lat && station.lng && !isNaN(station.lat) && !isNaN(station.lng)) {
            // Choose icon based on station type
            var iconHtml, markerColor;

            if (station.amenity === 'charging_station') {
                iconHtml = '<i class="fa-solid fa-charging-station" style="color: #28a745;"></i>';
                markerColor = '#28a745'; // Green for charging stations
            } else {
                iconHtml = '<i class="fa-solid fa-gas-pump" style="color: #dc3545;"></i>';
                markerColor = '#dc3545'; // Red for fuel stations
            }

            // Create ranking display for fuel stations
            var rankingDisplay = '';
            if (station.amenity === 'fuel' && station.gas95Rank && station.dieselRank) {
                rankingDisplay = station.gas95Rank + '/' + station.dieselRank;
            } else {
                // Fallback to sequential number for charging stations or stations without rankings
                rankingDisplay = (index + 1).toString();
            }

            // Create marker content with rankings and fuel prices if available
            var markerContent = '<div style="background: ' + markerColor + '; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); position: relative; font-weight: bold; font-size: ' + (rankingDisplay.includes('/') ? '10px' : '12px') + ';">' + rankingDisplay;

            // Add fuel price overlay for fuel stations
            if (station.amenity === 'fuel' && station.prices) {
                var priceLabels = [];

                // Add Gasolina 95 price if available
                if (station.prices.gasolina95 && station.prices.gasolina95 !== '') {
                    var gas95Price = parseFloat(station.prices.gasolina95.replace(',', '.')).toFixed(3);
                    priceLabels.push('95: ' + gas95Price);
                }

                // Add Diesel price if available
                if (station.prices.diesel && station.prices.diesel !== '') {
                    var dieselPrice = parseFloat(station.prices.diesel.replace(',', '.')).toFixed(3);
                    priceLabels.push('D: ' + dieselPrice);
                }

                // If no preferred prices, try Gasolina 98
                if (priceLabels.length === 0 && station.prices.gasolina98 && station.prices.gasolina98 !== '') {
                    var gas98Price = parseFloat(station.prices.gasolina98.replace(',', '.')).toFixed(3);
                    priceLabels.push('98: ' + gas98Price);
                }

                if (priceLabels.length > 0) {
                    var priceText = priceLabels.join(' | ');
                    markerContent += '<div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background: white; color: ' + markerColor + '; border-radius: 8px; padding: 2px 4px; font-size: 8px; font-weight: bold; border: 1px solid ' + markerColor + '; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis;">' + priceText + '</div>';
                }
            }

            markerContent += '</div>';

            var marker = L.marker([station.lat, station.lng], {
                icon: L.divIcon({
                    html: markerContent,
                    className: 'fuel-station-marker',
                    iconSize: [32, 40], // Increased height to accommodate price label
                    iconAnchor: [16, 16]
                })
            });

            // Create detailed popup content
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: ' + markerColor + '; border-bottom: 2px solid ' + markerColor + '; padding-bottom: 4px;">' +
                (station.amenity === 'charging_station' ? '🔌' : '⛽') + ' ' + station.name + '</h4>' +
                '<div style="background: ' + markerColor + '15; border: 1px solid ' + markerColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">';

            if (station.brand) popupContent += '<strong>Marca:</strong> ' + station.brand + '<br>';
            if (station.operator) popupContent += '<strong>Operador:</strong> ' + station.operator + '<br>';
            if (station.address) popupContent += '<strong>Adreça:</strong> ' + station.address + '<br>';

            // Fuel types
            if (station.fuelTypes && station.fuelTypes.length > 0) {
                popupContent += '<strong>Combustibles:</strong> ' + station.fuelTypes.join(', ') + '<br>';
            }

            // Fuel prices (from Spanish Ministry API)
            if (station.prices) {
                popupContent += '</div><div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin: 8px 0;">';
                popupContent += '<strong style="color: #856404;">💰 Preus dels combustibles</strong><br>';

                var hasPrices = false;
                if (station.prices.gasolina95 && station.prices.gasolina95 !== '') {
                    popupContent += '<strong>Gasolina 95:</strong> ' + station.prices.gasolina95 + ' €/L<br>';
                    hasPrices = true;
                }
                if (station.prices.gasolina98 && station.prices.gasolina98 !== '') {
                    popupContent += '<strong>Gasolina 98:</strong> ' + station.prices.gasolina98 + ' €/L<br>';
                    hasPrices = true;
                }
                if (station.prices.diesel && station.prices.diesel !== '') {
                    popupContent += '<strong>Diesel:</strong> ' + station.prices.diesel + ' €/L<br>';
                    hasPrices = true;
                }
                if (station.prices.dieselPremium && station.prices.dieselPremium !== '') {
                    popupContent += '<strong>Diesel Premium:</strong> ' + station.prices.dieselPremium + ' €/L<br>';
                    hasPrices = true;
                }
                if (station.prices.lpg && station.prices.lpg !== '') {
                    popupContent += '<strong>GLP:</strong> ' + station.prices.lpg + ' €/L<br>';
                    hasPrices = true;
                }

                if (!hasPrices) {
                    popupContent += '<em>No hi ha preus disponibles</em><br>';
                }

                if (station.priceLastUpdate) {
                    popupContent += '<small style="color: #856404;">Actualitzat: ' + station.priceLastUpdate + '</small><br>';
                }

                popupContent += '</div><div style="background: ' + markerColor + '15; border: 1px solid ' + markerColor + '; border-radius: 4px; padding: 10px; margin: 8px 0;">';
            }

            // Charging station info
            if (station.chargingInfo) {
                popupContent += '<strong>Tipus:</strong> Punt de recàrrega<br>';
                if (station.chargingInfo.network) popupContent += '<strong>Xarxa:</strong> ' + station.chargingInfo.network + '<br>';
                if (station.chargingInfo.capacity) popupContent += '<strong>Capacitat:</strong> ' + station.chargingInfo.capacity + '<br>';
                if (station.chargingInfo.socket_type) popupContent += '<strong>Tipus endoll:</strong> ' + station.chargingInfo.socket_type + '<br>';
            }

            popupContent += '<strong>Posició:</strong> ' + station.lat.toFixed(4) + ', ' + station.lng.toFixed(4) +
                '</div>' +
                '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                '🗺️ Dades d\'OpenStreetMap';

            if (station.prices) {
                popupContent += ' | 💰 Preus del Ministeri d\'Energia';
            }

            popupContent += '</div>' +
                '</div>';

            marker.bindPopup(popupContent);

            // Add marker to map
            marker.addTo(map);
            fuelStationsMarkers.push(marker);

            console.log('✅ ADDED FUEL STATION MARKER:', station.name, 'at', station.lat, station.lng, 'type:', station.amenity);
        } else {
            console.warn('❌ INVALID COORDS for fuel station:', station.name, station.lat, station.lng);
        }
    });

    console.log('🎯 TOTAL FUEL STATION MARKERS CREATED:', fuelStationsMarkers.length);

    // Update status
    var fuelCount = stations.filter(s => s.amenity === 'fuel').length;
    var chargingCount = stations.filter(s => s.amenity === 'charging_station').length;
    updateFuelStationsStatus('⛽ Mostrant ' + fuelCount + ' benzineres i ' + chargingCount + ' punts de recàrrega');

    // Populate the fuel stations table
    populateFuelStationsTable(stations);

    console.log('🎉 FUEL STATIONS DISPLAY COMPLETED SUCCESSFULLY!');
}

// Filter fuel stations based on selected type
function filterFuelStations() {
    var filterSelect = document.getElementById('fuel-type-filter');
    if (!filterSelect) return;

    currentFuelFilter = filterSelect.value;

    // Clear existing markers
    fuelStationsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    fuelStationsMarkers = [];

    // Filter stations
    var filteredStations = allFuelStations.filter(function(station) {
        if (currentFuelFilter === 'all') return true;
        if (currentFuelFilter === 'fuel') return station.amenity === 'fuel';
        if (currentFuelFilter === 'charging') return station.amenity === 'charging_station';
        return true;
    });

    // Display filtered stations
    displayFuelStations(filteredStations, false);
}

// Find matching fuel price data for an OSM station
function findMatchingPrice(osmStation, priceMap) {
    // Try to find a match by name and address similarity
    var bestMatch = null;
    var bestScore = 0;

    Object.values(priceMap).forEach(function(priceStation) {
        var score = 0;

        // Name similarity
        if (osmStation.name && priceStation.name) {
            var osmName = osmStation.name.toLowerCase().replace(/[^\w\s]/g, '');
            var priceName = priceStation.name.toLowerCase().replace(/[^\w\s]/g, '');

            // Exact match gets high score
            if (osmName === priceName) {
                score += 10;
            }
            // Partial match
            else if (osmName.includes(priceName) || priceName.includes(osmName)) {
                score += 5;
            }
            // Brand match
            else if (osmStation.brand && priceStation.name.toLowerCase().includes(osmStation.brand.toLowerCase())) {
                score += 3;
            }
        }

        // Address similarity
        if (osmStation.address && priceStation.address) {
            var osmAddr = osmStation.address.toLowerCase();
            var priceAddr = (priceStation.address + ', ' + (priceStation.town || '')).toLowerCase();

            // Address contains street name
            if (priceAddr.includes(osmAddr.split(',')[0].trim())) {
                score += 4;
            }
        }

        // Location proximity (if coordinates are available in price data, we could check distance)
        // For now, we rely on name/address matching

        if (score > bestScore && score >= 5) { // Minimum threshold for matching
            bestMatch = priceStation;
            bestScore = score;
        }
    });

    return bestMatch;
}

// Sort fuel stations table
function sortFuelStationsTable(field) {
    if (fuelSortField === field) {
        // Toggle direction if same field
        fuelSortDirection = fuelSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New field, default to ascending
        fuelSortField = field;
        fuelSortDirection = 'asc';
    }

    // Get current filtered stations
    var filteredStations = allFuelStations.filter(function(station) {
        if (currentFuelFilter === 'all') return true;
        if (currentFuelFilter === 'fuel') return station.amenity === 'fuel';
        if (currentFuelFilter === 'charging') return station.amenity === 'charging_station';
        return true;
    });

    // Sort the filtered stations
    filteredStations.sort(function(a, b) {
        var result = 0;

        switch (field) {
            case 'number':
                result = (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
                break;
            case 'name':
                result = a.name.localeCompare(b.name);
                break;
            case 'gas95':
                var aPrice = a.prices && a.prices.gasolina95 ? parseFloat(a.prices.gasolina95.replace(',', '.')) : Infinity;
                var bPrice = b.prices && b.prices.gasolina95 ? parseFloat(b.prices.gasolina95.replace(',', '.')) : Infinity;
                result = aPrice - bPrice;
                break;
            case 'diesel':
                var aPrice = a.prices && a.prices.diesel ? parseFloat(a.prices.diesel.replace(',', '.')) : Infinity;
                var bPrice = b.prices && b.prices.diesel ? parseFloat(b.prices.diesel.replace(',', '.')) : Infinity;
                result = aPrice - bPrice;
                break;
            case 'address':
                result = (a.address || '').localeCompare(b.address || '');
                break;
            default:
                result = 0;
        }

        return fuelSortDirection === 'asc' ? result : -result;
    });

    // Re-populate table with sorted data
    populateFuelStationsTable(filteredStations, true);
}

// Populate the fuel stations table with station data
function populateFuelStationsTable(stations, isSorted = false) {
    var tableContainer = document.getElementById('fuel-stations-table-container');
    var tableBody = document.getElementById('fuel-stations-table-body');
    var tableHead = document.querySelector('#fuel-stations-table thead tr');

    if (!tableContainer || !tableBody || !tableHead) {
        console.warn('Fuel stations table elements not found');
        return;
    }

    // Update table headers with sorting links (only once)
    if (!isSorted) {
        tableHead.innerHTML = `
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">
                <a href="#" onclick="sortFuelStationsTable('number'); return false;" style="color: #0066cc; text-decoration: none;">#</a>
            </th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left; font-weight: bold;">
                <a href="#" onclick="sortFuelStationsTable('name'); return false;" style="color: #0066cc; text-decoration: none;">Nom</a>
            </th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">
                <a href="#" onclick="sortFuelStationsTable('gas95'); return false;" style="color: #0066cc; text-decoration: none;">Gasolina 95</a>
            </th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">
                <a href="#" onclick="sortFuelStationsTable('diesel'); return false;" style="color: #0066cc; text-decoration: none;">Diesel</a>
            </th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left; font-weight: bold;">
                <a href="#" onclick="sortFuelStationsTable('address'); return false;" style="color: #0066cc; text-decoration: none;">Adreça</a>
            </th>
        `;
    }

    // Clear existing rows
    tableBody.innerHTML = '';

    if (stations.length === 0) {
        tableContainer.style.display = 'none';
        return;
    }

    // Show the table container
    tableContainer.style.display = 'block';

    // Add rows for each station
    stations.forEach(function(station, index) {
        var stationNumber = index + 1;

        // Format prices
        var gas95Price = (station.prices && station.prices.gasolina95 && station.prices.gasolina95 !== '') ?
            station.prices.gasolina95 + ' €' : '-';
        var dieselPrice = (station.prices && station.prices.diesel && station.prices.diesel !== '') ?
            station.prices.diesel + ' €' : '-';

        // Create table row
        var row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.style.transition = 'background-color 0.2s';

        // Determine if this is a charging station (for green styling)
        var isChargingStation = station.amenity === 'charging_station';

        // Add hover effect
        row.onmouseover = function() { this.style.backgroundColor = '#f0f8ff'; };
        row.onmouseout = function() { this.style.backgroundColor = ''; };

        // Add click handler to center map on station
        row.onclick = function(event) {
            event.preventDefault();
            event.stopPropagation();

            map.setView([station.lat, station.lng], Math.max(map.getZoom(), 15));
            // Highlight the corresponding marker briefly
            if (fuelStationsMarkers[index]) {
                fuelStationsMarkers[index].openPopup();
            }

            return false;
        };

        // Apply green styling for charging stations
        var numberStyle = isChargingStation ?
            'padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #28a745;' :
            'padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #dc3545;';
        var nameStyle = isChargingStation ?
            'padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #28a745;' :
            'padding: 8px; border: 1px solid #ddd; font-weight: bold;';
        var addressStyle = isChargingStation ?
            'padding: 8px; border: 1px solid #ddd; color: #28a745;' :
            'padding: 8px; border: 1px solid #ddd;';

        row.innerHTML = `
            <td style="${numberStyle}">${stationNumber}</td>
            <td style="${nameStyle}">${station.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center; ${gas95Price !== '-' ? 'color: #28a745; font-weight: bold;' : 'color: #999;'}">${gas95Price}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center; ${dieselPrice !== '-' ? 'color: #007acc; font-weight: bold;' : 'color: #999;'}">${dieselPrice}</td>
            <td style="${addressStyle}">${station.address || 'Adreça desconeguda'}</td>
        `;

        tableBody.appendChild(row);
    });

    console.log('📊 Fuel stations table populated with', stations.length, 'stations');
}

// Make fuel functions globally accessible
window.startFuelStations = startFuelStations;
window.stopFuelStations = stopFuelStations;
window.filterFuelStations = filterFuelStations;
