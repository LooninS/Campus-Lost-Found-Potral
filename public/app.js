const state = {
  token: localStorage.getItem('campus_token'),
  user: JSON.parse(localStorage.getItem('campus_user') || 'null')
};
const $ = (selector) => document.querySelector(selector);
const routeViews = { '/': 'search', '/report': 'report', '/mine': 'mine', '/admin': 'admin' };
const reportDraftKey = 'campus_report_draft';

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 4200);
}

function saveReportDraft() {
  const form = $('#report-form');
  if (!form) return;
  const draft = Object.fromEntries(new FormData(form));
  delete draft.image;
  localStorage.setItem(reportDraftKey, JSON.stringify(draft));
}

function restoreReportDraft() {
  const form = $('#report-form');
  if (!form) return;
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(reportDraftKey) || 'null');
  } catch {
    localStorage.removeItem(reportDraftKey);
    return;
  }
  if (!draft) return;
  for (const [name, value] of Object.entries(draft)) {
    const field = form.elements[name];
    if (!field) continue;
    if (field instanceof RadioNodeList) {
      [...field].forEach((input) => { input.checked = input.value === value; });
    } else {
      field.value = value;
    }
  }
}

function setReportDefaults() {
  const form = $('#report-form');
  if (!form) return;
  const current = new Date();
  if (!form.elements.eventDate.value) {
    const localDate = new Date(current.getTime() - current.getTimezoneOffset() * 60000);
    form.elements.eventDate.value = localDate.toISOString().slice(0, 10);
  }
  if (!form.elements.approximateTime.value) {
    form.elements.approximateTime.value = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
  }
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && state.token) {
    localStorage.removeItem('campus_token');
    localStorage.removeItem('campus_user');
    state.token = null;
    state.user = null;
    renderAuthActions();
    navigate('/login', true);
    showToast('Your session expired. Please sign in again.');
  }
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function initials(name = 'Student') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function renderAuthActions() {
  const actions = $('#auth-actions');
  $('#main-nav').hidden = false;
  $('#admin-nav').hidden = !state.token || state.user?.role !== 'ADMIN';
  const mobileAdmin = $('.mobile-admin-link');
  if (mobileAdmin) mobileAdmin.hidden = !state.token || state.user?.role !== 'ADMIN';
  if (!state.token) {
    actions.innerHTML = '<button class="button secondary-button" data-route="/login">Sign in</button>';
    return;
  }
  actions.innerHTML = `
    <button class="icon-button" aria-label="Notifications" id="notifications-button">
      <span class="material-symbols-outlined">notifications</span><i class="notification-dot" hidden></i>
    </button>
    <button class="button primary-button desktop-report" data-route="/report"><span class="material-symbols-outlined">add</span> Report item</button>
    <div class="profile">
      <span class="avatar">${initials(state.user?.fullName)}</span>
      <span class="profile-copy"><strong>${escapeHtml(state.user?.fullName || 'Student')}</strong><small>Campus member</small></span>
    </div>
    <button class="icon-button" id="logout" aria-label="Log out"><span class="material-symbols-outlined">logout</span></button>
  `;
  $('#logout').addEventListener('click', () => {
    localStorage.removeItem('campus_token');
    state.token = null;
    state.user = null;
    localStorage.removeItem('campus_user');
    renderAuthActions();
    navigate('/');
  });
  $('#notifications-button').addEventListener('click', () => {
    const panel = $('#notifications-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) loadNotifications();
  });
}

function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  renderRoute();
}

function showView(name) {
  if (name === 'auth') return navigate('/login');
  return navigate(Object.entries(routeViews).find(([, view]) => view === name)?.[0] || '/');
}

