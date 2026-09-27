// Ruter /auth/v1 til Supabase Auth og /rest/v1 til PostgREST, slik Supabase sitt API-lag gjør.
import http from 'node:http';

const routes = [
  ['/auth/v1', 9999],
  ['/rest/v1', 3000],
];

http
  .createServer((req, res) => {
    const cors = {
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-expose-headers': 'content-range, x-supabase-api-version',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const route = routes.find(([p]) => req.url.startsWith(p));
    if (!route) {
      res.writeHead(404, cors);
      return res.end();
    }
    const upstream = http.request(
      { host: '127.0.0.1', port: route[1], path: req.url.slice(route[0].length) || '/', method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, cors);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(54321, '127.0.0.1');
