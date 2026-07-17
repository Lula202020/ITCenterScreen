const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const stateFilePath = path.join(dataDir, 'team-members.json');
const port = Number(process.env.PORT || 3000);

function ensureStateFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(stateFilePath)) {
    fs.writeFileSync(stateFilePath, JSON.stringify({ members: [] }, null, 2), 'utf8');
  }
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    const members = Array.isArray(parsed.members) ? parsed.members : [];
    return {
      members: members.filter((member) => member && typeof member.id === 'string' && typeof member.name === 'string' && typeof member.categoryId === 'string')
        .map((member) => ({
          id: member.id,
          name: member.name,
          categoryId: member.categoryId,
          returnDate: typeof member.returnDate === 'string' ? member.returnDate : null,
          isArchived: member.isArchived === true,
          archivedAt: typeof member.archivedAt === 'string' ? member.archivedAt : null
        }))
    };
  } catch {
    return { members: [] };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };

  const contentType = contentTypeMap[extension] || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  response.end(fs.readFileSync(filePath));
}

ensureStateFile();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/state') {
    if (request.method === 'GET') {
      sendJson(response, 200, readState());
      return;
    }

    if (request.method === 'PUT') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const members = Array.isArray(parsed.members) ? parsed.members : [];
          const normalized = {
            members: members
              .filter((member) => member && typeof member.id === 'string' && typeof member.name === 'string' && typeof member.categoryId === 'string')
              .map((member) => ({
                id: member.id,
                name: member.name,
                categoryId: member.categoryId,
                returnDate: typeof member.returnDate === 'string' ? member.returnDate : null,
                isArchived: member.isArchived === true,
                archivedAt: typeof member.archivedAt === 'string' ? member.archivedAt : null
              }))
          };

          writeState(normalized);
          sendJson(response, 200, { ok: true });
        } catch (error) {
          sendJson(response, 400, { ok: false, error: 'Invalid JSON payload' });
        }
      });
      return;
    }

    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, () => {
  console.log(`Team Planner server running at http://localhost:${port}`);
});
