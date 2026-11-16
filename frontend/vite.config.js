import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dafuMockPlugin from './mock/index.js';

// 开发代理：/api 与 /img → 本地后端 3000（生产由 Nginx 反代）
// 注：当前默认启用本地 mock 插件（frontend/mock/index.js），无后端也能看界面。
// 要连真实后端时，把下方 plugins 里的 dafuMockPlugin() 去掉即可。
export default defineConfig({
    plugins: [vue(), dafuMockPlugin()],
    server: {
        port: 5175,
        proxy: {
            '/api': { target: 'http://localhost:3000', changeOrigin: true },
            '/img': { target: 'http://localhost:3000', changeOrigin: true },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    echarts: ['echarts'],
                    'element-plus': ['element-plus'],
                },
            },
        },
    },
});
