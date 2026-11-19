// Build dist/main.js, then stamp its content hash into index.html (`./dist/main.js?v=<hash>`).
// Why: Logseq's `lsp://` scheme is started with --code-cache-schemes=lsp, so the plugin iframe keeps running a
// cached main.js after a rebuild, even across plugin reload and off/on. A new URL (query string) is a new cache
// key, while index.html itself is re-read every time (verified, see build/reports/reload-report.md).
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
await build({
  entryPoints: [root + 'src/main.js'], bundle: true, format: 'iife', target: 'chrome120',
  sourcemap: true, outfile: root + 'dist/main.js', logLevel: 'warning'
})
const hash = createHash('sha256').update(readFileSync(root + 'dist/main.js')).digest('hex').slice(0, 10)
const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Sidebar Window</title></head>
  <body><script src="./dist/main.js?v=${hash}"></script></body>
</html>
`
writeFileSync(root + 'index.html', html)
console.log('built dist/main.js, index.html -> ?v=' + hash)
