import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { connect as connectTcp } from 'node:net';
import { EventEmitter } from 'node:events';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Connector } = require('../plugins/adoin.panel.anywhere/src/connector.js');

// Minimal loopback-only fixture, not a production WebSocket implementation.
function frame(text, mask = false) {
  const data = Buffer.from(text), long = data.length >= 126;
  const head = Buffer.alloc(long ? 4 : 2); head[0] = 0x81; head[1] = (mask ? 128 : 0) | (long ? 126 : data.length);
  if (long) head.writeUInt16BE(data.length, 2);
  if (!mask) return Buffer.concat([head, data]);
  const key = randomBytes(4), encoded = Buffer.from(data);
  for (let i = 0; i < encoded.length; i++) encoded[i] ^= key[i % 4];
  return Buffer.concat([head, key, encoded]);
}
function frames(onText) {
  let pending = Buffer.alloc(0);
  return chunk => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (pending.length < 2) return;
      const masked = (pending[1] & 128) !== 0;
      let size = pending[1] & 127, offset = 2;
      if (size === 126) { if (pending.length < 4) return; size = pending.readUInt16BE(2); offset = 4; }
      assert.notEqual(size, 127, 'fixture payload limit');
      const start = offset + (masked ? 4 : 0);
      if (pending.length < start + size) return;
      const data = Buffer.from(pending.subarray(start, start + size));
      if (masked) for (let i = 0; i < size; i++) data[i] ^= pending[offset + i % 4];
      pending = pending.subarray(start + size); onText(data.toString());
    }
  };
}

test('loopback HTTP/WS transport authenticates and exchanges current runtime lifecycle frames', { timeout: 10000 }, async t => {
  const longSecret = randomUUID(), accessSecret = randomUUID(), events = new EventEmitter(), sockets = new Set();
  const transcript = []; let complete, reject;
  const done = new Promise((resolve, fail) => { complete = resolve; reject = fail; });
  // Register rejection handling before opening the socket.
  done.catch(() => {});
  const server = createServer((req, res) => {
    try {
      assert.equal(req.url, '/api/v2/connector/auth'); assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, `Connector conn_fixture:${longSecret}`);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ accessToken: accessSecret, expiresIn: 900 }));
    } catch (error) { res.writeHead(400); res.end(); reject(error); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket) => {
    try {
      assert.equal(req.url, '/api/v2/connector/ws'); assert.equal(req.headers.authorization, `Bearer ${accessSecret}`); assert.equal(req.headers['x-device-os'], 'windows');
      const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      const request = (id, method, params) => socket.write(frame(JSON.stringify({ type: 'request', id, method, params })));
      socket.on('data', frames(text => {
        try {
          const message = JSON.parse(text); transcript.push(message); assert.equal(message.jsonrpc, undefined);
          if (message.type === 'notification') { assert.equal(message.method, 'connector.heartbeat'); return; }
          assert.equal(message.type, 'response'); assert.equal(message.ok, true);
          if (message.id === 'discovery') {
            assert.equal(message.result.runtimeTypes[0].runtimeType, 'pi');
            request('start', 'runtime.start', { runtime: 'pi', runtimeId: 'rti_loopback', name: 'Pi', config: {}, configRevision: Date.parse('2026-09-29T01:00:00Z') });
          } else if (message.id === 'start') {
            assert.equal(message.result.status, 'running');
            request('capabilities', 'runtime.capabilities', { runtime: 'pi', runtimeId: 'rti_loopback' });
          } else if (message.id === 'capabilities') {
            assert.ok(message.result.capabilitySet.capabilities.every(capability => !capability.supported)); complete();
          }
        } catch (error) { reject(error); }
      }));
      request('discovery', 'runtime.discover', {});
    } catch (error) { socket.destroy(); reject(error); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let tcp;
  const pi = { events, net: {
    getCapabilities: async () => ({ fetchRedirectModes: ['error'] }),
    fetch: async input => { assert.equal(input.redirect, 'error'); const res = await fetch(input.url, { method: input.method, headers: input.headers, redirect: input.redirect }); return { status: res.status, bodyText: await res.text() }; },
    websocket: {
      connect: input => new Promise((resolve, fail) => {
        const url = new URL(input.url); assert.equal(url.hostname, '127.0.0.1');
        tcp = connectTcp({ host: '127.0.0.1', port }); let head = Buffer.alloc(0), upgraded = false;
        const read = frames(data => events.emit('net:websocket:message', { socketId: 'loopback', data }));
        tcp.on('error', fail);
        tcp.on('connect', () => tcp.write(`GET ${url.pathname} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nAuthorization: ${input.headers.Authorization}\r\nX-Device-OS: ${input.headers['X-Device-OS']}\r\n\r\n`));
        tcp.on('data', chunk => {
          if (upgraded) { read(chunk); return; }
          head = Buffer.concat([head, chunk]); const end = head.indexOf('\r\n\r\n'); if (end < 0) return;
          if (!head.toString().startsWith('HTTP/1.1 101')) { fail(new Error('Fixture upgrade failed')); return; }
          upgraded = true; resolve({ socketId: 'loopback' });
          // Deliberately deliver early data before connect() continuation runs.
          read(head.subarray(end + 4)); head = Buffer.alloc(0);
        });
      }),
      send: async input => { assert.equal(input.socketId, 'loopback'); tcp.write(frame(input.data, true)); },
      close: async () => tcp?.destroy(),
    },
  } };
  const client = new Connector(pi, { platform: 'win32' });
  t.after(async () => { client.disconnect(); tcp?.destroy(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  client.connect({ serverUrl: `http://127.0.0.1:${port}`, profile: 'current', connectorId: 'conn_fixture', connectorToken: longSecret });
  await done;
  assert.equal(client.state, 'online'); assert.equal(client.runtime.running, true);
  assert.equal(transcript.filter(message => message.type === 'response').length, 3);
  assert.ok(!JSON.stringify(client.status()).includes(longSecret)); assert.ok(!JSON.stringify(client.status()).includes(accessSecret));
});
