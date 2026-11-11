import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// The inline script of src/index.html that reads the saved language, run against a fake page.
const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/index.html'),
  'utf8',
);
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((body) => body.includes('dms.language'));

function run({ saved, pathname, search = '', hash = '', throwing = false }) {
  const replaced = [];
  const sessionStorage = {
    getItem: (key) => {
      if (throwing) throw new Error('storage is blocked');
      return key === 'dms.language' ? (saved ?? null) : null;
    },
  };
  const location = { pathname, search, hash, replace: (url) => replaced.push(url) };
  vm.runInNewContext(script ?? 'throw new Error("no inline script reads dms.language")', {
    sessionStorage,
    location,
  });
  return replaced;
}

describe('the language redirect in index.html', () => {
  it('moves a user whose saved language is the other copy, keeping route, query and hash', () => {
    assert.deepEqual(
      run({ saved: 'en', pathname: '/es/users/1/edit', search: '?x=1', hash: '#y' }),
      ['/en/users/1/edit?x=1#y'],
    );
  });

  it('moves from the bare prefix too', () => {
    assert.deepEqual(run({ saved: 'es', pathname: '/en' }), ['/es']);
  });

  it('stays when the saved language is the one of this copy', () => {
    assert.deepEqual(run({ saved: 'es', pathname: '/es/users' }), []);
  });

  it('does nothing without a saved language, and for a value that is not a language', () => {
    assert.deepEqual(run({ pathname: '/es/users' }), []);
    assert.deepEqual(run({ saved: 'fr', pathname: '/es/users' }), []);
  });

  it('does nothing on the dev server, which has no language prefix', () => {
    assert.deepEqual(run({ saved: 'en', pathname: '/users' }), []);
  });

  it('does not take a path that only starts with the letters of a prefix for a copy', () => {
    assert.deepEqual(run({ saved: 'en', pathname: '/essays/1' }), []);
  });

  it('never throws when the browser blocks storage', () => {
    assert.deepEqual(run({ saved: 'en', pathname: '/es/users', throwing: true }), []);
  });
});
