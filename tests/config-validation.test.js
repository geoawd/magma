import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const window = {};
const context = vm.createContext({ window });
for (const source of [
  'config/overlays.js',
  'config/terrain-models.js',
  'config/notifications.js',
  'config/config.js',
  'js/config-validation.js'
]) {
  const filePath = path.join(root, source);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
}

test('public configuration fragments pass runtime validation', () => {
  assert.equal(window.validateAppConfig(window.CONFIG), window.CONFIG);
});

test('configuration validation rejects missing overlay sources and broken theme references', () => {
  const invalidConfig = {
    title: 'Invalid config',
    overlays: [{ id: 'missing-source' }],
    themes: [{ name: 'Broken theme', overlays: ['missing-overlay'] }]
  };
  assert.throws(() => window.validateAppConfig(invalidConfig), /exactly one of url, tiles, or cog/);

  invalidConfig.overlays[0].url = 'https://example.org/data';
  assert.throws(() => window.validateAppConfig(invalidConfig), /references unknown overlay or group/);
});

test('configuration validation checks custom COG projection definitions', () => {
  const invalidConfig = {
    title: 'Invalid config',
    cogProjections: [{ code: '27700', definition: '+proj=tmerc' }]
  };
  assert.throws(() => window.validateAppConfig(invalidConfig), /code.*positive integer/);

  invalidConfig.cogProjections[0].code = 27700;
  assert.equal(window.validateAppConfig(invalidConfig), invalidConfig);
});
