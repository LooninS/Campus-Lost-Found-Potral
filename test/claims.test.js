const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = `data/test-claims-${process.pid}`;
const app = require('../src/server');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

test('requires authentication and protects claim creation', async () => {
  const result = await request('/api/v1/reports/not-a-report/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I can identify the item.' })
  });
  assert.equal(result.response.status, 401);
});
