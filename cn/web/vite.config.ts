import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'POB_CN_');
  const bridgeTarget = process.env.POB_CN_BRIDGE_TARGET ?? env.POB_CN_BRIDGE_TARGET ?? 'http://127.0.0.1:3002';
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      open: false,
      proxy: {
        '/api': bridgeTarget,
        '/health': bridgeTarget
      }
    }
  };
});
