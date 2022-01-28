const http = require('http');
const fs = require('fs');
const path = require('path');

const hostname = 'localhost';
const port = 3000;

const server = http.createServer((req, res) => {
    console.log('Request for ' + req.url + ' by method ' + req.method);

    if (req.method == 'GET') {
        var fileUrl;
        if (req.url == '/') fileUrl = 'index.html';
        else if (req.url == '/pageToBeCrawled.html') fileUrl = 'pageToBeCrawled.html';
        else fileUrl = '404.html';

        res.writeHead(200, { 'content-type': 'text/html' });
        fs.createReadStream(fileUrl).pipe(res);
    }

});


server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});