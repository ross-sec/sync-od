// hooks/ods-guard.mjs
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let e; try { e = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const content = e?.tool_input?.content || '';
  const SECRET = /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i;
  if (SECRET.test(content)) { process.stderr.write('[ods-guard] refusing: content looks like it contains a secret. Remove it before syncing to Open Design.\n'); process.exit(2); }
  process.exit(0);
});
if (process.stdin.isTTY) process.exit(0);