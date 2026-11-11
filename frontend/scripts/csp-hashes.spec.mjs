import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { hashesOfFolder, inlineScriptHashes } from '../docker/csp-hashes.mjs';

const sha = (body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes the exact body of every inline script, whitespace included', () => {
    const html = '<script>\n  var a = 1;\n</script><p>x</p><script>b()</script>';

    assert.deepEqual(inlineScriptHashes(html), [sha('\n  var a = 1;\n'), sha('b()')]);
  });

  it('skips scripts with a src (covered by self) and empty scripts', () => {
    const html = '<script src="main.js" type="module"></script><script> </script>';

    assert.deepEqual(inlineScriptHashes(html), []);
  });

  it('lists a repeated script once', () => {
    assert.deepEqual(inlineScriptHashes('<script>a()</script><script>a()</script>'), [sha('a()')]);
  });

  it('reads attributes on the tag without confusing them with the body', () => {
    assert.deepEqual(inlineScriptHashes('<script type="module" nonce="x">m()</script>'), [
      sha('m()'),
    ]);
  });
});

describe('hashesOfFolder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csp-hashes-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('collects the hashes of every index.html below the folder, once each', () => {
    mkdirSync(join(dir, 'en'));
    mkdirSync(join(dir, 'es'));
    writeFileSync(join(dir, 'en', 'index.html'), '<script>theme()</script><script>swap()</script>');
    writeFileSync(join(dir, 'es', 'index.html'), '<script>theme()</script>');
    writeFileSync(join(dir, 'es', 'other.html'), '<script>ignored()</script>');

    assert.deepEqual(hashesOfFolder(dir).sort(), [sha('theme()'), sha('swap()')].sort());
  });
});
