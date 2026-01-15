// Catalonia Bus Stops Visualization
var buscatBusStopsMarkers = [];
var buscatBusStopsInterval = null;
var allBusCatStops = []; // Store all stops data
var buscatBatchProcessingCancelled = false; // Flag to cancel batch processing

// Start Bus Cat bus stops visualization
function startBusCatStops() {
    if (buscatBusStopsInterval) {
        stopBusCatStops();
        return;
    }

    // Initial load
    fetchAllBusCatStops().then(function(stops) {
        displayBusCatStops(stops);
        // Start live countdown after data is loaded
        startBusCatLiveCountdown();
    }).catch(function(error) {
        console.error('❌ Failed to load Bus Cat bus stops:', error);
        updateBusCatStatus('Error: ' + error.message);
        alert('Error carregant parades autobús Catalunya: ' + error.message);
    });

    // Update every 10 minutes
    buscatBusStopsInterval = setInterval(function() {
        fetchAllBusCatStops().then(function(stops) {
            displayBusCatStops(stops);
        });
    }, 600000); // 10 minutes

    // Update UI
    document.getElementById('start-buscat-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-buscat-stops-btn').style.display = 'none';
    updateBusCatStatus('Carregant parades d\'autobús Catalunya...');
}

// Stop Bus Cat bus stops visualization
function stopBusCatStops() {
    if (buscatBusStopsInterval) {
        clearInterval(buscatBusStopsInterval);
        buscatBusStopsInterval = null;
    }

    // Set cancellation flag
    buscatBatchProcessingCancelled = true;

    // Clear all stop markers
    buscatBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    buscatBusStopsMarkers = [];

    // Update UI
    document.getElementById('start-buscat-stops-btn').style.display = 'inline-block';
    document.getElementById('stop-buscat-stops-btn').style.display = 'none';
    updateBusCatStatus('Inactiu');
}

// Update Bus Cat status display
function updateBusCatStatus(status) {
    var statusElement = document.getElementById('buscat-stops-status');
    if (statusElement) {
        statusElement.textContent = 'Status: ' + status;
    }
}

// Fetch all Bus Cat bus stops from GTFS static feed
function fetchAllBusCatStops() {
    console.log('🚌 Starting to fetch Bus Cat bus stops from GTFS...');

    // Load GTFS data from local files
    return loadBusCatGTFSData().then(function(gtfsData) {
        // Combine the data and find scheduled arrivals
        var stopsWithSchedules = combineBusCatGTFSData(gtfsData);
        console.log('✅ Successfully processed Bus Cat GTFS data with schedules');
        return stopsWithSchedules;
    }).catch(function(error) {
        console.error('❌ Error fetching Bus Cat GTFS data:', error);
        throw error; // Let the error propagate
    });
}

// Load GTFS data from local files
function loadBusCatGTFSData() {
    var gtfsPath = 'assets/gtfs/cat_bus/';
    var gtfsData = {
        stops: [],
        stopTimes: [],
        trips: [],
        routes: [],
        calendar: [],
        calendarDates: []
    };

    // Define file readers with promises
    var filePromises = [];

    // Read stops.txt
    filePromises.push(
        fetch(gtfsPath + 'stops.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.stops = parseBusCatCSVStops(content);
                console.log('✅ Parsed', gtfsData.stops.length, 'Bus Cat stops');
            })
    );

    // Read stop_times.txt
    filePromises.push(
        fetch(gtfsPath + 'stop_times.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.stopTimes = parseBusCatCSVStopTimes(content);
                console.log('✅ Parsed', gtfsData.stopTimes.length, 'Bus Cat stop times');
            })
    );

    // Read trips.txt
    filePromises.push(
        fetch(gtfsPath + 'trips.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.trips = parseBusCatCSVTrips(content);
                console.log('✅ Parsed', gtfsData.trips.length, 'Bus Cat trips');
            })
    );

    // Read routes.txt
    filePromises.push(
        fetch(gtfsPath + 'routes.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.routes = parseBusCatCSVRoutes(content);
                console.log('✅ Parsed', gtfsData.routes.length, 'Bus Cat routes');
            })
    );

    // Read calendar.txt
    filePromises.push(
        fetch(gtfsPath + 'calendar.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.calendar = parseBusCatCSVCalendar(content);
                console.log('✅ Parsed', gtfsData.calendar.length, 'Bus Cat calendar entries');
            })
    );

    // Read calendar_dates.txt
    filePromises.push(
        fetch(gtfsPath + 'calendar_dates.txt')
            .then(response => response.text())
            .then(function(content) {
                gtfsData.calendarDates = parseBusCatCSVCalendarDates(content);
                console.log('✅ Parsed', gtfsData.calendarDates.length, 'Bus Cat calendar date exceptions');
            })
    );

    // Wait for all files to be parsed
    return Promise.all(filePromises).then(function() {
        return gtfsData;
    }).catch(function(error) {
        console.error('❌ Error reading Bus Cat GTFS files:', error);
        throw error;
    });
}

// Parse CSV content of stops.txt for Bus Cat
function parseBusCatCSVStops(csvContent) {
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
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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
            }
        }
    }

    console.log('📊 Bus Cat stops.txt parsing complete:', stops.length, 'valid stops');
    return stops;
}

