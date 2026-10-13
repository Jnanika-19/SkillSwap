// ── Global State ───────────────────────────────────────────
let currentUser = null;
let ratingCtx   = {}; // { request_id, ratee_id, ratee_name }
let selectedStar = 0;
let activeDialog = null;
let notificationPoll = null;

window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('App shell registration failed:', error));
  }
});

function activateDialog(overlay) {
  activeDialog?.cleanup?.();
  const dialog = overlay.matches('[role="dialog"]') ? overlay : overlay.querySelector('[role="dialog"]');
  if (!dialog) return;
  const previousFocus = document.activeElement;
  const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      overlay.id === 'rating-modal' ? closeRatingModal() : closeSendRequestModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeyDown);
  activeDialog = {
    cleanup() {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      activeDialog = null;
    }
  };
  (focusable()[0] || dialog).focus();
}

function closeSendRequestModal() {
  const overlay = document.getElementById('send-req-modal');
  if (overlay) overlay.remove();
  activeDialog?.cleanup?.();
}

// ── Boot ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const { user } = await API.me();
    currentUser = user;
    showApp();
  } catch {
    showAuth();
  }
});

// ── Auth ───────────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('skip-link').href = '#auth-screen';
  showLoginForm();
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('skip-link').href = '#main-content';
  updateSidebarUser();
  setupNav();
  refreshNotificationBadge();
  refreshPendingBadge();
  if (notificationPoll) clearInterval(notificationPoll);
  notificationPoll = setInterval(() => {
    refreshNotificationBadge();
    refreshPendingBadge();
  }, 30000);
  navigateTo('dashboard');
}

async function refreshPendingBadge() {
  const badge = document.getElementById('pending-badge');
  if (!badge || !currentUser) return;
  try {
    const { requests = [] } = await API.getRequests();
    const userId = Number(currentUser.user_id);
    const incoming = requests.filter(r => Number(r.to_user) === userId && r.status === 'pending');
    badge.textContent = incoming.length;
    badge.classList.toggle('hidden', incoming.length === 0);
  } catch (error) {
    console.warn('Unable to refresh pending requests count:', error.message);
  }
}

function refreshActiveView() {
  refreshNotificationBadge();
  refreshPendingBadge();
  const activePage = document.querySelector('.nav-link.active')?.dataset.page || 'dashboard';
  const loaders = {
    dashboard:   loadDashboard,
    matches:     loadMatches,
    requests:    loadRequests,
    notifications: loadNotifications,
    skills:      loadSkills,
    leaderboard:  loadLeaderboard,
    notes:       loadNotes,
    completions: loadCompletions,
    profile:     loadProfile
  };
  if (loaders[activePage]) return loaders[activePage]();
}

