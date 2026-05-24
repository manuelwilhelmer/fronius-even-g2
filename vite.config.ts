import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from "vite-plugin-singlefile"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/solarweb': {
        target: 'https://swqapi.solarweb.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/solarweb/, ''),
        headers: {
          'Origin': 'https://swqapi.solarweb.com',
          'Referer': 'https://swqapi.solarweb.com/'
        }
      }
    }
  },
})
