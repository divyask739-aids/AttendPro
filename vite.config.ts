import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * Deploy path.
 *
 * Cloudflare Pages / Netlify / Vercel at a domain root -> '/' (default).
 * A project served from a sub-folder (e.g. GitHub Pages) -> set
 * PUBLIC_BASE_PATH, e.g. PUBLIC_BASE_PATH=/AttendPro/ npm run build
 */
const base = process.env.PUBLIC_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})