function switchAuth(tab) {
  document.getElementById('auth-tabs').classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.querySelectorAll('.auth-tab').forEach((t,i) => {
    t.classList.toggle('active', (i===0 && tab==='login') || (i===1 && tab==='register'));
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('login-tab').setAttribute('aria-selected', String(tab === 'login'));
  document.getElementById('register-tab').setAttribute('aria-selected', String(tab === 'register'));
}

function showLoginForm() {
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('auth-tabs').classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  switchAuth('login');
}

function showForgotPassword() {
  document.getElementById('auth-tabs').classList.add('hidden');
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.remove('hidden');
  document.getElementById('forgot-email').value = document.getElementById('login-email').value;
  document.getElementById('forgot-message').replaceChildren();
}

function showResetForm() {
  document.getElementById('auth-tabs').classList.add('hidden');
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.remove('hidden');
  document.getElementById('reset-code').value = '';
  document.getElementById('reset-password').value = '';
  document.getElementById('reset-message').textContent = '';
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const message = document.getElementById('forgot-message');
  const button = event.currentTarget.querySelector('[type="submit"]');
  message.replaceChildren();
  message.classList.remove('is-error');
  button.disabled = true;
  try {
    const result = await API.requestPasswordReset(document.getElementById('forgot-email').value);
    if (result.verificationCode) {
      showResetForm();
      document.getElementById('reset-message').textContent = `Local development verification code: ${result.verificationCode}`;
    } else {
      message.textContent = result.message;
    }
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  const message = document.getElementById('reset-message');
  const button = event.currentTarget.querySelector('[type="submit"]');
  message.textContent = '';
  message.classList.remove('is-error');
  button.disabled = true;
  try {
    const result = await API.resetPassword(
      document.getElementById('reset-code').value,
      document.getElementById('reset-password').value
    );
    history.replaceState(null, '', window.location.pathname);
    showLoginForm();
    const loginError = document.getElementById('login-error');
    loginError.textContent = result.message;
    loginError.classList.add('is-success');
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  const button = e.currentTarget.querySelector('[type="submit"]');
  const originalText = button.textContent;
  errEl.textContent = '';
  errEl.classList.remove('is-success');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const { user } = await API.login({
      email:    document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });
    currentUser = user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('reg-error');
  const button = e.currentTarget.querySelector('[type="submit"]');
  const originalText = button.textContent;
  errEl.textContent = '';
  button.disabled = true;
  button.textContent = 'Creating account…';
  try {
    const { user } = await API.register({
      name:       document.getElementById('reg-name').value,
      email:      document.getElementById('reg-email').value,
      password:   document.getElementById('reg-password').value,
      department: document.getElementById('reg-dept').value
    });
    currentUser = user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function handleLogout() {
  try {
    await API.logout();
    if (notificationPoll) clearInterval(notificationPoll);
    notificationPoll = null;
    currentUser = null;
    showAuth();
  } catch (err) {
    showToast(err.message || 'Unable to log out. Please try again.', 'error');
  }
}

// ── Sidebar ────────────────────────────────────────────────
function updateSidebarUser() {
  if (!currentUser) return;
  document.getElementById('sidebar-name').textContent  = currentUser.name;
  document.getElementById('sidebar-dept').textContent  = currentUser.department || '';
  setAvatarElement(document.getElementById('sidebar-avatar'), currentUser.profile_picture, currentUser.avatar || currentUser.name.slice(0,2).toUpperCase());
}

function isProfilePictureUrl(value) {
  return typeof value === 'string' && /^\/api\/users\/avatar\/[a-f0-9]{32}\.(?:png|jpe?g|webp)$/.test(value);
}

function avatarMarkup(picture, initials, size = '') {
  const image = isProfilePictureUrl(picture)
    ? `<img class="avatar-image" src="${picture}" alt="" loading="lazy" />`
    : escapeHTML(initials || '??');
  return `<div class="avatar ${size}" aria-hidden="true">${image}</div>`;
}

function setAvatarElement(element, picture, initials) {
  if (!element) return;
  if (isProfilePictureUrl(picture)) {
    const image = document.createElement('img');
    image.className = 'avatar-image';
    image.src = picture;
    image.alt = '';
    element.replaceChildren(image);
  } else {
    element.textContent = initials || '??';
  }
}

function setupNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.nav-link').forEach(l => {
    const active = l.dataset.page === page;
    l.classList.toggle('active', active);
    if (active) l.setAttribute('aria-current', 'page');
    else l.removeAttribute('aria-current');
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
    p.classList.toggle('hidden', p.id !== `page-${page}`);
  });
  // Load page content
  const loaders = {
    dashboard:   loadDashboard,
    matches:     loadMatches,
    requests:    loadRequests,
    notifications: loadNotifications,
    skills:      loadSkills,
    leaderboard:  loadLeaderboard,
    notes:       loadNotes,
    completions: loadCompletions,
    profile:     loadProfile
  };
  if (loaders[page]) return loaders[page]();
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, type='success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 3000);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function jsString(value) {
  const quoted = JSON.stringify(String(value ?? ''))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  // Values are embedded in inline HTML attributes. Escape for the HTML parser
  // after producing a valid JavaScript string literal.
  return escapeHTML(quoted);
}

// ── Stars HTML helper ──────────────────────────────────────
function starsHTML(score) {
  return [...Array(5)].map((_,i) =>
    `<span class="star ${i < score ? '' : 'empty'}">★</span>`
  ).join('');
}

// ── Rating Modal ───────────────────────────────────────────
function openRatingModal(request_id, ratee_id, ratee_name) {
  ratingCtx = { request_id, ratee_id };
  selectedStar = 0;
  document.getElementById('rating-modal-subtitle').textContent = `Rating ${ratee_name}`;
  document.getElementById('rating-comment').value = '';
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));
  const overlay = document.getElementById('rating-modal');
  overlay.classList.remove('hidden');

  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.onclick = () => {
      selectedStar = +btn.dataset.val;
      document.querySelectorAll('.star-btn').forEach((s,i) => {
        s.classList.toggle('active', i < selectedStar);
        s.setAttribute('aria-pressed', String(i === selectedStar - 1));
        s.style.color = i < selectedStar ? 'var(--warn)' : 'var(--bg3)';
      });
    };
  });
  activateDialog(overlay);
}

function closeRatingModal() {
  document.getElementById('rating-modal').classList.add('hidden');
  activeDialog?.cleanup?.();
}

async function submitRating() {
  if (!selectedStar) return showToast('Please pick a star rating', 'error');
  const btn = document.querySelector('#rating-modal .btn-primary');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Submitting…';
  }
  try {
    await API.submitRating({
      request_id: ratingCtx.request_id,
      ratee_id:   ratingCtx.ratee_id,
      score:      selectedStar,
      comment:    document.getElementById('rating-comment').value
    });
    closeRatingModal();
    showToast('Rating submitted!');
    refreshActiveView();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit Rating';
    }
  }
}

// ── Loading helper ─────────────────────────────────────────
function loadingHTML() {
  return `<div class="loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span class="sr-only">Loading content</span></div>`;
}
