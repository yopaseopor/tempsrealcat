// spinner
var spinner = 0;

// Don't scape HTML string in Mustache
Mustache.escape = function (text) { return text; }

// https://github.com/Leaflet/Leaflet
var map = new L.Map('map', {zoomControl: false});
var iconLayer = new L.LayerGroup();
map.addLayer(iconLayer);

var attribution = 'Dades &#169; Col·laboradors <a href="http://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

var tileLayerData = {
    std: {
	name: 'Estàndard (Mapnik)',
	url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	zoom: '19'
    },
    hot: {
	name: 'Equip Humanitari',
	url: 'http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
	attribution: 'Tessel·les <a href="http://hot.openstreetmap.org/" target="_blank">Equip Humanitari OpenStreetMap</a>',
	zoom: '20'
    },
    osmfr: {
	name: 'OSM França',
	url: 'http://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
	attribution: 'Tessel·les <a href="http://openstreetmap.fr/" target="_blank">OpenStreetMap França</a>',
	zoom: '20'
    },
    cycle: {
	name: 'Bicicleta',
	url: 'http://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png' + apikey,
	attribution: 'Tessel·les <a href="http://thunderforest.com/opencyclemap/" target="_blank">ThunderForest</a>',
	zoom: '18'
    },
    transport: {
	name: 'Transport públic',
	url: 'http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png' + apikey,
	attribution: 'Tessel·les <a href="http://thunderforest.com/transport/" target="_blank">ThunderForest</a>',
	zoom: '20'
    },
    landscape: {
	name: 'Paisatge',
	url: 'http://{s}.tile.thunderforest.com/landscape/{z}/{x}/{y}.png' + apikey,
	attribution: 'Tessel·les <a href="http://thunderforest.com/landscape/" target="_blank">ThunderForest</a>',
	zoom: '18'
    },
    outdoor: {
	name: 'A l\'aire lliure',
	url: 'http://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png' + apikey,
	attribution: 'Tessel·les <a href="http://thunderforest.com/outdoors/" target="_blank">ThunderForest</a>',
	zoom: '18'
    },
//    lyrk: {
//	name: 'Lyrk',
//	url: 'http://tiles.lyrk.org/ls/{z}/{x}/{y}?apikey=3d836013a4ab468f965bfd1328d89522',
//	attribution: 'Tessel·les <a href="http://lyrk.de/" target="_blank">Lyrk</a>',
//	zoom: '18'
//    },
    mapbox: {
	name: 'MapBox (satèl·lit)',
	url: 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png' + token,
	attribution: 'Tessel·les <a href="http://mapbox.com/" target="_blank">MapBox</a>',
	zoom: '19'
    },
    mapquest: {
	name: 'MapQuest Open',
	url: 'http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png',
	attribution: 'Tessel·les <a href="http://mapquest.com/" target="_blank">MapQuest</a>',
	subdomains: '123',
	zoom: '18'
    },
    mapsurfer: {
	name: 'OpenMapSurfer (3D)',
	url: 'http://openmapsurfer.uni-hd.de/tiles/roads/x={x}&y={y}&z={z}',
	attribution: 'Tessel·les <a href="http://giscience.uni-hd.de/" target="_blank">GIScience Research Group @ Heidelberg University</a>',
	zoom: '19'
    },
    toner: {
	name: 'Tòner',
	url: 'http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png',
	attribution: 'Tessel·les d\'<a href="http://stamen.com" target="_blank">Stamen Design</a>',
	zoom: '20'
    },
    watercolor: {
	name: 'Aquarel·la',
	url: 'http://{s}.tile.stamen.com/watercolor/{z}/{x}/{y}.png',
	attribution: 'Tessel·les d\'<a href="http://stamen.com" target="_blank">Stamen Design</a>',
	zoom: '16'
    }
};

var tileLayers = {};
for (tile in tileLayerData) {
    var tileAttribution;
    var tilemaxZoom = tileLayerData[tile].zoom;
    var subdomains = tileLayerData[tile].subdomains ? tileLayerData[tile].subdomains : 'abc';
    if (tileLayerData[tile].attribution) {
	tileAttribution = tileLayerData[tile].attribution + ' &mdash; ' + attribution;
    }
    else tileAttribution = attribution;

    tileLayers[tileLayerData[tile].name] = L.tileLayer(
	tileLayerData[tile].url,
	{maxNativeZoom: tilemaxZoom, maxZoom: 20, attribution: tileAttribution, subdomains: subdomains}
    )
}

