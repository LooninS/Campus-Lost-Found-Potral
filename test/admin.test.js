const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATA_DIR = `data/test-admin-${process.pid}`;
process.env.ADMIN_EMAILS = 'test-admin@college.edu';
process.env.ADMIN_PASSWORD = 'AdminTest@2026!';

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

test('bootstraps and authenticates the configured administrator', async () => {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-admin@college.edu', password: 'AdminTest@2026!' })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.role, 'ADMIN');

  const statistics = await request('/api/v1/admin/statistics', {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  assert.equal(statistics.response.status, 200);
  assert.ok(statistics.body.totals);
});

test('allows an administrator to review a claim and resolve the found report', async () => {
  const foundUser = await request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Found Reporter', email: `found-${Date.now()}@college.edu`, password: 'password123' })
  });
  const foundForm = new FormData();
  for (const [key, value] of Object.entries({
    reportType: 'FOUND',
    title: 'Silver campus keys',
    category: 'keys',
    description: 'Silver keys with a blue tag',
    colour: 'silver',
    locationText: 'SAC entrance',
    eventDate: '2026-11-08',
    tags: 'silver,keys,blue'
  })) foundForm.append(key, value);
  foundForm.append('image', new Blob(['keys image'], { type: 'image/png' }), 'keys.png');
  const foundResponse = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${foundUser.body.token}` },
    body: foundForm
  });
  const found = await foundResponse.json();
  assert.equal(foundResponse.status, 201);

  const claimant = await request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Claimant Student', email: `claimant-${Date.now()}@college.edu`, password: 'password123' })
  });
  const claim = await request(`/api/v1/reports/${found.id}/claims`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${claimant.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I can identify the blue tag and the key pattern.' })
  });
  assert.equal(claim.response.status, 201);

  const admin = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-admin@college.edu', password: 'AdminTest@2026!' })
  });
  const review = await request(`/api/v1/admin/claims/${claim.body.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${admin.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'APPROVED' })
  });
  assert.equal(review.response.status, 200);
  assert.equal(review.body.status, 'APPROVED');

  const detail = await request(`/api/v1/reports/${found.id}`);
  assert.equal(detail.body.report.status, 'RESOLVED');
  const notifications = await request('/api/v1/notifications', {
    headers: { Authorization: `Bearer ${claimant.body.token}` }
  });
  assert.ok(notifications.body.results.some((item) => item.message.includes('approved')));
});
