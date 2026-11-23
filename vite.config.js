import { defineConfig } from 'vite'

// O mesmo código funciona em localhost, Netlify e GitHub Pages.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/MecanichalMadness/' : '/',
  build: { target: 'es2020', outDir: 'dist', cssCodeSplit: true },
})
