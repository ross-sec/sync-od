// hooks/ods-drift.mjs
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let e; try { e = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const fp = e?.tool_input?.file_path; if (!fp) process.exit(0);
  const mf = join(process.cwd(), '.design-sync', 'manifest.json');
  if (existsSync(mf)) {
    try { const m = JSON.parse(readFileSync(mf, 'utf8')); if ((m.pairs || []).some((p) => fp.replace(/\\/g, '/').endsWith(p.src.replace(/\\/g, '/').split('/').pop()))) appendFileSync(join(process.cwd(), '.design-sync', 'JOURNAL.md'), `drift: ${fp} edited\n`); } catch {}
  }
  process.exit(0);
});
if (process.stdin.isTTY) process.exit(0);