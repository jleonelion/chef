// The runtime adapter contract: every adapter Chef ships must pass this suite.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import CAPABILITIES from '../../schemas/feedback/capabilities.v1.json' with { type: 'json' };
import { checkAdapter, currentRuntime } from './contract.mjs';
import { generic } from './generic.mjs';
import { muse } from './muse.mjs';

const onMuse = { exists: (file) => file === '/opt/hatch/bin/authdc' };
const offMuse = { exists: () => false };

for (const adapter of [muse, generic]) {
  test(`${adapter.name} adapter: identity and contract version`, () => {
    assert.match(adapter.name, /^[a-z0-9-]+$/);
    assert.ok(Number.isInteger(adapter.adapterVersion) && adapter.adapterVersion >= 1);
    assert.equal(adapter.adapterContractVersion, 1);
    assert.equal(checkAdapter(adapter), adapter);
  });

  test(`${adapter.name} adapter: capabilities are registered names, evaluated at call time`, () => {
    const declared = adapter.feedback.capabilities();
    assert.ok(Array.isArray(declared));
    assert.equal(new Set(declared).size, declared.length);
    for (const name of declared) assert.ok(Object.hasOwn(CAPABILITIES.capabilities, name), `unregistered capability ${name}`);
    assert.notEqual(adapter.feedback.capabilities(), declared, 'a fresh list on every call');
  });

  test(`${adapter.name} adapter: without a submit capability, submit sends nothing`, async () => {
    if (adapter.feedback.capabilities().some((name) => name.startsWith('submit.'))) return;
    assert.deepEqual(await adapter.feedback.submit(Buffer.from('{}')), { ok: false, reason: 'unsupported' });
  });
}

test('off Muse the current runtime is generic and never identifies as muse', () => {
  const adapter = currentRuntime(offMuse);
  assert.equal(adapter, generic);
  assert.equal(adapter.name, 'unknown');
});

test('on Muse the current runtime is muse', () => {
  assert.equal(currentRuntime(onMuse), muse);
});

test('core rejects an adapter with an unknown contract major', () => {
  assert.throws(() => checkAdapter({ ...generic, adapterContractVersion: 2 }), /unsupported adapter contract version 2/);
});

test('core rejects an adapter that declares an unregistered capability', () => {
  const adapter = { ...generic, feedback: { ...generic.feedback, capabilities: () => ['supports-tracing'] } };
  assert.throws(() => checkAdapter(adapter), /unregistered capability "supports-tracing"/);
});

test('generic declares no submit capability', () => {
  assert.deepEqual(generic.feedback.capabilities(), []);
});
