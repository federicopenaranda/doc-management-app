// Guards for things `terraform test` cannot see: the CI workflow and first-apply ordering.
// Run with: node --test infrastructure/tests/guards.spec.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const infraDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(infraDir, '..', '.github', 'workflows', 'infrastructure.yml'), 'utf8');

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
  const source = readFileSync(join(infraDir, file), 'utf8');
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