tileLayers['Estàndard (Mapnik)'].addTo(map);
L.control.layers(tileLayers).addTo(map);
// +++++ Set the coordinates for zoomhouse +++++
// ++++++++MODIFICAR AQUÍ++++++++++++++
map.setView([41.2214 , 1.7169], 15);
var zoomHome = L.Control.zoomHome();
zoomHome.addTo(map);
var notesLayer = new leafletOsmNotes();

// Mapillary popoups
var onEachFeature = function(feature, layer) {
    console.log(arguments);
    var content = '<div><center><img width="100%" src="'+feature.properties.image+'"></img><br><a style="font-size:1.1em;" href="http://www.mapillary.com/map/im/'+feature.properties.key+'" target="_blank">Continua la seqüència a Mapillary</a><br><img style="vertical-align:middle;" src="assets/img/mapillary.png" width="25" height="25"></center></div>'
    layer.bindPopup(content);
};
mapillaryLayer = L.geoJson(null, {
                        onEachFeature: onEachFeature
                    })
mapillaryLayer.addTo(map);

// https://github.com/Turbo87/sidebar-v2/
var sidebar = L.control.sidebar('sidebar').addTo(map);
//$(document).ready(function () {
    // open #home sidebar-pane to show the available POIs
//    sidebar.open('home');
//});

// https://github.com/mlevans/leaflet-hash
var hash = new L.Hash(map);

// update the permalink when L.Hash changes the #hash
window.onhashchange = function() {
    update_permalink();
}


// https://github.com/domoritz/leaflet-locatecontrol
L.control.locate({
    follow: false,
    setView: true,
    keepCurrentZoomLevel: true,
    showPopup: false,
    strings: {
	title: 'Mostra la meva ubicació',
	popup: 'Esteu a {distance} metres d\'aquí aproximadament',
	outsideMapBoundsMsg: 'No es posible ubicar tu posición en el mapa'
    },
    onLocationError: function(err) {
	alert('S\'ha produït un error en intentar loacalitzar la vostra ubicació.');
    }
}).addTo(map);

// https://github.com/rowanwins/leaflet-easyPrint
L.easyPrint().addTo(map)

// https://github.com/ebrelsford/Leaflet.loading
var loadingControl = L.Control.loading({
    separate: true
});
map.addControl(loadingControl);

// https://github.com/makinacorpus/Leaflet.RestoreView
if (!map.restoreView()) {
// +++++ Coordinates (lat,lon) for local place +++++
//+++++++++ MODIFICAR AQUÍ ++++++++++++
    map.setView([41.2214 , 1.7169], 15);
}

var query = '';
show_pois_checkboxes();
build_overpass_query();

var uri = URI(window.location.href);
if (uri.hasQuery('pois')) {
    var selectedPois = uri.search(true).pois;
    if (!$.isArray(selectedPois)) {
	poi = selectedPois.replace('/', '');
	$('#pois input[data-key='+ poi + ']').attr('checked', true);
    }
    else {
	for (i = 0; i < selectedPois.length; i++) {
	    // the last poi has a "/" on it because leaflet-hash
	    poi = selectedPois[i].replace('/', '');
	    $('#pois input[data-key='+ poi + ']').attr('checked', true);
	}
    }
    setting_changed();
}

// Global variables for dynamic base location
var baseLocation = {
    name: "Vilanova i la Geltrú",
    type: "city",
    lat: 41.2214,
    lng: 1.7169,
    bounds: null,
    osm_id: null,
    osm_type: null
};

// Local search functions

var feature2

function getLocationType(display_name, osm_type, class_type) {
    // Determine location type based on OSM data
    if (class_type) {
        switch(class_type) {
            case 'boundary':
                return 'region';
            case 'place':
                return osm_type === 'node' ? 'city' : 'region';
            case 'highway':
                return 'road';
            case 'natural':
                return 'natural_feature';
            case 'waterway':
                return 'waterway';
            case 'landuse':
                return 'landuse';
            default:
                return 'location';
        }
    }

    // Fallback based on display name keywords
    var name_lower = display_name.toLowerCase();
    if (name_lower.includes('county') || name_lower.includes('comarca') || name_lower.includes('provincia')) {
        return 'county';
    } else if (name_lower.includes('city') || name_lower.includes('ciudad') || name_lower.includes('municipio')) {
        return 'city';
    } else if (name_lower.includes('state') || name_lower.includes('estado') || name_lower.includes('comunidad')) {
        return 'state';
    } else if (name_lower.includes('country') || name_lower.includes('país') || name_lower.includes('nation')) {
        return 'country';
    } else if (name_lower.includes('region') || name_lower.includes('región')) {
        return 'region';
    } else {
        return osm_type === 'node' ? 'point' : 'area';
    }
}