// Simple CSV line parser for Bus Cat
function parseBusCatCSVLine(line) {
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

// Parse CSV content of stop_times.txt for Bus Cat
function parseBusCatCSVStopTimes(csvContent) {
    var lines = csvContent.split('\n');
    var stopTimes = [];

    if (lines.length < 2) {
        console.warn('⚠️ stop_times.txt is empty or invalid');
        return stopTimes;
    }

    var header = lines[0].split(',');
    var tripIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'trip_id');
    var stopIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_id');
    var arrivalTimeIndex = header.findIndex(h => h.trim().toLowerCase() === 'arrival_time');
    var departureTimeIndex = header.findIndex(h => h.trim().toLowerCase() === 'departure_time');
    var stopSequenceIndex = header.findIndex(h => h.trim().toLowerCase() === 'stop_sequence');

    if (tripIdIndex === -1 || stopIdIndex === -1 || arrivalTimeIndex === -1) {
        console.error('❌ Missing required columns in stop_times.txt');
        return [];
    }

    // Parse data rows (limit for performance)
    var maxRows = Math.min(lines.length - 1, 100000);
    console.log('📊 Processing', maxRows, 'Bus Cat stop times out of', (lines.length - 1), 'total rows');

    for (var i = 1; i <= maxRows; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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
    }

    return stopTimes;
}

// Parse CSV content of trips.txt for Bus Cat
function parseBusCatCSVTrips(csvContent) {
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

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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

// Parse CSV content of routes.txt for Bus Cat
function parseBusCatCSVRoutes(csvContent) {
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

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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

// Parse CSV content of calendar.txt for Bus Cat
function parseBusCatCSVCalendar(csvContent) {
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

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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

// Parse CSV content of calendar_dates.txt for Bus Cat
function parseBusCatCSVCalendarDates(csvContent) {
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

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var fields = parseBusCatCSVLine(line);

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

// Combine Bus Cat GTFS data and find scheduled arrivals for each stop
function combineBusCatGTFSData(gtfsData) {
    console.log('🔗 Combining Bus Cat GTFS data...');

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
            if (!isBusCatServiceRunningToday(trip.service_id, currentDay, currentDate, calendarMap, calendarDatesMap)) {
                return;
            }

            // Parse arrival time
            var arrivalTimeStr = stopTime.arrival_time;
            if (!arrivalTimeStr) return;

            var arrivalTime = parseBusCatGTFSTime(arrivalTimeStr);
            if (!arrivalTime) return;

            // Create scheduled arrival time for today
            var scheduledTime = new Date(now);
            scheduledTime.setHours(arrivalTime.hours, arrivalTime.minutes, arrivalTime.seconds, 0);

            // If the scheduled time has already passed, assume it's for tomorrow
            if (scheduledTime.getTime() < now.getTime()) {
                scheduledTime.setDate(scheduledTime.getDate() + 1);
            }

            // Calculate time to arrival in minutes
            var timeToArrival = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / (1000 * 60)));

            // Only include arrivals within the next 24 hours
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

    console.log('✅ Bus Cat GTFS data combined successfully');
    return stops;
}

// Check if a service is running on the given day and date for Bus Cat
function isBusCatServiceRunningToday(serviceId, currentDay, currentDate, calendarMap, calendarDatesMap) {
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

// Parse GTFS time format (HH:MM:SS) for Bus Cat
function parseBusCatGTFSTime(timeStr) {
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

// Display Bus Cat bus stops on map
function displayBusCatStops(stops) {
    console.log('🚏 DISPLAYING', stops.length, 'Bus Cat BUS STOPS ON MAP...');

    // Clear existing markers
    buscatBusStopsMarkers.forEach(function(marker) {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    buscatBusStopsMarkers = [];

    var totalStops = 0;

    stops.forEach(function(stop) {
        var lat = stop.stop_lat;
        var lng = stop.stop_lon;
        var stopId = stop.stop_id;
        var stopName = stop.stop_name;

        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            // Create marker - use different color for stops with timetable data
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
                    className: 'buscat-bus-stop-marker',
                    iconSize: [markerWidth, markerHeight],
                    iconAnchor: [markerWidth / 2, markerHeight + 4]
                })
            });

            // Create popup with scheduled arrivals
            var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
                '<h4 style="margin: 0 0 8px 0; color: #0088cc; border-bottom: 2px solid #0088cc; padding-bottom: 4px;">' +
                '<i class="fa-solid fa-van-shuttle"></i> Parada Catalunya ' + stopId +
                '<button onclick="updateBusCatStopData(\'' + stopId + '\', this)" style="float: right; background: #28a745; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;" title="Actualitzar dades">' +
                '<i class="fa-solid fa-refresh"></i></button>' +
                '</h4>' +
                '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
                '<strong>Nom:</strong> ' + stopName + '<br>' +
                '<strong>Codi:</strong> ' + stopId + '<br>' +
                '<strong>Posició:</strong> ' + lat.toFixed(4) + ', ' + lng.toFixed(4) +
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
                    '<h5 style="margin: 0 0 8px 0; color: #0066cc;"><i class="fa-solid fa-van-shuttle"></i> Horaris d\'autobusos</h5>' +
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
                        var arrivalId = 'buscat-popup-arrival-' + stop.stop_id + '-' + index;

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
                        startBusCatArrivalCountdown(arrivalId, scheduledTime);
                    });

                    // Show remaining count if more than 5
                    if (routeArrivals.length > 5) {
                        popupContent += '<div style="font-size: 11px; color: #666; text-align: center; padding: 4px; font-style: italic;">+' + (routeArrivals.length - 5) + ' més sortides avui</div>';
                    }

                    popupContent += '</div>';
                });

                popupContent += '</div>' +
                    '<div style="font-size: 10px; color: #666; margin-top: 6px; text-align: center;">Horaris basats en dades GTFS de Catalunya</div>' +
                    '<div style="text-align: center; margin-top: 8px;">' +
                    '<button onclick="showBusCatFullTimetable(\'' + stopId + '\')" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 11px;">📋 Veure horari complet</button>' +
                    '</div>' +
                    '</div>';
            } else {
                popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
                    '<em>No hi ha horaris disponibles per aquesta parada</em>' +
                    '</div>';
            }

            popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
                '<i class="fa-solid fa-van-shuttle"></i> Autobús Catalunya' +
                '</div>' +
                '</div>';

            stopMarker.bindPopup(popupContent);
            stopMarker.addTo(map);
            buscatBusStopsMarkers.push(stopMarker);
            totalStops++;
        }
    });

    console.log('✅ Created', totalStops, 'Bus Cat bus stop markers');
    updateBusCatStatus('Mostrant ' + totalStops + ' parades autobús Catalunya');
}

