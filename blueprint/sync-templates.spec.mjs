// Run with: node --test blueprint/
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyReplacements, compare, leaks, plan, write } from './sync-templates.mjs';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  const repo = join(root, 'repo');
  const templates = join(root, 'templates');
  mkdirSync(join(repo, 'backend/src'), { recursive: true });
  return { repo, templates, done: () => rmSync(root, { recursive: true }) };
}

test('turns the app names into placeholders', () => {
  const text = "const db = 'dms'; // doc-management-sandbox:us-west1:dms-postgres, DMS API, postgresql://u:p@h:5432/dms";
  assert.equal(
    applyReplacements(text),
    "const db = '__DB_NAME__'; // __PROJECT_NAME__-sandbox:us-west1:__PROJECT_NAME__-postgres, __PROJECT_TITLE__ API, postgresql://u:p@h:5432/__DB_NAME__",
  );
});

test('finds a line that still names the app, ignoring letter case', () => {
  assert.deepEqual(leaks('ok\nthe Nexo logo\nfine'), [{ line: 2, text: 'the Nexo logo' }]);
  assert.deepEqual(leaks('index.ts: dmsHelper is not the word dms'), [
    { line: 1, text: 'index.ts: dmsHelper is not the word dms' },
  ]);
  assert.deepEqual(leaks('addresses and dmsHelper'), []);
});

test('plan copies a file and a folder, with LF line endings and the replacements', () => {
  const { repo, done } = sandbox();
  writeFileSync(join(repo, 'backend/src/a.ts'), "x = 'dms';\r\n");
  mkdirSync(join(repo, 'backend/src/common'));
  writeFileSync(join(repo, 'backend/src/common/b.ts'), 'b\n');

  const files = plan(repo, ['backend/src/a.ts', 'backend/src/common']);

  assert.deepEqual(
    files.map((f) => [f.rel, f.content]),
    [
      ['backend/src/a.ts', "x = '__DB_NAME__';\n"],
      ['backend/src/common/b.ts', 'b\n'],
    ],
  );
  done();
});

test('plan fails for a manifest entry that is not in the app', () => {
  const { repo, done } = sandbox();
  assert.throws(() => plan(repo, ['backend/src/missing.ts']), /does not exist/);
  done();
});

test('compare reports a missing template, a stale one, one that names the app, and a file the app lost', () => {
  const { repo, templates, done } = sandbox();
  mkdirSync(join(repo, 'backend/src/common'), { recursive: true });
  writeFileSync(join(repo, 'backend/src/common/a.ts'), 'a\n');
  writeFileSync(join(repo, 'backend/src/common/b.ts'), 'b\n');
  writeFileSync(join(repo, 'backend/src/common/c.ts'), 'the nexo logo\n');
  const manifest = ['backend/src/common'];
  const files = plan(repo, manifest);

  mkdirSync(join(templates, 'backend/src/common'), { recursive: true });
  writeFileSync(join(templates, 'backend/src/common/a.ts'), 'old\n');
  writeFileSync(join(templates, 'backend/src/common/gone.ts'), 'x\n');

  const problems = compare(files, templates, manifest);

  assert.deepEqual(problems.sort(), [
    'backend/src/common/a.ts is stale',
    'backend/src/common/b.ts is missing from templates/',
    'backend/src/common/c.ts is missing from templates/',
    'backend/src/common/c.ts:1 still names the app: the nexo logo',
    'backend/src/common/gone.ts is in templates/ but no longer in the app',
  ]);
  done();
});

test('write makes the templates match, and removes files a synced folder no longer has', () => {
  const { repo, templates, done } = sandbox();
  mkdirSync(join(repo, 'backend/src/common'), { recursive: true });
  writeFileSync(join(repo, 'backend/src/common/a.ts'), 'a\n');
  const manifest = ['backend/src/common'];
  mkdirSync(join(templates, 'backend/src/common'), { recursive: true });
  writeFileSync(join(templates, 'backend/src/common/gone.ts'), 'x\n');

  write(plan(repo, manifest), templates, manifest);

  assert.equal(readFileSync(join(templates, 'backend/src/common/a.ts'), 'utf8'), 'a\n');
  assert.deepEqual(compare(plan(repo, manifest), templates, manifest), []);
  done();
});