function chooseAddr(lat1, lng1, lat2, lng2, osm_type, display_name, class_type, osm_id, osm_type_full) {
	var loc1 = new L.LatLng(lat1, lng1);
	var loc2 = new L.LatLng(lat2, lng2);
	var bounds = new L.LatLngBounds(loc1, loc2);

	if (feature2) {
		map.removeLayer(feature2);
	}

	// Update base location
	baseLocation = {
	    name: display_name,
	    type: getLocationType(display_name, osm_type, class_type),
	    lat: (lat1 + lat2) / 2,
	    lng: (lng1 + lng2) / 2,
	    bounds: bounds,
	    osm_id: osm_id,
	    osm_type: osm_type_full
	};

	// Update UI to show current base location
	updateBaseLocationDisplay();

	// Update routes for new location
	if (typeof updateRoutesForNewLocation === 'function') {
		updateRoutesForNewLocation();
	}

	if (osm_type == "node") {
		feature2 = L.circle( loc1, 15, {color: 'green', fill: false}).addTo(map);
		map.fitBounds(bounds);
		map.setZoom(19);
		sidebar.close();
	} else {
		var loc3 = new L.LatLng(lat1, lng2);
		var loc4 = new L.LatLng(lat2, lng1);
		feature2 = L.polyline( [loc1, loc4, loc2, loc3, loc1], {color: 'red'}).addTo(map);
		map.fitBounds(bounds);
		sidebar.close();
	}
}

function updateBaseLocationDisplay() {
    // Update the subtitle to show current base location
    var subtitleElement = document.querySelector('#search h1 small');
    if (subtitleElement) {
        // Escape apostrophes in location name to prevent JavaScript errors
        var escapedLocationName = baseLocation.name.replace(/'/g, "\\'");
        subtitleElement.textContent = getTranslation('search_local_subtitle_dynamic')
            .replace('{location}', escapedLocationName)
            .replace('{type}', getTranslation('location_type_' + baseLocation.type));
    }

    // Update Wikipedia content based on new base location
    if (typeof updateWikipediaContent === 'function') {
        updateWikipediaContent();
    }

    // Do NOT automatically reload POIs - user must click button
    // Removed: setting_changed();
}

function addr_search() {
    var inp = document.getElementById("addr");

    // Get current language for localized search results
    var currentLang = currentLanguage || 'ca';

    // Search globally without viewbox restriction, with language preference
    $.getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=' + currentLang + '&q=' + encodeURIComponent(inp.value), function(data) {
        var items = [];

        $.each(data, function(key, val) {
            bb = val.boundingbox;
            var locationType = getLocationType(val.display_name, val.osm_type, val.class);
            var typeTranslation = getTranslation('location_type_' + locationType);
            // Use data attributes to avoid onclick escaping issues
            var dataAttrs = 'data-lat1="' + bb[0] + '" data-lng1="' + bb[2] + '" data-lat2="' + bb[1] + '" data-lng2="' + bb[3] + '" data-osm-type="' + val.osm_type + '" data-display-name="' + val.display_name.replace(/"/g, '"').replace(/'/g, '&#39;') + '" data-class="' + (val.class || '') + '" data-osm-id="' + (val.osm_id || 0) + '" data-osm-type-full="' + (val.osm_type || '') + '"';
            items.push("<li class='fa fa-dot-circle-o' style='padding:5px;'> <a href='#' class='search-result' " + dataAttrs + ">" + val.display_name + ' <small>(' + typeTranslation + ')</small></a></li>');
        });

		$('#results').empty();
        if (items.length != 0) {
            $('<p>', { html: getTranslation('search_results') }).appendTo('#results');
            $('<ul/>', {
                'class': 'my-new-list',
                html: items.join('')
            }).appendTo('#results');
	    $('<p>', { html: getTranslation('search_select') }).appendTo('#results');
        } else {
            $('<p>', { html: getTranslation('search_no_results') }).appendTo('#results');
        }
    });
}

