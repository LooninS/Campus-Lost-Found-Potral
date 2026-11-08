const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = `data/test-api-${process.pid}`;
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

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

test('registers, creates, searches, and resolves a report', async () => {
  const email = `student-${Date.now()}@college.edu`;
  const registration = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Test Student', email, password: 'password123' })
  });
  assert.equal(registration.response.status, 201);
  const token = registration.body.token;

  const form = new FormData();
  form.append('reportType', 'LOST');
  form.append('title', 'Blue campus bottle');
  form.append('category', 'water bottle');
  form.append('description', 'Blue metal bottle with black cap');
  form.append('colour', 'blue');
  form.append('locationText', 'Library entrance');
  form.append('eventDate', '2026-11-01');
  form.append('tags', 'blue,metal,bottle');
  form.append('image', new Blob(['prototype image'], { type: 'image/png' }), 'bottle.png');

  const createdResponse = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);
  assert.equal(created.status, 'ACTIVE');

  const search = await json('/api/v1/reports?q=blue%20bottle');
  assert.equal(search.response.status, 200);
  assert.ok(search.body.results.some((item) => item.id === created.id));

  const resolved = await json(`/api/v1/reports/${created.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'RESOLVED' })
  });
  assert.equal(resolved.response.status, 409);

  const removed = await json(`/api/v1/reports/${created.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'EXPIRED' })
  });
  assert.equal(removed.response.status, 200);
});
