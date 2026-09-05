import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'SUPABASE_'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: true,
    // @vercel/botid is optional in production (dynamically imported only
    // when BOTID_ENABLED=true) and not a declared dependency; alias it to
    // a stub so Vite can transform api/cast-anonymous-vote.js in tests.
    alias: {
      '@vercel/botid': new URL('./src/test/stubs/vercel-botid.js', import.meta.url).pathname,
    },
  },
})