// Function to load external HTML content for train tab
function loadTrainContent() {
    const trainPane = document.getElementById('train');

    // Check if content is already loaded
    if (trainPane.querySelector('.close-button')) {
        return; // Content already loaded
    }

    // Load the train.html content
    fetch('train.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load train.html');
            }
            return response.text();
        })
        .then(html => {
            // Extract the sidebar-pane content from the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const trainContent = doc.querySelector('#train');

            if (trainContent) {
                // Clear existing content and add new content
                trainPane.innerHTML = trainContent.innerHTML;

                // Update language for the new content
                updateLanguage();

                console.log('Train content loaded successfully');
            } else {
                console.error('Could not find #train content in train.html');
                trainPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading train content</h1>';
            }
        })
        .catch(error => {
            console.error('Error loading train content:', error);
            trainPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading train content</h1><p>' + error.message + '</p>';
        });
}

// Function to load external HTML content for FGC tab
function loadFgcContent() {
    const fgcPane = document.getElementById('fgc');

    // Check if content is already loaded (look for the specific FGC title)
    if (fgcPane.querySelector('h1[data-i18n="fgc_title"]')) {
        return; // Content already loaded
    }

    // Load the fgc.html content
    fetch('fgc.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load fgc.html');
            }
            return response.text();
        })
        .then(html => {
            // Extract the sidebar-pane content from the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const fgcContent = doc.querySelector('#fgc');

            if (fgcContent) {
                // Clear existing content and add new content
                fgcPane.innerHTML = fgcContent.innerHTML;

                // Update language for the new content
                updateLanguage();

                console.log('FGC content loaded successfully');
            } else {
                console.error('Could not find #fgc content in fgc.html');
                fgcPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading FGC content</h1>';
            }
        })
        .catch(error => {
            console.error('Error loading FGC content:', error);
            fgcPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading FGC content</h1><p>' + error.message + '</p>';
        });
}

// Function to load external HTML content for Bus tab
function loadBusContent() {
    const busPane = document.getElementById('bus');

    // Check if content is already loaded (look for the specific Bus title)
    if (busPane.querySelector('h1')) {
        return; // Content already loaded
    }

    // Load the bus.html content
    fetch('bus.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load bus.html');
            }
            return response.text();
        })
        .then(html => {
            // Extract the sidebar-pane content from the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const busContent = doc.querySelector('#bus');

            if (busContent) {
                // Clear existing content and add new content
                busPane.innerHTML = busContent.innerHTML;

                // Update language for the new content
                updateLanguage();

                console.log('Bus content loaded successfully');
            } else {
                console.error('Could not find #bus content in bus.html');
                busPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading Bus content</h1>';
            }
        })
        .catch(error => {
            console.error('Error loading Bus content:', error);
            busPane.innerHTML = '<div class="close-button"><span class="fa fa-close" onclick="javascript: sidebar.close()"></span></div><h1>Error loading Bus content</h1><p>' + error.message + '</p>';
        });
}

// Initialize train, FGC, and Bus content loading when tabs are clicked
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener to train tab
    const trainTab = document.querySelector('a[href="#train"]');
    if (trainTab) {
        trainTab.addEventListener('click', function(e) {
            // Load train content after a short delay to ensure tab is active
            setTimeout(loadTrainContent, 100);
        });
    }

    // Add event listener to FGC tab
    const fgcTab = document.querySelector('a[href="#fgc"]');
    if (fgcTab) {
        fgcTab.addEventListener('click', function(e) {
            // Load FGC content after a short delay to ensure tab is active
            setTimeout(loadFgcContent, 100);
        });
    }

    // Add event listener to Bus tab
    const busTab = document.querySelector('a[href="#bus"]');
    if (busTab) {
        busTab.addEventListener('click', function(e) {
            // Load Bus content after a short delay to ensure tab is active
            setTimeout(loadBusContent, 100);
        });
    }

    // Pre-load FGC content to ensure it's available immediately
    setTimeout(function() {
        const fgcPane = document.getElementById('fgc');
        if (fgcPane && !fgcPane.querySelector('h1[data-i18n="fgc_title"]')) {
            loadFgcContent();
        }
    }, 500);

    // Initialize language
    const savedLang = localStorage.getItem('language') || 'ca';
    setLanguage(savedLang);
});

// Global search functions

var feature3

