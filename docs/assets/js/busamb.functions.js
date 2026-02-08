// AMB Bus Stops Visualization
var ambBusStopsMarkers = [];
var ambBusStopsInterval = null;
var allAMBStops = []; // Store all stops data
var ambBatchProcessingCancelled = false; // Flag to cancel batch processing

// Start AMB bus stops visualization
function startAMBStops() {
    if (ambBusStopsInterval) {
        stopAMBStops();
        return;
    }

    // Initial load
    fetchAllAMBStops().then(function(stops) {
        displayAMBStops(stops);
        // Start live countdown after data is loaded
        startLiveCountdown();
    }).catch(function(error) {
        console.error('❌ Failed to load AMB bus stops:', error);
        updateAMBStatus('Error: ' + error.message);
        alert('Error carregant parades AMB: ' + error.message);
    });

    // Update every 10 minutes
    ambBusStopsInterval = setInterval(function() {
        fetchAllAMBStops().then(function(stops) {
            displayAMBStops(stops);
        });
    }, 600000); // 10 minutes

    // Update UI
    document.getElementById('start-amb-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-amb-stops-btn').style.display = 'none';
    updateAMBStatus('Carregant parades d\'autobús AMB...');
}

// Update AMB data manually (button function)
function updateAMBData() {
    console.log('🔄 Manual AMB data update requested');

    // Show loading state
    var updateBtn = document.getElementById('update-amb-data-btn');
    if (updateBtn) {
        updateBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> <span>Actualitzant...</span>';
        updateBtn.disabled = true;
    }

    updateAMBStatus('Actualitzant dades AMB...');

    // Fetch fresh data
    fetchAllAMBStops().then(function(stops) {
        // If stops are currently displayed, update them
        if (ambBusStopsMarkers && ambBusStopsMarkers.length > 0) {
            displayAMBStops(stops);
        }

        // Update live countdown immediately
        updateLiveCountdown();

        // Update timetable if visible
        if (document.getElementById('amb-standalone-timetable').style.display !== 'none') {
            // Re-show timetable to refresh data
            showAMBStandaloneTimetable();
        }

        updateAMBStatus('Dades actualitzades correctament');

        console.log('✅ AMB data updated successfully');
    }).catch(function(error) {
        console.error('❌ Failed to update AMB data:', error);
        updateAMBStatus('Error actualitzant dades: ' + error.message);
        alert('Error actualitzant les dades AMB: ' + error.message);
    }).finally(function() {
        // Reset button state
        if (updateBtn) {
            updateBtn.innerHTML = '<i class="fa fa-refresh"></i> <span>Actualitzar dades</span>';
            updateBtn.disabled = false;
        }
    });
}

// Stop AMB bus stops visualization
function stopAMBStops() {
    if (ambBusStopsInterval) {
        clearInterval(ambBusStopsInterval);
        ambBusStopsInterval = null;
    }

    // Set cancellation flag
    ambBatchProcessingCancelled = true;

    // Clear all stop markers
    ambBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    ambBusStopsMarkers = [];

    // Update UI
    document.getElementById('start-amb-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-amb-stops-btn').style.display = 'none';
    updateAMBStatus('Inactiu');
}

// Update AMB status display
function updateAMBStatus(status) {
    var statusElement = document.getElementById('amb-stops-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch all AMB bus stops from local GTFS static feed and merge with real-time protobuf data
function fetchAllAMBStops() {
    console.log('🚌 Starting to fetch AMB bus stops from local GTFS files...');

    // Load GTFS static data from local files instead of zip
    var gtfsPromise = loadLocalGTFSData();

    // Fetch real-time trip updates from protobuf
    var proxyUrl = 'https://tempsrealcat.vercel.app/api/proxy?url=';
    var tripUpdatesUrl = proxyUrl + encodeURIComponent('https://www.ambmobilitat.cat/transit/trips-updates/trips.bin');

    console.log('🚌 Fetching real-time trip updates from:', tripUpdatesUrl);

    var tripUpdatesPromise = fetch(tripUpdatesUrl)
        .then(response => {
            if (!response.ok) {
                console.warn('⚠️ Trip updates not available:', response.status);
                return null;
            }
            return response.arrayBuffer();
        })
        .then(buffer => {
            if (buffer) {
                return parseGTFSRealtime(buffer, 'trip_updates');
            }
            return null;
        })
        .catch(error => {
            console.warn('⚠️ Error fetching trip updates:', error);
            return null;
        });

    // Wait for requests and combine data
    return Promise.all([gtfsPromise, tripUpdatesPromise])
        .then(function(results) {
            var stopsData = results[0];
            var tripUpdatesData = results[1];

            if (tripUpdatesData && tripUpdatesData.length > 0) {
                console.log('✅ Merging', tripUpdatesData.length, 'real-time updates with scheduled data');
                return mergeRealtimeData(stopsData, tripUpdatesData);
            } else {
                console.log('ℹ️ No real-time data available, using scheduled data only');
                return stopsData;
            }
        })
        .catch(error => {
            console.error('❌ Error fetching AMB GTFS data:', error);
            throw error;
        });
}

// Load GTFS data from local CSV files instead of zip
function loadLocalGTFSData() {
    console.log('📁 Loading GTFS data from local CSV files...');

    var gtfsBasePath = 'docs/assets/gtfs/amb_bus/';

    // Define all the GTFS files we need to load
    var filePromises = [
        // Load stops.txt
        fetch(gtfsBasePath + 'stops.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load stops.txt'))
            .then(content => {
                console.log('✅ Loaded stops.txt');
                return { type: 'stops', data: parseCSVStops(content) };
            }),

        // Load stop_times.txt
        fetch(gtfsBasePath + 'stop_times.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load stop_times.txt'))
            .then(content => {
                console.log('✅ Loaded stop_times.txt');
                return { type: 'stopTimes', data: parseCSVStopTimes(content) };
            }),

        // Load trips.txt
        fetch(gtfsBasePath + 'trips.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load trips.txt'))
            .then(content => {
                console.log('✅ Loaded trips.txt');
                return { type: 'trips', data: parseCSVTrips(content) };
            }),

        // Load routes.txt
        fetch(gtfsBasePath + 'routes.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load routes.txt'))
            .then(content => {
                console.log('✅ Loaded routes.txt');
                return { type: 'routes', data: parseCSVRoutes(content) };
            }),

        // Load calendar.txt
        fetch(gtfsBasePath + 'calendar.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load calendar.txt'))
            .then(content => {
                console.log('✅ Loaded calendar.txt');
                return { type: 'calendar', data: parseCSVCalendar(content) };
            }),

        // Load calendar_dates.txt
        fetch(gtfsBasePath + 'calendar_dates.txt')
            .then(response => response.ok ? response.text() : Promise.reject('Failed to load calendar_dates.txt'))
            .then(content => {
                console.log('✅ Loaded calendar_dates.txt');
                return { type: 'calendarDates', data: parseCSVCalendarDates(content) };
            })
    ];

    // Wait for all files to load and parse
    return Promise.all(filePromises)
        .then(function(results) {
            // Combine all loaded data into GTFS data object
            var gtfsData = {};
            results.forEach(function(result) {
                gtfsData[result.type] = result.data;
            });

            console.log('✅ All GTFS files loaded successfully');

            // Process the combined data
            var processedStops = combineGTFSData(gtfsData);
            console.log('✅ GTFS data processed and combined');
            return processedStops;
        })
        .catch(function(error) {
            console.error('❌ Error loading local GTFS files:', error);
            throw new Error('Failed to load GTFS data from local files: ' + error);
        });
}

// Parse GTFS stops.txt from zip buffer (kept for backward compatibility)
function parseGTFSStops(buffer) {
    return new Promise(function(resolve, reject) {
        // Import JSZip dynamically
        if (typeof JSZip === 'undefined') {
            // Load JSZip if not available
            var script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = function() {
                parseZipFile(buffer, resolve, reject);
            };
            script.onerror = function() {
                reject(new Error('Failed to load JSZip'));
            };
            document.head.appendChild(script);
        } else {
            parseZipFile(buffer, resolve, reject);
        }
    });
}

// Parse GTFS-RT binary file using official GTFS-RT bindings
function parseGTFSRealtime(buffer, feedType) {
    return new Promise(function(resolve, reject) {
        // Load official GTFS-RT JavaScript bindings
        if (typeof GtfsRealtimeBindings === 'undefined') {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@transit/gtfs-realtime-bindings@0.0.2/dist/index.min.js';
            script.onload = function() {
                decodeGTFSRealtime(buffer, feedType, resolve, reject);
            };
            script.onerror = function() {
                console.warn('Failed to load GTFS-RT bindings, trying alternative...');
                // Fallback to older library
                var fallbackScript = document.createElement('script');
                fallbackScript.src = 'https://cdn.jsdelivr.net/npm/gtfs-realtime-bindings@0.0.5/dist/gtfs-realtime.js';
                fallbackScript.onload = function() {
                    decodeGTFSRealtime(buffer, feedType, resolve, reject);
                };
                fallbackScript.onerror = function() {
                    console.warn('Failed to load GTFS-RT bindings, skipping real-time data');
                    resolve(null);
                };
                document.head.appendChild(fallbackScript);
            };
            document.head.appendChild(script);
        } else {
            decodeGTFSRealtime(buffer, feedType, resolve, reject);
        }
    });
}

// Decode GTFS-RT data using official bindings (Trip Updates only for now)
function decodeGTFSRealtime(buffer, feedType, resolve, reject) {
    try {
        console.log('🔄 Decoding GTFS-RT', feedType, 'data using official bindings...', buffer.byteLength, 'bytes');

        // Use official GTFS-RT JavaScript bindings
        // Check which library was loaded
        var gtfsBindings;
        if (typeof GtfsRealtimeBindings !== 'undefined') {
            gtfsBindings = GtfsRealtimeBindings;
        } else if (typeof transit_realtime !== 'undefined') {
            gtfsBindings = transit_realtime;
        } else {
            throw new Error('GTFS-RT bindings not available');
        }

        // Decode the FeedMessage
        var FeedMessage = gtfsBindings.FeedMessage;
        var message = FeedMessage.decode(new Uint8Array(buffer));

        console.log('✅ Successfully decoded GTFS-RT', feedType, 'FeedMessage using official bindings');

        var realtimeUpdates = [];

        if (feedType === 'trip_updates') {
            // Extract real-time trip updates using official bindings
            message.entity.forEach(function(entity) {
                if (entity.tripUpdate) {
                    var tripUpdate = entity.tripUpdate;
                    var trip = tripUpdate.trip;

                    // Process each stop time update
                    tripUpdate.stopTimeUpdate.forEach(function(stopUpdate) {
                        if (stopUpdate.arrival && stopUpdate.arrival.time) {
                            realtimeUpdates.push({
                                tripId: trip.tripId,
                                routeId: trip.routeId,
                                stopId: stopUpdate.stopId,
                                arrivalTime: new Date(stopUpdate.arrival.time.low * 1000 + stopUpdate.arrival.time.high * 0x100000000 * 1000), // Handle int64
                                delay: stopUpdate.arrival.delay || 0,
                                stopSequence: stopUpdate.stopSequence,
                                type: 'trip_update'
                            });
                        }
                    });
                }
            });
        } else if (feedType === 'vehicle_positions') {
            // Extract vehicle position data using official bindings
            message.entity.forEach(function(entity) {
                if (entity.vehicle) {
                    var vehiclePos = entity.vehicle;
                    var trip = vehiclePos.trip;

                    realtimeUpdates.push({
                        tripId: trip ? trip.tripId : null,
                        routeId: trip ? trip.routeId : null,
                        vehicleId: vehiclePos.vehicle ? vehiclePos.vehicle.id : null,
                        latitude: vehiclePos.position ? vehiclePos.position.latitude : null,
                        longitude: vehiclePos.position ? vehiclePos.position.longitude : null,
                        bearing: vehiclePos.position ? vehiclePos.position.bearing : null,
                        speed: vehiclePos.position ? vehiclePos.position.speed : null,
                        timestamp: vehiclePos.timestamp ? new Date(vehiclePos.timestamp.low * 1000 + vehiclePos.timestamp.high * 0x100000000 * 1000) : null,
                        stopId: vehiclePos.stopId,
                        currentStopSequence: vehiclePos.currentStopSequence,
                        currentStatus: vehiclePos.currentStatus,
                        type: 'vehicle_position'
                    });
                }
            });
        }

        console.log('🕒 Extracted', realtimeUpdates.length, 'real-time', feedType, 'from GTFS-RT using official bindings');
        resolve(realtimeUpdates);

    } catch (error) {
        console.warn('❌ Error decoding GTFS-RT', feedType, 'data with official bindings:', error);
        console.warn('⚠️ Falling back to manual protobuf parsing...');

        // Fallback to manual protobuf parsing if official bindings fail
        try {
            decodeGTFSRealtimeFallback(buffer, feedType, resolve, reject);
        } catch (fallbackError) {
            console.error('❌ Fallback parsing also failed:', fallbackError);
            resolve(null);
        }
    }
}

// Fallback manual protobuf decoding (in case official bindings fail)
function decodeGTFSRealtimeFallback(buffer, feedType, resolve, reject) {
    console.log('🔄 Using fallback manual protobuf decoding...');

    // Load protobuf.js for fallback
    if (typeof protobuf === 'undefined') {
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/protobufjs@7.2.4/dist/protobuf.min.js';
        script.onload = function() {
            decodeWithProtobufFallback(buffer, feedType, resolve, reject);
        };
        script.onerror = function() {
            resolve(null);
        };
        document.head.appendChild(script);
    } else {
        decodeWithProtobufFallback(buffer, feedType, resolve, reject);
    }
}

// Manual protobuf decoding as fallback
function decodeWithProtobufFallback(buffer, feedType, resolve, reject) {
    try {
        // GTFS-RT FeedMessage schema (simplified for fallback)
        var root = protobuf.Root.fromJSON({
            nested: {
                transit_realtime: {
                    nested: {
                        FeedMessage: {
                            fields: {
                                header: { rule: "required", type: "FeedHeader", id: 1 },
                                entity: { rule: "repeated", type: "FeedEntity", id: 2 }
                            }
                        },
                        FeedHeader: {
                            fields: {
                                gtfsRealtimeVersion: { type: "string", id: 1 },
                                incrementality: { type: "uint32", id: 2 },
                                timestamp: { type: "uint64", id: 3 }
                            }
                        },
                        FeedEntity: {
                            fields: {
                                id: { type: "string", id: 1 },
                                tripUpdate: { type: "TripUpdate", id: 3 },
                                vehicle: { type: "VehiclePosition", id: 2 }
                            }
                        },
                        TripUpdate: {
                            fields: {
                                trip: { rule: "required", type: "TripDescriptor", id: 1 },
                                stopTimeUpdate: { rule: "repeated", type: "StopTimeUpdate", id: 2 },
                                vehicle: { type: "VehicleDescriptor", id: 3 },
                                timestamp: { type: "uint64", id: 4 },
                                delay: { type: "int32", id: 5 }
                            }
                        },
                        TripDescriptor: {
                            fields: {
                                tripId: { type: "string", id: 1 },
                                routeId: { type: "string", id: 5 },
                                directionId: { type: "uint32", id: 6 },
                                startTime: { type: "string", id: 7 },
                                startDate: { type: "string", id: 8 }
                            }
                        },
                        StopTimeUpdate: {
                            fields: {
                                stopSequence: { type: "uint32", id: 1 },
                                stopId: { type: "string", id: 4 },
                                arrival: { type: "StopTimeEvent", id: 2 },
                                departure: { type: "StopTimeEvent", id: 3 }
                            }
                        },
                        StopTimeEvent: {
                            fields: {
                                time: { type: "int64", id: 1 },
                                delay: { type: "int32", id: 2 }
                            }
                        },
                        VehiclePosition: {
                            fields: {
                                trip: { type: "TripDescriptor", id: 1 },
                                vehicle: { type: "VehicleDescriptor", id: 8 },
                                position: { type: "Position", id: 2 },
                                timestamp: { type: "uint64", id: 4 },
                                stopId: { type: "string", id: 7 },
                                currentStopSequence: { type: "uint32", id: 3 },
                                currentStatus: { type: "VehicleStopStatus", id: 6 }
                            }
                        },
                        VehicleDescriptor: {
                            fields: {
                                id: { type: "string", id: 1 },
                                label: { type: "string", id: 2 },
                                licensePlate: { type: "string", id: 3 }
                            }
                        },
                        Position: {
                            fields: {
                                latitude: { type: "float", id: 1 },
                                longitude: { type: "float", id: 2 },
                                bearing: { type: "float", id: 3 },
                                speed: { type: "float", id: 4 }
                            }
                        },
                        VehicleStopStatus: {
                            values: { INCOMING_AT: 0, STOPPED_AT: 1, IN_TRANSIT_TO: 2 }
                        }
                    }
                }
            }
        });

        var FeedMessage = root.lookupType("transit_realtime.FeedMessage");
        var message = FeedMessage.decode(new Uint8Array(buffer));

        console.log('✅ Successfully decoded GTFS-RT', feedType, 'with fallback parsing');

        var realtimeUpdates = [];

        if (feedType === 'trip_updates') {
            message.entity.forEach(function(entity) {
                if (entity.tripUpdate) {
                    var tripUpdate = entity.tripUpdate;
                    var trip = tripUpdate.trip;

                    tripUpdate.stopTimeUpdate.forEach(function(stopUpdate) {
                        if (stopUpdate.arrival && stopUpdate.arrival.time) {
                            realtimeUpdates.push({
                                tripId: trip.tripId,
                                routeId: trip.routeId,
                                stopId: stopUpdate.stopId,
                                arrivalTime: new Date(stopUpdate.arrival.time * 1000),
                                delay: stopUpdate.arrival.delay || 0,
                                stopSequence: stopUpdate.stopSequence,
                                type: 'trip_update'
                            });
                        }
                    });
                }
            });
        }

        console.log('🕒 Extracted', realtimeUpdates.length, 'real-time', feedType, 'with fallback parsing');
        resolve(realtimeUpdates);

    } catch (error) {
        console.error('❌ Fallback parsing also failed:', error);
        resolve(null);
    }
}

