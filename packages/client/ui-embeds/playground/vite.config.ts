// Dev-only playground server; rides the vite that vitest already brings in.
// Run from the package: `pnpm playground`.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    // Explicit IPv4: on this Windows setup the default 'localhost' binding
    // lands on [::1] only, and IPv4 clients get connection-refused.
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    fs: {
      // The page imports ui-theme's stylesheet and this package's src across
      // the monorepo; allow serving from the workspace root.
      allow: [fileURLToPath(new URL('../../../..', import.meta.url))],
    },
  },
  esbuild: { jsx: 'automatic' },
})