function chooseAddr2(lat1, lng1, lat2, lng2, osm_type) {
	var loc1 = new L.LatLng(lat1, lng1);
	var loc2 = new L.LatLng(lat2, lng2);
	var bounds = new L.LatLngBounds(loc1, loc2);

	if (feature3) {
		map.removeLayer(feature3);
	}

	// Update base location for global search too
	baseLocation = {
	    name: "Àrea seleccionada",
	    type: "area",
	    lat: (lat1 + lat2) / 2,
	    lng: (lng1 + lng2) / 2,
	    bounds: bounds,
	    osm_id: null,
	    osm_type: null
	};

	// Update routes for new location
	if (typeof updateRoutesForNewLocation === 'function') {
		updateRoutesForNewLocation();
	}

	if (osm_type == "node") {
		feature3 = L.circle( loc1, 15, {color: 'blue', fill: false}).addTo(map);
		map.fitBounds(bounds);
		map.setZoom(19);
		sidebar.close();
	} else {
		var loc3 = new L.LatLng(lat1, lng2);
		var loc4 = new L.LatLng(lat2, lng1);
		feature3 = L.polyline( [loc1, loc4, loc2, loc3, loc1], {color: 'blue'}).addTo(map);
		map.fitBounds(bounds);
		sidebar.close();
	}
}

function addr_search2() {
    var inp = document.getElementById("addr2");

    // Get current language for localized search results
    var currentLang = currentLanguage || 'ca';

    $.getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=10&accept-language=' + currentLang + '&q=' + encodeURIComponent(inp.value), function(data) {
        var items = [];

        $.each(data, function(key, val) {
            bb = val.boundingbox;
            // Use data attributes to avoid onclick escaping issues
            var dataAttrs = 'data-lat1="' + bb[0] + '" data-lng1="' + bb[2] + '" data-lat2="' + bb[1] + '" data-lng2="' + bb[3] + '" data-osm-type="' + val.osm_type + '"';
            items.push("<li class='fa fa-dot-circle-o' style='padding:5px;'> <a href='#' class='search-result-global' " + dataAttrs + ">" + val.display_name + '</a></li>');
        });

		$('#results2').empty();
        if (items.length != 0) {
            $('<p>', { html: getTranslation('search_results') }).appendTo('#results2');
            $('<ul/>', {
                'class': 'my-new-list',
                html: items.join('')
            }).appendTo('#results2');
	    $('<p>', { html: getTranslation('search_select') }).appendTo('#results2');
        } else {
            $('<p>', { html: getTranslation('search_no_results') }).appendTo('#results2');
        }
    });
}

function clear_layer2()
	{
		var inp = document.getElementById("addr");
		$('#results').empty();
		$('<p>', { html: " " }).appendTo('#results');
	if (feature2) {
		map.removeLayer(feature2);
	}

}

function clear_layer3()
	{
		var inp = document.getElementById("addr2");
		$('#results2').empty();
		$('<p>', { html: " " }).appendTo('#results2');
	if (feature3) {
		map.removeLayer(feature3);
	}
}

// Mapillary functions
function clear_layer()
{
	for (id in mapillaryLayer._layers){
		mapillaryLayer.removeLayer(id);
	}
}

function refreshMapillary() {
    // Use base location bounds instead of current map view
    var bounds = baseLocation.bounds || map.getBounds();

 $.ajax({

    dataType: "json",
    url: "http://api.mapillary.com/v1/im/search?",
             url: "http://api.mapillary.com/v1/im/search?",
            data: {
                'max-results': 10,
                'geojson': true,
                'min-lat': bounds.getSouth(),
                'max-lat': bounds.getNorth(),
                'min-lon': bounds.getWest(),
                'max-lon': bounds.getEast()
            },
            success: function(data) {
                    clear_layer();
                $(data.features).each(function(key, data) {
                    console.log('data',data);
                    mapillaryLayer.addData(data);
		    sidebar.close()
                });
            }
    });
}

// OSM notes
function addnotes() {
notesLayer.addTo(map);
}

function clearnotes()
{
	for (id in notesLayer._layers){
		notesLayer.removeLayer(id);
	}
}

var url = 'assets/gpx/track001.gpx'; // URL to your GPX file

