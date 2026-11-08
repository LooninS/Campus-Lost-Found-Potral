const state = { token: localStorage.getItem('campus_token'), user: null };
const $ = (selector) => document.querySelector(selector);
const message = (text = '') => { $('#message').textContent = text; };

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function showView(name) {
  if (!state.token && name !== 'auth') return;
  $('#auth-view').hidden = name !== 'auth';
  $('#app-view').hidden = name === 'auth';
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== `${name}-view`; });
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  if (name === 'search') loadReports();
  if (name === 'mine') loadMine();
}

function renderAuth() {
  $('#auth-actions').innerHTML = state.token
    ? `<span class="muted">${state.user?.fullName || ''}</span> <button class="ghost" id="logout">Log out</button>`
    : '';
  $('#logout')?.addEventListener('click', () => {
    localStorage.removeItem('campus_token');
    state.token = null;
    state.user = null;
    renderAuth();
    showView('auth');
  });
}

function card(report, mine = false) {
  const image = report.imageUrl ? `<img src="${report.imageUrl}" alt="${report.title}">` : '';
  const action = mine && ['ACTIVE', 'MATCHED', 'CLAIMED'].includes(report.status)
    ? `<button class="ghost status-button" data-id="${report.id}" data-status="${report.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE'}">${report.status === 'ACTIVE' ? 'Mark resolved' : 'Reopen'}</button>`
    : '';
  return `<article class="card">${image}<div class="card-body"><span class="badge">${report.reportType} · ${report.status}</span><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.category)} · ${escapeHtml(report.locationText)}</p><p>${escapeHtml(report.description || report.aiDescription || 'No description provided.')}</p><p class="muted">${report.eventDate}${report.colour ? ` · ${escapeHtml(report.colour)}` : ''}</p>${action}</div></article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

async function loadReports() {
  const form = $('#search-form');
  const query = new URLSearchParams(new FormData(form));
  const data = await api(`/api/v1/reports?${query}`);
  $('#result-count').textContent = `${data.results.length} result(s)`;
  $('#results').innerHTML = data.results.length ? data.results.map((item) => card(item)).join('') : '<div class="empty">No matching reports yet. Try a broader search.</div>';
}

async function loadMine() {
  const data = await api('/api/v1/reports/mine');
  $('#mine-results').innerHTML = data.results.length ? data.results.map((item) => card(item, true)).join('') : '<div class="empty">You have not submitted any reports.</div>';
  document.querySelectorAll('.status-button').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/v1/reports/${button.dataset.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: button.dataset.status }) });
      message('Report status updated.');
      loadMine();
    } catch (error) { message(error.message); }
  }));
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    state.token = data.token; state.user = data.user; localStorage.setItem('campus_token', data.token);
    renderAuth(); showView('search'); message('Welcome back.');
  } catch (error) { message(error.message); }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    state.token = data.token; state.user = data.user; localStorage.setItem('campus_token', data.token);
    renderAuth(); showView('search'); message('Account created.');
  } catch (error) { message(error.message); }
});

$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); loadReports().catch((error) => message(error.message)); });
$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/v1/reports', { method: 'POST', body: new FormData(event.target) });
    event.target.reset(); message(`Report submitted with ${data.aiStatus === 'DISABLED' ? 'manual description mode' : 'AI processing'}.`);
    showView('mine');
  } catch (error) { message(error.message); }
});
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));

renderAuth();
showView(state.token ? 'search' : 'auth');
