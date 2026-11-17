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

/** Removes a `run "<name>" { ... }` block of a Terraform test, with the comment lines right above it. */
export function dropRun(text, name) {
  const marker = `\nrun "${name}" {\n`;
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`transform: no run "${name}"`);
  const end = text.indexOf('\n}\n', at + 1);
  if (end < 0) throw new Error(`transform: run "${name}" has no end`);
  let start = at;
  // Comment lines directly above belong to the run.
  while (true) {
    const lineStart = text.lastIndexOf('\n', start - 1);
    const line = text.slice(lineStart + 1, start);
    if (!line.startsWith('#')) break;
    start = lineStart;
  }
  return text.slice(0, start) + text.slice(end + '\n}'.length);
}

/** Removes a top-level `describe('<title>', () => { ... });` block of a node:test file. */
export function dropDescribe(text, title) {
  const start = text.indexOf(`\ndescribe('${title}`);
  if (start < 0) throw new Error(`transform: no describe "${title}"`);
  const end = text.indexOf('\n});\n', start);
  if (end < 0) throw new Error(`transform: describe "${title}" has no end`);
  return text.slice(0, start) + text.slice(end + '\n});'.length);
}

/** The text of a markdown section: from its `## <heading>` line to the next `## ` line. */
export function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  if (start < 0) throw new Error(`transform: no section "${heading}"`);
  const next = text.indexOf('\n## ', start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next + 1);
}

const noAlertVar = (t) => cut(t, /^ *alert_email\s*= "alerts@example\.com"\n/m, 'alert_email variable');

