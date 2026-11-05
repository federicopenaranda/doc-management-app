// Guards for things `terraform test` cannot see: the CI workflow and first-apply ordering.
// Run with: node --test infrastructure/tests/guards.spec.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const infraDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (...parts) => readFileSync(join(...parts), 'utf8').replaceAll('\r\n', '\n');
const workflow = readText(infraDir, '..', '.github', 'workflows', 'infrastructure.yml');

/** Text of one top-level job (from "  <name>:" up to the next job or the end). */
function jobBlock(name) {
  const match = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm'));
  assert.ok(match, `job ${name} not found`);
  return match[1];
}

function concurrencyOf(block) {
  const group = block.match(/^ {4}concurrency:\n {6}group: (.+)\n {6}cancel-in-progress: (true|false)/m);
  assert.ok(group, 'job needs its own concurrency group');
  return { group: group[1].trim(), cancel: group[2] === 'true' };
}

describe('infrastructure workflow', () => {
  it('redacts personal addresses from the plan before posting it as a comment (public repository)', () => {
    assert.match(workflow, /require\('\.\/\.github\/scripts\/redact-plan\.cjs'\)/);
    assert.match(workflow, /const plan = redact\(/);
  });

  it('reads the alert address from a secret, so GitHub masks it in the logs of this public repository', () => {
    assert.doesNotMatch(workflow, /vars\.ALERT_EMAIL/);
    const uses = workflow.match(/TF_VAR_alert_email: \$\{\{ secrets\.ALERT_EMAIL \}\}/g) ?? [];
    assert.equal(uses.length, 2, 'both the plan and the apply job');
  });

  it('switches on secret adoption in both jobs (the secrets already exist in GCP)', () => {
    const uses = workflow.match(/TF_VAR_adopt_existing_secrets: "true"/g) ?? [];
    assert.equal(uses.length, 2, 'both the plan and the apply job');
  });

  it('reads the reader list from a secret, so GitHub masks it in the logs of this public repository', () => {
    assert.doesNotMatch(workflow, /vars\.LOCAL_SECRET_READERS/);
    const uses = workflow.match(/TF_VAR_local_secret_readers: \$\{\{ secrets\.LOCAL_SECRET_READERS \}\}/g) ?? [];
    assert.equal(uses.length, 2, 'both the plan and the apply job');
  });

  it('has no workflow-level concurrency group shared by plan and apply', () => {
    assert.doesNotMatch(workflow, /^concurrency:/m);
  });

  it('plan and apply use different groups, so a plan can never cancel a pending apply', () => {
    const plan = concurrencyOf(jobBlock('plan'));
    const apply = concurrencyOf(jobBlock('apply'));

    assert.notEqual(plan.group, apply.group);
    assert.match(plan.group, /github\.event\.number/, 'plans are grouped per pull request');
    assert.equal(plan.cancel, true, 'a newer push replaces an older plan of the same PR');
    assert.equal(apply.cancel, false, 'a running apply is never cancelled');
  });
});

/** Source text of one resource block, found by brace matching. */
function resourceBlock(file, type, name) {
  const source = readText(infraDir, file);
  const open = source.indexOf(`resource "${type}" "${name}" {`);
  assert.ok(open >= 0, `${type}.${name} not found in ${file}`);
  let depth = 0;
  for (let i = source.indexOf('{', open); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  assert.fail(`unbalanced braces in ${type}.${name}`);
}

describe('first-apply ordering', () => {
  it('the Pub/Sub token-creator binding waits for the APIs to be enabled', () => {
    // Pub/Sub is enabled in the same apply; its service agent (the binding's member) only exists afterwards.
    const block = resourceBlock('pubsub.tf', 'google_service_account_iam_member', 'pubsub_token_creator');

    assert.match(block, /depends_on\s*=\s*\[[^\]]*google_project_service\.apis/);
  });
});

describe('secrets', () => {
  const tfFiles = readdirSync(infraDir).filter((name) => name.endsWith('.tf'));

  it('adopts secrets that already exist instead of failing with 409 on create', () => {
    const imports = readText(infraDir, 'imports.tf');

    assert.match(imports, /import\s*\{[^}]*to\s*=\s*google_secret_manager_secret\.config\[each\.key\]/s);
    assert.match(imports, /id\s*=\s*"projects\/\$\{var\.project_id\}\/secrets\/\$\{each\.key\}"/);
  });

  it('never writes a secret version: a new version becomes "latest" and would hide the values you added by hand', () => {
    for (const name of tfFiles) {
      const source = readText(infraDir, name);
      assert.doesNotMatch(source, /resource\s+"google_secret_manager_secret_version"/, name);
    }
  });
});

describe('our workflows', () => {
  const dir = join(infraDir, '..', '.github', 'workflows');
  // claude.yml comes from the Claude Code GitHub app installer and is left as generated.
  const files = ['infrastructure.yml', 'frontend.yml', 'backend.yml'];

  it('pin every third-party action to a full commit SHA', () => {
    for (const name of files) {
      for (const [, action] of readText(dir, name).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
        if (action.startsWith('./')) continue;
        assert.match(action, /@[0-9a-f]{40}$/, `${name}: ${action}`);
      }
    }
  });
});

for (const app of ['frontend', 'backend']) {
  describe(`${app} workflow`, () => {
    const workflowText = readText(infraDir, '..', '.github', 'workflows', `${app}.yml`);
    const job = (name) => {
      const match = workflowText.match(new RegExp(String.raw`^  ${name}:\n([\s\S]*?)(?=^  [a-z-]+:\n|(?![\s\S]))`, 'm'));
      assert.ok(match, `job ${name} not found`);
      return match[1];
    };

    it(`runs for ${app} changes on pull requests and on main`, () => {
      assert.match(workflowText, new RegExp(String.raw`pull_request:\n\s+paths:\n\s+- "${app}/\*\*"`));
      assert.match(workflowText, new RegExp(String.raw`push:\n\s+branches: \[main\]\n\s+paths:\n\s+- "${app}/\*\*"`));
    });

    it('verifies without secrets or an environment, so any pull request (forks too) can run it', () => {
      const verify = job('verify');
      assert.doesNotMatch(verify, /environment:/);
      assert.doesNotMatch(verify, /id-token/);
      assert.match(verify, /npm run test:image/);
    });

    it('deploys only on push, after verify, through the sandbox environment', () => {
      const deploy = job('deploy');
      assert.match(deploy, /needs: verify/);
      assert.match(deploy, /if: github\.event_name == 'push'/);
      assert.match(deploy, /environment: sandbox/);
    });

    it('tags the image with the commit and never with "latest"', () => {
      assert.match(job('deploy'), new RegExp(String.raw`/apps/${app}:\$\{\{ github\.sha \}\}`));
      assert.doesNotMatch(workflowText, /:latest/);
    });
  });
}

describe('image files', () => {
  it('are always checked out with LF: a CRLF shell script fails inside the Linux image', () => {
    for (const file of ['frontend/Dockerfile', 'frontend/docker/40-app-config.sh', 'frontend/docker/nginx.conf', 'backend/Dockerfile']) {
      const out = execFileSync('git', ['check-attr', 'eol', file], { cwd: join(infraDir, '..'), encoding: 'utf8' });
      assert.match(out, /eol: lf/, file);
    }
  });
});
