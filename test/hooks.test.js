// test/hooks.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const guard = new URL('../hooks/ods-guard.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const runIn = (json) => { try { execFileSync('node', [guard], { input: json, encoding: 'utf8' }); return 0; } catch (e) { return e.status; } };

test('guard blocks secret-bearing OD write', () => {
  assert.equal(runIn(JSON.stringify({ tool_input: { path: 'projects/x/index.html', content: 'api_key = "FAKEFIXTUREKEY1234567890"' } })), 2);
});
test('guard allows clean write', () => {
  assert.equal(runIn(JSON.stringify({ tool_input: { path: 'projects/x/index.html', content: '<h1>hi</h1>' } })), 0);
});
