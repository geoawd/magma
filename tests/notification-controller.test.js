import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNotificationConfig } from '../js/notification-controller.js';

const validConfig = {
  notifications: [{
    id: 'report',
    label: 'Report',
    title: 'Map report',
    recipient: 'reports@example.test',
    reminderText: 'Attach supporting files.',
    fields: [
      { name: 'description', label: 'Description', type: 'textarea', rows: 4, required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['A', { value: 'b', label: 'B' }] }
    ]
  }]
};

test('validates notification forms and supports empty configuration', () => {
  assert.equal(validateNotificationConfig(validConfig), validConfig);
  assert.equal(validateNotificationConfig({ notifications: [] }).notifications.length, 0);
  assert.equal(validateNotificationConfig({}).notifications, undefined);
});

test('rejects duplicate IDs, duplicate field names, unsupported types, and invalid options', () => {
  assert.throws(() => validateNotificationConfig({
    notifications: [validConfig.notifications[0], validConfig.notifications[0]]
  }), /Duplicate notification id/);
  assert.throws(() => validateNotificationConfig({
    notifications: [{ ...validConfig.notifications[0], fields: [
      { name: 'same', label: 'First', type: 'text' },
      { name: 'same', label: 'Second', type: 'text' }
    ] }]
  }), /Duplicate field/);
  assert.throws(() => validateNotificationConfig({
    notifications: [{ ...validConfig.notifications[0], fields: [{ name: 'x', label: 'X', type: 'hidden' }] }]
  }), /Invalid field/);
  assert.throws(() => validateNotificationConfig({
    notifications: [{ ...validConfig.notifications[0], fields: [
      { name: 'x', label: 'X', type: 'select', options: [] }
    ] }]
  }), /Invalid field/);
});