// Bus Cat Bus Stops Table Management
var buscatStopsTableData = [];
var currentBusCatTablePage = 1;
var itemsPerBusCatTablePage = 25; // 25 items per page for better readability
var filteredBusCatTableData = [];
var currentBusCatTableSortColumn = 'id'; // Default sort column
var currentBusCatTableSortDirection = 'asc'; // 'asc' or 'desc'

// Load Bus Cat stops table
function loadBusCatStopsTable() {
    console.log('📋 Loading Bus Cat stops table...');

    // Show loading indicator
    document.getElementById('buscat-table-loading').style.display = 'block';
    document.getElementById('buscat-stops-table').style.display = 'none';
    document.getElementById('buscat-no-results').style.display = 'none';
    document.getElementById('buscat-pagination').style.display = 'none';

    updateBusCatTableStatus('Carregant parades d\'autobús...');

    // Check if we already have the data from the map visualization
    if (allBusCatStops && allBusCatStops.length > 0) {
        console.log('✅ Using cached Bus Cat stops data:', allBusCatStops.length, 'stops');
        populateBusCatTable(allBusCatStops);
    } else {
        // Fetch fresh data
        fetchAllBusCatStops().then(function(stops) {
            allBusCatStops = stops; // Cache for future use
            populateBusCatTable(stops);
        }).catch(function(error) {
            console.error('❌ Error loading Bus Cat stops for table:', error);
            updateBusCatTableStatus('Error carregant dades');
            document.getElementById('buscat-table-loading').style.display = 'none';
            alert('Error carregant les dades de parades Catalunya: ' + error.message);
        });
    }
}

// Populate table with Bus Cat stops data
function populateBusCatTable(stops) {
    console.log('📊 Populating Bus Cat table with', stops.length, 'stops');

    buscatStopsTableData = stops;
    filteredBusCatTableData = [...buscatStopsTableData];

    currentBusCatTablePage = 1;
    displayBusCatTablePage();

    // Hide loading, show table
    document.getElementById('buscat-table-loading').style.display = 'none';
    document.getElementById('buscat-stops-table').style.display = 'table';
    document.getElementById('buscat-pagination').style.display = 'block';

    updateBusCatTableStatus('Trobat ' + stops.length + ' parades d\'autobús');
    updateBusCatTableSortIndicators();

    console.log('✅ Bus Cat table populated successfully');
}