const noLogoLines =(text) => cut(text, /^.*nexo-logo\.png.*\n/gm, 'logo line');

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

  // The project-specific head (architecture, GCP, Tika) is replaced by a generic one; the rules after it are kept.
  'CLAUDE.md': (t) => {
    const rules = t.indexOf('## 🤖 Integración con Claude Code y Git');
    if (rules < 0) throw new Error('transform: CLAUDE.md has no "Integración con Claude Code y Git" section');
    const head = [
      '# CLAUDE.md - Guía de Desarrollo para __PROJECT_TITLE__',
      '',
      '## 🏗️ Visión General y Arquitectura',
      '- **Proyecto:** __PROJECT_TITLE__. Describe aquí qué hace y para quién.',
      '- **Repositorio único (monorepo):**',
      '  - `/backend`: NestJS + SWC + PostgreSQL.',
      '  - `/frontend`: Angular (v22+) + Signals + Tailwind CSS + Angular Material/CDK.',
      '  - `/infrastructure`: infraestructura como código.',
      '  - `/docs`: documentación técnica y especificaciones.',
      '',
      '---',
      '',
      '',
    ].join('\n');
    return head + t.slice(rules);
  },

  // ---- Infrastructure: the blueprint has no Tika, Pub/Sub, buckets or dead-letter alert ----
  'infrastructure/apis.tf': (t) => {
    t = cut(t, '    "pubsub.googleapis.com",\n');
    t = cut(t, '    "storage.googleapis.com",\n');
    return cut(t, '    "monitoring.googleapis.com",\n');
  },

  'infrastructure/artifact_registry.tf': (t) => {
    t = cut(t, /\n# Cloud Run cannot pull from Docker Hub directly[\s\S]*$/, 'dockerhub repository');
    return t.replace(/\n+$/, '\n');
  },

  'infrastructure/cloud_run.tf': (t) => {
    t = cut(t, /  tika_image +=[^\n]*\n/, 'tika image');
    t = cut(t, /      env \{\n        name  = "TIKA_URL"[\s\S]*?\n      \}\n/, 'TIKA_URL');
    t = cut(t, /      env \{\n        name  = "PROCESSED_BUCKET"[\s\S]*?\n      \}\n/, 'PROCESSED_BUCKET');
    t = cut(t, /      # The audience of the Pub\/Sub push token[^\n]*\n      env \{\n        name  = "BACKEND_URL"[\s\S]*?\n      \}\n/, 'BACKEND_URL');
    t = cut(t, /      env \{\n        name  = "PUBSUB_PUSH_SA_EMAIL"[\s\S]*?\n      \}\n/, 'PUBSUB_PUSH_SA_EMAIL');
    t = cut(t, /# Apache Tika has no authentication[\s\S]*?\n\}\n\n(?=resource "google_cloud_run_v2_service_iam_member" "public")/, 'tika service');
    return cut(t, /\nresource "google_cloud_run_v2_service_iam_member" "tika_invoker" \{[\s\S]*?\n\}\n/, 'tika invoker');
  },

  'infrastructure/locals.tf': (t) => cut(t, /  tika_url +=[^\n]*\n/, 'tika_url'),

  'infrastructure/outputs.tf': (t) => {
    t = cut(t, /output "documents_bucket" \{[\s\S]*?\n\}\n\n/, 'documents_bucket');
    return cut(t, /output "tika_url" \{[\s\S]*?\n\}\n\n/, 'tika_url');
  },

  'infrastructure/service_accounts.tf': (t) => {
    t = cut(t, /\nresource "google_service_account" "tika" \{[\s\S]*?\n\}\n/, 'tika account');
    return cut(t, /\nresource "google_service_account" "pubsub_push" \{[\s\S]*?\n\}\n/, 'pubsub account');
  },

  'infrastructure/variables.tf': (t) => {
    t = swap(t, 'Region for Cloud Run, Artifact Registry, Pub/Sub and storage.', 'Region for Cloud Run, Cloud SQL and Artifact Registry.');
    return cut(t, /\nvariable "alert_email" \{[\s\S]*?\n\}\n/, 'alert_email');
  },

  'infrastructure/tests/foundation.tftest.hcl': (t) => {
    t = noAlertVar(t);
    t = cut(t, '      "pubsub.googleapis.com",\n');
    t = cut(t, '      "storage.googleapis.com",\n');
    t = cut(t, '      "monitoring.googleapis.com",\n');
    return swap(t, 'exactly the seven required APIs must be enabled', 'exactly the four required APIs must be enabled');
  },

  'infrastructure/tests/cloud_run.tftest.hcl': (t) => {
    t = noAlertVar(t);
    for (const name of ['backend_env_has_tika_url', 'tika_callable_only_by_backend', 'tika_runs_from_dockerhub_remote_repo', 'backend_env_has_worker_settings']) {
      t = dropRun(t, name);
    }
    return t.replace(/\n+$/, '\n');
  },

  'infrastructure/tests/outputs.tftest.hcl': (t) => {
    t = noAlertVar(t);
    t = cut(t, /  assert \{\n    condition     = output\.documents_bucket[\s\S]*?\n  \}\n\n/, 'documents_bucket assert');
    return cut(t, /  assert \{\n    condition     = output\.tika_url[\s\S]*?\n  \}\n\n/, 'tika_url assert');
  },

  'infrastructure/tests/cloud_sql.tftest.hcl': noAlertVar,
  'infrastructure/tests/secrets.tftest.hcl': noAlertVar,
  'infrastructure/tests/imports.tftest.hcl': noAlertVar,

  'infrastructure/tests/guards.spec.mjs': (t) => {
    t = dropTest(t, 'reads the alert address from a secret');
    return dropDescribe(t, 'first-apply ordering');
  },

  'infrastructure/tests/redact.spec.mjs': (t) => swap(t, 'google_pubsub_subscription.x', 'google_cloud_run_v2_service.x'),

  '.github/workflows/infrastructure.yml': (t) => cut(t, /^ *TF_VAR_alert_email: .*\n/gm, 'alert_email variable'),

  // A shorter README: what the blueprint creates, then the app's own sections for the pipeline, secrets and database.
  'infrastructure/README.md': (t) => {
    const head = [
      '# Infrastructure',
      '',
      'Terraform for the **sandbox** GCP project of __PROJECT_TITLE__ (`__PROJECT_NAME__-sandbox`, region `us-west1`; change both',
      'in the GitHub environment variables).',
      '',
      '## What it creates',
      '',
      '| Area | Resources |',
      '| --- | --- |',
      '| Cloud Run | `frontend` and `backend` (public) |',
      '| Identities | `frontend-run` and `backend-run` service accounts |',
      '| Secrets | `backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox` (JSON, see below) |',
      '| Database | Cloud SQL `__PROJECT_NAME__-postgres` (PostgreSQL 16, `db-f1-micro`, one zone, 10 GB HDD, no backups) with the database `__DB_NAME__`; the backend identity logs in with IAM (no password). See *Cloud SQL* below |',
      '| Registry | `apps` (the frontend and backend images) |',
      '',
      '',
    ].join('\n');
    const how = section(t, 'How changes reach GCP')
      .replace('; secrets `LOCAL_SECRET_READERS` and `ALERT_EMAIL`', '; secret `LOCAL_SECRET_READERS`')
      .replace(/\n  Both secrets are GitHub \*\*secrets\*\*[\s\S]*?\n  also marks it sensitive/, '\n  The readers are a GitHub **secret** (not a variable) so Actions masks the addresses in logs of a public repository; Terraform\n  also marks it sensitive');
    const secrets = cut(section(t, 'Secrets'), /^  "GCS_BUCKET": .*\n/gm, 'GCS_BUCKET examples');
    const things = swap(
      section(t, 'Things to know'),
      /^- The Pub\/Sub token-creator binding, the deterministic Cloud Run URLs and the Docker Hub remote repository are assumptions/m,
      '- The deterministic Cloud Run URLs are an assumption',
    );
    return head + how + '\n' + secrets + '\n' + section(t, 'Cloud SQL') + '\n' + things;
  },

  'frontend/src/index.html': (t) => {
    t = swap(t, '<title>Nexo - DMS</title>', '<title>__PROJECT_TITLE__</title>');
    return cut(t, /^.*favicon\.png.*\n/m, 'png icon');
  },
};
