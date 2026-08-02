import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React-плагин
export default defineConfig({
  plugins: [react()],
  server: {
    // Браузер обращается к API через тот же origin.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});