// Display current page of Bus Cat table
function displayBusCatTablePage() {
    var tbodyElement = document.getElementById('buscat-stops-tbody');
    var noResultsElement = document.getElementById('buscat-no-results');

    if (!tbodyElement) return;

    var startIndex = (currentBusCatTablePage - 1) * itemsPerBusCatTablePage;
    var endIndex = startIndex + itemsPerBusCatTablePage;
    var stopsToShow = filteredBusCatTableData.slice(startIndex, endIndex);

    tbodyElement.innerHTML = '';

    if (stopsToShow.length === 0) {
        if (noResultsElement) {
            noResultsElement.style.display = 'block';
        }
        return;
    }

    if (noResultsElement) {
        noResultsElement.style.display = 'none';
    }

    stopsToShow.forEach(function(stop) {
        var row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        // ID column - make it clickable to zoom to stop
        var idCell = document.createElement('td');
        idCell.style.padding = '8px';
        idCell.style.fontWeight = 'bold';
        idCell.style.color = '#c41e3a';
        idCell.style.cursor = 'pointer';
        idCell.style.textDecoration = 'underline';
        idCell.title = 'Click to zoom to this stop on map';
        idCell.textContent = stop.stop_id || '';
        idCell.onclick = function() {
            zoomToBusCatStop(stop);
        };
        row.appendChild(idCell);

        // Name column
        var nameCell = document.createElement('td');
        nameCell.style.padding = '8px';
        nameCell.textContent = stop.stop_name || 'Sense nom';
        row.appendChild(nameCell);

        // Real-time arrivals column
        var arrivalsCell = document.createElement('td');
        arrivalsCell.style.padding = '8px';

        if (stop.scheduledArrivals && stop.scheduledArrivals.length > 0) {
            var arrivalsHtml = '<div style="max-height: 80px; overflow-y: auto;">';
            stop.scheduledArrivals.slice(0, 3).forEach(function(arrival, index) { // Show up to 3 arrivals
                var arrivalId = 'buscat-table-arrival-' + stop.stop_id + '-' + index;
                var scheduledTime = arrival.scheduledTime;
                var countdownStr = getBusCatCountdownString(arrival, scheduledTime);

                arrivalsHtml += '<div style="margin-bottom: 4px; font-size: 11px; border: 1px solid #eee; border-radius: 3px; padding: 4px; background: #f9f9f9;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">' +
                    '<span style="font-weight: bold; color: #c41e3a;">' + arrival.route + '</span> ' +
                    '<span id="' + arrivalId + '" style="font-family: monospace; font-weight: bold; font-size: 10px;">' + countdownStr + '</span>' +
                    '</div>';
                if (arrival.destination) {
                    arrivalsHtml += '<div style="font-size: 10px; color: #666;">➜ ' + arrival.destination + '</div>';
                }
                arrivalsHtml += '</div>';

                // Start live countdown update for this table arrival
                startBusCatArrivalCountdown(arrivalId, scheduledTime);
            });
            if (stop.scheduledArrivals.length > 3) {
                arrivalsHtml += '<div style="font-size: 10px; color: #666; text-align: center; margin-top: 2px;">+' + (stop.scheduledArrivals.length - 3) + ' més...</div>';
            }
            arrivalsHtml += '</div>';
            arrivalsCell.innerHTML = arrivalsHtml;
        } else {
            arrivalsCell.innerHTML = '<span style="color: #999; font-style: italic; font-size: 11px;">Sense dades</span>';
        }
        row.appendChild(arrivalsCell);

        // Actions column
        var actionsCell = document.createElement('td');
        actionsCell.style.padding = '8px';
        actionsCell.style.textAlign = 'center';

        // Create a container for buttons
        var actionsContainer = document.createElement('div');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '4px';
        actionsContainer.style.justifyContent = 'center';
        actionsContainer.setAttribute('data-stop-id', stop.stop_id);

        var refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄';
        refreshBtn.title = 'Actualitzar dades parada';
        refreshBtn.style.background = '#28a745';
        refreshBtn.style.color = 'white';
        refreshBtn.style.border = 'none';
        refreshBtn.style.padding = '4px 6px';
        refreshBtn.style.borderRadius = '3px';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.style.fontSize = '10px';
        refreshBtn.onclick = function() {
            updateBusCatStopData(stop.stop_id, this);
        };

        var zoomBtn = document.createElement('button');
        zoomBtn.textContent = '📍';
        zoomBtn.title = 'Centrar al mapa';
        zoomBtn.style.background = '#007acc';
        zoomBtn.style.color = 'white';
        zoomBtn.style.border = 'none';
        zoomBtn.style.padding = '4px 6px';
        zoomBtn.style.borderRadius = '3px';
        zoomBtn.style.cursor = 'pointer';
        zoomBtn.style.fontSize = '10px';
        zoomBtn.onclick = function() {
            zoomToBusCatStop(stop);
        };

        actionsContainer.appendChild(refreshBtn);
        actionsContainer.appendChild(zoomBtn);
        actionsCell.appendChild(actionsContainer);
        row.appendChild(actionsCell);

        tbodyElement.appendChild(row);
    });

    updateBusCatTablePaginationControls();
}

// Update Bus Cat table status display
function updateBusCatTableStatus(status) {
    var statusElement = document.getElementById('buscat-table-status');
    if (statusElement) {
        statusElement.textContent = '📊 ' + status;
    }
}

// Search Bus Cat table
function searchBusCatTable() {
    var searchInput = document.getElementById('buscat-table-search');
    if (!searchInput) return;

    var searchTerm = searchInput.value.toLowerCase().trim();
    filteredBusCatTableData = buscatStopsTableData.filter(function(stop) {
        var searchableText = [
            stop.stop_id || '',
            stop.stop_name || '',
            stop.line || '',
            stop.line_nom || ''
        ].join(' ').toLowerCase();

        return searchableText.includes(searchTerm);
    });

    currentBusCatTablePage = 1;
    displayBusCatTablePage();
}

// Clear Bus Cat table search
function clearBusCatTableSearch() {
    var searchInput = document.getElementById('buscat-table-search');
    if (searchInput) {
        searchInput.value = '';
    }
    filteredBusCatTableData = [...buscatStopsTableData];
    currentBusCatTablePage = 1;
    displayBusCatTablePage();
}

// Sort Bus Cat table
function sortBusCatTable(column) {
    // Toggle sort direction if same column, otherwise default to ascending
    if (currentBusCatTableSortColumn === column) {
        currentBusCatTableSortDirection = currentBusCatTableSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentBusCatTableSortColumn = column;
        currentBusCatTableSortDirection = 'asc';
    }

    // Sort the filtered data
    filteredBusCatTableData.sort(function(a, b) {
        var aVal, bVal;

        switch(column) {
            case 'id':
                aVal = (a.stop_id || '').toString().toLowerCase();
                bVal = (b.stop_id || '').toString().toLowerCase();
                break;
            case 'name':
                aVal = (a.stop_name || '').toString().toLowerCase();
                bVal = (b.stop_name || '').toString().toLowerCase();
                break;
            case 'arrivals':
                aVal = (a.scheduledArrivals && a.scheduledArrivals.length > 0) ? a.scheduledArrivals[0].timeToArrival || 999 : 999;
                bVal = (b.scheduledArrivals && b.scheduledArrivals.length > 0) ? b.scheduledArrivals[0].timeToArrival || 999 : 999;
                break;
            default:
                return 0;
        }

        if (currentBusCatTableSortDirection === 'asc') {
            if (typeof aVal === 'string') {
                return aVal.localeCompare(bVal, 'ca', {numeric: true, sensitivity: 'base'});
            } else {
                return aVal - bVal;
            }
        } else {
            if (typeof aVal === 'string') {
                return bVal.localeCompare(aVal, 'ca', {numeric: true, sensitivity: 'base'});
            } else {
                return bVal - aVal;
            }
        }
    });

    // Reset to first page when sorting
    currentBusCatTablePage = 1;

    // Update sort indicators
    updateBusCatTableSortIndicators();

    // Redisplay the table
    displayBusCatTablePage();
}

