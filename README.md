# Local OpenStreetMap: OpenLocalMap (OLM)

More customized Local OSM map showing multiple data with leaflet plugins.

## Live version!

http://osm-catalan.github.io/openlocalmap

## Attribution

### Forked from:

 - http://www.konfraria.org/osm/cerca/web
 - https://upoi.org (Humitos)

### Strongly based on :
 - http://unterkunftskarte.de/
 - http://osm24.eu/
 - https://github.com/simon04/POImap/
 
### Working on:
 
 - La Palma de Cervelló (Catalonia/Spain) 
 http://www.konfraria.org/osm/cerca/web
 - Vilanova i la Geltrú (Catalonia/Spain) 
 http://yopaseopor.github.io/olm-vng
 
## Instructions (Spanish)
 
 -http://yopaseopor.blogspot.com.es/2018/01/yorenderizo-openlocalmap-osm-en-tu.html
 
 ## Languages

 To translate OpenLocalmap in your language replace index.html with index_xx (your language).html

## Node.js Server Setup

To run the application locally using Node.js:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000`

For development with auto-reload:
```bash
npm run dev
```

The server serves the static files from the `docs/` directory and includes API proxies for RENFE and FGC real-time train data.

### RENFE Real-Time Train Integration

The application now includes real-time RENFE train visualization:

- **Automatic Mode**: Click "▶️ Iniciar Visualització de Trens" to fetch live train positions every 30 seconds
- **Manual Mode**: Use the manual data entry to paste JSON data directly from RENFE's API
- **Legend**: Toggle route legend to see train counts by RENFE núcleos (hubs)

The Node.js server provides a CORS proxy at `/api/renfe-trains` to fetch data from RENFE's GTFS-RT API.

### FGC Real-Time Train Integration

Similar functionality is available for FGC (Ferrocarrils de la Generalitat de Catalunya) trains:

- **Automatic Mode**: Fetches data from FGC's open data portal
- **Manual Mode**: Manual JSON data entry option
- **Legend**: Shows trains grouped by service type (Metro del Vallès, Barcelona-Vallès, etc.)

## Deployment to GitHub Pages

The application is automatically deployed to GitHub Pages using GitHub Actions with Node.js.

**Live Demo with RENFE Real-Time Trains**: https://yopaseopor.github.io/openlocalmap2

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Set Source to "Deploy from a branch"
   - Set Branch to "gh-pages" and folder to "/ (root)"

2. **Automatic deployment**: On every push to the `main` branch, the workflow runs Node.js to install dependencies and deploy the `docs/` folder to GitHub Pages.

3. The live version will be available at: `https://{username}.github.io/{repository-name}`

To deploy manually (if needed):
```bash
npm run deploy
```

This uses the `gh-pages` package to publish the static files to the `gh-pages` branch, which GitHub Pages serves.