function renderRoute() {
  const path = window.location.pathname;
  const authenticated = Boolean(state.token);
  const protectedRoute = path !== '/' && path !== '/login';
  document.body.classList.toggle('auth-route', path === '/login');

  if (path === '/login') {
    if (authenticated) return navigate('/', true);
    $('#landing-view').hidden = true;
    $('#auth-view').hidden = false;
    $('#app-view').hidden = true;
    return;
  }

  if (!authenticated && protectedRoute) {
    return navigate(`/login?redirect=${encodeURIComponent(path)}`, true);
  }

  $('#landing-view').hidden = authenticated || path !== '/';
  $('#auth-view').hidden = true;
  $('#app-view').hidden = !authenticated;
  if (!authenticated) return;

  const itemMatch = path.match(/^\/item\/([^/]+)$/);
  const viewName = itemMatch ? 'item' : (routeViews[path] || 'search');
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `${viewName}-view`;
  });
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
    const active = link.dataset.route === (path === '/' ? '/' : path);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (viewName === 'search') loadReports();
  if (viewName === 'mine') loadMine();
  if (viewName === 'admin') loadAdmin();
  if (viewName === 'item') loadItemDetail(itemMatch[1]);
}

function statusBadge(report) {
  const status = report.status.toLowerCase();
  const type = report.reportType.toLowerCase();
  const label = report.status === 'MATCHED' ? 'AI matched' : `${report.reportType} · ${report.status}`;
  return `<span class="badge ${status === 'matched' ? 'matched' : type}">${report.status === 'MATCHED' ? '<span class="material-symbols-outlined">auto_awesome</span>' : ''}${label}</span>`;
}

function card(report, mine = false) {
  const image = report.imageUrl
    ? `<img src="${report.imageUrl}" alt="${escapeHtml(report.title)}">`
    : `<div class="placeholder"><span class="material-symbols-outlined">inventory_2</span></div>`;
  const match = report.status === 'MATCHED' ? '<span class="ai-match"><span class="material-symbols-outlined">auto_awesome</span> Potential match</span>' : '';
  const action = mine && ['ACTIVE', 'MATCHED', 'CLAIMED'].includes(report.status)
    ? `<button class="button secondary-button status-button" data-id="${report.id}" data-status="${report.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE'}">${report.status === 'ACTIVE' ? 'Mark resolved' : 'Reopen'}</button>`
    : '';
  const claim = !mine && report.reportType === 'FOUND' && ['ACTIVE', 'MATCHED'].includes(report.status)
    ? `<button class="button secondary-button claim-button" data-id="${report.id}">Claim item</button>`
    : '';
  return `
    <article class="card">
      <div class="card-image">${image}</div>
      <div class="card-body">
        <div class="card-topline">${statusBadge(report)}${match}</div>
        <h3>${escapeHtml(report.title)}</h3>
        <p class="card-meta"><span class="material-symbols-outlined">location_on</span>${escapeHtml(report.locationText)} · ${escapeHtml(report.eventDate)}</p>
        <p>${escapeHtml(report.description || report.aiDescription || 'No description provided.')}</p>
        ${report.tags?.length ? `<p class="card-meta">${report.tags.slice(0, 4).map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>` : ''}
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.8rem"><button class="button secondary-button" data-route="/item/${report.id}">View details</button>${action}${claim}</div>
      </div>
    </article>`;
}

async function loadItemDetail(id) {
  try {
    const data = await api(`/api/v1/reports/${encodeURIComponent(id)}`);
    const report = data.report;
    const image = report.imageUrl
      ? `<img class="detail-image" src="${report.imageUrl}" alt="${escapeHtml(report.title)}">`
      : '<div class="detail-image placeholder"><span class="material-symbols-outlined">inventory_2</span></div>';
    const claim = report.reportType === 'FOUND' && ['ACTIVE', 'MATCHED'].includes(report.status)
      ? '<button id="detail-claim" class="button primary-button">Claim this item</button>'
      : '';
    $('#item-detail').innerHTML = `
      <button class="button secondary-button" data-route="/">← Back to reports</button>
      <div class="detail-layout">
        <div>${image}</div>
        <article class="detail-card">
          <div class="card-topline">${statusBadge(report)}</div>
          <h2>${escapeHtml(report.title)}</h2>
          <p class="card-meta"><span class="material-symbols-outlined">location_on</span>${escapeHtml(report.locationText)} · ${escapeHtml(report.eventDate)} · ${escapeHtml(report.approximateTime || 'Time not provided')}</p>
          <dl class="detail-facts">
            <div><dt>Category</dt><dd>${escapeHtml(report.category)}</dd></div>
            <div><dt>Colour</dt><dd>${escapeHtml(report.colour || 'Not specified')}</dd></div>
            <div><dt>Condition</dt><dd>${escapeHtml(report.condition || 'Not specified')}</dd></div>
            <div><dt>Accessories</dt><dd>${escapeHtml(report.accessories?.join(', ') || 'None specified')}</dd></div>
          </dl>
          <p>${escapeHtml(report.description || report.aiDescription || 'No description provided.')}</p>
          ${report.brandOrIdentifyingText ? `<p><strong>Identifying details:</strong> ${escapeHtml(report.brandOrIdentifyingText)}</p>` : ''}
          ${report.tags?.length ? `<p class="card-meta">${report.tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>` : ''}
          ${claim}
        </article>
      </div>
      <div class="detail-card status-history"><h3>Status history</h3>${data.history.length ? data.history.map((entry) => `<p><strong>${escapeHtml(entry.new_status)}</strong><small>${new Date(entry.created_at).toLocaleString()}</small></p>`).join('') : '<p>No status history available.</p>'}</div>`;
    $('#detail-claim')?.addEventListener('click', async () => {
      const message = window.prompt('Tell the admin how you can identify this item:');
      if (!message) return;
      try {
        await api(`/api/v1/reports/${report.id}/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        showToast('Claim submitted for admin verification.');
        loadItemDetail(report.id);
      } catch (error) {
        showToast(error.message);
      }
    });
  } catch (error) {
    $('#item-detail').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadReports() {
  const query = new URLSearchParams(new FormData($('#search-form')));
  const data = await api(`/api/v1/reports?${query}`);
  $('#result-count').textContent = `${data.results.length} report${data.results.length === 1 ? '' : 's'}`;
  $('#results').innerHTML = data.results.length
    ? data.results.map((item) => card(item)).join('')
    : '<div class="empty"><span class="material-symbols-outlined">search_off</span><br>No matching reports yet. Try a broader search.</div>';
  $('#stat-total').textContent = data.results.length;
  document.querySelectorAll('.claim-button').forEach((button) => button.addEventListener('click', async () => {
    const claimMessage = window.prompt('Tell the admin how you can identify this item:');
    if (!claimMessage) return;
    try {
      await api(`/api/v1/reports/${button.dataset.id}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: claimMessage })
      });
      showToast('Claim submitted for admin verification.');
      loadReports();
    } catch (error) {
      showToast(error.message);
    }
  }));
}

