const state = {
  token: localStorage.getItem('campus_token'),
  user: JSON.parse(localStorage.getItem('campus_user') || 'null')
};
const $ = (selector) => document.querySelector(selector);
const routeViews = { '/': 'search', '/report': 'report', '/mine': 'mine', '/admin': 'admin' };

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 4200);
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
      <span class="material-symbols-outlined">notifications</span><i class="notification-dot"></i>
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
  $('#notifications-button').addEventListener('click', loadNotifications);
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

  const viewName = routeViews[path] || 'search';
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `${viewName}-view`;
  });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.route === (path === '/' ? '/' : path)));
  if (viewName === 'search') loadReports();
  if (viewName === 'mine') loadMine();
  if (viewName === 'admin') loadAdmin();
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
        ${action || claim ? `<div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.8rem">${action}${claim}</div>` : ''}
      </div>
    </article>`;
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
    if (unread.length) {
      showToast(unread[0].message);
      await api(`/api/v1/notifications/${unread[0].id}/read`, { method: 'PATCH' });
    } else {
      showToast(data.results.length ? data.results[0].message : 'You have no new notifications.');
    }
  } catch (error) {
    showToast(error.message);
  }
}

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

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector('.submit-report');
  submit.disabled = true;
  submit.innerHTML = '<span class="material-symbols-outlined">progress_activity</span> Submitting...';
  try {
    const data = await api('/api/v1/reports', { method: 'POST', body: new FormData(event.target) });
    event.target.reset();
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
restoreSession();
