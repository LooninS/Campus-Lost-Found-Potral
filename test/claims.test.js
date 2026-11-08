const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.DATA_DIR = `data/test-claims-${process.pid}-${Date.now()}`;
process.env.COLLEGE_EMAIL_DOMAIN = 'college.edu';
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

test('rejects a token for a user missing from the active database', async () => {
  const token = jwt.sign(
    { id: 'missing-user', role: 'USER', email: 'missing@college.edu' },
    process.env.JWT_SECRET || 'development-secret',
    { expiresIn: '2h' }
  );
  const result = await request('/api/v1/notifications', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(result.response.status, 401);
  assert.match(result.body.error, /sign in again/i);
});

test('rejects administrator endpoints for ordinary users', async () => {
  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Normal User', email: `normal-${Date.now()}@college.edu`, password: 'password123' })
  });
  assert.equal(registration.response.status, 201);
  const result = await request('/api/v1/admin/statistics', {
    headers: { Authorization: `Bearer ${registration.body.token}` }
  });
  assert.equal(result.response.status, 403);
});
