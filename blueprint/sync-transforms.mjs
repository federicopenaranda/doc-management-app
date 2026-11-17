// Edits applied to app files on their way into blueprint/templates/, for the parts of the app the blueprint does not have
// (clients, uploads, the Nexo artwork, feature flags). Every edit must match: when the app changes and an edit no longer
// finds its text, the sync fails loudly instead of copying something half removed.

function found(text, pattern) {
  return typeof pattern === 'string' ? text.includes(pattern) : new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text);
}

/** Replaces the match; throws when there is none. */
export function swap(text, pattern, replacement, label = String(pattern)) {
  if (!found(text, pattern)) throw new Error(`transform: nothing matches ${label}`);
  return text.replace(pattern, replacement);
}

export const cut = (text, pattern, label) => swap(text, pattern, '', label);

/** Removes a whole `it('<title>...', ...)` block (and the blank line before it) from a spec file. */
export function dropTest(text, title, indent = '  ') {
  const start = text.indexOf(`\n${indent}it('${title}`);
  if (start < 0) throw new Error(`transform: no test starts with "${title}"`);
  const end = text.indexOf(`\n${indent}});\n`, start);
  if (end < 0) throw new Error(`transform: the test "${title}" has no end`);
  return text.slice(0, start) + text.slice(end + `\n${indent}});`.length);
}

const noLogoLines = (text) => cut(text, /^.*nexo-logo\.png.*\n/gm, 'logo line');

export const TRANSFORMS = {
  'frontend/src/app/app.routes.ts': (t) => {
    t = cut(t, "import { inject } from '@angular/core';\n");
    t = cut(t, "import { AppConfigService } from './app-config.service';\n");
    t = cut(t, /      \{\n        path: 'upload',[\s\S]*?\n      \},\n/, 'upload route');
    return cut(t, /      \{\n        path: 'clients',[\s\S]*?\n      \},\n(?=      \{\n        path: 'users')/, 'clients route');
  },

  'frontend/src/app/app.routes.spec.ts': (t) => {
    t = cut(t, "import { ClientsApi } from './clients/clients-api';\n");
    t = cut(t, "import { UploadApi } from './uploads/upload-api';\n");
    t = cut(t, /^.*provide: (ClientsApi|UploadApi).*\n/gm, 'api providers');
    t = swap(t, 'function setup(clientsEnabled = false) {', 'function setup() {');
    t = swap(t, '{ preferencesEnabled: false, clientsEnabled }', '{ preferencesEnabled: false }');
    t = dropTest(t, 'lazy loads the upload page');
    t = dropTest(t, 'lazy loads the clients list and the client forms');
    t = dropTest(t, 'has no clients routes while the clients flag is off');
    t = swap(t, "navigateByUrl('/upload')", "navigateByUrl('/users')");
    return swap(t, `'main [data-testid="drop-zone"]'`, `'main section'`);
  },

  'frontend/src/app/app-config.service.ts': (t) => {
    t = cut(t, /  \/\*\* Feature flag for the Clients screens[^\n]*\n  clientsEnabled: boolean;\n/, 'interface flag');
    t = cut(t, "    clientsEnabled: parseFlag(object, 'clientsEnabled'),\n");
    return cut(t, /  get clientsEnabled\(\): boolean \{[\s\S]*?\n  \}\n\n/, 'getter');
  },

  'frontend/src/app/app-config.service.spec.ts': (t) => {
    const start = t.indexOf("  it.each([\n    [{ apiUrl: 'http://localhost:3000' }, false],\n    [{ apiUrl: 'http://localhost:3000', clientsEnabled");
    if (start < 0) throw new Error('transform: no clientsEnabled test in app-config.service.spec.ts');
    const end = t.indexOf('\n  });\n', start) + '\n  });\n'.length;
    return t.slice(0, start) + t.slice(end).replace(/^\n/, '');
  },

  'frontend/src/app/shell/side-menu.html': (t) => cut(t, /    @if \(clientsEnabled\) \{[\s\S]*?\n    \}\n/, 'clients entry'),

  'frontend/src/app/shell/side-menu.ts': (t) => {
    t = cut(t, "import { AppConfigService } from '../app-config.service';\n");
    t = cut(t, "\n  protected readonly clientsEnabled = inject(AppConfigService).clientsEnabled;\n");
    return swap(t, '  inject,\n', '');
  },

  'frontend/src/app/shell/side-menu.spec.ts': (t) => {
    t = cut(t, "import { AppConfigService } from '../app-config.service';\n");
    t = cut(t, /^.*provide: AppConfigService.*\n/gm, 'config provider');
    t = swap(t, 'async function setup(open: boolean, clientsEnabled = false) {', 'async function setup(open: boolean) {');
    t = dropTest(t, 'has a Clients entry linking');
    return dropTest(t, 'has no Clients entry');
  },

  'frontend/src/app/shell/preferences-dialog.ts': (t) => {
    t = cut(t, "import { firstValueFrom } from 'rxjs';\n");
    t = swap(t, '  MatDialog,\n', '');
    t = cut(t, "import { UploadStore } from '../uploads/upload-store';\n");
    t = cut(t, "import { LanguageSwitchDialog } from './language-switch-dialog';\n");
    t = cut(t, "  private readonly uploads = inject(UploadStore);\n  private readonly dialog = inject(MatDialog);\n");
    return cut(t, /    \/\/ The switch reloads the page[\s\S]*?\n    \}\n(?=    try \{)/, 'upload confirmation');
  },

  'frontend/src/app/shell/preferences-dialog.spec.ts': (t) => {
    t = cut(t, "import { UploadStore } from '../uploads/upload-store';\n");
    t = cut(t, /^.*provide: UploadStore.*\n/gm, 'store provider');
    t = swap(t, '{ activeUploads = 0, willReload = false } = {}', '{ willReload = false } = {}');
    return cut(t, /\n  describe\('when the language switch reloads the page'[\s\S]*?\n  \}\);\n/, 'reload block');
  },

  'frontend/src/app/shell/toolbar.html': (t) => {
    t = cut(t, ' The logo is on a white plate: its navy would vanish on the dark theme.', 'plate comment');
    return swap(t, /^ *<img ngSrc="nexo-logo\.png"[^\n]*\n/m, '    <mat-icon aria-hidden="true" fontIcon="description" />\n', 'logo image');
  },

  'frontend/src/app/shell/toolbar.ts': (t) => {
    t = cut(t, "import { NgOptimizedImage } from '@angular/common';\n");
    return cut(t, '    NgOptimizedImage,\n');
  },

  'frontend/src/app/shell/toolbar.spec.ts': (t) => {
    t = noLogoLines(t);
    return swap(t, "expect(link.querySelector('mat-icon')).toBeNull();", "expect(link.querySelector('mat-icon')).not.toBeNull();");
  },

  'frontend/src/app/auth/login-page.html': (t) => cut(t, /^.*On a white plate[\s\S]*?\/>\n\n/m, 'logo'),

  'frontend/src/app/auth/login-page.ts': (t) => {
    t = cut(t, "import { NgOptimizedImage } from '@angular/common';\n");
    return cut(t, '    NgOptimizedImage,\n');
  },

  'frontend/src/app/auth/login-page.spec.ts': (t) => dropTest(t, 'shows the Nexo logo'),

  'frontend/src/index.html': (t) => {
    t = swap(t, '<title>Nexo - DMS</title>', '<title>__PROJECT_TITLE__</title>');
    return cut(t, /^.*favicon\.png.*\n/m, 'png icon');
  },
};
