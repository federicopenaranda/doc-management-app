// Prints the Content-Security-Policy hashes of the inline scripts of every built index.html.
//   node docker/csp-hashes.mjs dist/doc-management/browser
// Run in the image build; docker/40-app-config.sh puts the result in script-src at container start, so the
// policy needs no 'unsafe-inline' and still follows whatever Angular puts in index.html.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The CSP source of every inline <script> with a body; scripts with a src are covered by 'self'. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, attributes, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attributes) || body.trim() === '') continue;
    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  }
  return [...hashes];
}

/** The hashes of every index.html below a folder (one per language copy), each listed once. */
export function hashesOfFolder(folder) {
  const hashes = new Set();
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      hashesOfFolder(path).forEach((hash) => hashes.add(hash));
    } else if (entry.name === 'index.html') {
      inlineScriptHashes(readFileSync(path, 'utf8')).forEach((hash) => hashes.add(hash));
    }
  }
  return [...hashes];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node docker/csp-hashes.mjs <build folder>');
    process.exit(1);
  }
  console.log(hashesOfFolder(folder).join(' '));
}
