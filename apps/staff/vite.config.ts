import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://localhost:3000';

export default defineConfig({
  base: '/staff/',
  plugins: [react()],
  server: {
    host: true, // reachable from phones on the LAN during development
    port: 5174,
    strictPort: true,
    proxy: { '/api': api, '/images': api },
  },
});