// Update sort indicators in table headers
function updateBusCatTableSortIndicators() {
    // Reset all indicators
    var indicators = ['sort-buscat-id', 'sort-buscat-name', 'sort-buscat-arrivals'];
    indicators.forEach(function(id) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = '↕️';
        }
    });

    // Set active indicator
    var activeId = 'sort-buscat-' + currentBusCatTableSortColumn;
    var activeElement = document.getElementById(activeId);
    if (activeElement) {
        activeElement.textContent = currentBusCatTableSortDirection === 'asc' ? '⬆️' : '⬇️';
    }
}

// Update Bus Cat table pagination controls
function updateBusCatTablePaginationControls() {
    var prevButton = document.getElementById('buscat-prev-page');
    var nextButton = document.getElementById('buscat-next-page');
    var pageInfo = document.getElementById('buscat-page-info');

    var totalPages = Math.ceil(filteredBusCatTableData.length / itemsPerBusCatTablePage);

    if (prevButton) {
        prevButton.disabled = currentBusCatTablePage <= 1;
    }

    if (nextButton) {
        nextButton.disabled = currentBusCatTablePage >= totalPages;
    }

    if (pageInfo) {
        pageInfo.textContent = 'Pàgina ' + currentBusCatTablePage + ' de ' + Math.max(1, totalPages) +
                              ' (' + filteredBusCatTableData.length + ' parades)';
    }
}

// Change Bus Cat table page
function changeBusCatPage(direction) {
    var totalPages = Math.ceil(filteredBusCatTableData.length / itemsPerBusCatTablePage);
    currentBusCatTablePage += direction;

    if (currentBusCatTablePage < 1) currentBusCatTablePage = 1;
    if (currentBusCatTablePage > totalPages) currentBusCatTablePage = totalPages;

    displayBusCatTablePage();
}

// Zoom to Bus Cat stop on map
function zoomToBusCatStop(stop) {
    if (stop.stop_lat && stop.stop_lon && !isNaN(stop.stop_lat) && !isNaN(stop.stop_lon)) {
        map.setView([stop.stop_lat, stop.stop_lon], 18); // High zoom level to focus on the stop
        console.log('🗺️ Zoomed to Bus Cat stop:', stop.stop_id, 'at', stop.stop_lat, stop.stop_lon);

        // If map visualization is active, also trigger popup
        if (buscatBusStopsMarkers && buscatBusStopsMarkers.length > 0) {
            // Find the marker for this stop and open its popup
            buscatBusStopsMarkers.forEach(function(marker) {
                if (marker && marker.getPopup()) {
                    var popup = marker.getPopup();
                    var content = popup.getContent();

                    if (content && typeof content === 'string') {
                        var stopIdMatch = content.match(/Parada Catalunya ([^\s<]+)/);

                        if (stopIdMatch && stopIdMatch[1] === stop.stop_id) {
                            marker.openPopup();
                        }
                    }
                }
            });
        }
    } else {
        console.warn('❌ Cannot zoom to Bus Cat stop - invalid coordinates:', stop.stop_id, stop.stop_lat, stop.stop_lon);
        alert('No es poden obtenir les coordenades d\'aquesta parada.');
    }
}

// Get countdown string for Bus Cat bus arrival
function getBusCatCountdownString(arrival, scheduledTime) {
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

    // Format as HH:MM:SS
    var timeStr = '';
    if (hours > 0) {
        timeStr = hours.toString().padStart(2, '0') + ':';
    }
    timeStr += minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');

    return timeStr;
}

// Start live countdown update for a specific Bus Cat arrival
function startBusCatArrivalCountdown(elementId, scheduledTime) {
    if (!scheduledTime) return;

    function updateCountdown() {
        var element = document.getElementById(elementId);
        if (!element) return; // Element no longer exists

        var countdownStr = getBusCatCountdownString(null, scheduledTime);

        // Color coding based on urgency
        var now = new Date().getTime();
        var arrivalMs = scheduledTime.getTime();
        var diffMs = arrivalMs - now;
        var diffMinutes = diffMs / (1000 * 60);

        var color = '#0066cc'; // Default blue
        if (diffMs <= 0) {
            color = '#888'; // Gray for arrived/overdue
        } else if (diffMinutes <= 2) {
            color = '#d63031'; // Red for very soon
        } else if (diffMinutes <= 5) {
            color = '#e17055'; // Orange for soon
        }

        element.textContent = countdownStr;
        element.style.color = color;
        element.style.fontWeight = 'bold';
        element.style.fontFamily = 'monospace';
    }

    // Update immediately
    updateCountdown();

    // Set up interval for live updates
    var intervalId = setInterval(updateCountdown, 1000); // Update every second

    // Store the interval ID for cleanup
    if (!window.buscatCountdownIntervals) {
        window.buscatCountdownIntervals = {};
    }
    if (!window.buscatCountdownIntervals[elementId]) {
        window.buscatCountdownIntervals[elementId] = intervalId;
    }
}