// Parse the zip file and extract GTFS files
function parseZipFile(buffer, resolve, reject) {
    var zip = new JSZip();
    zip.loadAsync(buffer).then(function(zipContents) {
        var gtfsData = {
            stops: [],
            stopTimes: [],
            trips: [],
            routes: [],
            calendar: [],
            calendarDates: []
        };

        // Get list of files
        var fileNames = Object.keys(zipContents.files);
        console.log('📁 GTFS files found:', fileNames);

        // Define file readers with promises
        var filePromises = [];

        // Read stops.txt
        var stopsFile = findGTFSFile(zipContents, ['stops.txt', 'google_transit/stops.txt']);
        if (stopsFile) {
            filePromises.push(
                stopsFile.async('string').then(function(content) {
                    gtfsData.stops = parseCSVStops(content);
                    console.log('✅ Parsed', gtfsData.stops.length, 'stops');
                })
            );
        }

        // Read stop_times.txt
        var stopTimesFile = findGTFSFile(zipContents, ['stop_times.txt', 'google_transit/stop_times.txt']);
        if (stopTimesFile) {
            filePromises.push(
                stopTimesFile.async('string').then(function(content) {
                    gtfsData.stopTimes = parseCSVStopTimes(content);
                    console.log('✅ Parsed', gtfsData.stopTimes.length, 'stop times');
                })
            );
        }

        // Read trips.txt
        var tripsFile = findGTFSFile(zipContents, ['trips.txt', 'google_transit/trips.txt']);
        if (tripsFile) {
            filePromises.push(
                tripsFile.async('string').then(function(content) {
                    gtfsData.trips = parseCSVTrips(content);
                    console.log('✅ Parsed', gtfsData.trips.length, 'trips');
                })
            );
        }

        // Read routes.txt
        var routesFile = findGTFSFile(zipContents, ['routes.txt', 'google_transit/routes.txt']);
        if (routesFile) {
            filePromises.push(
                routesFile.async('string').then(function(content) {
                    gtfsData.routes = parseCSVRoutes(content);
                    console.log('✅ Parsed', gtfsData.routes.length, 'routes');
                })
            );
        }

        // Read calendar.txt
        var calendarFile = findGTFSFile(zipContents, ['calendar.txt', 'google_transit/calendar.txt']);
        if (calendarFile) {
            filePromises.push(
                calendarFile.async('string').then(function(content) {
                    gtfsData.calendar = parseCSVCalendar(content);
                    console.log('✅ Parsed', gtfsData.calendar.length, 'calendar entries');
                })
            );
        }

        // Read calendar_dates.txt
        var calendarDatesFile = findGTFSFile(zipContents, ['calendar_dates.txt', 'google_transit/calendar_dates.txt']);
        if (calendarDatesFile) {
            filePromises.push(
                calendarDatesFile.async('string').then(function(content) {
                    gtfsData.calendarDates = parseCSVCalendarDates(content);
                    console.log('✅ Parsed', gtfsData.calendarDates.length, 'calendar date exceptions');
                })
            );
        }

        // Wait for all files to be parsed
        Promise.all(filePromises).then(function() {
            try {
                // Combine the data and find scheduled arrivals
                var stopsWithSchedules = combineGTFSData(gtfsData);
                console.log('✅ Successfully processed GTFS data with schedules');
                resolve(stopsWithSchedules);
            } catch (error) {
                reject(new Error('Error combining GTFS data: ' + error.message));
            }
        }).catch(function(error) {
            reject(new Error('Error reading GTFS files: ' + error.message));
        });

    }).catch(function(error) {
        reject(new Error('Error loading GTFS zip: ' + error.message));
    });
}

// Helper function to find GTFS files
function findGTFSFile(zipContents, possibleNames) {
    for (var i = 0; i < possibleNames.length; i++) {
        var file = zipContents.file(possibleNames[i]);
        if (file) {
            return file;
        }
    }

    // Try to find files containing the base name
    var fileNames = Object.keys(zipContents.files);
    var baseName = possibleNames[0].split('.')[0];
    for (var i = 0; i < fileNames.length; i++) {
        if (fileNames[i].toLowerCase().includes(baseName) && fileNames[i].toLowerCase().endsWith('.txt')) {
            return zipContents.file(fileNames[i]);
        }
    }

    return null;
}

// Parse CSV content of stops.txt
function parseCSVStops(csvContent) {
    var lines = csvContent.split('\n');
    var stops = [];

    if (lines.length < 2) {
        throw new Error('Invalid stops.txt format');
    }

    // Parse header to find column indices
    var header = lines[0].split(',');
    var stopIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_id');
    var stopNameIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_name');
    var stopLatIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_lat');
    var stopLonIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_lon');

    if (stopIdIndex === -1 || stopNameIndex === -1 || stopLatIndex === -1 || stopLonIndex === -1) {
        throw new Error('Required columns not found in stops.txt');
    }

    // Parse data rows
    var parsedCount = 0;
    var skippedCount = 0;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) {
            skippedCount++;
            continue;
        }

        // Handle CSV parsing with quoted fields
        var fields = parseCSVLine(line);

        // Debug first few lines
        if (i <= 3) {
            console.log('🔍 stops.txt line', i, ':', fields);
        }

        if (fields.length > Math.max(stopIdIndex, stopNameIndex, stopLatIndex, stopLonIndex)) {
            var stop = {
                stop_id: fields[stopIdIndex] ? fields[stopIdIndex].replace(/"/g, '').trim() : '',
                stop_name: fields[stopNameIndex] ? fields[stopNameIndex].replace(/"/g, '').trim() : '',
                stop_lat: parseFloat(fields[stopLatIndex]),
                stop_lon: parseFloat(fields[stopLonIndex])
            };

            // Validate coordinates and required fields
            if (stop.stop_id && stop.stop_name && !isNaN(stop.stop_lat) && !isNaN(stop.stop_lon) &&
                stop.stop_lat >= -90 && stop.stop_lat <= 90 &&
                stop.stop_lon >= -180 && stop.stop_lon <= 180) {
                stops.push(stop);
                parsedCount++;

                // Debug first few valid stops
                if (parsedCount <= 3) {
                    console.log('✅ Valid stop:', stop);
                }
            } else {
                skippedCount++;
                if (skippedCount <= 3) {
                    console.log('⚠️ Invalid stop skipped:', stop, 'Fields:', fields);
                }
            }
        } else {
            skippedCount++;
        }
    }

    console.log('📊 stops.txt parsing complete:', parsedCount, 'valid stops,', skippedCount, 'skipped');
    return stops;
}

// Simple CSV line parser
function parseCSVLine(line) {
    var fields = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
        var char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    fields.push(current); // Add the last field
    return fields;
}

// Display AMB bus stops on map
function displayAMBStops(stops) {
    console.log('🚏 DISPLAYING', stops.length, 'AMB BUS STOPS ON MAP...');

    // Clear existing markers
    ambBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    ambBusStopsMarkers = [];

    var totalStops = 0;

    stops.forEach(function(stop) {
        // Use GTFS property names: stop_lat, stop_lon, stop_id, stop_name
        var lat = stop.stop_lat || stop.lat;
        var lng = stop.stop_lon || stop.lng;
        var stopId = stop.stop_id || stop.id || '?';
        var stopName = stop.stop_name || stop.nom_parada || 'Sense nom';

        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            // Create marker - make it wider to fit longer stop IDs
            // Use different color for stops with timetable data
            var hasTimetable = stop.scheduledArrivals && stop.scheduledArrivals.length > 0;
            var markerColor = hasTimetable ? '#28a745' : '#0088cc'; // Green for timetable, blue for no timetable
            var borderColor = hasTimetable ? '#1e7e34' : '#006699';

            var stopRef = stopId;
            var markerWidth = Math.max(32, stopRef.length * 8 + 8); // Minimum 32px, add 8px per character
            var markerHeight = 20;

            var markerHtml = '<div style="width: ' + markerWidth + 'px; height: ' + markerHeight + 'px; background: ' + markerColor + '; border: 2px solid ' + borderColor + '; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 1px 1px 3px rgba(0,0,0,0.7); white-space: nowrap;">' +
                '<span style="color: white; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.7); overflow: hidden; text-overflow: ellipsis;">' + stopRef + '</span>' +
                '</div>';

            var stopMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    html: markerHtml,
                    className: 'amb-bus-stop-marker',
                    iconSize: [markerWidth, markerHeight],
                    iconAnchor: [markerWidth / 2, markerHeight + 4]
                })
            });

            // Create popup with scheduled arrivals
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: #0088cc; border-bottom: 2px solid #0088cc; padding-bottom: 4px;">' +
                '🚏 Parada AMB ' + stopId + '</h4>' +
                '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                '<strong>Nom:</strong> ' + stopName + '<br>' +
                '<strong>Codi:</strong> ' + stopId + '<br>' +
                '<strong>Posició:</strong> ' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '<br>' +
                '<strong>Hora actual:</strong> ' + new Date().toLocaleTimeString('ca-ES') + '<br>' +
                '</div>';

            // Filter out past arrivals before displaying
            stop.scheduledArrivals = stop.scheduledArrivals.filter(function(arrival) {
                return arrival.scheduledTime > new Date();
            });

            // Sort arrivals by time to arrival and show the next two
            stop.scheduledArrivals.sort(function(a, b) {
                return a.timeToArrival - b.timeToArrival;
            });
            var nextArrivals = stop.scheduledArrivals.slice(0, 2);

            if (nextArrivals.length > 0) {
                var firstArrival = nextArrivals[0];

                popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                    '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🕒 Properes arribades</h5>';

                nextArrivals.forEach(function(arrival, index) {
                    var routeId = arrival.route;
                    var routeLongName = arrival.route_long_name || '';

                    if (index === 0) {
                        popupContent += '<div style="margin-bottom: 8px; padding: 8px; background: #fff; border-radius: 4px; border: 1px solid #eee;">' +
                            '<div style="font-weight: bold; color: #0088cc; margin-bottom: 6px;">Línia ' + routeId;
                        if (routeLongName) {
                            popupContent += ' - ' + routeLongName;
                        }
                        popupContent += '</div>';
                    }

                    var scheduledTime = arrival.scheduledTime;
                    var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + (scheduledTime.getDate() !== new Date().getDate() ? ' (demà)' : '') : '--:--';
                    var timeToArrival = arrival.timeToArrival;

                    var arrivalId = 'popup-arrival-' + stop.stop_id + '-' + index;

                    popupContent += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding: 4px; background: #f9f9f9; border-radius: 3px;">' +
                        '<div style="font-size: 12px; color: #666;">' + scheduledTimeStr;
                    if (arrival.destination) {
                        popupContent += ' ➜ ' + arrival.destination;
                    }
                    popupContent += '</div>' +
                        '<div style="font-weight: bold; font-family: monospace; font-size: 11px;">' +
                        '<span id="' + arrivalId + '">Calculating...</span></div>' +
                        '</div>';
                });

                popupContent += '</div>' +
                    '<div style="font-size: 10px; color: #666; margin-top: 6px; text-align: center;">Horaris basats en dades GTFS d\'AMB</div>' +
                    '<div style="text-align: center; margin-top: 8px;">' +
                    '<button onclick="showAMBFullTimetable(\'' + stopId + '\')" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 11px;">📋 Veure horari complet</button>' +
                    '</div>' +
                    '</div>';
            } else {
                popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                    '<em>No hi ha autobusos programats en les properes hores</em>' +
                    '</div>';
            }

            popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                '🚌 Àrea Metropolitana de Barcelona' +
                '</div>' +
                '</div>';

            stopMarker.bindPopup(popupContent);

            // Start live countdown when popup opens
            stopMarker.on('popupopen', function() {
                var nextArrivals = stop.scheduledArrivals.slice(0, 2);
                nextArrivals.forEach(function(arrival, index) {
                    if (arrival) {
                        startAMBArrivalCountdown('popup-arrival-' + stopId + '-' + index, arrival.scheduledTime);
                    }
                });
            });

            // Clear countdown when popup closes
            stopMarker.on('popupclose', function() {
                if (window.ambCountdownIntervals && window.ambCountdownIntervals[stopId]) {
                    window.ambCountdownIntervals[stopId].forEach(function(interval) {
                        clearInterval(interval);
                    });
                    delete window.ambCountdownIntervals[stopId];
                }
            });
            stopMarker.addTo(map);
            ambBusStopsMarkers.push(stopMarker);
            totalStops++;
        }
    });

    console.log('✅ Created', totalStops, 'AMB bus stop markers');
    updateAMBStatus('Mostrant ' + totalStops + ' parades AMB');
}