async function loadMine() {
  const data = await api('/api/v1/reports/mine');
  $('#mine-results').innerHTML = data.results.length
    ? data.results.map((item) => card(item, true)).join('')
    : '<div class="empty"><span class="material-symbols-outlined">inventory_2</span><br>You have not submitted any reports.</div>';
  document.querySelectorAll('.status-button').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/api/v1/reports/${button.dataset.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: button.dataset.status })
      });
      showToast('Report status updated.');
      loadMine();
    } catch (error) {
      showToast(error.message);
    }
  }));
}

async function loadNotifications() {
  try {
    const data = await api('/api/v1/notifications');
    const unread = data.results.filter((notification) => !notification.isRead);
    $('.notification-dot').hidden = unread.length === 0;
    $('#notifications-list').innerHTML = data.results.length
      ? data.results.map((notification) => `
        <article class="notification-item${notification.isRead ? '' : ' unread'}">
          <span class="material-symbols-outlined">${notification.isRead ? 'notifications_none' : 'notifications_active'}</span>
          <p>${escapeHtml(notification.message)}<small>${new Date(notification.createdAt).toLocaleString()}</small></p>
          ${notification.isRead ? '' : `<button class="notification-read" data-id="${notification.id}">Mark read</button>`}
        </article>`).join('')
      : '<div class="empty">No notifications yet.</div>';
    document.querySelectorAll('.notification-read').forEach((button) => button.addEventListener('click', async () => {
      try {
        await api(`/api/v1/notifications/${button.dataset.id}/read`, { method: 'PATCH' });
        loadNotifications();
      } catch (error) {
        showToast(error.message);
      }
    }));
  } catch (error) {
    showToast(error.message);
  }
}

$('#close-notifications').addEventListener('click', () => { $('#notifications-panel').hidden = true; });

