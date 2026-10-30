import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://localhost:3000';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: true, // reachable from phones on the LAN during development
    port: 5173,
    strictPort: true,
    proxy: { '/api': api, '/images': api },
  },
});