// Parse CSV content of stop_times.txt
function parseCSVStopTimes(csvContent) {
    var lines = csvContent.split('\n');
    var stopTimes = [];

    if (lines.length < 2) {
        console.warn('⚠️ stop_times.txt is empty or invalid');
        return stopTimes;
    }

    // Parse header to find column indices
    var header = lines[0].split(',');
    console.log('📊 stop_times.txt header:', header.map(h => h.trim()));

    // More robust column detection - look for exact matches first, then case-insensitive
    var tripIdIndex = header.findIndex(h => h.trim() === 'trip_id') !== -1 ?
        header.findIndex(h => h.trim() === 'trip_id') :
        header.findIndex(h => h.trim().toLowerCase() === 'trip_id');

    var stopIdIndex = header.findIndex(h => h.trim() === 'stop_id') !== -1 ?
        header.findIndex(h => h.trim() === 'stop_id') :
        header.findIndex(h => h.trim().toLowerCase() === 'stop_id');

    var arrivalTimeIndex = header.findIndex(h => h.trim() === 'arrival_time') !== -1 ?
        header.findIndex(h => h.trim() === 'arrival_time') :
        header.findIndex(h => h.trim().toLowerCase() === 'arrival_time');

    var departureTimeIndex = header.findIndex(h => h.trim() === 'departure_time') !== -1 ?
        header.findIndex(h => h.trim() === 'departure_time') :
        header.findIndex(h => h.trim().toLowerCase() === 'departure_time');

    var stopSequenceIndex = header.findIndex(h => h.trim() === 'stop_sequence') !== -1 ?
        header.findIndex(h => h.trim() === 'stop_sequence') :
        header.findIndex(h => h.trim().toLowerCase() === 'stop_sequence');

    console.log('📊 stop_times.txt columns found:', {
        trip_id: tripIdIndex,
        stop_id: stopIdIndex,
        arrival_time: arrivalTimeIndex,
        departure_time: departureTimeIndex,
        stop_sequence: stopSequenceIndex
    });

    // Validate that we found all required columns
    if (tripIdIndex === -1 || stopIdIndex === -1 || arrivalTimeIndex === -1) {
        console.error('❌ Missing required columns in stop_times.txt');
        console.error('Required: trip_id, stop_id, arrival_time');
        console.error('Found indices:', {tripIdIndex, stopIdIndex, arrivalTimeIndex});
        return [];
    }

    // Parse data rows (increased limit to handle all AMB bus lines - now parsing all lines)
    var maxRows = lines.length - 1;
    console.log('📊 Processing', maxRows, 'stop times out of', (lines.length - 1), 'total rows');

    for (var i = 1; i <= maxRows; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseCSVLine(line);

        if (fields.length > Math.max(tripIdIndex, stopIdIndex, arrivalTimeIndex, departureTimeIndex)) {
            var stopTime = {
                trip_id: fields[tripIdIndex] ? fields[tripIdIndex].replace(/"/g, '') : '',
                stop_id: fields[stopIdIndex] ? fields[stopIdIndex].replace(/"/g, '') : '',
                arrival_time: fields[arrivalTimeIndex] ? fields[arrivalTimeIndex].replace(/"/g, '') : '',
                departure_time: fields[departureTimeIndex] ? fields[departureTimeIndex].replace(/"/g, '') : '',
                stop_sequence: parseInt(fields[stopSequenceIndex]) || 0
            };

            if (stopTime.trip_id && stopTime.stop_id && stopTime.arrival_time) {
                stopTimes.push(stopTime);
            }
        }

        // Progress logging
        if (i % 10000 === 0) {
            console.log('📊 Parsed', i, 'stop times...');
        }
    }

    return stopTimes;
}

// Parse CSV content of trips.txt
function parseCSVTrips(csvContent) {
    var lines = csvContent.split('\n');
    var trips = [];

    if (lines.length < 2) {
        console.warn('⚠️ trips.txt is empty or invalid');
        return trips;
    }

    var header = lines[0].split(',');
    var routeIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_id');
    var serviceIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'service_id');
    var tripIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'trip_id');
    var tripHeadsignIndex = header.findIndex(h => h.trim().toLowerCase() === 'trip_headsign');
    var directionIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'direction_id');

    console.log('📊 trips.txt columns found:', {
        route_id: routeIdIndex,
        service_id: serviceIdIndex,
        trip_id: tripIdIndex,
        trip_headsign: tripHeadsignIndex,
        direction_id: directionIdIndex
    });

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseCSVLine(line);

        if (fields.length > Math.max(routeIdIndex, serviceIdIndex, tripIdIndex)) {
            var trip = {
                route_id: fields[routeIdIndex] ? fields[routeIdIndex].replace(/"/g, '') : '',
                service_id: fields[serviceIdIndex] ? fields[serviceIdIndex].replace(/"/g, '') : '',
                trip_id: fields[tripIdIndex] ? fields[tripIdIndex].replace(/"/g, '') : '',
                trip_headsign: fields[tripHeadsignIndex] ? fields[tripHeadsignIndex].replace(/"/g, '') : '',
                direction_id: parseInt(fields[directionIdIndex]) || 0
            };

            if (trip.route_id && trip.service_id && trip.trip_id) {
                trips.push(trip);
            }
        }
    }

    return trips;
}

// Parse CSV content of routes.txt
function parseCSVRoutes(csvContent) {
    var lines = csvContent.split('\n');
    var routes = [];

    if (lines.length < 2) {
        console.warn('⚠️ routes.txt is empty or invalid');
        return routes;
    }

    var header = lines[0].split(',');
    var routeIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_id');
    var routeShortNameIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_short_name');
    var routeLongNameIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_long_name');
    var routeTypeIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_type');
    var routeColorIndex = header.findIndex(h => h.trim().toLowerCase() === 'route_color');

    console.log('📊 routes.txt columns found:', {
        route_id: routeIdIndex,
        route_short_name: routeShortNameIndex,
        route_long_name: routeLongNameIndex,
        route_type: routeTypeIndex,
        route_color: routeColorIndex
    });

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseCSVLine(line);

        if (fields.length > Math.max(routeIdIndex, routeShortNameIndex)) {
            var route = {
                route_id: fields[routeIdIndex] ? fields[routeIdIndex].replace(/"/g, '') : '',
                route_short_name: fields[routeShortNameIndex] ? fields[routeShortNameIndex].replace(/"/g, '') : '',
                route_long_name: fields[routeLongNameIndex] ? fields[routeLongNameIndex].replace(/"/g, '') : '',
                route_type: parseInt(fields[routeTypeIndex]) || 0,
                route_color: fields[routeColorIndex] ? fields[routeColorIndex].replace(/"/g, '') : '0088cc'
            };

            if (route.route_id) {
                routes.push(route);
            }
        }
    }

    return routes;
}

// Parse CSV content of calendar.txt
function parseCSVCalendar(csvContent) {
    var lines = csvContent.split('\n');
    var calendar = [];

    if (lines.length < 2) {
        console.warn('⚠️ calendar.txt is empty or invalid');
        return calendar;
    }

    var header = lines[0].split(',');
    var serviceIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'service_id');
    var mondayIndex = header.findIndex(h => h.trim().toLowerCase() === 'monday');
    var tuesdayIndex = header.findIndex(h => h.trim().toLowerCase() === 'tuesday');
    var wednesdayIndex = header.findIndex(h => h.trim().toLowerCase() === 'wednesday');
    var thursdayIndex = header.findIndex(h => h.trim().toLowerCase() === 'thursday');
    var fridayIndex = header.findIndex(h => h.trim().toLowerCase() === 'friday');
    var saturdayIndex = header.findIndex(h => h.trim().toLowerCase() === 'saturday');
    var sundayIndex = header.findIndex(h => h.trim().toLowerCase() === 'sunday');
    var startDateIndex = header.findIndex(h => h.trim().toLowerCase() === 'start_date');
    var endDateIndex = header.findIndex(h => h.trim().toLowerCase() === 'end_date');

    console.log('📊 calendar.txt columns found:', {
        service_id: serviceIdIndex,
        monday: mondayIndex,
        tuesday: tuesdayIndex,
        wednesday: wednesdayIndex,
        thursday: thursdayIndex,
        friday: fridayIndex,
        saturday: saturdayIndex,
        sunday: sundayIndex,
        start_date: startDateIndex,
        end_date: endDateIndex
    });

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseCSVLine(line);

        if (fields.length > Math.max(serviceIdIndex, startDateIndex, endDateIndex)) {
            var service = {
                service_id: fields[serviceIdIndex] ? fields[serviceIdIndex].replace(/"/g, '') : '',
                monday: parseInt(fields[mondayIndex]) || 0,
                tuesday: parseInt(fields[tuesdayIndex]) || 0,
                wednesday: parseInt(fields[wednesdayIndex]) || 0,
                thursday: parseInt(fields[thursdayIndex]) || 0,
                friday: parseInt(fields[fridayIndex]) || 0,
                saturday: parseInt(fields[saturdayIndex]) || 0,
                sunday: parseInt(fields[sundayIndex]) || 0,
                start_date: fields[startDateIndex] ? fields[startDateIndex].replace(/"/g, '') : '',
                end_date: fields[endDateIndex] ? fields[endDateIndex].replace(/"/g, '') : ''
            };

            if (service.service_id) {
                calendar.push(service);
            }
        }
    }

    return calendar;
}

// Parse CSV content of calendar_dates.txt
function parseCSVCalendarDates(csvContent) {
    var lines = csvContent.split('\n');
    var calendarDates = [];

    if (lines.length < 2) {
        console.warn('⚠️ calendar_dates.txt is empty or invalid');
        return calendarDates;
    }

    var header = lines[0].split(',');
    var serviceIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'service_id');
    var dateIndex = header.findIndex(h => h.trim().toLowerCase() === 'date');
    var exceptionTypeIndex = header.findIndex(h => h.trim().toLowerCase() === 'exception_type');

    console.log('📊 calendar_dates.txt columns found:', {
        service_id: serviceIdIndex,
        date: dateIndex,
        exception_type: exceptionTypeIndex
    });

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseCSVLine(line);

        if (fields.length > Math.max(serviceIdIndex, dateIndex, exceptionTypeIndex)) {
            var exception = {
                service_id: fields[serviceIdIndex] ? fields[serviceIdIndex].replace(/"/g, '') : '',
                date: fields[dateIndex] ? fields[dateIndex].replace(/"/g, '') : '',
                exception_type: parseInt(fields[exceptionTypeIndex]) || 0
            };

            if (exception.service_id && exception.date) {
                calendarDates.push(exception);
            }
        }
    }

    return calendarDates;
}

// Combine GTFS data and find scheduled arrivals for each stop
function combineGTFSData(gtfsData) {
    console.log('🔗 Combining GTFS data...');

    var stops = gtfsData.stops;
    var stopTimes = gtfsData.stopTimes;
    var trips = gtfsData.trips;
    var routes = gtfsData.routes;
    var calendar = gtfsData.calendar;
    var calendarDates = gtfsData.calendarDates;

    // Create lookup maps for faster access
    var tripsMap = {};
    trips.forEach(function(trip) {
        tripsMap[trip.trip_id] = trip;
    });

    var routesMap = {};
    routes.forEach(function(route) {
        routesMap[route.route_id] = route;
    });

    var calendarMap = {};
    calendar.forEach(function(service) {
        calendarMap[service.service_id] = service;
    });

    var calendarDatesMap = {};
    calendarDates.forEach(function(exception) {
        if (!calendarDatesMap[exception.service_id]) {
            calendarDatesMap[exception.service_id] = [];
        }
        calendarDatesMap[exception.service_id].push(exception);
    });

    console.log('🔗 Created lookup maps:', {
        trips: Object.keys(tripsMap).length,
        routes: Object.keys(routesMap).length,
        calendar: Object.keys(calendarMap).length,
        calendarDates: Object.keys(calendarDatesMap).length
    });

    // Group stop times by stop_id and filter stops that have schedules
    var stopTimesByStop = {};
    var stopsWithSchedules = new Set();

    stopTimes.forEach(function(stopTime) {
        if (!stopTimesByStop[stopTime.stop_id]) {
            stopTimesByStop[stopTime.stop_id] = [];
        }
        stopTimesByStop[stopTime.stop_id].push(stopTime);
        stopsWithSchedules.add(stopTime.stop_id);
    });

    console.log('🔗 Grouped stop times by stop, found stops with schedules:', stopsWithSchedules.size);

    // Create a map of stops by stop_id for efficient lookup
    var stopsById = {};
    stops.forEach(function(stop) {
        stopsById[stop.stop_id] = stop;
    });

    // Filter stops to only include those with timetable data
    var filteredStops = [];
    stopsWithSchedules.forEach(function(stopId) {
        if (stopsById[stopId]) {
            filteredStops.push(stopsById[stopId]);
        } else {
            // If stop exists in stop_times but not in stops.txt, create a minimal stop entry
            console.warn('⚠️ Stop', stopId, 'has timetable data but not found in stops.txt');
            filteredStops.push({
                stop_id: stopId,
                stop_name: 'Parada ' + stopId,
                stop_lat: 41.3851, // Default Barcelona coordinates
                stop_lon: 2.1734
            });
        }
    });

    console.log('🔗 Filtered stops from', stops.length, 'to', filteredStops.length, 'stops with timetable data');

    // Update stops array with filtered data
    gtfsData.stops = filteredStops;

    // Store the filtered stops globally for timetable zoom functionality
    allAMBStops = filteredStops;

    // Also create a lookup map of all stops by ID for the zoom function
    window.allAMBStopsMap = {};
    filteredStops.forEach(function(stop) {
        window.allAMBStopsMap[stop.stop_id] = stop;
    });

    // Also include original stops in case timetable references stops not in filtered list
    stops.forEach(function(stop) {
        if (!window.allAMBStopsMap[stop.stop_id]) {
            window.allAMBStopsMap[stop.stop_id] = stop;
        }
    });

    // For each stop, find scheduled arrivals
    var now = new Date();
    var currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    var currentDate = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    stops.forEach(function(stop) {
        var stopId = stop.stop_id;
        var stopSchedules = stopTimesByStop[stopId];

        if (!stopSchedules) {
            stop.scheduledArrivals = [];
            return;
        }

        var scheduledArrivals = [];

        // Process each scheduled stop time
        stopSchedules.forEach(function(stopTime) {
            var trip = tripsMap[stopTime.trip_id];
            if (!trip) return;

            var route = routesMap[trip.route_id];
            if (!route) return;

            // Check if service is running today
            if (!isServiceRunningToday(trip.service_id, currentDay, currentDate, calendarMap, calendarDatesMap)) {
                return;
            }

            // Parse arrival time
            var arrivalTimeStr = stopTime.arrival_time;
            if (!arrivalTimeStr) return;

            var arrivalTime = parseGTFSTime(arrivalTimeStr);
            if (!arrivalTime) return;

            // Create scheduled arrival time for today
            var scheduledTime = new Date(now);
            scheduledTime.setHours(arrivalTime.hours, arrivalTime.minutes, arrivalTime.seconds, 0);

            // If the scheduled time has already passed today, assume it's for tomorrow
            if (scheduledTime.getTime() < now.getTime()) {
                scheduledTime.setDate(scheduledTime.getDate() + 1);
            }

            // Calculate time to arrival in minutes
            var timeToArrival = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / (1000 * 60)));

            // Only include arrivals within the next 2 hours
            if (timeToArrival <= 120) {
                scheduledArrivals.push({
                    route: route.route_short_name || route.route_id,
                    route_long_name: route.route_long_name || '',
                    destination: trip.trip_headsign || '',
                    scheduledTime: scheduledTime,
                    timeToArrival: timeToArrival,
                    status: 'Horari',
                    isRealtime: false,
                    color: route.route_color || '0088cc'
                });
            }
        });

        // Sort by time to arrival and limit to next 10 arrivals
        scheduledArrivals.sort(function(a, b) {
            return a.timeToArrival - b.timeToArrival;
        });
        stop.scheduledArrivals = scheduledArrivals.slice(0, 10);
    });

    console.log('✅ GTFS data combined successfully');
    return stops;
}

// Check if a service is running on the given day and date
function isServiceRunningToday(serviceId, currentDay, currentDate, calendarMap, calendarDatesMap) {
    // Check calendar dates exceptions first
    var exceptions = calendarDatesMap[serviceId];
    if (exceptions) {
        var dateException = exceptions.find(function(exc) {
            return parseInt(exc.date) === currentDate;
        });
        if (dateException) {
            return dateException.exception_type === 1; // 1 = service added, 2 = service removed
        }
    }

    // Check regular calendar
    var service = calendarMap[serviceId];
    if (!service) return false;

    // Map day of week to calendar fields
    var dayFields = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var dayField = dayFields[currentDay];

    return service[dayField] === 1;
}

// Parse GTFS time format (HH:MM:SS)
function parseGTFSTime(timeStr) {
    var parts = timeStr.split(':');
    if (parts.length >= 2) {
        var hours = parseInt(parts[0]);
        var minutes = parseInt(parts[1]);
        var seconds = parts.length > 2 ? parseInt(parts[2]) : 0;

        if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
            return {
                hours: hours,
                minutes: minutes,
                seconds: seconds
            };
        }
    }
    return null;
}

// Show full timetable for a specific AMB stop
function showAMBFullTimetable(stopId) {
    console.log('📋 Showing full timetable for AMB stop:', stopId);

    // Find the stop data
    var stopData = allAMBStops ? allAMBStops.find(function(stop) {
        return stop.stop_id === stopId;
    }) : null;

    if (!stopData) {
        // Try to find in GTFS data or create a fallback entry
        if (window.gtfsData && window.gtfsData.stops) {
            stopData = window.gtfsData.stops.find(function(stop) {
                return stop.stop_id === stopId;
            });
        }

        if (!stopData) {
            // Create a fallback stop entry with default Barcelona coordinates
            console.warn('⚠️ Stop data not found for:', stopId, '- creating fallback entry');
            stopData = {
                stop_id: stopId,
                stop_name: 'Parada ' + stopId + ' (Sense dades completes)',
                stop_lat: 41.3851, // Default Barcelona coordinates
                stop_lon: 2.1734,
                scheduledArrivals: []
            };
        }
    }

    // Show the timetable section
    var timetableSection = document.getElementById('amb-full-timetable');
    var timetableContent = document.getElementById('amb-timetable-content');

    if (!timetableSection || !timetableContent) {
        console.error('❌ Timetable elements not found');
        return;
    }

    // Generate full timetable HTML
    var html = '<div style="margin-bottom: 15px;">' +
        '<h4 style="margin: 0 0 10px 0; color: #0088cc;">Horari complet - Parada ' + stopId + '</h4>' +
        '<p style="margin: 0 0 15px 0; color: #666; font-size: 14px;"><strong>' + (stopData.stop_name || 'Sense nom') + '</strong></p>' +
        '</div>';

    // Group all scheduled arrivals by route for the full day
    var allArrivalsByRoute = {};
    var now = new Date();
    var today = now.toDateString();

    // Get stop times for this stop and process all schedules
    if (window.gtfsData && window.gtfsData.stopTimes && window.gtfsData.trips && window.gtfsData.routes && window.gtfsData.calendar) {
        var stopTimes = window.gtfsData.stopTimes.filter(function(st) {
            return st.stop_id === stopId;
        });

        console.log('📋 Found', stopTimes.length, 'stop times for full timetable');

        stopTimes.forEach(function(stopTime) {
            var trip = window.gtfsData.tripsMap ? window.gtfsData.tripsMap[stopTime.trip_id] : null;
            if (!trip) return;

            var route = window.gtfsData.routesMap ? window.gtfsData.routesMap[trip.route_id] : null;
            if (!route) return;

            // Check if service runs today
            var currentDay = now.getDay();
            var currentDate = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
            if (!isServiceRunningToday(trip.service_id, currentDay, currentDate, window.gtfsData.calendarMap, window.gtfsData.calendarDatesMap)) {
                return;
            }

            // Parse time and create schedule entries for today and tomorrow
            var arrivalTime = parseGTFSTime(stopTime.arrival_time);
            if (!arrivalTime) return;

            // Today
            var todayTime = new Date(now);
            todayTime.setHours(arrivalTime.hours, arrivalTime.minutes, arrivalTime.seconds, 0);

            // Tomorrow (for times that have passed today)
            var tomorrowTime = new Date(todayTime);
            tomorrowTime.setDate(tomorrowTime.getDate() + 1);

            var scheduleTime = todayTime.getTime() < now.getTime() ? tomorrowTime : todayTime;

            var routeKey = route.route_short_name || route.route_id;
            if (!allArrivalsByRoute[routeKey]) {
                allArrivalsByRoute[routeKey] = {
                    route: route,
                    times: []
                };
            }

            allArrivalsByRoute[routeKey].times.push({
                time: scheduleTime,
                destination: trip.trip_headsign || '',
                timeStr: scheduleTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
            });
        });

        // Sort times for each route and limit to reasonable number
        Object.keys(allArrivalsByRoute).forEach(function(routeKey) {
            allArrivalsByRoute[routeKey].times.sort(function(a, b) {
                return a.time - b.time;
            });
            // Limit to 20 times per route for display
            allArrivalsByRoute[routeKey].times = allArrivalsByRoute[routeKey].times.slice(0, 20);
        });
    }

    // Generate HTML for each route
    if (Object.keys(allArrivalsByRoute).length > 0) {
        Object.keys(allArrivalsByRoute).sort().forEach(function(routeKey) {
            var routeData = allArrivalsByRoute[routeKey];
            var route = routeData.route;

            html += '<div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;">' +
                '<div style="font-weight: bold; color: #0088cc; margin-bottom: 10px; font-size: 16px;">' +
                'Línia ' + routeKey;
            if (route.route_long_name) {
                html += ' - ' + route.route_long_name;
            }
            html += '</div>' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;">';

            routeData.times.forEach(function(timeEntry) {
                var timeDiff = Math.round((timeEntry.time - now) / (1000 * 60));
                var timeColor = timeDiff < 0 ? '#6c757d' : timeDiff <= 5 ? '#dc3545' : timeDiff <= 15 ? '#fd7e14' : '#0066cc';

                html += '<div style="background: white; border: 1px solid #ddd; border-radius: 4px; padding: 8px; text-align: center;">' +
                    '<div style="font-weight: bold; color: ' + timeColor + '; font-family: monospace; font-size: 14px;">' + timeEntry.timeStr + '</div>';
                if (timeEntry.destination) {
                    html += '<div style="font-size: 11px; color: #666; margin-top: 2px;">' + timeEntry.destination + '</div>';
                }
                if (timeDiff > 0 && timeDiff <= 60) {
                    html += '<div style="font-size: 10px; color: ' + timeColor + '; margin-top: 2px;">' + timeDiff + ' min</div>';
                }
                html += '</div>';
            });

            html += '</div></div>';
        });
    } else {
        html += '<div style="text-align: center; padding: 40px; color: #666;">' +
            '<i class="fa fa-info-circle" style="font-size: 24px; margin-bottom: 10px;"></i>' +
            '<p>No s\'han trobat horaris per aquesta parada.</p>' +
            '<p style="font-size: 12px;">És possible que la parada no tingui servei programat o que les dades no estiguin disponibles.</p>' +
            '</div>';
    }

    html += '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #dee2e6; font-size: 12px; color: #666; text-align: center;">' +
        'Horaris basats en dades GTFS de l\'AMB - ' + now.toLocaleDateString('ca-ES') +
        '</div>';

    timetableContent.innerHTML = html;
    timetableSection.style.display = 'block';

    // Scroll to timetable section
    timetableSection.scrollIntoView({behavior: 'smooth', block: 'start'});
}

// Hide full timetable
function hideAMBFullTimetable() {
    var timetableSection = document.getElementById('amb-full-timetable');
    if (timetableSection) {
        timetableSection.style.display = 'none';
    }
}

// Store GTFS data globally for timetable access
var gtfsData = null;

// Update the fetch function to store GTFS data
function fetchAllAMBStops() {
    console.log('🚌 Starting to fetch AMB bus stops from GTFS...');

    // Use CORS proxy to access AMB GTFS data
    var proxyUrl = 'https://tempsrealcat.vercel.app/api/proxy?url=';
    var gtfsUrl = proxyUrl + encodeURIComponent('https://www.ambmobilitat.cat/OpenData/google_transit.zip');

    console.log('🚌 Using proxy URL:', gtfsUrl);

    return fetch(gtfsUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('GTFS download failed: ' + response.status);
            }
            return response.arrayBuffer();
        })
        .then(buffer => {
            return parseGTFSStops(buffer);
        })
        .then(function(processedData) {
            // Store GTFS data globally for timetable access
            if (window.gtfsData) {
                gtfsData = window.gtfsData;
            }
            return processedData;
        })
        .catch(error => {
            console.error('❌ Error fetching AMB GTFS data:', error);
            throw error; // Let the error propagate - no fallback mock data
        });
}

// Update combineGTFSData to store data globally
function combineGTFSData(gtfsData) {
    console.log('🔗 Combining GTFS data...');

    var stops = gtfsData.stops;
    var stopTimes = gtfsData.stopTimes;
    var trips = gtfsData.trips;
    var routes = gtfsData.routes;
    var calendar = gtfsData.calendar;
    var calendarDates = gtfsData.calendarDates;

    // Store data globally
    window.gtfsData = {
        stops: stops,
        stopTimes: stopTimes,
        trips: trips,
        routes: routes,
        calendar: calendar,
        calendarDates: calendarDates
    };

    // Create lookup maps for faster access
    var tripsMap = {};
    trips.forEach(function(trip) {
        tripsMap[trip.trip_id] = trip;
    });

    var routesMap = {};
    routes.forEach(function(route) {
        routesMap[route.route_id] = route;
    });

    var calendarMap = {};
    calendar.forEach(function(service) {
        calendarMap[service.service_id] = service;
    });

    var calendarDatesMap = {};
    calendarDates.forEach(function(exception) {
        if (!calendarDatesMap[exception.service_id]) {
            calendarDatesMap[exception.service_id] = [];
        }
        calendarDatesMap[exception.service_id].push(exception);
    });

    // Store maps globally too
    window.gtfsData.tripsMap = tripsMap;
    window.gtfsData.routesMap = routesMap;
    window.gtfsData.calendarMap = calendarMap;
    window.gtfsData.calendarDatesMap = calendarDatesMap;

    console.log('🔗 Created lookup maps:', {
        trips: Object.keys(tripsMap).length,
        routes: Object.keys(routesMap).length,
        calendar: Object.keys(calendarMap).length,
        calendarDates: Object.keys(calendarDatesMap).length
    });

    // Group stop times by stop_id
    var stopTimesByStop = {};
    stopTimes.forEach(function(stopTime) {
        if (!stopTimesByStop[stopTime.stop_id]) {
            stopTimesByStop[stopTime.stop_id] = [];
        }
        stopTimesByStop[stopTime.stop_id].push(stopTime);
    });

    console.log('🔗 Grouped stop times by stop, found stops with schedules:', Object.keys(stopTimesByStop).length);

    // For each stop, find scheduled arrivals
    var now = new Date();
    var currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    var currentDate = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    stops.forEach(function(stop) {
        var stopId = stop.stop_id;
        var stopSchedules = stopTimesByStop[stopId];

        if (!stopSchedules) {
            stop.scheduledArrivals = [];
            return;
        }

        var scheduledArrivals = [];

        // Process each scheduled stop time
        stopSchedules.forEach(function(stopTime) {
            var trip = tripsMap[stopTime.trip_id];
            if (!trip) return;

            var route = routesMap[trip.route_id];
            if (!route) return;

            // Check if service is running today
            if (!isServiceRunningToday(trip.service_id, currentDay, currentDate, calendarMap, calendarDatesMap)) {
                return;
            }

            // Parse arrival time
            var arrivalTimeStr = stopTime.arrival_time;
            if (!arrivalTimeStr) return;

            var arrivalTime = parseGTFSTime(arrivalTimeStr);
            if (!arrivalTime) return;
            // Create scheduled arrival time for today
            var scheduledTime = new Date(now);
            scheduledTime.setHours(arrivalTime.hours, arrivalTime.minutes, arrivalTime.seconds, 0);

            // If scheduled time has already passed, assume it's for tomorrow
            if (scheduledTime.getTime() < now.getTime()) {
                scheduledTime.setDate(scheduledTime.getDate() + 1);
            }

            // Calculate time to arrival in minutes
            var timeToArrival = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / (1000 * 60)));

            // Only include arrivals within next 24 hours
            if (timeToArrival <= 1440) {
                scheduledArrivals.push({
                    route: route.route_short_name || route.route_id,
                    route_long_name: route.route_long_name || '',
                    destination: trip.trip_headsign || '',
                    scheduledTime: scheduledTime,
                    timeToArrival: timeToArrival,
                    status: 'Horari',
                    isRealtime: false,
                    color: route.route_color || '0088cc'
                });
            }
        });

        // Sort by time to arrival and limit to next 10 arrivals
        scheduledArrivals.sort(function(a, b) {
            return a.timeToArrival - b.timeToArrival;
        });
        stop.scheduledArrivals = scheduledArrivals.slice(0, 10);
    });

    console.log('✅ GTFS data combined successfully');
    
    // Analyze data completeness
    analyzeGTFSCompleteness(gtfsData);
    
    return stops;
}

// Analyze GTFS data completeness and identify missing data
function analyzeGTFSCompleteness(gtfsData) {
    console.log('📊 === GTFS DATA COMPLETENESS ANALYSIS ===');
    
    var stops = gtfsData.stops || [];
    var stopTimes = gtfsData.stopTimes || [];
    var trips = gtfsData.trips || [];
    var routes = gtfsData.routes || [];
    
    console.log('Total records:');
    console.log('  - Stops:', stops.length);
    console.log('  - Stop Times:', stopTimes.length);
    console.log('  - Trips:', trips.length);
    console.log('  - Routes:', routes.length);
    
    // Find trips without stop times
    var tripsWithStopTimes = new Set();
    stopTimes.forEach(function(stopTime) {
        if (stopTime.trip_id) {
            tripsWithStopTimes.add(stopTime.trip_id);
        }
    });
    
    var tripsWithoutStopTimes = trips.filter(function(trip) {
        return !tripsWithStopTimes.has(trip.trip_id);
    });
    
    console.log('');
    console.log('🔍 TRIPS ANALYSIS:');
    console.log('  - Trips with stop times:', tripsWithStopTimes.size);
    console.log('  - Trips WITHOUT stop times:', tripsWithoutStopTimes.length);
    
    if (tripsWithoutStopTimes.length > 0) {
        console.log('');
        console.log('⚠️ TRIPS MISSING STOP TIMES:');
        tripsWithoutStopTimes.forEach(function(trip, index) {
            console.log('  ' + (index + 1) + '. Trip ID:', trip.trip_id, 
                       'Route:', trip.route_id, 
                       'Headsign:', trip.trip_headsign || 'N/A');
        });
        
        // Store missing trips data for later processing
        window.tripsMissingStopTimes = tripsWithoutStopTimes;
        console.log('');
        console.log('💾 Stored', tripsWithoutStopTimes.length, 'trips missing stop times for generation');
    }
    
    // Find stops without times
    var stopsWithTimes = new Set();
    stopTimes.forEach(function(stopTime) {
        if (stopTime.stop_id) {
            stopsWithTimes.add(stopTime.stop_id);
        }
    });
    
    var stopsWithoutTimes = stops.filter(function(stop) {
        return !stopsWithTimes.has(stop.stop_id);
    });
    
    console.log('');
    console.log('🔍 STOPS ANALYSIS:');
    console.log('  - Stops with stop times:', stopsWithTimes.size);
    console.log('  - Stops WITHOUT stop times:', stopsWithoutTimes.length);
    
    if (stopsWithoutTimes.length > 0) {
        console.log('');
        console.log('⚠️ STOPS MISSING STOP TIMES (showing first 10):');
        stopsWithoutTimes.slice(0, 10).forEach(function(stop, index) {
            console.log('  ' + (index + 1) + '. Stop ID:', stop.stop_id, 'Name:', stop.stop_name);
        });
        if (stopsWithoutTimes.length > 10) {
            console.log('  ... and', stopsWithoutTimes.length - 10, 'more stops');
        }
    }
    
    console.log('');
    console.log('📊 === ANALYSIS COMPLETE ===');
}

// Generate missing stop times for trips that lack them
function generateMissingStopTimes() {
    if (!window.tripsMissingStopTimes || window.tripsMissingStopTimes.length === 0) {
        console.log('✅ No trips missing stop times to generate');
        return;
    }

    console.log('🔧 === GENERATING MISSING STOP TIMES ===');
    console.log('Processing', window.tripsMissingStopTimes.length, 'trips without stop times...');

    var generatedStopTimes = [];
    var now = new Date();

    window.tripsMissingStopTimes.forEach(function(trip, index) {
        console.log('🔧 Processing trip', index + 1, '/', window.tripsMissingStopTimes.length, ':', trip.trip_id);

        // Get route information
        var route = window.gtfsData.routesMap[trip.route_id];
        if (!route) {
            console.warn('⚠️ Route not found for trip:', trip.trip_id, 'route:', trip.route_id);
            return;
        }

        // Find existing trips for this route to use as template
        var existingTripsForRoute = window.gtfsData.trips.filter(function(t) {
            return t.route_id === trip.route_id && t.trip_id !== trip.trip_id;
        });

        if (existingTripsForRoute.length === 0) {
            console.warn('⚠️ No existing trips found for route:', trip.route_id, 'to use as template');
            return;
        }

        // Find stop times for existing trips of this route
        var templateStopTimes = [];
        existingTripsForRoute.forEach(function(existingTrip) {
            var tripStopTimes = window.gtfsData.stopTimes.filter(function(st) {
                return st.trip_id === existingTrip.trip_id;
            });
            if (tripStopTimes.length > 0) {
                templateStopTimes = templateStopTimes.concat(tripStopTimes);
            }
        });

        if (templateStopTimes.length === 0) {
            console.warn('⚠️ No template stop times found for route:', trip.route_id);
            return;
        }

        // Group template stop times by stop sequence
        var stopTimesBySequence = {};
        templateStopTimes.forEach(function(st) {
            var key = st.stop_sequence;
            if (!stopTimesBySequence[key] || stopTimesBySequence[key].count < 3) {
                if (!stopTimesBySequence[key]) {
                    stopTimesBySequence[key] = {
                        stop_id: st.stop_id,
                        arrival_times: [],
                        departure_times: [],
                        count: 0
                    };
                }
                stopTimesBySequence[key].arrival_times.push(st.arrival_time);
                stopTimesBySequence[key].departure_times.push(st.departure_time || st.arrival_time);
                stopTimesBySequence[key].count++;
            }
        });

        // Generate stop times for this trip based on average times
        var generatedForTrip = [];
        Object.keys(stopTimesBySequence).sort(function(a, b) {
            return parseInt(a) - parseInt(b);
        }).forEach(function(sequence) {
            var template = stopTimesBySequence[sequence];
            
            // Calculate average arrival time
            var avgArrivalTime = calculateAverageTime(template.arrival_times);
            var avgDepartureTime = calculateAverageTime(template.departure_times);

            generatedForTrip.push({
                trip_id: trip.trip_id,
                arrival_time: avgArrivalTime,
                departure_time: avgDepartureTime,
                stop_id: template.stop_id,
                stop_sequence: parseInt(sequence),
                timepoint: 1
            });
        });

        generatedStopTimes = generatedStopTimes.concat(generatedForTrip);
        console.log('✅ Generated', generatedForTrip.length, 'stop times for trip:', trip.trip_id);
    });

    if (generatedStopTimes.length > 0) {
        // Add generated stop times to the global data
        window.gtfsData.stopTimes = window.gtfsData.stopTimes.concat(generatedStopTimes);
        
        // Update the trips missing stop times list
        window.tripsMissingStopTimes = [];
        
        console.log('✅ === GENERATION COMPLETE ===');
        console.log('Generated', generatedStopTimes.length, 'stop times total');
        console.log('Added to GTFS data - refresh displays to see updated information');
        
        // Re-process stops with the new data
        if (window.gtfsData && window.gtfsData.stops) {
            var updatedStops = combineGTFSData(window.gtfsData);
            console.log('🔄 Re-processed stops with generated stop times');
        }
    } else {
        console.log('❌ No stop times could be generated');
    }
}

// Calculate average time from an array of time strings (HH:MM:SS format)
function calculateAverageTime(timeStrings) {
    if (timeStrings.length === 0) return '00:00:00';
    
    var totalSeconds = 0;
    timeStrings.forEach(function(timeStr) {
        var parts = timeStr.split(':');
        if (parts.length === 3) {
            var hours = parseInt(parts[0]) || 0;
            var minutes = parseInt(parts[1]) || 0;
            var seconds = parseInt(parts[2]) || 0;
            totalSeconds += hours * 3600 + minutes * 60 + seconds;
        }
    });
    
    var avgSeconds = Math.round(totalSeconds / timeStrings.length);
    var avgHours = Math.floor(avgSeconds / 3600);
    var avgMinutes = Math.floor((avgSeconds % 3600) / 60);
    var avgSecs = avgSeconds % 60;
    
    return (avgHours.toString().padStart(2, '0') + ':' + 
            avgMinutes.toString().padStart(2, '0') + ':' + 
            avgSecs.toString().padStart(2, '0'));
}

// Export updated GTFS data with generated stop times
function exportUpdatedGTFSData() {
    if (!window.gtfsData) {
        console.error('❌ No GTFS data available to export');
        return;
    }

    console.log('💾 === EXPORTING UPDATED GTFS DATA ===');
    
    // Create CSV content for updated stop_times.txt
    var stopTimesCSV = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint\n';
    
    window.gtfsData.stopTimes.forEach(function(stopTime) {
        stopTimesCSV += [
            stopTime.trip_id || '',
            stopTime.arrival_time || '',
            stopTime.departure_time || '',
            stopTime.stop_id || '',
            stopTime.stop_sequence || '',
            stopTime.timepoint || 1
        ].join(',') + '\n';
    });

    // Create download link
    var blob = new Blob([stopTimesCSV], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'updated_stop_times.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ Exported', window.gtfsData.stopTimes.length, 'stop times to updated_stop_times.txt');
    
    // Also export a summary report
    var summaryContent = 'GTFS Data Completeness Report\n';
    summaryContent += 'Generated: ' + new Date().toISOString() + '\n\n';
    summaryContent += 'Total Records:\n';
    summaryContent += '- Stops: ' + window.gtfsData.stops.length + '\n';
    summaryContent += '- Stop Times: ' + window.gtfsData.stopTimes.length + '\n';
    summaryContent += '- Trips: ' + window.gtfsData.trips.length + '\n';
    summaryContent += '- Routes: ' + window.gtfsData.routes.length + '\n';
    summaryContent += '- Trips Missing Stop Times: ' + (window.tripsMissingStopTimes ? window.tripsMissingStopTimes.length : 0) + '\n';

    var summaryBlob = new Blob([summaryContent], { type: 'text/plain' });
    var summaryUrl = URL.createObjectURL(summaryBlob);
    var summaryA = document.createElement('a');
    summaryA.href = summaryUrl;
    summaryA.download = 'gtfs_completeness_report.txt';
    document.body.appendChild(summaryA);
    summaryA.click();
    document.body.removeChild(summaryA);
    URL.revokeObjectURL(summaryUrl);

    console.log('✅ Exported completeness report to gtfs_completeness_report.txt');
}

// Merge real-time data with scheduled arrivals
function mergeRealtimeData(stopsData, realtimeData) {
    if (!realtimeData || realtimeData.length === 0) {
        console.log('ℹ️ No real-time data to merge');
        return stopsData;
    }

    console.log('🔄 Merging', realtimeData.length, 'real-time updates with scheduled data');

    // Create lookup map for real-time updates by stop_id and route_id
    var realtimeByStopAndRoute = {};
    realtimeData.forEach(function(update) {
        var key = update.stopId + '_' + update.routeId;
        if (!realtimeByStopAndRoute[key]) {
            realtimeByStopAndRoute[key] = [];
        }
        realtimeByStopAndRoute[key].push(update);
    });

    // Merge real-time data with scheduled arrivals
    stopsData.forEach(function(stop) {
        if (!stop.scheduledArrivals || stop.scheduledArrivals.length === 0) {
            return;
        }

        stop.scheduledArrivals.forEach(function(arrival) {
            var key = stop.stop_id + '_' + arrival.route;

            // Look for real-time updates for this stop and route
            var realtimeUpdates = realtimeByStopAndRoute[key];
            if (realtimeUpdates && realtimeUpdates.length > 0) {
                // Find the closest real-time update in time
                var scheduledTime = arrival.scheduledTime;
                var closestUpdate = null;
                var minTimeDiff = Infinity;

                realtimeUpdates.forEach(function(update) {
                    var timeDiff = Math.abs(update.arrivalTime.getTime() - scheduledTime.getTime());
                    if (timeDiff < minTimeDiff && timeDiff < 600000) { // Within 10 minutes
                        minTimeDiff = timeDiff;
                        closestUpdate = update;
                    }
                });

                if (closestUpdate) {
                    // Update with real-time information
                    var now = new Date();
                    var realtimeArrival = new Date(closestUpdate.arrivalTime.getTime() + (closestUpdate.delay * 1000));

                    arrival.scheduledTime = realtimeArrival;
                    arrival.timeToArrival = Math.max(0, Math.round((realtimeArrival.getTime() - now.getTime()) / (1000 * 60)));
                    arrival.status = closestUpdate.delay !== 0 ?
                        (closestUpdate.delay > 0 ? 'Retard ' + Math.round(closestUpdate.delay / 60) + ' min' : 'Avanç ' + Math.round(Math.abs(closestUpdate.delay) / 60) + ' min') :
                        'A l\'hora';
                    arrival.isRealtime = true;

                    console.log('🕒 Updated', arrival.route, 'at stop', stop.stop_id, 'with real-time data:', arrival.status);
                }
            }
        });

        // Re-sort by time to arrival after merging real-time data
        stop.scheduledArrivals.sort(function(a, b) {
            return a.timeToArrival - b.timeToArrival;
        });
    });

    console.log('✅ Real-time data merged successfully');
    return stopsData;
}

// Analyze GTFS-RT .bin file structure
function analyzeGTFSBinFile(feedType) {
    console.log('🔍 Analyzing GTFS-RT .bin file structure for:', feedType);

    var proxyUrl = 'https://tempsrealcat.vercel.app/api/proxy?url=';
    var binUrl;

    if (feedType === 'trip_updates') {
        binUrl = proxyUrl + encodeURIComponent('https://www.ambmobilitat.cat/transit/trips-updates/trips.bin');
    } else if (feedType === 'vehicle_positions') {
        binUrl = proxyUrl + encodeURIComponent('https://www.ambmobilitat.cat/transit/vehicle-positions/vehicle-positions.bin');
    } else {
        console.error('❌ Invalid feed type. Use "trip_updates" or "vehicle_positions"');
        return;
    }

    console.log('🔍 Fetching from URL:', binUrl);

    fetch(binUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            return response.arrayBuffer();
        })
        .then(buffer => {
            return analyzeBuffer(buffer, feedType);
        })
        .catch(error => {
            console.error('❌ Error analyzing .bin file:', error);
            console.error('Error details:', error.message);
        });
}

