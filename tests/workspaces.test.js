import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceStore, MAX_SAVED_WORKSPACES } from '../js/workspaces.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

const snapshot = { version: 1, view: { center: [-6.5, 54.6], zoom: 8 } };

test('workspace store saves, updates, sorts, and removes named snapshots', () => {
  const store = createWorkspaceStore(memoryStorage(), 'workspaces');
  store.save('Northern sites', snapshot);
  store.save('Geology', { ...snapshot, view: { ...snapshot.view, zoom: 9 } });
  store.save('northern sites', { ...snapshot, view: { ...snapshot.view, zoom: 10 } });

  assert.deepEqual(store.list().map(entry => entry.name), ['Geology', 'northern sites']);
  assert.equal(store.get('Northern Sites').snapshot.view.zoom, 10);
  assert.equal(store.remove('GEOLOGY'), true);
  assert.equal(store.remove('missing'), false);
  assert.deepEqual(store.list().map(entry => entry.name), ['northern sites']);
});

test('workspace store rejects invalid snapshots, names, corrupt data, and excess entries', () => {
  const storage = memoryStorage();
  const store = createWorkspaceStore(storage, 'workspaces', 1);
  assert.throws(() => store.save(' ', snapshot), /Workspace names/);
  assert.throws(() => store.save('No view', { version: 1 }), /cannot be saved/);
  store.save('First', snapshot);
  assert.throws(() => store.save('Second', snapshot), /maximum of 1/);

  storage.setItem('broken', '{');
  assert.throws(() => createWorkspaceStore(storage, 'broken').list(), /unreadable/);
});

test('workspace limit is deliberately bounded', () => {
  assert.equal(MAX_SAVED_WORKSPACES, 20);
});
