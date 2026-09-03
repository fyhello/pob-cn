import { spawn as spawnChild } from 'node:child_process';

function errorFromExit(code, signal, stderr = '') {
  const detail = stderr.trim();
  return new Error(`PoB bridge process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})${detail ? `: ${detail}` : ''}`);
}

export class PoBCoreEngine {
  constructor({ command, args = [], cwd, env = process.env, spawn = spawnChild, startupTimeoutMs = 15_000, requestTimeoutMs = 15_000 } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.spawn = spawn;
    this.startupTimeoutMs = startupTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.pending = [];
    this.buffer = '';
    this.ready = false;
    this.startupStderr = '';
  }

  async start() {
    if (this.ready) return this;
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      let timer;
      const failStart = error => {
        clearTimeout(timer);
        this.starting = null;
        this.child = null;
        reject(error);
      };
      try {
        this.startupStderr = '';
        this.child = this.spawn(this.command, this.args, { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        failStart(error);
        return;
      }
      const child = this.child;
      timer = setTimeout(() => {
        if (!this.ready) {
          child.kill();
          failStart(new Error(`PoB bridge startup timed out after ${this.startupTimeoutMs}ms`));
        }
      }, this.startupTimeoutMs);
      child.stdout.on('data', chunk => this.#consume(chunk, () => {
        clearTimeout(timer);
        this.ready = true;
        this.starting = null;
        resolve(this);
      }));
      child.stderr.on('data', chunk => { this.startupStderr += chunk.toString(); });
      child.on('error', failStart);
      child.on('exit', (code, signal) => {
        const error = errorFromExit(code, signal, this.startupStderr);
        if (!this.ready) failStart(error);
        this.#reset(error);
      });
    });
    return this.starting;
  }

  request(message, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.ready || !this.child) throw new Error('PoB bridge is not ready');
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, timer: setTimeout(() => {
        this.pending = this.pending.filter(value => value !== pending);
        reject(new Error(`PoB bridge request timed out after ${timeoutMs}ms`));
      }, timeoutMs) };
      this.pending.push(pending);
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  async close() {
    const child = this.child;
    if (!child) return;
    this.ready = false;
    child.stdin.write('exit\n');
    child.kill();
  }

  #consume(chunk, onReady) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    for (const rawLine of lines) {
      if (!rawLine.startsWith('POB_JSON:')) continue;
      let message;
      try {
        message = JSON.parse(rawLine.slice('POB_JSON:'.length));
      } catch {
        continue;
      }
      if (message.event === 'ready') {
        onReady();
        continue;
      }
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(message);
      }
    }
  }

  #reset(error) {
    this.ready = false;
    this.child = null;
    this.buffer = '';
    for (const pending of this.pending.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}
