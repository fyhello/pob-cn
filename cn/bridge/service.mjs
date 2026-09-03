import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startBridge } from './start.mjs';
import { createBridgeHttpServer } from './http-server.mjs';

const root = resolve(import.meta.dirname, '../..');
const runtime = process.env.POB_CN_LUAJIT ?? resolve(root, 'Builds', 'luajit', process.platform === 'win32' ? 'luajit.exe' : 'luajit');
if (!existsSync(runtime)) throw new Error(`PoB LuaJIT runtime is missing: ${runtime}. Build or install it inside this project; legacy project paths are not supported.`);
const runtimeLuaPath = '../runtime/lua/?.lua;../runtime/lua/?/init.lua';
const luaPath = process.env.LUA_PATH ? `${runtimeLuaPath};${process.env.LUA_PATH}` : `${runtimeLuaPath};;`;
const engine = await startBridge(root, { command: runtime, args: [resolve(root, 'cn/bridge/calc_server.lua')], cwd: resolve(root, 'src'), env: { ...process.env, LUA_PATH: luaPath } });
const server = createBridgeHttpServer(engine);
const port = Number(process.env.POB_CN_PORT ?? 3002);
server.listen(port, '127.0.0.1', () => process.stdout.write(`PoB CN bridge listening on 127.0.0.1:${port}\n`));