// Start live countdown timer for Bus Cat
function startBusCatLiveCountdown() {
    if (window.buscatCountdownInterval) {
        clearInterval(window.buscatCountdownInterval);
    }

    console.log('⏰ Starting Bus Cat live countdown timer');

    // Update immediately
    updateBusCatLiveCountdown();

    // Then update every minute
    window.buscatCountdownInterval = setInterval(updateBusCatLiveCountdown, 60000); // Update every minute
}

// Stop live countdown timer for Bus Cat
function stopBusCatLiveCountdown() {
    if (window.buscatCountdownInterval) {
        clearInterval(window.buscatCountdownInterval);
        window.buscatCountdownInterval = null;
        console.log('⏰ Stopped Bus Cat live countdown timer');
    }
}

// Update live countdown for all Bus Cat timetable displays
function updateBusCatLiveCountdown() {
    var now = new Date();
    var currentTime = now.getTime();

    // Only update if it's been more than 30 seconds since last update
    if (window.buscatLastCountdownUpdate && currentTime - window.buscatLastCountdownUpdate < 30000) {
        return;
    }

    window.buscatLastCountdownUpdate = currentTime;
    console.log('⏰ Updating Bus Cat live countdowns at', now.toLocaleTimeString());
}

// Show full timetable for a specific Bus Cat stop
function showBusCatFullTimetable(stopId) {
    console.log('📋 Showing full timetable for Bus Cat stop:', stopId);

    // Find the stop data - check both allBusCatStops and try to fetch if not found
    var stopData = null;

    if (allBusCatStops && allBusCatStops.length > 0) {
        stopData = allBusCatStops.find(function(stop) {
            return stop.stop_id === stopId;
        });
    }

    // If not found in cache, try to fetch fresh data
    if (!stopData) {
        console.log('🔄 Stop data not found in cache, attempting to fetch fresh data for:', stopId);

        fetchAllBusCatStops().then(function(stops) {
            var foundStop = stops.find(function(stop) {
                return stop.stop_id === stopId;
            });

            if (foundStop) {
                // Cache the data for future use
                allBusCatStops = stops;

                // Now show the timetable
                showBusCatTimetableDialog(foundStop);
            } else {
                console.error('❌ Stop data still not found after fresh fetch:', stopId);
                alert('Error: No s\'ha trobat informació per aquesta parada.');
            }
        }).catch(function(error) {
            console.error('❌ Error fetching fresh stop data:', error);
            alert('Error carregant dades de la parada: ' + error.message);
        });
        return;
    }

    // Show the timetable dialog
    showBusCatTimetableDialog(stopData);
}

