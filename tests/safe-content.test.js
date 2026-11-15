import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, parseServiceUrl, safeExternalUrl } from '../js/safe-content.js';

test('external attributes are escaped before HTML rendering', () => {
  assert.equal(escapeHtml(`<img src=x onerror='alert(1)'>&`),
    '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('untrusted links permit HTTPS and same-origin links only', () => {
  assert.equal(safeExternalUrl('https://example.org/data', 'https://map.example.org/'), 'https://example.org/data');
  assert.equal(safeExternalUrl('/records/1', 'https://map.example.org/'), 'https://map.example.org/records/1');
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://example.org/file',
    'http://example.org/',
    'https://user:pass@example.org/'
  ]) {
    assert.equal(safeExternalUrl(url, 'https://map.example.org/'), null);
  }
});

test('custom service URLs require HTTPS outside localhost development', () => {
  assert.equal(parseServiceUrl('https://services.example.org/MapServer', 'map.example.org').protocol, 'https:');
  assert.equal(parseServiceUrl('http://localhost:8000/MapServer', 'localhost').protocol, 'http:');
  assert.equal(parseServiceUrl('http://127.0.0.1:8000/MapServer', '127.0.0.1').protocol, 'http:');
  assert.throws(() => parseServiceUrl('http://services.example.org/MapServer', 'map.example.org'), /must use HTTPS/);
  assert.throws(() => parseServiceUrl('http://services.example.org/MapServer', 'localhost'), /must use HTTPS/);
  assert.throws(() => parseServiceUrl('http://localhost/MapServer', 'map.example.org'), /must use HTTPS/);
  assert.throws(() => parseServiceUrl('http://[::1]:8000/MapServer', '[::1]'), /must use HTTPS/);
  assert.throws(() => parseServiceUrl('https://user:pass@example.org/MapServer', 'map.example.org'), /embedded credentials/);
});
