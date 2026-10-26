// Minimal RFC 6455 WebSocket server on top of node:http — no dependencies.
// Supports text frames, ping/pong, close and fragmented messages. Payloads up to 1 MB.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX = 1 << 20;

export class Socket extends EventEmitter {
  constructor(sock) {
    super(); this.sock = sock; this.buf = Buffer.alloc(0); this.frag = []; this.open = true;
    sock.setNoDelay(true);
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._close());
    sock.on('error', () => this._close());
  }
  _close() { if (!this.open) return; this.open = false; this.emit('close'); }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1]; const fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX) { this.close(1009); return; }
      const need = off + (masked ? 4 : 0) + len; if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = this.buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._send(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.frag.push(payload);
        if (fin) { const msg = Buffer.concat(this.frag); this.frag = []; this.emit('message', msg.toString('utf8')); }
      }
    }
  }
  _send(op, data) {
    if (!this.open) return; const len = data.length; let head;
    if (len < 126) { head = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.sock.write(Buffer.concat([head, data]));
  }
  send(text) { this._send(0x1, Buffer.from(text, 'utf8')); }
  close(code = 1000) { if (!this.open) return; const b = Buffer.alloc(2); b.writeUInt16BE(code); this._send(0x8, b); this.sock.end(); this._close(); }
}

export function attach(server, path, onConnect) {
  server.on('upgrade', (req, sock) => {
    if (req.url.split('?')[0] !== path || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
    const key = req.headers['sec-websocket-key']; if (!key) { sock.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onConnect(new Socket(sock), req);
  });
}