// Show the timetable dialog for a stop
function showBusCatTimetableDialog(stopData) {
    var stopId = stopData.stop_id;
    var stopName = stopData.stop_name;

    console.log('📋 Displaying timetable for:', stopId, stopName);

    // Create a comprehensive timetable display
    var html = '<div style="font-family: Arial, sans-serif; max-width: 800px; max-height: 600px; overflow-y: auto;">';
    html += '<h3 style="margin: 0 0 15px 0; color: #0088cc; border-bottom: 2px solid #0088cc; padding-bottom: 8px;">';
    html += '<i class="fa-solid fa-van-shuttle"></i> Horari complet - ' + stopName + ' (' + stopId + ')';
    html += '</h3>';

    if (stopData.scheduledArrivals && stopData.scheduledArrivals.length > 0) {
        // Group arrivals by route
        var arrivalsByRoute = {};
        stopData.scheduledArrivals.forEach(function(arrival) {
            var route = arrival.route;
            if (!arrivalsByRoute[route]) {
                arrivalsByRoute[route] = [];
            }
            arrivalsByRoute[route].push(arrival);
        });

        html += '<div style="margin-bottom: 15px;">';
        html += '<strong>📅 Data d\'avui - ' + new Date().toLocaleDateString('ca-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</strong>';
        html += '</div>';

        // Display each route's timetable
        Object.keys(arrivalsByRoute).sort().forEach(function(routeId) {
            var routeArrivals = arrivalsByRoute[routeId];
            var firstArrival = routeArrivals[0];

            html += '<div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f9f9f9;">';
            html += '<h4 style="margin: 0 0 10px 0; color: #c41e3a;">';
            html += '<i class="fa-solid fa-route"></i> Línia ' + routeId;
            if (firstArrival.route_long_name) {
                html += ' - ' + firstArrival.route_long_name;
            }
            html += '</h4>';

            // Create a table for this route's times
            html += '<table style="width: 100%; border-collapse: collapse;">';
            html += '<thead>';
            html += '<tr style="background: #e9ecef;">';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd; font-weight: bold;">Hora</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd; font-weight: bold;">Destí</th>';
            html += '<th style="padding: 8px; text-align: center; border: 1px solid #ddd; font-weight: bold;">Arribada</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';

            routeArrivals.forEach(function(arrival) {
                var scheduledTime = arrival.scheduledTime;
                var timeStr = scheduledTime ? scheduledTime.toLocaleTimeString('ca-ES', {hour: '2-digit', minute: '2-digit'}) : '--:--';
                var destination = arrival.destination || 'Sense destinació';
                var timeToArrival = arrival.timeToArrival;

                var rowStyle = '';
                var statusText = '';
                var statusColor = '';

                if (timeToArrival < 0) {
                    statusText = 'Passat';
                    statusColor = '#6c757d';
                    rowStyle = 'opacity: 0.6;';
                } else if (timeToArrival === 0) {
                    statusText = 'Arribant';
                    statusColor = '#fd7e14';
                    rowStyle = 'background: #fff3cd;';
                } else if (timeToArrival <= 5) {
                    statusText = timeToArrival + ' min';
                    statusColor = '#dc3545';
                    rowStyle = 'background: #f8d7da;';
                } else if (timeToArrival <= 15) {
                    statusText = timeToArrival + ' min';
                    statusColor = '#ffc107';
                    rowStyle = 'background: #fff3cd;';
                } else {
                    statusText = timeToArrival + ' min';
                    statusColor = '#28a745';
                }

                html += '<tr style="' + rowStyle + '">';
                html += '<td style="padding: 8px; border: 1px solid #ddd;">' + timeStr + '</td>';
                html += '<td style="padding: 8px; border: 1px solid #ddd;">' + destination + '</td>';
                html += '<td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: ' + statusColor + '; font-weight: bold;">' + statusText + '</td>';
                html += '</tr>';
            });

            html += '</tbody>';
            html += '</table>';
            html += '</div>';
        });

        html += '<div style="margin-top: 15px; padding: 10px; background: #e9ecef; border-radius: 4px; font-size: 12px; color: #6c757d;">';
        html += '<i class="fa-solid fa-info-circle"></i> ';
        html += 'Horaris basats en dades GTFS oficials de Catalunya. Els temps són aproximats i poden variar.';
        html += '</div>';
    } else {
        html += '<div style="text-align: center; padding: 40px; color: #6c757d;">';
        html += '<i class="fa-solid fa-clock" style="font-size: 48px; margin-bottom: 15px;"></i>';
        html += '<p style="font-size: 16px; margin: 0;">No hi ha horaris disponibles per aquesta parada avui.</p>';
        html += '</div>';
    }

    html += '</div>';

    // Create and show modal dialog
    var modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    modal.innerHTML = html;

    // Add close button
    var closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.background = '#dc3545';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '50%';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.onclick = function() {
        document.body.removeChild(modal);
    };

    modal.firstChild.insertBefore(closeButton, modal.firstChild.firstChild);

    // Close on background click
    modal.onclick = function(event) {
        if (event.target === modal) {
            document.body.removeChild(modal);
        }
    };

    document.body.appendChild(modal);
}

// Update data for a specific Bus Cat stop
function updateBusCatStopData(stopId, buttonElement) {
    console.log('🔄 Updating data for Bus Cat stop:', stopId);

    // Show loading state on button
    var originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    buttonElement.disabled = true;
    buttonElement.style.opacity = '0.7';

    // Fetch fresh GTFS data
    fetchAllBusCatStops().then(function(stops) {
        // Find the updated stop data
        var updatedStop = stops.find(function(stop) {
            return stop.stop_id === stopId;
        });

        if (updatedStop) {
            // Update the global cache
            allBusCatStops = stops;

            // Update any markers on the map
            buscatBusStopsMarkers.forEach(function(marker) {
                if (marker && marker.getPopup()) {
                    var popup = marker.getPopup();
                    var content = popup.getContent();

                    if (content && typeof content === 'string') {
                        var stopIdMatch = content.match(/Parada Catalunya ([^\s<]+)/);

                        if (stopIdMatch && stopIdMatch[1] === stopId) {
                            // Update marker color based on new data
                            var hasTimetable = updatedStop.scheduledArrivals && updatedStop.scheduledArrivals.length > 0;
                            var markerColor = hasTimetable ? '#28a745' : '#0088cc';
                            var borderColor = hasTimetable ? '#1e7e34' : '#006699';

                            // Rebuild the marker HTML
                            var stopRef = stopId;
                            var markerWidth = Math.max(32, stopRef.length * 8 + 8);
                            var markerHeight = 20;

                            var markerHtml = '<div style="width: ' + markerWidth + 'px; height: ' + markerHeight + 'px; background: ' + markerColor + '; border: 2px solid ' + borderColor + '; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 1px 1px 3px rgba(0,0,0,0.7); white-space: nowrap;">' +
                                '<span style="color: white; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.7); overflow: hidden; text-overflow: ellipsis;">' + stopRef + '</span>' +
                                '</div>';

                            // Update marker icon
                            marker.setIcon(L.divIcon({
                                html: markerHtml,
                                className: 'buscat-bus-stop-marker',
                                iconSize: [markerWidth, markerHeight],
                                iconAnchor: [markerWidth / 2, markerHeight + 4]
                            }));

                            // Update popup content
                            var popupContent = buildBusCatStopPopup(updatedStop);
                            marker.setPopupContent(popupContent);

                            console.log('✅ Updated marker for stop:', stopId);
                        }
                    }
                }
            });

            // If there's a table, update it too
            if (buscatStopsTableData && buscatStopsTableData.length > 0) {
                // Find and update the stop in the table data
                var stopIndex = buscatStopsTableData.findIndex(function(stop) {
                    return stop.stop_id === stopId;
                });

                if (stopIndex !== -1) {
                    buscatStopsTableData[stopIndex] = updatedStop;

                    // If the updated stop is on the current page, refresh the display
                    var startIndex = (currentBusCatTablePage - 1) * itemsPerBusCatTablePage;
                    var endIndex = startIndex + itemsPerBusCatTablePage;
                    var stopsToShow = filteredBusCatTableData.slice(startIndex, endIndex);

                    var isOnCurrentPage = stopsToShow.some(function(stop) {
                        return stop.stop_id === stopId;
                    });

                    if (isOnCurrentPage) {
                        displayBusCatTablePage();
                    }
                }
            }

            console.log('✅ Successfully updated data for stop:', stopId);
            showBusCatUpdateNotification('Dades actualitzades per parada ' + stopId, 'success');
        } else {
            console.error('❌ Stop not found in updated data:', stopId);
            showBusCatUpdateNotification('Error: No s\'ha trobat la parada ' + stopId, 'error');
        }
    }).catch(function(error) {
        console.error('❌ Error updating stop data:', error);
        showBusCatUpdateNotification('Error actualitzant dades: ' + error.message, 'error');
    }).finally(function() {
        // Restore button state
        buttonElement.innerHTML = originalText;
        buttonElement.disabled = false;
        buttonElement.style.opacity = '1';
    });
}

// Build popup content for a Bus Cat stop
function buildBusCatStopPopup(stopData) {
    var stopId = stopData.stop_id;
    var stopName = stopData.stop_name;
    var lat = stopData.stop_lat;
    var lng = stopData.stop_lon;

    // Create popup with scheduled arrivals
    var popupContent = '<div style="font-family: Arial, sans-serif; min-width: 250px;">' +
        '<h4 style="margin: 0 0 8px 0; color: #0088cc; border-bottom: 2px solid #0088cc; padding-bottom: 4px;">' +
        '<i class="fa-solid fa-van-shuttle"></i> Parada Catalunya ' + stopId +
        '<button onclick="updateBusCatStopData(\'' + stopId + '\', this)" style="float: right; background: #28a745; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;" title="Actualitzar dades">' +
        '<i class="fa-solid fa-refresh"></i></button>' +
        '</h4>' +
        '<div style="background: #0088cc15; border: 1px solid #0088cc; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
        '<strong>Nom:</strong> ' + stopName + '<br>' +
        '<strong>Codi:</strong> ' + stopId + '<br>' +
        '<strong>Posició:</strong> ' + lat.toFixed(4) + ', ' + lng.toFixed(4) +
        '</div>';

    // Add scheduled arrivals section with timetable view
    if (stopData.scheduledArrivals && stopData.scheduledArrivals.length > 0) {
        // Group arrivals by route for better organization
        var arrivalsByRoute = {};
        stopData.scheduledArrivals.forEach(function(arrival) {
            if (!arrivalsByRoute[arrival.route]) {
                arrivalsByRoute[arrival.route] = [];
            }
            arrivalsByRoute[arrival.route].push(arrival);
        });

        popupContent += '<div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin: 8px 0;">' +
            '<h5 style="margin: 0 0 8px 0; color: #0066cc;"><i class="fa-solid fa-van-shuttle"></i> Horaris d\'autobusos</h5>' +
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
                var arrivalId = 'buscat-popup-arrival-' + stopId + '-' + index;

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
                startBusCatArrivalCountdown(arrivalId, scheduledTime);
            });

            // Show remaining count if more than 5
            if (routeArrivals.length > 5) {
                popupContent += '<div style="font-size: 11px; color: #666; text-align: center; padding: 4px; font-style: italic;">+' + (routeArrivals.length - 5) + ' més sortides avui</div>';
            }

            popupContent += '</div>';
        });

        popupContent += '</div>' +
            '<div style="font-size: 10px; color: #666; margin-top: 6px; text-align: center;">Horaris basats en dades GTFS de Catalunya</div>' +
            '<div style="text-align: center; margin-top: 8px;">' +
            '<button onclick="showBusCatFullTimetable(\'' + stopId + '\')" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 11px;">📋 Veure horari complet</button>' +
            '</div>' +
            '</div>';
    } else {
        popupContent += '<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px; margin: 8px 0; text-align: center;">' +
            '<em>No hi ha horaris disponibles per aquesta parada</em>' +
            '</div>';
    }

    popupContent += '<div style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">' +
        '<i class="fa-solid fa-van-shuttle"></i> Autobús Catalunya' +
        '</div>' +
        '</div>';

    return popupContent;
}

