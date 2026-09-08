import { spawn as spawnChild } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

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
    this.decoder = new StringDecoder('utf8');
    this.ready = false;
    this.startupStderr = '';
  }

  async start() {
    if (this.ready) return this;
    if (this.starting) return this.starting;
    const starting = new Promise((resolve, reject) => {
      let timer;
      const failStart = error => {
        clearTimeout(timer);
        if (this.startFailure === failStart) this.startFailure = null;
        reject(error);
      };
      this.startFailure = failStart;
      try {
        this.startupStderr = '';
        this.child = this.spawn(this.command, this.args, { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch (error) {
        failStart(error);
        return;
      }
      const child = this.child;
      this.exited = new Promise(resolve => { child.once('exit', resolve); child.once('close', resolve); });
      timer = setTimeout(() => {
        if (!this.ready) {
          this.#reset(new Error(`PoB bridge startup timed out after ${this.startupTimeoutMs}ms`));
          child.kill();
        }
      }, this.startupTimeoutMs);
      child.stdout.on('data', chunk => {
        if (this.child !== child) return;
        this.#consume(chunk, message => {
          if (message.calculator?.available === false) {
            this.#reset(new Error(message.calculator.error?.message ?? 'PoB core initialization failed'));
            child.kill();
            return;
          }
          clearTimeout(timer);
          this.startFailure = null;
          this.ready = true;
          resolve(this);
        });
      });
      child.stderr.on('data', chunk => { this.startupStderr = (this.startupStderr + chunk.toString()).slice(-8192); });
      if (typeof child.stdin.on === 'function') child.stdin.on('error', error => {
        if (this.child !== child) return;
        this.#reset(error);
        child.kill();
      });
      child.on('error', error => {
        if (this.child !== child) return;
        this.#reset(error);
        child.kill();
      });
      child.on('exit', (code, signal) => {
        if (this.child !== child) return;
        const error = errorFromExit(code, signal, this.startupStderr);
        this.#reset(error);
      });
    });
    this.starting = starting;
    try { return await starting; }
    finally { if (this.starting === starting) this.starting = null; }
  }

  request(message, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.ready || !this.child) throw new Error('PoB bridge is not ready');
    return new Promise((resolve, reject) => {
      let payload;
      try {
        payload = `${JSON.stringify(message)}\n`;
      } catch (error) {
        reject(error);
        return;
      }
      const pending = {
        resolve,
        reject,
        timer: null,
      };
      pending.timer = setTimeout(() => {
        // FIFO 协议无法跳过迟到响应；超时后整个进程的状态都不再可信。
        const child = this.child;
        this.#reset(new Error(`PoB bridge request timed out after ${timeoutMs}ms`));
        child?.kill();
      }, timeoutMs);
      this.pending.push(pending);
      try {
        this.child.stdin.write(payload);
      } catch (error) {
        clearTimeout(pending.timer);
        this.pending = this.pending.filter(value => value !== pending);
        reject(error);
      }
    });
  }

  async close() {
    const child = this.child;
    if (child) {
      this.#reset(new Error('PoB bridge closed'));
      child.kill();
    }
    if (!this.exited) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PoB bridge did not exit')), 5000);
      this.exited.then(() => { clearTimeout(timer); resolve(); });
    });
  }

  #consume(chunk, onReady) {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    for (const rawLine of lines) {
      if (!rawLine.startsWith('POB_JSON:')) continue;
      let message;
      try {
        message = JSON.parse(rawLine.slice('POB_JSON:'.length));
      } catch {
        const child = this.child;
        this.#reset(new Error('PoB bridge returned invalid JSON'));
        child?.kill();
        return;
      }
      if (message.event === 'ready') {
        onReady(message);
        continue;
      }
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timer);
        if (message.fatal) {
          const error = Object.assign(new Error(message.error?.message ?? 'PoB core state is uncertain'), { code: message.error?.code });
          pending.reject(error);
          const child = this.child;
          this.#reset(error);
          child?.kill();
          return;
        }
        pending.resolve(message);
      }
    }
  }

  #reset(error) {
    this.startFailure?.(error);
    this.ready = false;
    this.starting = null;
    this.child = null;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');
    for (const pending of this.pending.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}
