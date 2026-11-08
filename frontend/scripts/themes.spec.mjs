import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compile } from 'sass';

const { css } = compile('src/themes/github.scss', { loadPaths: ['node_modules'], quietDeps: true });

describe('github theme', () => {
  it('follows the system dark or light setting', () => {
    assert.match(css, /color-scheme:\s*light dark/);
  });

  for (const value of ['#0d1117', '#161b22', '#388bfd', '#ffffff', '#f6f8fa', '#0969da']) {
    it(`uses the Primer color ${value}`, () => {
      assert.ok(css.toLowerCase().includes(value), `${value} not found in compiled theme`);
    });
  }

  it('uses the GitHub font stack', () => {
    assert.match(css, /Segoe UI/);
  });

  it('is compact', () => {
    assert.match(css, /--mat-button-filled-container-height:\s*28px/);
  });
});
