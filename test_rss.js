// Test script to fetch and display RSS feed format
const https = require('https');

https.get('https://www.gencat.cat/transit/rss/ca/', (response) => {
  let data = '';
  
  response.on('data', (chunk) => {
    data += chunk;
  });
  
  response.on('end', () => {
    console.log('RSS Feed Content:');
    console.log('='.repeat(80));
    console.log(data.substring(0, 3000)); // Show first 3000 characters
  });
}).on('error', (error) => {
  console.error('Error fetching RSS:', error.message);
});