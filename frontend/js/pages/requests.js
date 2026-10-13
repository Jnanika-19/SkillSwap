async function loadRequests() {
  const el = document.getElementById('page-requests');
  el.innerHTML = loadingHTML();

  try {
    const { requests } = await API.getRequests();
    // Normalize IDs because API/database adapters can return INTs as either numbers or strings.
    const userId = Number(currentUser.user_id);
    const incoming = requests.filter(r => Number(r.to_user) === userId && r.status === 'pending');
    const outgoing = requests.filter(r => Number(r.from_user) === userId && r.status === 'pending');
    const active = requests.filter(r => r.status === 'accepted');
    const history = requests.filter(r => ['completed', 'declined'].includes(r.status));

    const badge = document.getElementById('pending-badge');
    badge.textContent = incoming.length;
    badge.classList.toggle('hidden', incoming.length === 0);

    el.innerHTML = `
      <div class="page-header">
        <h1>Swap Requests</h1>
        <p>Manage incoming and outgoing skill exchange requests.</p>
      </div>

      ${incoming.length > 0 ? `
        <div class="section-title">Incoming (${incoming.length})</div>
        ${incoming.map(r => requestCardHTML(r, true)).join('')}
      ` : ''}

      <div class="section-title">Sent / Pending (${outgoing.length})</div>
      ${outgoing.length > 0
        ? outgoing.map(r => requestCardHTML(r, true)).join('')
        : requests.length > 0
          ? '<div class="empty-card"><p>No outgoing requests are pending.</p></div>'
          : `<div class="empty-state"><p>You have not sent any requests yet.</p><br><button class="btn-primary" onclick="navigateTo('matches')">View Matches</button></div>`}

      ${active.length > 0 ? `
        <div class="section-title">Active Swaps</div>
        ${active.map(r => requestCardHTML(r, true)).join('')}
      ` : ''}

      ${history.length > 0 ? `
        <div class="section-title">History</div>
        ${history.map(r => requestCardHTML(r, true)).join('')}
      ` : ''}

      ${requests.length > 0 && incoming.length === 0 && outgoing.length === 0 && active.length === 0 && history.length === 0 ? `
        <div class="empty-state"><p>No requests are associated with this account yet.</p></div>
      ` : ''}

    `;
    if (window.highlightRequestId) {
      const card = document.getElementById(`swap-request-${window.highlightRequestId}`);
      if (card) {
        card.classList.add('request-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      window.highlightRequestId = null;
    }
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function navigateToNotes(requestId) {
  window._notesSelectedReq = Number(requestId);
  navigateTo('notes');
}

function requestCardHTML(r, isRequestPage = false) {
  const isIncoming = Number(r.to_user) === Number(currentUser.user_id);
  const otherName = isIncoming ? r.from_name : r.to_name;
  const otherAv = isIncoming ? r.from_avatar : r.to_avatar;
  const otherPicture = isIncoming ? r.from_profile_picture : r.to_profile_picture;
  const otherBio = isIncoming ? r.from_bio : r.to_bio;
  const otherId = isIncoming ? r.from_user : r.to_user;
  const userAlreadyRated = Number(r.user_rated) > 0;

  const actions = [];
  if (r.status === 'pending' && isIncoming) {
    actions.push(`<button type="button" class="btn-success btn-sm" onclick="doStatus(this, ${r.request_id},'accepted')">Accept</button>`);
    actions.push(`<button type="button" class="btn-danger btn-sm" onclick="doStatus(this, ${r.request_id},'declined')">Decline</button>`);
  } else if (r.status === 'pending') {
    actions.push(`<button type="button" class="btn-ghost btn-sm" onclick="cancelSwapRequest(this, ${r.request_id})">Cancel request</button>`);
  }
  if (r.status === 'accepted') {
    actions.push(`<button type="button" class="btn-primary btn-sm" onclick="doStatus(this, ${r.request_id},'completed')">Mark Complete</button>`);
    actions.push(`<button type="button" class="btn-ghost btn-sm" onclick="navigateToNotes(${r.request_id})">Session Notes</button>`);
  }
  if (r.status === 'completed') {
    if (userAlreadyRated) {
      actions.push(`<span class="tag tag-match" style="align-self:center">&#9733; Rated</span>`);
    } else {
      actions.push(`<button type="button" class="btn-ghost btn-sm" onclick="openRatingModal(${r.request_id}, ${otherId}, ${jsString(otherName)})">&#9733; Rate</button>`);
    }
    actions.push(`<button type="button" class="btn-ghost btn-sm" onclick="navigateToNotes(${r.request_id})">Session Notes</button>`);
  }

  return `
    <div class="request-card" ${isRequestPage ? `id="swap-request-${Number(r.request_id)}"` : ''}>
      <div class="request-header">
        ${avatarMarkup(otherPicture, otherAv, 'sm')}
        <div>
          <strong>${escapeHTML(otherName)}</strong>
          <div class="muted">${isIncoming ? 'incoming' : 'sent'} &middot; ${new Date(r.created_at).toLocaleDateString()}</div>
        </div>
        <span class="status-pill status-${escapeHTML(r.status)}">${escapeHTML(r.status)}</span>
      </div>
      ${otherBio ? `<p class="request-profile-bio">${escapeHTML(otherBio)}</p>` : ''}
      <div class="request-skills">
        <span class="tag tag-offered">Offering: ${escapeHTML(r.offered_skill)}</span>
        &nbsp;&rarr;&nbsp;
        <span class="tag tag-requested">Wants: ${escapeHTML(r.requested_skill)}</span>
      </div>
      ${r.message ? `<p style="font-size:13px;color:var(--muted);margin-bottom:10px">"${escapeHTML(r.message)}"</p>` : ''}
      ${actions.length ? `<div class="request-actions">${actions.join('')}</div>` : ''}
    </div>
  `;
}

async function cancelSwapRequest(btn, id) {
  if (btn && btn.disabled) return;
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelling…';
  }
  try {
    await API.cancelRequest(id);
    showToast('Pending request cancelled.');
    await refreshActiveView();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function doStatus(btn, id, status) {
  if (btn && btn.disabled) return;
  const parentActions = btn ? btn.closest('.request-actions') : null;
  const originalText = btn ? btn.textContent : '';
  if (parentActions) {
    parentActions.querySelectorAll('button').forEach(b => { b.disabled = true; });
  } else if (btn) {
    btn.disabled = true;
  }
  if (btn) {
    btn.textContent = status === 'accepted' ? 'Accepting…' : status === 'declined' ? 'Declining…' : 'Completing…';
  }
  try {
    await API.updateStatus(id, status);
    showToast(`Request ${status}!`);
    await refreshActiveView();
  } catch (err) {
    showToast(err.message, 'error');
    if (parentActions) {
      parentActions.querySelectorAll('button').forEach(b => { b.disabled = false; });
    } else if (btn) {
      btn.disabled = false;
    }
    if (btn) btn.textContent = originalText;
  }
}