function addgpx() {
el = L.control.elevation();
	el.addTo(map);
g = new L.GPX(url, {
	async: true,
	marker_options: {
	startIconUrl: 'assets/img/pin-icon-start.png',
	endIconUrl: 'assets/img/pin-icon-end.png',
	shadowUrl: 'assets/img/pin-shadow.png'
	}
	});
	g.on('loaded', function(e) {
		map.fitBounds(e.target.getBounds());
	info.textContent = 'Informació de la ruta:';
	nom.textContent = g.get_name();
	desc.textContent = g.get_desc();
	lev.textContent = 'Dificultat: ' + g.get_level();
	distance.textContent = 'Distància: ' + (g.get_distance() / 1000).toFixed(2) + ' Km';
	alt.textContent = 'Guany d\'alçada acumulat: ' + g.get_elevation_gain().toFixed(0) + ' metres';
	baix.textContent = 'Pèrdua d\'alçada acumulada: ' + g.get_elevation_loss().toFixed(0) + ' metres';
	desni.textContent = 'Diferencial, desnivell: ' + (g.get_elevation_gain() - g.get_elevation_loss()).toFixed(0) + ' metres';
	});
	g.on("addline",function(e){
		el.addData(e.line);
	});
	g.addTo(map);
	tileLayers['A l\'aire lliure'].addTo(map);
	sidebar.close()
}


function cleargpx() {
	map.removeLayer(g);
	el.clear();
	el.removeFrom(map);
	info.textContent = '';
	nom.textContent = '';
	desc.textContent = '';
	lev.textContent = '';
	distance.textContent = '';
	alt.textContent = '';
	baix.textContent = '';
	desni.textContent = '';
	document.getElementById("link").innerHTML="";
}

// Handle clicks on local search results using data attributes
$(document).on('click', '.search-result', function(e) {
    e.preventDefault();
    var $this = $(this);
    var lat1 = parseFloat($this.data('lat1'));
    var lng1 = parseFloat($this.data('lng1'));
    var lat2 = parseFloat($this.data('lat2'));
    var lng2 = parseFloat($this.data('lng2'));
    var osm_type = $this.data('osm-type');
    var display_name = $this.data('display-name');
    var class_type = $this.data('class');
    var osm_id = parseInt($this.data('osm-id')) || 0;
    var osm_type_full = $this.data('osm-type-full');

    chooseAddr(lat1, lng1, lat2, lng2, osm_type, display_name, class_type, osm_id, osm_type_full);
    return false;
});

// Handle clicks on global search results using data attributes
$(document).on('click', '.search-result-global', function(e) {
    e.preventDefault();
    var $this = $(this);
    var lat1 = parseFloat($this.data('lat1'));
    var lng1 = parseFloat($this.data('lng1'));
    var lat2 = parseFloat($this.data('lat2'));
    var lng2 = parseFloat($this.data('lng2'));
    var osm_type = $this.data('osm-type');

    chooseAddr2(lat1, lng1, lat2, lng2, osm_type);
    return false;
});

expert_mode_init();
updateQueryButton(); // Initialize button states

// Map click handler for setting route points (only when routing tab is active)
if (typeof map !== 'undefined' && map && typeof map.on === 'function') {
    map.on('click', function(e) {
        // Only handle clicks if the routing tab is active
        if (document.querySelector('#parking').classList.contains('active')) {
            if (!routeStartPoint) {
                routeStartPoint = [e.latlng.lng, e.latlng.lat];
                document.getElementById('route-start').value = e.latlng.lat.toFixed(6) + ', ' + e.latlng.lng.toFixed(6);

                // Add temporary marker
                var tempMarker = L.marker(e.latlng, {
                    icon: L.icon({
                        iconUrl: 'assets/img/pin-icon-start.png',
                        iconSize: [32, 37],
                        iconAnchor: [18.5, 35]
                    })
                }).addTo(map).bindPopup('Origen (fes clic per canviar)');
                routeMarkers.push(tempMarker);

            } else if (!routeEndPoint) {
                routeEndPoint = [e.latlng.lng, e.latlng.lat];
                document.getElementById('route-end').value = e.latlng.lat.toFixed(6) + ', ' + e.latlng.lng.toFixed(6);

                // Add temporary marker
                var tempMarker = L.marker(e.latlng, {
                    icon: L.icon({
                        iconUrl: 'assets/img/pin-icon-end.png',
                        iconSize: [32, 37],
                        iconAnchor: [18.5, 35]
                    })
                }).addTo(map).bindPopup('Destí (fes clic per canviar)');
                routeMarkers.push(tempMarker);
            }
        }
    });
}
