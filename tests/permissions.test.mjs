import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobalAccess, PAGE_ORIGINS } from '../extension/permissions.js';

function fixture() {
  const local = {}, session = {}, removed = [];
  const area = data => ({ get: async key => ({ [key]: data[key] }), set: async values => Object.assign(data, values), remove: async key => { delete data[key]; } });
  const api = { storage: { local: area(local), session: area(session) }, permissions: { contains: async () => true, remove: async request => { removed.push(request.origins); return true; } } };
  return { access: new GlobalAccess(api), api, local, session, removed };
}

test('session global access survives panel/worker recreation but expires on browser or extension restart', async () => {
  const { access, api, local, session, removed } = fixture();
  await access.save('session');
  assert.equal(await new GlobalAccess(api).mode(), 'session');
  await access.reconcile(); assert.equal(removed.length, 0);
  delete session.globalAccessSession;
  assert.equal(await access.mode(), 'off');
  await access.reconcile();
  assert.deepEqual(removed, [PAGE_ORIGINS]);
  assert.equal(local.globalAccess, undefined);
});

test('permanent global access survives restart and explicit revocation clears it', async () => {
  const { access, session, removed, local } = fixture();
  await access.save('permanent'); delete session.globalAccessSession;
  await access.reconcile(); assert.equal(removed.length, 0);
  assert.equal(await access.mode(), 'permanent');
  await access.revoke();
  assert.equal(await access.mode(), 'off');
  assert.equal(local.globalAccess, undefined);
  assert.deepEqual(removed, [PAGE_ORIGINS]);
});

test('changing permanent access to session expires it and failed removal stays actionable', async () => {
  const { access, api, session, local } = fixture();
  await access.save('permanent'); await access.save('session'); delete session.globalAccessSession;
  api.permissions.remove = async () => false;
  await assert.rejects(access.reconcile(), /could not be revoked/);
  assert.equal(local.globalAccess.mode, 'session');
  await assert.rejects(access.save('invalid'), /Choose session/);
});

test('browser-action bypass requires separate opt-in, a live lease and current website permissions', async () => {
  const { access, api, session } = fixture();
  await access.save('session'); assert.equal(await access.actionsEnabled(), false);
  await access.save('session', true); assert.equal(await access.actionsEnabled(), true);
  api.permissions.contains = async () => false;
  assert.equal(await access.actionsEnabled(), false);
  api.permissions.contains = async () => true;
  delete session.globalAccessSession;
  assert.equal(await access.actionsEnabled(), false);
});
