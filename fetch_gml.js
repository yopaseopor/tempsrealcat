const axios = require('axios');
const fs = require('fs');

async function fetchGML() {
    const url = 'https://www.gencat.cat/transit/opendata/incidenciesGML.xml';
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            responseType: 'text'
        });
        
        console.log(`Fetched ${response.data.length} characters`);
        
        // Write to file
        fs.writeFileSync('incidenciesGML.xml', response.data, 'utf8');
        console.log('GML data written to incidenciesGML.xml');
    } catch (error) {
        console.error('Error:', error);
    }
}

fetchGML();