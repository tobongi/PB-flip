import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/game': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/game/, ''),
        changeOrigin: true,
      },
    },
  },
});
