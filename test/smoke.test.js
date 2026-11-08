const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = `data/test-smoke-${process.pid}-${Date.now()}`;
const request = require('node:http');

test('project exposes the public application after startup', async () => {
  const app = require('../src/server');
  assert.ok(app);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id')?.length, 36);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
