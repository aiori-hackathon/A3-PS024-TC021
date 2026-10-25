import http from 'node:http';
import { PORTS } from '../common/contract';

http
  .createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: PORTS.gateway, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  })
  .listen(PORTS.proxy, () => console.log('shared proxy on ' + PORTS.proxy));
