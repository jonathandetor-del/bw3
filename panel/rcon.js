'use strict';
const net = require('net');

class Rcon {
  constructor(host, port, password) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.connected = false;
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) return resolve();
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.connected = true;
        this._send(3, this.password).then(resolve).catch(reject);
      });
      this.socket.on('data', d => this._onData(d));
      this.socket.on('error', () => this._reset());
      this.socket.on('close', () => this._reset());
      setTimeout(() => {
        if (!this.connected) reject(new Error('RCON connect timeout'));
      }, 5000);
    });
  }

  _reset() {
    this.connected = false;
    for (const [, p] of this.pending) p.reject(new Error('Connection lost'));
    this.pending.clear();
    this.buffer = Buffer.alloc(0);
    this.socket = null;
  }

  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (len < 10 || this.buffer.length < 4 + len) break;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.slice(12, 2 + len).toString('utf8');
      this.buffer = this.buffer.slice(4 + len);
      if (id === -1) {
        for (const [, p] of this.pending) p.reject(new Error('RCON auth failed'));
        this.pending.clear();
      } else if (this.pending.has(id)) {
        const p = this.pending.get(id);
        this.pending.delete(id);
        p.resolve(body);
      }
    }
  }

  _send(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('No socket'));
      const id = this.nextId++;
      const buf = Buffer.from(payload, 'utf8');
      const len = 4 + 4 + buf.length + 2;
      const pkt = Buffer.alloc(4 + len);
      pkt.writeInt32LE(len, 0);
      pkt.writeInt32LE(id, 4);
      pkt.writeInt32LE(type, 8);
      buf.copy(pkt, 12);
      this.pending.set(id, { resolve, reject });
      this.socket.write(pkt);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('RCON timeout'));
        }
      }, 10000);
    });
  }

  async command(cmd) {
    if (!this.connected) {
      this.socket = null;
      await this.connect();
    }
    return this._send(2, cmd);
  }

  close() {
    if (this.socket) this.socket.destroy();
    this._reset();
  }
}

module.exports = Rcon;
