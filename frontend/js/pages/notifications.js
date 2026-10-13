async function refreshNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge || !currentUser) return;
  try {
    const { unreadCount } = await API.getNotifications();
    badge.textContent = unreadCount;
    badge.classList.toggle('hidden', unreadCount === 0);
    badge.setAttribute('aria-label', `${unreadCount} unread notifications`);
  } catch (error) {
    console.warn('Unable to refresh notification count:', error.message);
  }
}

async function loadNotifications() {
  const el = document.getElementById('page-notifications');
  el.innerHTML = loadingHTML();
  try {
    const { notifications, unreadCount } = await API.getNotifications();
    const badge = document.getElementById('notification-badge');
    badge.textContent = unreadCount;
    badge.classList.toggle('hidden', unreadCount === 0);
    badge.setAttribute('aria-label', `${unreadCount} unread notifications`);

    el.innerHTML = `
      <div class="page-header notification-header">
        <div><h1>Notifications</h1><p>Updates about your skill swaps.</p></div>
        ${unreadCount ? '<button type="button" class="btn-ghost" onclick="markAllNotificationsRead(this)">Mark all as read</button>' : ''}
      </div>
      ${notifications.length ? `<div class="notification-list">${notifications.map(notification => `
        <article class="notification-card ${notification.is_read ? '' : 'unread'}">
          <span class="notification-indicator" aria-hidden="true"></span>
          <div class="notification-copy">
            <h2>${escapeHTML(notification.title)}</h2>
            <p>${escapeHTML(notification.message)}</p>
            <time>${escapeHTML(new Date(notification.created_at).toLocaleString())}</time>
          </div>
          ${notification.is_read ? '' : `<button type="button" class="btn-ghost notification-read" onclick="markNotificationRead(${Number(notification.notification_id)}, this)">Mark read</button>`}
          ${notification.request_id ? `<button type="button" class="btn-primary notification-open" onclick="openNotificationRequest(${Number(notification.notification_id)}, ${Number(notification.request_id)}, this)">View request</button>` : ''}
        </article>`
      ).join('')}</div>` : '<div class="empty-card notification-empty">You’re all caught up. New swap requests and updates will show here.</div>'}
    `;
  } catch (error) {
    el.innerHTML = `<p class="danger">${escapeHTML(error.message || 'Unable to load notifications')}</p>`;
  }
}

async function markNotificationRead(id, btn) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await API.readNotification(id);
    await refreshNotificationBadge();
    await loadNotifications();
  } catch (error) {
    showToast(error.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function markAllNotificationsRead(btn) {
  if (btn && btn.disabled) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    await API.readAllNotifications();
    await refreshNotificationBadge();
    await loadNotifications();
  } catch (error) {
    showToast(error.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Mark all as read';
    }
  }
}

async function openNotificationRequest(notificationId, requestId, btn) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await API.readNotification(notificationId);
    await refreshNotificationBadge();
    window.highlightRequestId = String(requestId);
    await navigateTo('requests');
  } catch (error) {
    showToast(error.message, 'error');
    if (btn) btn.disabled = false;
  }
}
