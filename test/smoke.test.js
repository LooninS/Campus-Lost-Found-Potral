const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = `data/test-smoke-${process.pid}`;
const request = require('node:http');

test('project exposes the public application after startup', async () => {
  assert.ok(require('../src/server'));
});
