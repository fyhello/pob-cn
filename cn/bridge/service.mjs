import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { startBridge } from './start.mjs';
import { createBridgeHttpServer } from './http-server.mjs';
import { BuildSessions } from './build-sessions.mjs';
import { LibraryStore } from './library-store.mjs';

const root = resolve(import.meta.dirname, '../..');
const runtime = process.env.POB_CN_LUAJIT ?? resolve(root, 'Builds', 'luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');
if (!existsSync(runtime)) throw new Error(`PoB LuaJIT runtime is missing: ${runtime}. Build or install it inside this project; legacy project paths are not supported.`);
const runtimeLuaPath = '../runtime/lua/?.lua;../runtime/lua/?/init.lua';
const luaPath = process.env.LUA_PATH ? `${runtimeLuaPath};${process.env.LUA_PATH}` : `${runtimeLuaPath};;`;
const libraryDirectory = process.env.POB_CN_DATA_DIR ?? resolve(process.env.LOCALAPPDATA ?? homedir(), 'PoB-CN', 'library');
const library = await new LibraryStore(libraryDirectory).start();
const sessions = new BuildSessions({ createEngine: async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pob-cn-core-'));
  await mkdir(resolve(directory, 'Builds'));
  await mkdir(resolve(directory, 'files'));
  try {
    const engine = await startBridge(root, { command: runtime, args: [resolve(root, 'cn/bridge/calc_server.lua')], cwd: resolve(root, 'src'), env: { ...process.env, LUA_PATH: luaPath, POB_CN_SESSION_DIR: directory } });
    const close = engine.close.bind(engine);
    engine.close = async () => {
      await close();
      await rm(directory, { recursive: true, force: true });
    };
    return engine;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
} });
const server = createBridgeHttpServer(sessions, { library });
const port = Number(process.env.POB_CN_PORT ?? 3002);
server.listen(port, '127.0.0.1', () => process.stdout.write(`PoB CN bridge listening on 127.0.0.1:${port}\n`));
let stopping;
async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    server.close();
    await sessions.shutdown();
    await library.close();
  })();
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  void stop().catch(error => { console.error('PoB 服务关闭失败：', error); process.exitCode = 1; });
});
server.on('error', error => {
  console.error('PoB 服务启动失败：', error);
  process.exitCode = 1;
  void stop().catch(closeError => console.error('PoB 服务清理失败：', closeError));
});
