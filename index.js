// CheckSocks5 Vercel Function 入口（Node 22 移植）
// 原版依赖 cloudflare:sockets 的 connect，这里用 node:net / node:tls 实现同接口注入
// 注意：inject-connect 必须作为第一个 import（先求值），_worker.js 在模块顶层读取 globalThis.__cfConnect
import './inject-connect.js';
import http from 'node:http';
import worker from '../_worker.js';

function reqToRequest(req, bodyBuf) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  const init = { method: req.method, headers };
  if (bodyBuf && bodyBuf.length) init.body = bodyBuf;
  const request = new Request(url, init);
  request.cf = { colo: 'NRT', asn: 0, asOrganization: '', city: '', country: '' };
  return request;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const bodyBuf = await readBody(req);
    const request = reqToRequest(req, bodyBuf);
    const response = await worker.fetch(request, {}, {});
    const headers = {};
    for (const [k, v] of response.headers) headers[k] = v;
    res.writeHead(response.status, response.statusText || '', headers);
    if (response.body) {
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    } else {
      res.end();
    }
  } catch (e) {
    console.error('[http error]', e);
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    } catch (_) {}
  }
});

// 本地直接运行（node api/index.js）时监听端口；Vercel 环境由平台调用导出 server
import { pathToFileURL } from 'node:url';
const isMainRun = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch (e) { return false; }
})();
if (isMainRun) {
  const port = Number(process.env.PORT) || 8080;
  server.listen(port, () => console.log('checksocks5 listening on', port));
}

export default server;