// Show notification for Bus Cat updates
function showBusCatUpdateNotification(message, type) {
    // Remove any existing notification
    var existingNotification = document.getElementById('buscat-notification');
    if (existingNotification) {
        document.body.removeChild(existingNotification);
    }

    // Create notification element
    var notification = document.createElement('div');
    notification.id = 'buscat-notification';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    notification.style.zIndex = '10001';
    notification.style.fontFamily = 'Arial, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.maxWidth = '300px';

    // Set colors based on type
    if (type === 'success') {
        notification.style.backgroundColor = '#d4edda';
        notification.style.color = '#155724';
        notification.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#f8d7da';
        notification.style.color = '#721c24';
        notification.style.border = '1px solid #f5c6cb';
    } else {
        notification.style.backgroundColor = '#fff3cd';
        notification.style.color = '#856404';
        notification.style.border = '1px solid #ffeaa7';
    }

    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(function() {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    }, 5000);
}

// Make functions globally accessible
window.startBusCatStops = startBusCatStops;
window.stopBusCatStops = stopBusCatStops;
window.loadBusCatStopsTable = loadBusCatStopsTable;
window.searchBusCatTable = searchBusCatTable;
window.clearBusCatTableSearch = clearBusCatTableSearch;
window.sortBusCatTable = sortBusCatTable;
window.changeBusCatPage = changeBusCatPage;
window.zoomToBusCatStop = zoomToBusCatStop;
window.showBusCatFullTimetable = showBusCatFullTimetable;
window.updateBusCatStopData = updateBusCatStopData;
