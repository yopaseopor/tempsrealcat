# Temps Real Cat

A map application that shows real-time information about transports and traffic in Catalonia.

## Live Version
[https://yopaseopor.github.io/tempsrealcat/docs](https://yopaseopor.github.io/tempsrealcat/docs)

## Data Sources

This page details all the data sources used in Temps Real Cat to provide real-time information about transports and traffic in Catalonia.

### Legend
- **API**: Official API
- **RSS**: RSS Feed
- **XML**: XML Data
- **JSON**: JSON Data
- **GBFS**: Shared Bicycle System

### API Architecture
All data is accessed through a proxy API layer on Vercel to avoid CORS issues and allow access from the browser. The endpoints are available at:
[https://tempsrealcat.vercel.app/api/[service-name]](https://tempsrealcat.vercel.app/api/[service-name])

## Traffic
### DGT - Dirección General de Tráfico
**Type**: XML, DATEX2  
**Description**: Real-time traffic incident data from the Spanish DGT in DATEX2 format. Includes accidents, works, congestion, road closures, and other incidents.  
**URLs**:
- [https://infocar.dgt.es/datex2.xml](https://infocar.dgt.es/datex2.xml)
- [https://infocar.dgt.es/xml.xml](https://infocar.dgt.es/xml.xml)
- [https://www.dgt.es/incidencias/incidencias.xml](https://www.dgt.es/incidencias/incidencias.xml)
- [https://dgt.es/incidencias.xml](https://dgt.es/incidencias.xml)
**Update Frequency**: Real-time

### GENCAT - Generalitat de Catalunya (RSS)
**Type**: RSS, XML  
**Description**: RSS feed of traffic incidents from the Catalan Traffic Service. Provides updated information about incidents on Catalan roads.  
**URL**: [https://www.gencat.cat/transit/rss/ca/](https://www.gencat.cat/transit/rss/ca/)  
**Update Frequency**: Real-time

### GENCAT - Generalitat de Catalunya (GML)
**Type**: XML, GML  
**Description**: Geospatial traffic incident data in GML (Geography Markup Language) format from the Generalitat of Catalonia. Includes detailed information with geographic coordinates.  
**URL**: [https://intranet.gencat.cat/economia/coneixementai/governobert/dades_obertes/dades_obertes_informacio_transit.xml](https://intranet.gencat.cat/economia/coneixementai/governobert/dades_obertes/dades_obertes_informacio_transit.xml)  
**Update Frequency**: Real-time

## Railway Transport
### RENFE - Red Nacional de Ferrocarriles Españoles
**Type**: JSON, GTFS-RT  
**Description**: Real-time train position data from RENFE using the GTFS-Realtime protocol. Includes position and status information of railway services.  
**URL**: [https://gtfsrt.renfe.com/vehicle_positions.json](https://gtfsrt.renfe.com/vehicle_positions.json)  
**Update Frequency**: Real-time

### FGC - Ferrocarrils de la Generalitat de Catalunya
**Type**: JSON, API  
**Description**: FGC train positioning data through the FGC Open Data API. Provides updated information about the FGC train fleet.  
**URL**: [https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100](https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100)  
**Update Frequency**: Real-time

## Urban Transport
### TMB - Transports Metropolitans de Barcelona
**Type**: JSON, API  
**Description**: TMB bus service data through their iTransit API. Includes stop information, schedules, and waiting times.  
**URL**: [https://api.tmb.cat/v1/itransit/bus/parades/108](https://api.tmb.cat/v1/itransit/bus/parades/108)  
**Update Frequency**: Real-time

### TMB - Metro de Barcelona
**Type**: JSON, API  
**Description**: TMB metro station and line data. Provides information about the metro network and service status.  
**URL**: [https://api.tmb.cat/v1/itransit/metro/estacions](https://api.tmb.cat/v1/itransit/metro/estacions)  
**Update Frequency**: Periodic

## Fuel
### Ministerio para la Transición Ecológica - España
**Type**: JSON, API  
**Description**: Official fuel price data from Spanish service stations provided by the Ministry for the Ecological Transition and Demographic Challenge. Includes updated prices for gasoline 95, diesel, and other fuels.  
**URL**: [https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/](https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/)  
**Update Frequency**: Daily

### OpenStreetMap - Service Stations
**Type**: API, Overpass  
**Description**: Geographic data of service stations and charging points from OpenStreetMap obtained through the Overpass API. Provides information about location, available services, and fuel types.  
**URLs**:
- [https://overpass-api.de/api/interpreter](https://overpass-api.de/api/interpreter)
- [https://overpass.kumi.systems/api/interpreter](https://overpass.kumi.systems/api/interpreter)
- [https://overpass.osm.ch/api/interpreter](https://overpass.osm.ch/api/interpreter)
- [https://overpass.openstreetmap.fr/api/interpreter](https://overpass.openstreetmap.fr/api/interpreter)
**Update Frequency**: On demand

## Sustainable Mobility
### Bicing - Barcelona
**Type**: JSON, GBFS  
**Description**: Barcelona's Bicing shared bicycle system data using the GBFS (General Bikeshare Feed Specification) protocol. Includes station status, bike availability, and free spaces.  
**URL**: [https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_status](https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_status)  
**Update Frequency**: Real-time

## Geographic and Reference Data
### OpenStreetMap
**Type**: API, OSM  
**Description**: OpenStreetMap cartographic and POI (Points of Interest) data. Used for geocoding and base map visualization.  
**URLs**:
- [https://www.openstreetmap.org/](https://www.openstreetmap.org/)
- [https://nominatim.openstreetmap.org/](https://nominatim.openstreetmap.org/)
- [https://overpass-api.de/](https://overpass-api.de/)
**Update Frequency**: Continuous

### Wikidata
**Type**: API, SPARQL  
**Description**: Structured data from Wikidata to obtain contextual information about locations, entities, and geographic relationships.  
**URLs**:
- [https://query.wikidata.org/sparql](https://query.wikidata.org/sparql)
- [https://www.wikidata.org/](https://www.wikidata.org/)
**Update Frequency**: Continuous

### GraphHopper
**Type**: API  
**Description**: Routing and route planning service used to calculate walking, cycling, and public transport routes.  
**URL**: [https://graphhopper.com/maps/](https://graphhopper.com/maps/)  
**Update Frequency**: Real-time

### Mobility Database
**Type**: API, GTFS  
**Description**: Global database of public transport GTFS datasets from around the world. Used to explore and download transport data.  
**URL**: [https://mobilitydatabase.org/](https://mobilitydatabase.org/)  
**Update Frequency**: Regular

## Map Layers
### OpenStreetMap Tiles
**Type**: Tiles  
**Description**: OpenStreetMap base map layers provided by various tile server services.  
**URLs**:
- [https://tile.openstreetmap.org/](https://tile.openstreetmap.org/)
- [https://tile.openstreetmap.fr/hot/](https://tile.openstreetmap.fr/hot/)
- [https://tile.thunderforest.com/](https://tile.thunderforest.com/)
**Update Frequency**: Regular

### MapBox Satellite
**Type**: Tiles  
**Description**: High-resolution satellite map layers provided by MapBox.  
**URL**: [https://api.mapbox.com/v4/mapbox.satellite/](https://api.mapbox.com/v4/mapbox.satellite/)  
**Update Frequency**: Regular

## Development and Infrastructure
### Vercel Platform
**Type**: Platform  
**Description**: Hosting and serverless functions platform used to deploy the proxy API and web application.  
**URL**: [https://vercel.com/](https://vercel.com/)  
**Update Frequency**: Continuous

### GitHub Pages
**Type**: Hosting  
**Description**: Static hosting service used for the main version of the application.  
**URL**: [https://yopaseopor.github.io/tempsrealcat/docs](https://yopaseopor.github.io/tempsrealcat/docs)  
**Update Frequency**: On deployments

## Privacy and Security
- All API calls are made through a proxy to avoid exposing API keys
- No personal data is collected from users
- Location data is only processed locally in the browser
- External API requests have limits to avoid overload

## Update Frequency
- **Traffic**: Real-time (every 30-60 seconds)
- **Trains**: Real-time (every 30-60 seconds)
- **Buses/Metro**: Real-time (every 30-60 seconds)
- **Bicing**: Real-time (every 60 seconds)
- **Geographic data**: On demand

This information is updated according to the availability of external data sources.

## About Temps Real Cat

### About the Project
This is a map of our city created from a project of the non-profit association [la Konfraria de la Vila del Pingüí de la Palma (de Cervelló)](https://www.konfraria.org), which has also actively participated in the [OSM in Catalan](https://wiki.openstreetmap.org/wiki/WikiProject_Catalan) group and in the incorporation of data to the map of Palma de Cervelló in the [OpenStreetMap](https://www.openstreetmap.org/) project.

You will find a summary of the most relevant activities on [KonfrareAlbert's user page](https://wiki.openstreetmap.org/wiki/User:KonfrareAlbert), and also information about the cadastre import on the [Palma de Cervelló page on the OSM wiki](https://wiki.openstreetmap.org/wiki/Palma_de_Cervell%C3%B3). You will find more information about the Konfraria, and our contact at [this link](https://www.lapalmadecervello.cat/entitats/cultura/la-konfraria-de-la-vila-del-pingui).

### Project Code
**Project code**: [OpenLocalMap](https://github.com/osm-catalan/openlocalmap) (GPL license) on GitHub.

This website is a [fork](https://ca.wikipedia.org/wiki/Fork) of the **osm-pois** project by **Manuel Kaufmann**, from which we have taken most of the code ([POIs](https://upoi.org) on Humitos' blog, osm-pois code on [GitHub](https://github.com/humitos/osm-pois) with [GPL](https://www.gnu.org/licenses/gpl-2.0.html) license, Twitter: [@reydelhumo](https://twitter.com/reydelhumo)).

## Tools Used

### JavaScript Libraries
- [Leafletjs](https://leafletjs.com/) © Vladimir Agafonkin
- [Leaflet.loading](https://github.com/ebrelsford/Leaflet.loading) © Eric Brelsford
- [L.control.sidebar](https://github.com/Turbo87/sidebar-v2/) © Tobias Bieniek
- [L.Control.Locate](https://www.mapbox.com/mapbox.js/plugins/#leaflet-locatecontrol) © Mapbox
- [Leaflet.RestoreView](https://github.com/makinacorpus/Leaflet.RestoreView) © Makina Corpus
- [L.OverPassLayer](https://github.com/kartenkarsten/leaflet-layer-overpass) © kartenkarsten
- [L.Hash](https://github.com/mlevans/leaflet-hash) © Michael Lawrence Evans
- [Leaflet.label](https://github.com/Leaflet/Leaflet.label) © Leaflet
- [Leaflet-osm-notes](https://github.com/osmlab/leaflet-osm-notes) © Tom MacWright
- [Leaflet.zoomhome](https://github.com/torfuspolymorphus/leaflet.zoomhome) © Torf
- [leaflet-easyPrint](https://github.com/rowanwins/leaflet-easyPrint) © Rowan Winsemius
- [leaflet-gpx](https://github.com/mpetazzoni/leaflet-gpx) © Maxime Petazzoni
- [Leaflet.elevation](https://github.com/MrMufflon/Leaflet.Elevation) © Felix Bache
- [opening_hours.js](https://github.com/ypid/opening_hours.js) © Robin Schneider
- [Font-Awesome](https://fortawesome.github.io/Font-Awesome/) © Dave Gandy
- [Map Icons](https://mapicons.nicolasmollet.com/) © Nicolas Mollet
- [jQuery](https://jquery.com) © The jQuery Foundation
- [URI.js](https://github.com/medialize/URI.js) © Medialize
- [Mustache](https://github.com/janl/mustache.js) © Jan Lehnardt
- [Mapillary](https://www.mapillary.com/) © Mapillary
- [Graphhopper](https://graphhopper.com/) © Graphhopper
- [OSRM (Open Source Routing Machine)](https://project-osrm.org/) © Project OSRM contributors

### Acknowledgments
We also want to thank **Konfrare Albert (who has allowed extreme customization of his tool)** ([@la_konfraria](https://twitter.com/la_konfraria)), **Xavier Barnada** ([@Xevib](https://twitter.com/Xevib)), and **Marco Antonio** ([@51114u9](https://twitter.com/51114u9)) for their help and contributions.

Finally, we want to emphasize that WE ARE NOT ASSOCIATED with the OPENSTREETMAP organization nor do we intend to use their brand.

Without these tools and help, this website would not function, to all of them, thank you very much.

## License
This project is distributed under the [GPL v2](https://www.gnu.org/licenses/gpl-2.0.html) license. You are free to use, modify, and distribute the code as long as you respect the terms of the license.