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

test('automatically matches a new lost report to an existing found report', async () => {
  const foundUser = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Found Reporter', email: `found-${Date.now()}@college.edu`, password: 'password123' })
  });
  const foundForm = new FormData();
  for (const [key, value] of Object.entries({
    reportType: 'FOUND',
    title: 'Black leather wallet',
    category: 'wallet',
    description: 'Black leather wallet found near the library',
    colour: 'black',
    locationText: 'Library',
    eventDate: '2026-11-02',
    tags: 'black,leather,wallet'
  })) foundForm.append(key, value);
  foundForm.append('image', new Blob(['found image'], { type: 'image/png' }), 'wallet.png');
  const foundResponse = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${foundUser.body.token}` },
    body: foundForm
  });
  assert.equal(foundResponse.status, 201);

  const lostUser = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Lost Reporter', email: `lost-${Date.now()}@college.edu`, password: 'password123' })
  });
  const lostForm = new FormData();
  for (const [key, value] of Object.entries({
    reportType: 'LOST',
    title: 'Black leather wallet',
    category: 'wallet',
    description: 'I lost my black leather wallet near the library',
    colour: 'black',
    locationText: 'Library',
    eventDate: '2026-11-02',
    tags: 'black,leather,wallet'
  })) lostForm.append(key, value);
  lostForm.append('image', new Blob(['lost image'], { type: 'image/png' }), 'wallet.png');
  const lostResponse = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${lostUser.body.token}` },
    body: lostForm
  });
  const lost = await lostResponse.json();
  assert.equal(lostResponse.status, 201);
  assert.equal(lost.status, 'MATCHED');
  assert.ok(lost.potentialMatches.length >= 1);

  const notifications = await json('/api/v1/notifications', {
    headers: { Authorization: `Bearer ${lostUser.body.token}` }
  });
  assert.ok(notifications.body.results.some((item) => item.message.includes('Potential found-item match')));
});

test('allows image-first reports without manual title or category', async () => {
  const registration = await json('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Image First User', email: `image-first-${Date.now()}@college.edu`, password: 'password123' })
  });
  const form = new FormData();
  form.append('reportType', 'FOUND');
  form.append('locationText', 'Student Centre');
  form.append('eventDate', '2026-11-03');
  form.append('approximateTime', 'Around noon');
  form.append('brandOrIdentifyingText', 'Call 9876543210 if this is yours');
  form.append('description', 'Found near the desk; owner@example.com may identify it');
  form.append('image', new Blob(['image-first'], { type: 'image/png' }), 'item.png');

  const response = await fetch(`${baseUrl}/api/v1/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${registration.body.token}` },
    body: form
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.title, 'Unidentified item');
  assert.equal(body.category, 'Other');
  assert.match(body.brandOrIdentifyingText, /\[REDACTED_PHONE\]/);
  assert.match(body.description, /\[REDACTED_EMAIL\]/);
});
