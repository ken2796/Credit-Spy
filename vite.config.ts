import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // NEXT_PUBLIC_ lets the app read the public Supabase variables that
  // Vercel's Supabase integration adds to the project.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
