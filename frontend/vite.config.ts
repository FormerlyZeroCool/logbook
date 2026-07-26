import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const devApiKey = process.env.VITE_DEV_API_KEY;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['quickjs-emscripten', '@logbook/analysis-editor']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          quickjs: ['quickjs-emscripten'],
          ui: [
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-slot'
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
        ...(devApiKey
          ? { headers: { Authorization: `Bearer ${devApiKey}` } }
          : {})
      }
    }
  }
});
