const http = require('http');

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'Caliber Milestone One',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ detail: 'Not Found' }));
});

server.listen(8003, '0.0.0.0', () => {
  console.log('Caliber Milestone One running on port 8003');
});
