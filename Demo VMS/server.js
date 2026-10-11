const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (!error) {
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      response.end(content);
      return;
    }

    if (path.extname(pathname)) {
      response.writeHead(404).end('Not found');
      return;
    }

    fs.readFile(path.join(root, 'index.html'), (indexError, index) => {
      if (indexError) {
        response.writeHead(500).end('Application entry point unavailable');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentTypes['.html'] });
      response.end(index);
    });
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`VMS: http://127.0.0.1:${port}`);
});