async function loadAdmin() {
  try {
    const [stats, claims, reports, users] = await Promise.all([
      api('/api/v1/admin/statistics'),
      api('/api/v1/admin/claims'),
      api('/api/v1/admin/reports'),
      api('/api/v1/admin/users')
    ]);
    $('#admin-stats').innerHTML = `
        <div class="admin-stats">
          <div class="admin-stat"><strong>${stats.totals.reports || 0}</strong><small>Total reports</small></div>
          <div class="admin-stat"><strong>${stats.totals.lost || 0}</strong><small>Lost reports</small></div>
          <div class="admin-stat"><strong>${stats.totals.found || 0}</strong><small>Found reports</small></div>
          <div class="admin-stat"><strong>${stats.totals.resolved || 0}</strong><small>Resolved</small></div>
        </div>`;
    $('#admin-claims').innerHTML = claims.results.length ? claims.results.map((claim) => `
        <div class="admin-row"><div><strong>${escapeHtml(claim.report_title)}</strong><small>${escapeHtml(claim.claimant_name)} · ${escapeHtml(claim.message)}</small></div>
        <div class="admin-action">${claim.verification_status === 'PENDING' ? `<button class="button secondary-button claim-review" data-id="${claim.id}" data-status="APPROVED">Approve</button><button class="button secondary-button claim-review" data-id="${claim.id}" data-status="REJECTED">Reject</button>` : `<small>${claim.verification_status}</small>`}</div></div>
      `).join('') : '<div class="empty">No claims need review.</div>';
    $('#admin-reports').innerHTML = reports.results.length ? reports.results.slice(0, 12).map((report) => `
        <div class="admin-row"><div><strong>${escapeHtml(report.title)}</strong><small>${report.reportType} · ${report.status} · ${escapeHtml(report.reporterName)}</small></div>
        ${report.status !== 'REMOVED' ? `<button class="button secondary-button remove-report" data-id="${report.id}">Remove</button>` : '<small>Removed</small>'}</div>
      `).join('') : '<div class="empty">No reports yet.</div>';
    $('#admin-users').innerHTML = users.results.length ? users.results.slice(0, 12).map((user) => `
        <div class="admin-row"><div><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.college_email)} · ${user.role}</small></div>
        <button class="button secondary-button user-toggle" data-id="${user.id}" data-active="${user.isActive}">${user.isActive ? 'Deactivate' : 'Activate'}</button></div>
      `).join('') : '<div class="empty">No users yet.</div>';
    document.querySelectorAll('.claim-review').forEach((button) => button.addEventListener('click', async () => {
      try {
        await api(`/api/v1/admin/claims/${button.dataset.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: button.dataset.status }) });
        showToast(`Claim ${button.dataset.status.toLowerCase()}.`);
        loadAdmin();
      } catch (error) {
        showToast(error.message);
      }
    }));
    document.querySelectorAll('.remove-report').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm('Remove this report from public search?')) return;
      try {
        await api(`/api/v1/admin/reports/${button.dataset.id}/remove`, { method: 'PATCH' });
        showToast('Report removed.');
        loadAdmin();
      } catch (error) {
        showToast(error.message);
      }
    }));
    document.querySelectorAll('.user-toggle').forEach((button) => button.addEventListener('click', async () => {
      try {
        await api(`/api/v1/admin/users/${button.dataset.id}/active`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: button.dataset.active !== 'true' }) });
        showToast('Account access updated.');
        loadAdmin();
      } catch (error) {
        showToast(error.message);
      }
    }));
  } catch (error) {
    showToast(error.message);
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(event.target)))
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('campus_token', data.token);
    localStorage.setItem('campus_user', JSON.stringify(data.user));
    $('#welcome-name').textContent = data.user.fullName.split(' ')[0];
    renderAuthActions();
    navigate(new URLSearchParams(window.location.search).get('redirect') || '/');
    showToast('Welcome back to the campus portal.');
  } catch (error) {
    showToast(error.message);
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(event.target)))
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('campus_token', data.token);
    localStorage.setItem('campus_user', JSON.stringify(data.user));
    $('#welcome-name').textContent = data.user.fullName.split(' ')[0];
    renderAuthActions();
    navigate(new URLSearchParams(window.location.search).get('redirect') || '/');
    showToast('Your campus account is ready.');
  } catch (error) {
    showToast(error.message);
  }
});

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadReports().catch((error) => showToast(error.message));
});

const imageInput = $('#report-form input[name="image"]');
const uploadBox = $('#upload-box');

async function analyzeSelectedImage(event) {
  const file = event.target.files?.[0];
  const status = $('#ai-draft-status');
  const preview = $('#image-preview');
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute('src');
    status.textContent = 'Waiting for a photo.';
    return;
  }
  if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
  const objectUrl = URL.createObjectURL(file);
  preview.dataset.objectUrl = objectUrl;
  preview.src = objectUrl;
  preview.hidden = false;
  status.textContent = 'Sarvam AI is analyzing the photo...';
  const formData = new FormData();
  formData.append('image', file);
  try {
    const result = await api('/api/v1/ai/describe', { method: 'POST', body: formData });
    if (result.status === 'LOW_CONFIDENCE') {
      status.textContent = 'AI draft has low confidence. Enter the item details manually.';
      return;
    }
    if (result.status !== 'SUCCEEDED') {
      status.textContent = 'AI is not enabled. Enter any missing details manually.';
      return;
    }
    const form = $('#report-form');
    const fillIfEmpty = (name, value) => {
      const field = form.elements[name];
      if (field && !field.value && value) field.value = value;
    };
    fillIfEmpty('title', result.short_description);
    fillIfEmpty('category', result.item_category);
    fillIfEmpty('colour', result.colour);
    fillIfEmpty('condition', result.condition);
    fillIfEmpty('brandOrIdentifyingText', result.brand_or_identifying_text);
    fillIfEmpty('accessories', result.accessories?.join(', '));
    fillIfEmpty('description', result.detailed_description || result.short_description);
    fillIfEmpty('tags', result.search_keywords?.join(', '));
    saveReportDraft();
    status.textContent = `Draft ready for review${result.confidence !== undefined ? ` (${Math.round(result.confidence * 100)}% confidence)` : ''}.`;
  } catch (error) {
    status.textContent = 'AI could not analyze this photo. You can continue with manual details.';
    showToast(error.message);
  }
}

imageInput.addEventListener('change', analyzeSelectedImage);
uploadBox.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadBox.classList.add('drag-over');
});
uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('drag-over'));
uploadBox.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadBox.classList.remove('drag-over');
  const file = event.dataTransfer.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  imageInput.files = transfer.files;
  imageInput.dispatchEvent(new Event('change', { bubbles: true }));
});
uploadBox.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    imageInput.click();
  }
});

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector('.submit-report');
  submit.disabled = true;
  submit.innerHTML = '<span class="material-symbols-outlined">progress_activity</span> Submitting...';
  try {
    const data = await api('/api/v1/reports', { method: 'POST', body: new FormData(event.target) });
    event.target.reset();
    const preview = $('#image-preview');
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    preview.hidden = true;
    preview.removeAttribute('src');
    delete preview.dataset.objectUrl;
    localStorage.removeItem(reportDraftKey);
    const matchMessage = data.potentialMatches?.length
      ? `${data.potentialMatches.length} potential found-item match(es) found automatically.`
      : 'No related active found-item reports were found.';
    showToast(`Report submitted. ${matchMessage}`);
    navigate('/mine');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Submit report <span class="material-symbols-outlined">arrow_forward</span>';
  }
});

$('#report-form').addEventListener('input', saveReportDraft);
$('#report-form').addEventListener('change', saveReportDraft);

document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-route]');
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.route);
});

async function restoreSession() {
  if (!state.token) {
    renderAuthActions();
    renderRoute();
    return;
  }
  try {
    if (!state.user) state.user = await api('/api/v1/users/me');
    $('#welcome-name').textContent = state.user.fullName.split(' ')[0];
    renderAuthActions();
    renderRoute();
  } catch {
    localStorage.removeItem('campus_token');
    localStorage.removeItem('campus_user');
    state.token = null;
    state.user = null;
    renderAuthActions();
    navigate('/login', true);
  }
}

window.addEventListener('popstate', renderRoute);
restoreReportDraft();
setReportDefaults();
restoreSession();