// Analyze the binary buffer and show field structure
function analyzeBuffer(buffer, feedType) {
    return new Promise(function(resolve, reject) {
        // Load protobuf.js dynamically if not available
        if (typeof protobuf === 'undefined') {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/protobufjs@7.2.4/dist/protobuf.min.js';
            script.onload = function() {
                decodeAndAnalyze(buffer, feedType, resolve, reject);
            };
            script.onerror = function() {
                reject(new Error('Failed to load protobuf.js'));
            };
            document.head.appendChild(script);
        } else {
            decodeAndAnalyze(buffer, feedType, resolve, reject);
        }
    });
}

// Decode and analyze the GTFS-RT structure
function decodeAndAnalyze(buffer, feedType, resolve, reject) {
    try {
        console.log('🔍 Decoding GTFS-RT', feedType, 'data...', buffer.byteLength, 'bytes');

        // GTFS-RT FeedMessage schema with both TripUpdate and VehiclePosition
        var root = protobuf.Root.fromJSON({
            nested: {
                transit_realtime: {
                    nested: {
                        FeedMessage: {
                            fields: {
                                header: {
                                    rule: "required",
                                    type: "FeedHeader",
                                    id: 1
                                },
                                entity: {
                                    rule: "repeated",
                                    type: "FeedEntity",
                                    id: 2
                                }
                            }
                        },
                        FeedHeader: {
                            fields: {
                                gtfsRealtimeVersion: {
                                    type: "string",
                                    id: 1
                                },
                                incrementality: {
                                    type: "uint32",
                                    id: 2
                                },
                                timestamp: {
                                    type: "uint64",
                                    id: 3
                                }
                            }
                        },
                        FeedEntity: {
                            fields: {
                                id: {
                                    type: "string",
                                    id: 1
                                },
                                tripUpdate: {
                                    type: "TripUpdate",
                                    id: 3
                                },
                                vehicle: {
                                    type: "VehiclePosition",
                                    id: 2
                                }
                            }
                        },
                        TripUpdate: {
                            fields: {
                                trip: {
                                    rule: "required",
                                    type: "TripDescriptor",
                                    id: 1
                                },
                                stopTimeUpdate: {
                                    rule: "repeated",
                                    type: "StopTimeUpdate",
                                    id: 2
                                },
                                vehicle: {
                                    type: "VehicleDescriptor",
                                    id: 3
                                },
                                timestamp: {
                                    type: "uint64",
                                    id: 4
                                },
                                delay: {
                                    type: "int32",
                                    id: 5
                                }
                            }
                        },
                        VehiclePosition: {
                            fields: {
                                trip: {
                                    type: "TripDescriptor",
                                    id: 1
                                },
                                vehicle: {
                                    type: "VehicleDescriptor",
                                    id: 8
                                },
                                position: {
                                    type: "Position",
                                    id: 2
                                },
                                timestamp: {
                                    type: "uint64",
                                    id: 4
                                },
                                stopId: {
                                    type: "string",
                                    id: 7
                                },
                                currentStopSequence: {
                                    type: "uint32",
                                    id: 3
                                },
                                currentStatus: {
                                    type: "VehicleStopStatus",
                                    id: 6
                                }
                            }
                        },
                        TripDescriptor: {
                            fields: {
                                tripId: {
                                    type: "string",
                                    id: 1
                                },
                                routeId: {
                                    type: "string",
                                    id: 5
                                },
                                directionId: {
                                    type: "uint32",
                                    id: 6
                                },
                                startTime: {
                                    type: "string",
                                    id: 7
                                },
                                startDate: {
                                    type: "string",
                                    id: 8
                                }
                            }
                        },
                        StopTimeUpdate: {
                            fields: {
                                stopSequence: {
                                    type: "uint32",
                                    id: 1
                                },
                                stopId: {
                                    type: "string",
                                    id: 4
                                },
                                arrival: {
                                    type: "StopTimeEvent",
                                    id: 2
                                },
                                departure: {
                                    type: "StopTimeEvent",
                                    id: 3
                                }
                            }
                        },
                        StopTimeEvent: {
                            fields: {
                                time: {
                                    type: "int64",
                                    id: 1
                                },
                                delay: {
                                    type: "int32",
                                    id: 2
                                }
                            }
                        },
                        VehicleDescriptor: {
                            fields: {
                                id: {
                                    type: "string",
                                    id: 1
                                },
                                label: {
                                    type: "string",
                                    id: 2
                                },
                                licensePlate: {
                                    type: "string",
                                    id: 3
                                }
                            }
                        },
                        Position: {
                            fields: {
                                latitude: {
                                    type: "float",
                                    id: 1
                                },
                                longitude: {
                                    type: "float",
                                    id: 2
                                },
                                bearing: {
                                    type: "float",
                                    id: 3
                                },
                                speed: {
                                    type: "float",
                                    id: 4
                                }
                            }
                        },
                        VehicleStopStatus: {
                            values: {
                                INCOMING_AT: 0,
                                STOPPED_AT: 1,
                                IN_TRANSIT_TO: 2
                            }
                        }
                    }
                }
            }
        });

        var FeedMessage = root.lookupType("transit_realtime.FeedMessage");
        var message = FeedMessage.decode(new Uint8Array(buffer));

        console.log('✅ Successfully decoded GTFS-RT', feedType, 'FeedMessage');

        // Analyze the structure
        console.log('📊 === GTFS-RT FEED ANALYSIS ===');
        console.log('Feed Type:', feedType.toUpperCase());
        console.log('File Size:', buffer.byteLength, 'bytes');
        console.log('');

        // Header analysis
        console.log('📋 HEADER:');
        if (message.header) {
            console.log('  - GTFS Realtime Version:', message.header.gtfsRealtimeVersion);
            console.log('  - Incrementality:', message.header.incrementality);
            console.log('  - Timestamp:', message.header.timestamp, '(Unix)', new Date(message.header.timestamp * 1000).toLocaleString());
        }
        console.log('');

        // Entity analysis
        console.log('📋 ENTITIES:');
        console.log('  - Total Entities:', message.entity.length);

        if (message.entity.length > 0) {
            // Analyze first entity structure
            var firstEntity = message.entity[0];
            console.log('  - First Entity ID:', firstEntity.id);

            if (feedType === 'trip_updates' && firstEntity.tripUpdate) {
                console.log('  - Entity Type: TripUpdate');
                analyzeTripUpdate(firstEntity.tripUpdate);
            } else if (feedType === 'vehicle_positions' && firstEntity.vehicle) {
                console.log('  - Entity Type: VehiclePosition');
                analyzeVehiclePosition(firstEntity.vehicle);
            }

            // Analyze a few more entities for patterns
            console.log('');
            console.log('📋 SAMPLE OF', Math.min(5, message.entity.length), 'ENTITIES:');
            message.entity.slice(0, 5).forEach(function(entity, index) {
                console.log('  Entity', index + 1 + ':');
                console.log('    - ID:', entity.id);

                if (feedType === 'trip_updates' && entity.tripUpdate) {
                    console.log('    - Type: TripUpdate');
                    console.log('    - Route ID:', entity.tripUpdate.trip ? entity.tripUpdate.trip.routeId : 'N/A');
                    console.log('    - Trip ID:', entity.tripUpdate.trip ? entity.tripUpdate.trip.tripId : 'N/A');
                    console.log('    - Stop Updates:', entity.tripUpdate.stopTimeUpdate ? entity.tripUpdate.stopTimeUpdate.length : 0);
                } else if (feedType === 'vehicle_positions' && entity.vehicle) {
                    console.log('    - Type: VehiclePosition');
                    console.log('    - Vehicle ID:', entity.vehicle.vehicle ? entity.vehicle.vehicle.id : 'N/A');
                    console.log('    - Route ID:', entity.vehicle.trip ? entity.vehicle.trip.routeId : 'N/A');
                    if (entity.vehicle.position) {
                        console.log('    - Position: [' + entity.vehicle.position.latitude + ', ' + entity.vehicle.position.longitude + ']');
                    }
                }
            });
        }

        console.log('');
        console.log('📊 === ANALYSIS COMPLETE ===');

        resolve(message);

    } catch (error) {
        console.error('❌ Error analyzing GTFS-RT data:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        reject(error);
    }
}

// Analyze TripUpdate structure
function analyzeTripUpdate(tripUpdate) {
    console.log('📋 TRIP UPDATE STRUCTURE:');
    if (tripUpdate.trip) {
        console.log('  - Trip Descriptor:');
        console.log('    - tripId:', tripUpdate.trip.tripId);
        console.log('    - routeId:', tripUpdate.trip.routeId);
        console.log('    - directionId:', tripUpdate.trip.directionId);
        console.log('    - startTime:', tripUpdate.trip.startTime);
        console.log('    - startDate:', tripUpdate.trip.startDate);
    }

    if (tripUpdate.stopTimeUpdate && tripUpdate.stopTimeUpdate.length > 0) {
        console.log('  - Stop Time Updates (' + tripUpdate.stopTimeUpdate.length + '):');
        var firstStop = tripUpdate.stopTimeUpdate[0];
        console.log('    - First Stop:');
        console.log('      - stopSequence:', firstStop.stopSequence);
        console.log('      - stopId:', firstStop.stopId);
        if (firstStop.arrival) {
            console.log('      - arrival.time:', firstStop.arrival.time, '(Unix)', new Date(firstStop.arrival.time * 1000).toLocaleString());
            console.log('      - arrival.delay:', firstStop.arrival.delay, 'seconds');
        }
        if (firstStop.departure) {
            console.log('      - departure.time:', firstStop.departure.time, '(Unix)', new Date(firstStop.departure.time * 1000).toLocaleString());
            console.log('      - departure.delay:', firstStop.departure.delay, 'seconds');
        }
    }

    if (tripUpdate.vehicle) {
        console.log('  - Vehicle Descriptor:');
        console.log('    - id:', tripUpdate.vehicle.id);
        console.log('    - label:', tripUpdate.vehicle.label);
        console.log('    - licensePlate:', tripUpdate.vehicle.licensePlate);
    }

    console.log('  - timestamp:', tripUpdate.timestamp, '(Unix)', new Date(tripUpdate.timestamp * 1000).toLocaleString());
    console.log('  - delay:', tripUpdate.delay, 'seconds');
}

// Analyze VehiclePosition structure
function analyzeVehiclePosition(vehiclePos) {
    console.log('📋 VEHICLE POSITION STRUCTURE:');
    if (vehiclePos.trip) {
        console.log('  - Trip Descriptor:');
        console.log('    - tripId:', vehiclePos.trip.tripId);
        console.log('    - routeId:', vehiclePos.trip.routeId);
        console.log('    - directionId:', vehiclePos.trip.directionId);
        console.log('    - startTime:', vehiclePos.trip.startTime);
        console.log('    - startDate:', vehiclePos.trip.startDate);
    }

    if (vehiclePos.vehicle) {
        console.log('  - Vehicle Descriptor:');
        console.log('    - id:', vehiclePos.vehicle.id);
        console.log('    - label:', vehiclePos.vehicle.label);
        console.log('    - licensePlate:', vehiclePos.vehicle.licensePlate);
    }

    if (vehiclePos.position) {
        console.log('  - Position:');
        console.log('    - latitude:', vehiclePos.position.latitude);
        console.log('    - longitude:', vehiclePos.position.longitude);
        console.log('    - bearing:', vehiclePos.position.bearing);
        console.log('    - speed:', vehiclePos.position.speed);
    }

    console.log('  - timestamp:', vehiclePos.timestamp, '(Unix)', new Date(vehiclePos.timestamp * 1000).toLocaleString());
    console.log('  - stopId:', vehiclePos.stopId);
    console.log('  - currentStopSequence:', vehiclePos.currentStopSequence);
    console.log('  - currentStatus:', vehiclePos.currentStatus, getVehicleStatusName(vehiclePos.currentStatus));
}

// Helper function to get human-readable vehicle status
function getVehicleStatusName(status) {
    switch(status) {
        case 0: return '(INCOMING_AT)';
        case 1: return '(STOPPED_AT)';
        case 2: return '(IN_TRANSIT_TO)';
        default: return '(UNKNOWN)';
    }
}

// Global variables for timetable pagination and sorting
var ambCurrentTimetablePage = 1;
var ambTimetableItemsPerPage = 50;
var ambAllTimetableEntries = [];
var ambCurrentSortColumn = 'timeToArrivalSeconds'; // Default sort by time remaining
var ambCurrentSortDirection = 'asc'; // 'asc' or 'desc'
var ambCurrentSearchTerm = ''; // Current search term for filtering



        // Sort timetable entries by column
function sortTimetableEntries(column, direction) {
    console.log('🔄 Sorting timetable by', column, 'in', direction, 'order');

    ambCurrentSortColumn = column;
    ambCurrentSortDirection = direction;

    ambAllTimetableEntries.sort(function(a, b) {
        var aValue, bValue;

        switch(column) {
            case 'route':
                aValue = a.route.toLowerCase();
                bValue = b.route.toLowerCase();
                break;
            case 'stopId':
                aValue = a.stopId.toLowerCase();
                bValue = b.stopId.toLowerCase();
                break;
            case 'stopName':
                aValue = (a.stopName || '').toLowerCase();
                bValue = (b.stopName || '').toLowerCase();
                break;
            case 'destination':
                aValue = a.destination.toLowerCase();
                bValue = b.destination.toLowerCase();
                break;
            case 'status':
                aValue = a.status.toLowerCase();
                bValue = b.status.toLowerCase();
                break;
            case 'time':
                aValue = a.scheduledTime.getTime();
                bValue = b.scheduledTime.getTime();
                break;
            case 'timeToArrivalSeconds':
            default:
                aValue = a.timeToArrivalSeconds;
                bValue = b.timeToArrivalSeconds;
                break;
        }

        if (direction === 'asc') {
            if (typeof aValue === 'string') {
                return aValue.localeCompare(bValue);
            } else {
                return aValue - bValue;
            }
        } else {
            if (typeof aValue === 'string') {
                return bValue.localeCompare(aValue);
            } else {
                return bValue - aValue;
            }
        }
    });

    // Reset to first page and re-render
    ambCurrentTimetablePage = 1;
    renderTimetablePage();
}

// Update data for a specific stop
function updateStopData(stopId) {
    console.log('🔄 Updating data for specific stop:', stopId);

    // Show loading state for the specific stop
    var updateBtn = document.querySelector('[data-stop-id="' + stopId + '"]');
    if (updateBtn) {
        updateBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
        updateBtn.disabled = true;
    }

    // Fetch fresh data for this stop only
    fetchAllAMBStops().then(function(stops) {
        // Find the specific stop data
        var stopData = stops.find(function(stop) {
            return stop.stop_id === stopId;
        });

        if (stopData) {
            // Update the stop data in our global array
            var existingStopIndex = allAMBStops.findIndex(function(stop) {
                return stop.stop_id === stopId;
            });

            if (existingStopIndex !== -1) {
                allAMBStops[existingStopIndex] = stopData;
            }

            // Update markers on map if they exist
            if (ambBusStopsMarkers && ambBusStopsMarkers.length > 0) {
                ambBusStopsMarkers.forEach(function(marker) {
                    if (marker && marker.getPopup()) {
                        var popup = marker.getPopup();
                        var content = popup.getContent();

                        if (content && typeof content === 'string') {
                            var stopIdMatch = content.match(/Parada AMB ([^\s<]+)/);

                            if (stopIdMatch && stopIdMatch[1] === stopId) {
                                // Update this marker's popup with fresh data
                                marker.setPopupContent(generateStopPopupContent(stopData));
                            }
                        }
                    }
                });
            }

            // Update timetable entries for this stop
            updateTimetableForStop(stopId, stopData);

            console.log('✅ Successfully updated data for stop:', stopId);
        } else {
            console.warn('⚠️ Stop data not found for:', stopId);
        }
    }).catch(function(error) {
        console.error('❌ Error updating stop data:', error);
    }).finally(function() {
        // Reset button state
        if (updateBtn) {
            updateBtn.innerHTML = '<i class="fa fa-refresh"></i>';
            updateBtn.disabled = false;
        }
    });
}

// Update timetable entries for a specific stop
function updateTimetableForStop(stopId, stopData) {
    // Remove existing entries for this stop
    ambAllTimetableEntries = ambAllTimetableEntries.filter(function(entry) {
        return entry.stopId !== stopId;
    });

    // Add new entries for this stop
    if (stopData.scheduledArrivals && stopData.scheduledArrivals.length > 0) {
        stopData.scheduledArrivals.forEach(function(arrival) {
            ambAllTimetableEntries.push({
                route: arrival.route,
                routeLongName: arrival.route_long_name || '',
                destination: arrival.destination || '',
                scheduledTime: arrival.scheduledTime,
                timeStr: arrival.scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
                timeToArrival: arrival.timeToArrival,
                timeToArrivalSeconds: Math.max(0, Math.round((arrival.scheduledTime.getTime() - new Date().getTime()) / 1000)),
                timeToArrivalFormatted: formatTimeRemaining(Math.max(0, Math.round((arrival.scheduledTime.getTime() - new Date().getTime()) / 1000))),
                stopId: stopId,
                tripId: arrival.tripId || '',
                status: arrival.status || 'Horari',
                isRealtime: arrival.isRealtime || false
            });
        });
    }

    // Re-sort and re-render
    sortTimetableEntries(ambCurrentSortColumn, ambCurrentSortDirection);
}

// Generate popup content for a stop
function generateStopPopupContent(stop) {
    var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
        '<h4 style="margin: 0 0 8px 0; color: #0088cc; border-bottom: 2px solid #0088cc; padding-bottom: 4px;">' +
        '🚏 Parada AMB ' + stop.stop_id + '</h4>' +
        '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
        '<strong>Nom:</strong> ' + (stop.stop_name || 'Sense nom') + '<br>' +
        '<strong>Codi:</strong> ' + stop.stop_id + '<br>' +
        '<strong>Posició:</strong> ' + stop.stop_lat.toFixed(4) + ', ' + stop.stop_lon.toFixed(4) +
        '</div>';

    // Add update button
    popupContent += '<div style="text-align: center; margin: 8px 0;">' +
        '<button onclick="updateStopData(\'' + stop.stop_id + '\')" data-stop-id="' + stop.stop_id + '" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 11px;">' +
        '<i class="fa fa-refresh"></i> Actualitzar parada</button>' +
        '</div>';

    // Add scheduled arrivals section with timetable view
    if (stop.scheduledArrivals && stop.scheduledArrivals.length > 0) {
        // Group arrivals by route for better organization
        var arrivalsByRoute = {};
        stop.scheduledArrivals.forEach(function(arrival) {
            if (!arrivalsByRoute[arrival.route]) {
                arrivalsByRoute[arrival.route] = [];
            }
            arrivalsByRoute[arrival.route].push(arrival);
        });

        popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
            '<h5 style="margin: 0 0 8px 0; color: #0066cc;">🕒 Horaris d\'autobusos</h5>' +
            '<div style="max-height: 200px; overflow-y: auto;">';

        // Show arrivals grouped by route
        Object.keys(arrivalsByRoute).sort().forEach(function(routeId) {
            var routeArrivals = arrivalsByRoute[routeId];
            var firstArrival = routeArrivals[0];

            popupContent += '<div style="margin-bottom: 8px; padding: 8px; background: #fff; border-radius: 4px; border: 1px solid #eee;">' +
                '<div style="font-weight: bold; color: #0088cc; margin-bottom: 6px;">Línia ' + routeId;
            if (firstArrival.route_long_name) {
                popupContent += ' - ' + firstArrival.route_long_name;
            }
            popupContent += '</div>';

                            // Show up to 5 times per route
                            routeArrivals.slice(0, 5).forEach(function(arrival, index) {
                                var scheduledTime = arrival.scheduledTime;
                                var scheduledTimeStr = scheduledTime ? scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '--:--';
                                var arrivalId = 'popup-arrival-' + stop.stop_id + '-' + index;

                                popupContent += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding: 4px; background: #f9f9f9; border-radius: 3px;">' +
                                    '<div style="font-size: 12px; color: #666;">' + scheduledTimeStr;
                                if (arrival.destination) {
                                    popupContent += ' ➜ ' + arrival.destination;
                                }
                                popupContent += '</div>' +
                                    '<div style="font-weight: bold; font-family: monospace; font-size: 11px;">' +
                                    '<span id="' + arrivalId + '">Calculating...</span></div>' +
                                    '</div>';

                                // Start live countdown for this popup arrival
                                startAMBArrivalCountdown(arrivalId, scheduledTime);
                            });

            // Show remaining count if more than 5
            if (routeArrivals.length > 5) {
                popupContent += '<div style="font-size: 11px; color: #666; text-align: center; padding: 4px; font-style: italic;">+' + (routeArrivals.length - 5) + ' més sortides avui</div>';
            }

            popupContent += '</div>';
        });

        popupContent += '</div>' +
            '<div style="font-size: 10px; color: #666; margin-top: 6px; text-align: center;">Horaris basats en dades GTFS d\'AMB</div>' +
            '<div style="text-align: center; margin-top: 8px;">' +
            '<button onclick="showAMBFullTimetable(\'' + stop.stop_id + '\')" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 11px;">📋 Veure horari complet</button>' +
            '</div>' +
            '</div>';
    } else {
        popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
            '<em>No hi ha horaris disponibles per aquesta parada</em>' +
            '</div>';
    }

    popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
        '🚌 Àrea Metropolitana de Barcelona' +
        '</div>' +
        '</div>';

    return popupContent;
}

// Global variables for live countdown
var countdownInterval = null;
var lastCountdownUpdate = 0;

// Store countdown intervals by stop ID (like TMB system)
if (!window.ambCountdownIntervals) {
    window.ambCountdownIntervals = {};
}

// Clear all AMB countdown intervals (called before re-rendering)
function clearAMBCountdownIntervals() {
    console.log('🧹 Clearing all AMB countdown intervals');

    if (window.ambCountdownIntervals) {
        var totalCleared = 0;

        // Clear intervals for each stop
        Object.keys(window.ambCountdownIntervals).forEach(function(stopId) {
            var intervals = window.ambCountdownIntervals[stopId];
            if (intervals && Array.isArray(intervals)) {
                intervals.forEach(function(intervalId) {
                    if (intervalId) {
                        clearInterval(intervalId);
                        totalCleared++;
                    }
                });
            }
            // Reset the array
            window.ambCountdownIntervals[stopId] = [];
        });

        console.log('🧹 Cleared', totalCleared, 'AMB countdown intervals');
    }
}

// Get countdown string for AMB bus arrival (similar to TMB)
function getAMBCountdownString(scheduledTime) {
    if (!scheduledTime) {
        return '--:--:--';
    }

    var now = new Date().getTime();
    var arrivalMs = scheduledTime.getTime();
    var diffMs = arrivalMs - now;

    if (diffMs <= 0) {
        return 'Sortint';
    }

    // Convert to seconds, minutes, hours
    var totalSeconds = Math.floor(diffMs / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    // Format for better user experience
    if (hours > 0) {
        // Show hours and minutes for longer waits
        return hours + ' h ' + minutes + ' min';
    } else if (minutes > 0) {
        // Show minutes and seconds for shorter waits
        return minutes + ' min ' + seconds + ' s';
    } else {
        // Show just seconds for very short waits
        return seconds + ' s';
    }
}

// Start live countdown update for a specific AMB arrival (similar to TMB)
function startAMBArrivalCountdown(elementId, scheduledTime) {
    if (!scheduledTime) {
        console.warn('⚠️ startAMBArrivalCountdown called without scheduledTime for element:', elementId);
        return;
    }

    function updateCountdown() {
        var element = document.getElementById(elementId);
        if (!element) {
            // Element not found - stop this countdown
            return;
        }

        var now = new Date();
        var diffMs = scheduledTime.getTime() - now.getTime();
        var totalSeconds = Math.floor(diffMs / 1000);
        var countdownStr = formatTimeRemaining(totalSeconds);

        // Color coding based on urgency
        var diffMinutes = diffMs / (1000 * 60);

        var color = '#0066cc'; // Default blue
        if (diffMs <= 0) {
            color = '#888'; // Gray for arrived/overdue
        } else if (diffMinutes <= 2) {
            color = '#d63031'; // Red for very soon
        } else if (diffMinutes <= 5) {
            color = '#e17055'; // Orange for soon
        }

        // Update the DOM element
        element.textContent = countdownStr;
        element.style.color = color;
        element.style.fontWeight = 'bold';
        element.style.fontFamily = 'monospace';
        element.style.fontSize = '12px';
    }

    // Update immediately
    updateCountdown();

    // Set up interval for live updates
    var intervalId = setInterval(updateCountdown, 1000); // Update every second

    // Extract stop ID from element ID (format: 'popup-arrival-STOPID-INDEX' or 'table-arrival-STOPID-INDEX')
    var stopId = null;
    var idParts = elementId.split('-');
    if (idParts.length >= 4 && idParts[0] === 'popup' || idParts[0] === 'table') {
        stopId = idParts[2]; // The stop ID is in position 2
    }

    // Store the interval ID organized by stop ID
    if (!window.ambCountdownIntervals) {
        window.ambCountdownIntervals = {};
    }
    if (stopId) {
        if (!window.ambCountdownIntervals[stopId]) {
            window.ambCountdownIntervals[stopId] = [];
        }
        window.ambCountdownIntervals[stopId].push(intervalId);
        console.log('⏰ Stored countdown interval for stop:', stopId, 'total intervals:', window.ambCountdownIntervals[stopId].length);
    } else {
        // Fallback for elements without proper stop ID
        if (!window.ambCountdownIntervals['unknown']) {
            window.ambCountdownIntervals['unknown'] = [];
        }
        window.ambCountdownIntervals['unknown'].push(intervalId);
        console.log('⏰ Stored countdown interval in unknown category');
    }
}

// Format time remaining as HH:MM:SS
function formatTimeRemaining(seconds) {
    if (seconds <= 0) return 'Sortint';

    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;

    return hours.toString().padStart(2, '0') + ':' +
           minutes.toString().padStart(2, '0') + ':' +
           secs.toString().padStart(2, '0');
}

// Update live countdown for timetable
function updateLiveCountdown() {
    // Update all countdown elements in the timetable
    var now = new Date();
    console.log('⏰ Updating live countdowns at', now.toLocaleTimeString());

    // Since each countdown has its own interval, this function can be used for additional updates
    // For now, it ensures the timetable is refreshed if needed
    if (document.getElementById('amb-standalone-timetable') && 
        document.getElementById('amb-standalone-timetable').style.display !== 'none') {
        // Optional: Re-render timetable if needed for consistency
        // renderTimetablePage(); // Commented out to avoid excessive re-rendering
    }
}

// Start live countdown timer
function startLiveCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    console.log('⏰ Starting live countdown timer');

    // Update immediately
    updateLiveCountdown();

    // Then update every second
    countdownInterval = setInterval(updateLiveCountdown, 1000); // Update every second
}

// Stop live countdown timer
function stopLiveCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        console.log('⏰ Stopped live countdown timer');
    }
}

