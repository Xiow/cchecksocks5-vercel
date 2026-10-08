// connect 兼容实现注入（必须在 import _worker.js 之前求值）
import net from 'node:net';
import tls from 'node:tls';

export function nodeConnect(options, extra) {
  const opts = Object.assign({}, options || {});
  if (extra) {
    if (extra.secureTransport === 'on') opts.secureTransport = 'on';
    if (extra.allowHalfOpen !== undefined) opts.allowHalfOpen = extra.allowHalfOpen;
  }
  const { hostname, port } = opts;
  const useTls = opts.tls || opts.secureTransport === 'on';
  let sock;
  const connOpts = { host: hostname, port };
  if (opts.allowHalfOpen !== undefined) connOpts.allowHalfOpen = opts.allowHalfOpen;
  if (useTls) {
    connOpts.servername = hostname;
    sock = tls.connect(connOpts);
  } else {
    sock = net.connect(connOpts);
  }
  let resolveOpened, rejectOpened, resolveClosed, rejectClosed;
  const opened = new Promise((res, rej) => { resolveOpened = res; rejectOpened = rej; });
  const closed = new Promise((res, rej) => { resolveClosed = res; rejectClosed = rej; });
  sock.on('connect', () => { try { resolveOpened(); } catch (e) {} });
  sock.on('secureConnect', () => { try { resolveOpened(); } catch (e) {} });
  sock.on('error', (e) => {
    try { rejectOpened(e); } catch (_) {}
    try { rejectClosed(e); } catch (_) {}
  });
  sock.on('close', () => { try { resolveClosed(); } catch (e) {} });
  const readable = new ReadableStream({
    start(controller) {
      sock.on('data', (chunk) => { try { controller.enqueue(new Uint8Array(chunk)); } catch (e) {} });
      sock.on('end', () => { try { controller.close(); } catch (e) {} });
      sock.on('close', () => { try { controller.close(); } catch (e) {} });
      sock.on('error', (e) => { try { controller.error(e); } catch (_) {} });
    },
    cancel() { try { sock.destroy(); } catch (e) {} }
  });
  const writable = new WritableStream({
    write(chunk) {
      return new Promise((res, rej) => {
        if (sock.destroyed) return rej(new Error('socket closed'));
        sock.write(Buffer.from(chunk), (err) => (err ? rej(err) : res()));
      });
    },
    close() { try { sock.end(); } catch (e) {} },
    abort() { try { sock.destroy(); } catch (e) {} }
  });
  return {
    opened, closed, readable, writable,
    close() { try { sock.destroy(); } catch (e) {} }
  };
}

globalThis.__cfConnect = nodeConnect;
