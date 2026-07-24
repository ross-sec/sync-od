// esbuild.config.mjs
import { build } from 'esbuild'

await build({
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',
  external: [],
  banner: {
    js: '#!/usr/bin/env node'
  },
  footer: {
    js: ''
  },
  minify: false,
  sourcemap: false,
  treeShaking: true,
  metafile: true,
  logLevel: 'info'
})