// Show standalone timetable for all AMB stops
function showAMBStandaloneTimetable() {
    console.log('📋 Showing standalone AMB timetable');

    // Show the timetable section
    var timetableSection = document.getElementById('amb-standalone-timetable');
    var timetableContent = document.getElementById('amb-standalone-content');

    if (!timetableSection || !timetableContent) {
        console.error('❌ Standalone timetable elements not found');
        return;
    }

    // Reset pagination
    ambCurrentTimetablePage = 1;
    ambAllTimetableEntries = [];

    // Generate comprehensive timetable data
    if (window.gtfsData && window.gtfsData.routes && window.gtfsData.stopTimes && window.gtfsData.trips && window.gtfsData.calendar) {
        var routes = window.gtfsData.routes;
        var stopTimes = window.gtfsData.stopTimes;
        var trips = window.gtfsData.trips;
        var now = new Date();
        var currentDay = now.getDay();
        var currentDate = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

        console.log('📋 Generating timetable for', routes.length, 'routes');

        // Create lookup maps
        var tripsMap = window.gtfsData.tripsMap || {};
        var routesMap = window.gtfsData.routesMap || {};

        // Generate all timetable entries
        routes.forEach(function(route) {
            var routeName = route.route_short_name || route.route_id;

            // Find all trips for this route
            var routeTrips = trips.filter(function(trip) {
                return trip.route_id === route.route_id;
            });

            // Find all stop times for these trips
            var routeStopTimes = [];
            routeTrips.forEach(function(trip) {
                var tripStopTimes = stopTimes.filter(function(st) {
                    return st.trip_id === trip.trip_id;
                });
                routeStopTimes = routeStopTimes.concat(tripStopTimes);
            });

            // Process each stop time
            routeStopTimes.forEach(function(stopTime) {
                // Check if service runs today
                var trip = tripsMap[stopTime.trip_id];
                if (!trip) return;

                if (!isServiceRunningToday(trip.service_id, currentDay, currentDate, window.gtfsData.calendarMap, window.gtfsData.calendarDatesMap)) {
                    return;
                }

                var arrivalTime = parseGTFSTime(stopTime.arrival_time);
                if (!arrivalTime) return;

                // Create scheduled arrival time for today
                var scheduledTime = new Date(now);
                scheduledTime.setHours(arrivalTime.hours, arrivalTime.minutes, arrivalTime.seconds, 0);

                // If the scheduled time has already passed, skip it
                if (scheduledTime.getTime() < now.getTime()) {
                    return;
                }

                var timeToArrival = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / (1000 * 60)));

                // Only include arrivals within the next 2 hours
                if (timeToArrival <= 120) {
                    // Create unique key to avoid duplicates
                    var entryKey = routeName + '_' + stopTime.stop_id + '_' + scheduledTime.getTime() + '_' + (trip.trip_headsign || '');

                    // Check if this entry already exists
                    var isDuplicate = ambAllTimetableEntries.some(function(existing) {
                        return existing.route === routeName &&
                               existing.stopId === stopTime.stop_id &&
                               existing.scheduledTime.getTime() === scheduledTime.getTime() &&
                               existing.destination === (trip.trip_headsign || '');
                    });

                    // Only add if not a duplicate
                    if (!isDuplicate) {
                        // Get stop name
                        var stopName = 'Sense nom';
                        if (window.allAMBStopsMap && window.allAMBStopsMap[stopTime.stop_id]) {
                            stopName = window.allAMBStopsMap[stopTime.stop_id].stop_name || 'Sense nom';
                        } else if (window.gtfsData && window.gtfsData.stops) {
                            var gtfsStop = window.gtfsData.stops.find(function(stop) {
                                return stop.stop_id === stopTime.stop_id;
                            });
                            if (gtfsStop) {
                                stopName = gtfsStop.stop_name || 'Sense nom';
                            }
                        }

                        ambAllTimetableEntries.push({
                            route: routeName,
                            routeLongName: route.route_long_name || '',
                            destination: trip.trip_headsign || '',
                            scheduledTime: scheduledTime,
                            timeStr: scheduledTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + (scheduledTime.getDate() !== now.getDate() ? ' (demà)' : ''),
                            timeToArrival: timeToArrival,
                            stopId: stopTime.stop_id,
                            stopName: stopName,
                            tripId: stopTime.trip_id,
                            status: 'Horari',
                            isRealtime: false
                        });
                    }
                }
            });

            // If this route has no stop times with schedules today, add a placeholder entry
            if (routeStopTimes.length === 0 || !routeStopTimes.some(function(stopTime) {
                var trip = tripsMap[stopTime.trip_id];
                if (!trip) return false;
                return isServiceRunningToday(trip.service_id, currentDay, currentDate, window.gtfsData.calendarMap, window.gtfsData.calendarDatesMap);
            })) {
                // Check if we already have an entry for this route
                var hasRouteEntry = ambAllTimetableEntries.some(function(entry) {
                    return entry.route === routeName;
                });

                if (!hasRouteEntry) {
                    // Add a placeholder entry for routes without current schedules
                    ambAllTimetableEntries.push({
                        route: routeName,
                        routeLongName: route.route_long_name || '',
                        destination: 'Sense horaris disponibles',
                        scheduledTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
                        timeStr: '--:--',
                        timeToArrival: 1440, // 24 hours from now
                        stopId: 'N/A',
                        stopName: 'N/A',
                        tripId: 'N/A',
                        status: 'Sense servei',
                        isRealtime: false
                    });
                }
            }
        });

        // Sort all entries by time to arrival
        ambAllTimetableEntries.sort(function(a, b) {
            return a.timeToArrival - b.timeToArrival;
        });

        console.log('📋 Generated', ambAllTimetableEntries.length, 'timetable entries');
    }

    // Render the paginated table
    renderTimetablePage();
    timetableSection.style.display = 'block';

    // Scroll to timetable section
    timetableSection.scrollIntoView({behavior: 'smooth', block: 'start'});
}

