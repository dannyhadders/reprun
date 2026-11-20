import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Shown in Settings → About. Workers Builds sets WORKERS_CI_COMMIT_SHA; locally git knows.
const sha = (process.env.WORKERS_CI_COMMIT_SHA ?? (() => { try { return execSync('git rev-parse HEAD').toString() } catch { return 'dev' } })()).trim().slice(0, 7)

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(),
    // The open app fetches index.html now and then and compares this with its own sha: a new one means a new deploy.
    { name: 'build-meta', transformIndexHtml: html => html.replace('</head>', `  <meta name="reprun-build" content="${sha}" />\n  </head>`) }],
  define: {
    __BUILD__: JSON.stringify({ sha, date: new Date().toISOString().slice(0, 10) }),
    // Phone-only build (app.reprun.co.uk): data in the browser instead of the Worker. Dead code everywhere else.
    __LOCAL__: JSON.stringify(process.env.CLOUDFLARE_ENV === 'local'),
  },
})