// Render timetable page with pagination
function renderTimetablePage() {
    var timetableContent = document.getElementById('amb-standalone-content');
    if (!timetableContent) return;

    // Clear existing countdown intervals before re-rendering
    clearAMBCountdownIntervals();

    var html = '<div style="margin-bottom: 15px;">' +
        '<p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">Horari complet de totes les línies d\'autobús AMB amb els seus horaris programats.</p>' +
        '<div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">' +
        '<div style="display: flex; align-items: center; gap: 10px;">' +
        '<div>' +
        '<label for="items-per-page" style="margin-right: 10px;">Elements per pàgina:</label>' +
        '<select id="items-per-page" onchange="changeItemsPerPage(this.value)" style="padding: 4px; border: 1px solid #ddd; border-radius: 3px;">' +
        '<option value="10"' + (ambTimetableItemsPerPage === 10 ? ' selected' : '') + '>10</option>' +
        '<option value="25"' + (ambTimetableItemsPerPage === 25 ? ' selected' : '') + '>25</option>' +
        '<option value="50"' + (ambTimetableItemsPerPage === 50 ? ' selected' : '') + '>50</option>' +
        '<option value="100"' + (ambTimetableItemsPerPage === 100 ? ' selected' : '') + '>100</option>' +
        '<option value="200"' + (ambTimetableItemsPerPage === 200 ? ' selected' : '') + '>200</option>' +
        '</select>' +
        '</div>' +
        '<div style="position: relative;">' +
        '<input type="text" id="timetable-search" placeholder="🔍 Cercar línia, destí o parada..." value="' + (ambCurrentSearchTerm || '') + '" oninput="filterTimetableEntries(this.value)" style="padding: 6px 32px 6px 12px; border: 1px solid #ddd; border-radius: 4px; width: 250px; font-size: 12px;" />' +
        '<i class="fa fa-search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #666; font-size: 12px;"></i>' +
        '<button onclick="clearTimetableSearch()" style="position: absolute; right: 30px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #999; cursor: pointer; font-size: 14px; padding: 0; display: ' + (ambCurrentSearchTerm ? 'block' : 'none') + ';" title="Netejar cerca">×</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

    // Apply search filter if search term is provided
    var filteredEntries = ambAllTimetableEntries;
    if (ambCurrentSearchTerm) {
        filteredEntries = ambAllTimetableEntries.filter(function(entry) {
            return entry.route.toLowerCase().includes(ambCurrentSearchTerm) ||
                   entry.destination.toLowerCase().includes(ambCurrentSearchTerm) ||
                   entry.stopId.toLowerCase().includes(ambCurrentSearchTerm) ||
                   (entry.routeLongName && entry.routeLongName.toLowerCase().includes(ambCurrentSearchTerm));
        });
    }

    if (filteredEntries.length === 0) {
        var noResultsMessage = ambCurrentSearchTerm ?
            '<p>No s\'han trobat resultats per a la cerca: "' + ambCurrentSearchTerm + '"</p>' +
            '<p style="font-size: 12px;"><a href="#" onclick="clearTimetableSearch(); return false;">Netejar cerca</a> per veure tots els resultats</p>' :
            '<p>No s\'han trobat horaris programats.</p>' +
            '<p style="font-size: 12px;">És possible que no hi hagi servei actiu o que les dades no estiguin disponibles.</p>';

        html += '<div style="text-align: center; padding: 40px; color: #666;">' +
            '<i class="fa fa-info-circle" style="font-size: 24px; margin-bottom: 10px;"></i>' +
            noResultsMessage +
            '</div>';
    } else {
        // Calculate pagination based on filtered results
        var totalPages = Math.ceil(filteredEntries.length / ambTimetableItemsPerPage);
        var startIndex = (ambCurrentTimetablePage - 1) * ambTimetableItemsPerPage;
        var endIndex = Math.min(startIndex + ambTimetableItemsPerPage, filteredEntries.length);
        var pageEntries = filteredEntries.slice(startIndex, endIndex);

        // Table header with clickable sorting
        html += '<div style="overflow-x: auto;">' +
            '<table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #dee2e6; font-size: 10px;">' +
            '<thead>' +
            '<tr style="background: #f8f9fa;">' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'route\', \'' + (ambCurrentSortColumn === 'route' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per línia">Línia ' +
            (ambCurrentSortColumn === 'route' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'stopId\', \'' + (ambCurrentSortColumn === 'stopId' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per codi de parada">Parada ' +
            (ambCurrentSortColumn === 'stopId' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'stopName\', \'' + (ambCurrentSortColumn === 'stopName' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per nom de parada">Nom parada ' +
            (ambCurrentSortColumn === 'stopName' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'destination\', \'' + (ambCurrentSortColumn === 'destination' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per destí">Destí ' +
            (ambCurrentSortColumn === 'destination' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'time\', \'' + (ambCurrentSortColumn === 'time' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per hora de sortida">Sortida ' +
            (ambCurrentSortColumn === 'time' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'timeToArrivalSeconds\', \'' + (ambCurrentSortColumn === 'timeToArrivalSeconds' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per temps restant">Temps restant ' +
            (ambCurrentSortColumn === 'timeToArrivalSeconds' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-weight: bold; color: #495057; cursor: pointer; user-select: none;" onclick="sortTimetableEntries(\'status\', \'' + (ambCurrentSortColumn === 'status' && ambCurrentSortDirection === 'asc' ? 'desc' : 'asc') + '\')" title="Ordenar per estat">Estat ' +
            (ambCurrentSortColumn === 'status' ? (ambCurrentSortDirection === 'asc' ? '↑' : '↓') : '') + '</th>' +
            '<th style="padding: 8px; border: 1px solid #dee2e6; text-align: center; font-weight: bold; color: #495057;">Accions</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody>';

        // Table rows
        pageEntries.forEach(function(entry, index) {
            var rowStyle = index % 2 === 0 ? 'background: #f8f9fa;' : 'background: white;';
            var hoverStyle = 'cursor: pointer; transition: background-color 0.2s;';
            var timeColor = entry.timeToArrival <= 5 ? '#dc3545' : entry.timeToArrival <= 15 ? '#fd7e14' : '#0066cc';
            var arrivalId = 'table-arrival-' + entry.stopId + '-' + index;

            // Get stop name from global stops data - check both maps and original data
            var stopName = 'Sense nom';

            // First try the lookup map
            if (window.allAMBStopsMap && window.allAMBStopsMap[entry.stopId]) {
                stopName = window.allAMBStopsMap[entry.stopId].stop_name || 'Sense nom';
            }

            // If not found, try the original GTFS stops data
            if (stopName === 'Sense nom' && window.gtfsData && window.gtfsData.stops) {
                var gtfsStop = window.gtfsData.stops.find(function(stop) {
                    return stop.stop_id === entry.stopId;
                });
                if (gtfsStop) {
                    stopName = gtfsStop.stop_name || 'Sense nom';
                }
            }

            html += '<tr style="' + rowStyle + hoverStyle + '" onclick="zoomToStop(\'' + entry.stopId + '\')" onmouseover="this.style.backgroundColor=\'#e3f2fd\'" onmouseout="this.style.backgroundColor=\'' + (index % 2 === 0 ? '#f8f9fa' : 'white') + '\'">' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; color: #0088cc;">' + entry.route + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; color: #666;">' + entry.stopId + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; color: #666;">' + stopName + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; color: #666;">' + entry.destination + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; font-family: monospace; font-weight: bold;">' + entry.timeStr + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; font-family: monospace; font-weight: bold;">' +
                '<span id="' + arrivalId + '">Loading...</span></td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; color: #666;">' + entry.status + '</td>' +
                '<td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">' +
                '<button onclick="event.stopPropagation(); updateStopData(\'' + entry.stopId + '\')" data-stop-id="' + entry.stopId + '" style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;" title="Actualitzar dades d\'aquesta parada">' +
                '<i class="fa fa-refresh"></i> Actualitzar</button>' +
                '</td>' +
                '</tr>';

            // Store countdown data for later initialization
            if (!window.pendingCountdowns) {
                window.pendingCountdowns = [];
            }
            window.pendingCountdowns.push({
                elementId: arrivalId,
                scheduledTime: entry.scheduledTime
            });
        });

        html += '</tbody></table></div>';

        // Pagination controls
        var totalResults = ambCurrentSearchTerm ? filteredEntries.length : ambAllTimetableEntries.length;
        var totalLabel = ambCurrentSearchTerm ?
            'Mostrant ' + (startIndex + 1) + ' a ' + endIndex + ' de ' + filteredEntries.length + ' resultats (filtrats per "' + ambCurrentSearchTerm + '")' :
            'Mostrant ' + (startIndex + 1) + ' a ' + endIndex + ' de ' + ambAllTimetableEntries.length + ' resultats';

        html += '<div style="margin-top: 20px; display: flex; justify-content: between; align-items: center;">' +
            '<div style="color: #666; font-size: 14px;">' + totalLabel + '</div>' +
            '<div style="display: flex; gap: 5px;">';

        // Previous button
        if (ambCurrentTimetablePage > 1) {
            html += '<button onclick="changeTimetablePage(' + (ambCurrentTimetablePage - 1) + ')" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; cursor: pointer; border-radius: 3px;">« Anterior</button>';
        }

        // Page numbers
        var startPage = Math.max(1, ambCurrentTimetablePage - 2);
        var endPage = Math.min(totalPages, ambCurrentTimetablePage + 2);

        if (startPage > 1) {
            html += '<button onclick="changeTimetablePage(1)" style="padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">1</button>';
            if (startPage > 2) {
                html += '<span style="padding: 8px 4px; color: #666;">...</span>';
            }
        }

        for (var i = startPage; i <= endPage; i++) {
            var buttonStyle = i === ambCurrentTimetablePage ?
                'padding: 8px 12px; border: 1px solid #007bff; background: #007bff; color: white; cursor: pointer; border-radius: 3px;' :
                'padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;';
            html += '<button onclick="changeTimetablePage(' + i + ')" style="' + buttonStyle + '">' + i + '</button>';
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += '<span style="padding: 8px 4px; color: #666;">...</span>';
            }
            html += '<button onclick="changeTimetablePage(' + totalPages + ')" style="padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">' + totalPages + '</button>';
        }

        // Next button
        if (ambCurrentTimetablePage < totalPages) {
            html += '<button onclick="changeTimetablePage(' + (ambCurrentTimetablePage + 1) + ')" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; cursor: pointer; border-radius: 3px;">Següent »</button>';
        }

        html += '</div></div>';
    }

    var now = new Date();
    html += '<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #dee2e6; font-size: 12px; color: #666; text-align: center;">' +
        'Horaris basats en dades GTFS de l\'AMB - ' + now.toLocaleDateString('ca-ES') + ' - Colors: <span style="color: #dc3545;">pròxim</span> | <span style="color: #fd7e14;">proper</span> | <span style="color: #0066cc;">normal</span>' +
        '</div>';

    timetableContent.innerHTML = html;

    // Start all pending countdown timers after DOM is updated with a longer delay
    setTimeout(startPendingCountdowns, 500);
}

// Start all pending countdown timers
function startPendingCountdowns() {
    if (window.pendingCountdowns && window.pendingCountdowns.length > 0) {
        console.log('⏰ Starting', window.pendingCountdowns.length, 'pending countdown timers');

        window.pendingCountdowns.forEach(function(countdownData) {
            startAMBArrivalCountdown(countdownData.elementId, countdownData.scheduledTime);
        });

        // Clear pending countdowns
        window.pendingCountdowns = [];
    }
}

// Change timetable page
function changeTimetablePage(page) {
    ambCurrentTimetablePage = page;
    renderTimetablePage();
}

// Filter timetable entries based on search term
function filterTimetableEntries(searchTerm) {
    ambCurrentSearchTerm = (searchTerm || '').trim().toLowerCase();
    console.log('🔍 Filtering timetable by:', ambCurrentSearchTerm);

    // Reset to first page when searching
    ambCurrentTimetablePage = 1;

    // Re-render with the new search term, but preserve input focus
    var activeElement = document.activeElement;
    var isSearchInput = activeElement && activeElement.id === 'timetable-search';

    renderTimetablePage();

    // Restore focus to search input if it was active
    if (isSearchInput) {
        setTimeout(function() {
            var searchInput = document.getElementById('timetable-search');
            if (searchInput) {
                searchInput.focus();
                // Restore cursor position
                searchInput.setSelectionRange(searchTerm.length, searchTerm.length);
            }
        }, 10);
    }
}

// Clear search input
function clearTimetableSearch() {
    ambCurrentSearchTerm = '';
    var searchInput = document.getElementById('timetable-search');
    if (searchInput) {
        searchInput.value = '';
    }
    console.log('🧹 Cleared timetable search');
    renderTimetablePage();
}

// Change items per page
function changeItemsPerPage(itemsPerPage) {
    ambTimetableItemsPerPage = parseInt(itemsPerPage);
    ambCurrentTimetablePage = 1; // Reset to first page
    renderTimetablePage();
}

// Hide standalone timetable
function hideAMBStandaloneTimetable() {
    var timetableSection = document.getElementById('amb-standalone-timetable');
    if (timetableSection) {
        timetableSection.style.display = 'none';
    }
}

// Create reusable timetable component
function createAMBReusableTimetable(containerId, options) {
    options = options || {};
    var container = document.getElementById(containerId);

    if (!container) {
        console.error('❌ Container element not found:', containerId);
        return null;
    }

    // Generate timetable HTML
    var timetableHtml = '<div class="amb-timetable-container" style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 15px;">' +
        '<h4 style="margin: 0 0 15px 0; color: #0088cc;"><i class="fa fa-bus"></i> Horaris Autobús AMB</h4>' +
        '<div id="amb-reusable-timetable-content">Carregant horaris...</div>' +
        '</div>';

    container.innerHTML = timetableHtml;

    // Load and display timetable
    if (options.autoLoad !== false) {
        setTimeout(function() {
            loadReusableTimetable(containerId, options);
        }, 100);
    }

    return {
        load: function() { loadReusableTimetable(containerId, options); },
        clear: function() { document.getElementById('amb-reusable-timetable-content').innerHTML = ''; }
    };
}

function loadReusableTimetable(containerId, options) {
    var contentDiv = document.getElementById('amb-reusable-timetable-content');
    if (!contentDiv) return;

    options = options || {};

    // Check if GTFS data is available
    if (!window.gtfsData) {
        contentDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">' +
            '<i class="fa fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>' +
            '<p>Carregant dades GTFS...</p>' +
            '</div>';
        return;
    }

    // Generate timetable based on options
    var html = '';
    var now = new Date();

    if (options.routeFilter) {
        // Show specific route timetable
        html = generateRouteTimetable(options.routeFilter);
    } else if (options.stopFilter) {
        // Show specific stop timetable
        html = generateStopTimetable(options.stopFilter);
    } else {
        // Show general timetable overview
        html = generateGeneralTimetable(options);
    }

    html += '<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #dee2e6; font-size: 11px; color: #666; text-align: center;">' +
        'Dades actualitzades: ' + now.toLocaleString('ca-ES') +
        '</div>';

    contentDiv.innerHTML = html;
}

function generateRouteTimetable(routeId) {
    // Generate detailed timetable for a specific route
    var html = '<div style="background: white; padding: 15px; border-radius: 4px; margin-bottom: 10px;">' +
        '<h5>Línia ' + routeId + ' - Horari complet</h5>' +
        '<div id="route-timetable-' + routeId + '">Horari detallat de la línia...</div>' +
        '</div>';
    return html;
}

function generateStopTimetable(stopId) {
    // Generate timetable for a specific stop
    return showAMBFullTimetable(stopId);
}

function generateGeneralTimetable(options) {
    // Generate overview of all routes
    var html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">';

    if (window.gtfsData && window.gtfsData.routes) {
        var routes = window.gtfsData.routes.slice(0, options.maxRoutes || 12); // Limit for performance

        routes.forEach(function(route) {
            var routeName = route.route_short_name || route.route_id;
            html += '<div style="background: white; padding: 10px; border-radius: 4px; border: 1px solid #dee2e6; cursor: pointer;" ' +
                'onclick="createAMBReusableTimetable(\'amb-reusable-timetable-content\', {routeFilter: \'' + route.route_id + '\'})">' +
                '<div style="font-weight: bold; color: #0088cc; margin-bottom: 5px;">Línia ' + routeName + '</div>' +
                '<div style="font-size: 12px; color: #666;">' + (route.route_long_name || 'Sense descripció') + '</div>' +
                '</div>';
        });
    }

    html += '</div>';
    return html;
}

// Zoom to a specific bus stop on the map
function zoomToStop(stopId) {
    console.log('🔍 Zooming to bus stop:', stopId);

    // Debug: Check what's available
    console.log('🔍 Available stops in allAMBStops:', allAMBStops ? allAMBStops.length : 0);
    console.log('🔍 Available stops in lookup map:', window.allAMBStopsMap ? Object.keys(window.allAMBStopsMap).length : 0);
    console.log('🔍 Stop exists in lookup map:', window.allAMBStopsMap && window.allAMBStopsMap[stopId] ? 'YES' : 'NO');

    // Find the marker for this stop
    var targetMarker = null;
    ambBusStopsMarkers.forEach(function(marker) {
        // Get the stop data from the marker's popup content
        var popupContent = marker.getPopup();
        if (popupContent) {
            var content = popupContent.getContent();
            // Check if this marker's popup contains the stop ID
            if (content && content.includes('Parada AMB ' + stopId)) {
                targetMarker = marker;
            }
        }
    });

    if (targetMarker) {
        // Zoom to the marker
        var latlng = targetMarker.getLatLng();
        map.setView(latlng, 18, {animate: true}); // Zoom level 18 for close-up view

        // Open the popup
        targetMarker.openPopup();

        console.log('✅ Zoomed to stop', stopId, 'at coordinates:', latlng);
    } else {
        console.warn('⚠️ Could not find marker for stop:', stopId);
        // If marker not found, try to find stop data and create a temporary marker
        if (allAMBStops) {
            var stopData = allAMBStops.find(function(stop) {
                return stop.stop_id === stopId;
            });

            if (stopData) {
                var latlng = [stopData.stop_lat, stopData.stop_lon];
                map.setView(latlng, 18, {animate: true});

                // Create a temporary popup
                var tempPopup = L.popup()
                    .setLatLng(latlng)
                    .setContent('<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                        '<h4 style="margin: 0 0 8px 0; color: #0088cc;">🚏 Parada AMB ' + stopId + '</h4>' +
                        '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                        '<strong>Nom:</strong> ' + (stopData.stop_name || 'Sense nom') + '<br>' +
                        '<strong>Codi:</strong> ' + stopId + '<br>' +
                        '<strong>Posició:</strong> ' + stopData.stop_lat.toFixed(4) + ', ' + stopData.stop_lon.toFixed(4) +
                        '</div>' +
                        '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                        '🚌 Àrea Metropolitana de Barcelona' +
                        '</div>' +
                        '</div>')
                    .openOn(map);

                console.log('✅ Created temporary popup for stop', stopId, 'at coordinates:', latlng);
            } else {
                // Try to create a basic entry for stops that exist in timetable but not in stops data
                console.warn('⚠️ Stop', stopId, 'not found in stops data, creating basic entry');

                // Create a basic stop entry with default Barcelona coordinates
                var basicStopData = {
                    stop_id: stopId,
                    stop_name: 'Parada ' + stopId,
                    stop_lat: 41.3851, // Default Barcelona coordinates
                    stop_lon: 2.1734
                };

                var latlng = [basicStopData.stop_lat, basicStopData.stop_lon];
                map.setView(latlng, 18, {animate: true});

                // Create a temporary popup for the basic stop
                var tempPopup = L.popup()
                    .setLatLng(latlng)
                    .setContent('<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                        '<h4 style="margin: 0 0 8px 0; color: #0088cc;">🚏 Parada AMB ' + stopId + '</h4>' +
                        '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                        '<strong>Nom:</strong> ' + basicStopData.stop_name + '<br>' +
                        '<strong>Codi:</strong> ' + stopId + '<br>' +
                        '<strong>Posició:</strong> Coordenades predeterminades (Barcelona)' +
                        '</div>' +
                        '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                        '<em>Coordenades aproximades - Localització exacta no disponible</em>' +
                        '</div>' +
                        '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                        '🚌 Àrea Metropolitana de Barcelona' +
                        '</div>' +
                        '</div>')
                    .openOn(map);

                console.log('✅ Created basic popup for stop', stopId, 'with default coordinates');
            }
        } else {
            console.error('❌ No stop data available');
            alert('Les dades de parades no estan disponibles. Si us plau, carregui les parades primer.');
        }
    }
}

// Make functions globally accessible
window.startAMBStops = startAMBStops;
window.stopAMBStops = stopAMBStops;
window.showAMBFullTimetable = showAMBFullTimetable;
window.hideAMBFullTimetable = hideAMBFullTimetable;
window.showAMBStandaloneTimetable = showAMBStandaloneTimetable;
window.hideAMBStandaloneTimetable = hideAMBStandaloneTimetable;
window.createAMBReusableTimetable = createAMBReusableTimetable;
window.analyzeGTFSBinFile = analyzeGTFSBinFile;
window.zoomToStop = zoomToStop;
window.generateMissingStopTimes = generateMissingStopTimes;
window.exportUpdatedGTFSData = exportUpdatedGTFSData;
window.analyzeGTFSCompleteness = analyzeGTFSCompleteness;
