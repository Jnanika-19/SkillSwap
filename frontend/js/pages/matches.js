async function loadMatches() {
  const el = document.getElementById('page-matches');
  el.innerHTML = loadingHTML();

  try {
    const [{ matches: allMatches }, { requests }] = await Promise.all([
      API.getMatches(),
      API.getRequests()
    ]);
    // Keep the current account out of the list even if an older backend returns it.
    const matches = allMatches.filter(match => Number(match.user_id) !== Number(currentUser.user_id));
    const userId = Number(currentUser.user_id);

    el.innerHTML = `
      <div class="page-header">
        <h1>My Matches</h1>
        <p>Students matched both ways: they offer what you need, and want what you offer.</p>
      </div>
      ${matches.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">&#9678;</div>
             <p>No matches yet. Add more skills to get matched!</p>
             <br><button class="btn-primary" onclick="navigateTo('skills')">Add Skills</button>
           </div>`
        : `<div class="card-grid">${matches.map(match => {
            const related = requests
              .filter(request => Number(request.from_user) === userId && Number(request.to_user) === Number(match.user_id)
                || Number(request.to_user) === userId && Number(request.from_user) === Number(match.user_id))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const requestState = related.find(request => request.status === 'pending' || request.status === 'accepted');
            return matchCardHTML(match, requestState, Number(requestState?.from_user) === userId);
          }).join('')}</div>`
      }
    `;
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function matchCardHTML(m, requestState, isOutgoing) {
  const matchedArr = m.matched_skills ? m.matched_skills.split(',') : [];
  const name = escapeHTML(m.name);
  const department = escapeHTML(m.department || 'Student');

  return `
    <div class="match-card">
      <div class="match-card-header">
        ${avatarMarkup(m.profile_picture, m.avatar)}
        <div class="match-info">
          <h4>${name}</h4>
          <p>${department} &middot; ${starsHTML(Math.round(m.avg_rating))} ${Number(m.avg_rating).toFixed(1)}</p>
        </div>
        <div class="match-score-badge">&#9889; ${m.match_score}</div>
      </div>
      ${m.bio ? `<p class="match-bio">${escapeHTML(m.bio)}</p>` : ''}
      <div class="skill-tags">
        ${matchedArr.map(s => `<span class="tag tag-match">&#8644; ${escapeHTML(s)}</span>`).join('')}
      </div>
      ${requestState?.status === 'pending'
        ? isOutgoing
          ? '<button class="btn-ghost btn-sm full" type="button" disabled>Request pending · waiting for response</button>'
          : `<button class="btn-primary btn-sm full" type="button" onclick="navigateTo('requests')">Review incoming request &rarr;</button>`
        : requestState?.status === 'accepted'
          ? `<button class="btn-ghost btn-sm full" type="button" onclick="navigateTo('requests')">Active swap · view details</button>`
          : `<button class="btn-primary btn-sm full" type="button" onclick="sendQuickRequest(this, ${Number(m.user_id)}, ${jsString(m.name)}, ${jsString(m.matched_skills || '')})">Send Swap Request</button>
             <button class="btn-ghost btn-sm full" type="button" onclick="openSendRequest(this, ${Number(m.user_id)}, ${jsString(m.name)})">Customize skills or message</button>`}
    </div>
  `;
}

async function sendQuickRequest(button, toUserId, toName, matchedSkillsText) {
  if (button.disabled) return;
  const parentCard = button.closest('.match-card');
  const siblingBtns = parentCard ? parentCard.querySelectorAll('button') : [button];
  siblingBtns.forEach(b => { b.disabled = true; });
  button.textContent = 'Checking skills…';

  try {
    const [{ offered }, profile] = await Promise.all([
      API.getMySkills(),
      API.get(`/api/users/${toUserId}`)
    ]);

    const theirOffered = profile.offered || [];
    const theirRequested = profile.requested || [];
    if (!offered.length) {
      throw new Error('Please add at least one skill you can teach under My Skills before sending a swap request.');
    }
    if (!theirOffered.length) {
      throw new Error(`${toName} has not added any skills to teach yet.`);
    }

    const offeredSkill = offered.find(skill => theirRequested.some(wanted => wanted.skill_name.toLowerCase() === skill.skill_name.toLowerCase())) || offered[0];
    const matchedSkills = matchedSkillsText.split(',').map(skill => skill.trim().toLowerCase()).filter(Boolean);
    const requestedSkill = theirOffered.find(skill => matchedSkills.includes(skill.skill_name.toLowerCase())) || theirOffered[0];
    button.textContent = 'Saving request…';
    const result = await API.sendRequest({
      to_user: toUserId,
      offered_skill: offeredSkill.skill_name,
      requested_skill: requestedSkill.skill_name,
      message: `Hi ${toName}, I’d like to exchange ${offeredSkill.skill_name} for ${requestedSkill.skill_name}. Let me know if you’re interested!`
    });
    if (!result.success || !result.request_id) throw new Error('The server did not confirm that the request was saved.');

    window.highlightRequestId = String(result.request_id);
    showToast(`Request sent to ${toName}; it is pending their response.`);
    await refreshPendingBadge();
    await navigateTo('requests');
  } catch (err) {
    showToast(err.message, 'error');
    siblingBtns.forEach(b => { b.disabled = false; });
    button.textContent = 'Send Swap Request';
  }
}

async function openSendRequest(triggerBtn, toUserId, toName) {
  if (document.getElementById('send-req-modal')) return;
  if (triggerBtn && triggerBtn.disabled) return;
  const originalText = triggerBtn ? triggerBtn.textContent : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Loading…';
  }

  try {
    if (Number(toUserId) === Number(currentUser.user_id)) {
      throw new Error('You cannot send a swap request to your own account.');
    }
    const [{ offered }, profile] = await Promise.all([
      API.getMySkills(),
      API.get(`/api/users/${toUserId}`)
    ]);

    const theirOffered = profile.offered || [];
    if (!offered.length) {
      throw new Error('Please add at least one skill you can teach under My Skills first.');
    }
    if (!theirOffered.length) {
      throw new Error(`${toName} has not added any skills to teach yet.`);
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'send-req-modal';
    modal.innerHTML = `
      <form class="modal" id="send-req-form" role="dialog" aria-modal="true" aria-labelledby="send-request-title">
        <h3 id="send-request-title">Send Swap Request</h3>
        <p style="margin-bottom:1rem">To: <strong>${escapeHTML(toName)}</strong></p>

        <div class="field">
          <label for="sr-offered">I will teach (my skill)</label>
          <select id="sr-offered" required>
            ${offered.map(s => `<option value="${escapeHTML(s.skill_name)}">${escapeHTML(s.skill_name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sr-requested">I want to learn (their skill)</label>
          <select id="sr-requested" required>
            ${theirOffered.map(s => `<option value="${escapeHTML(s.skill_name)}">${escapeHTML(s.skill_name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sr-message">Message (optional)</label>
          <textarea id="sr-message" maxlength="1000" placeholder="Introduce yourself..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" type="button" onclick="closeSendRequestModal()">Cancel</button>
          <button class="btn-primary" id="send-req-submit" type="submit">Send request to ${escapeHTML(toName)}</button>
        </div>
        <div id="sr-error" class="form-error" role="alert" aria-live="polite"></div>
      </form>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#send-req-form').addEventListener('submit', event => {
      event.preventDefault();
      submitSendRequest(toUserId, toName);
    });
    activateDialog(modal);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = originalText;
    }
  }
}

async function submitSendRequest(toUserId, toName) {
  const submitButton = document.getElementById('send-req-submit');
  const errorMessage = document.getElementById('sr-error');
  if (submitButton && submitButton.disabled) return;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sending request…';
  }
  if (errorMessage) errorMessage.textContent = '';

  try {
    const result = await API.sendRequest({
      to_user: toUserId,
      offered_skill: document.getElementById('sr-offered').value,
      requested_skill: document.getElementById('sr-requested').value,
      message: document.getElementById('sr-message').value
    });
    if (!result.success || !result.request_id) throw new Error('The server did not confirm that the request was saved. Please try again.');
    closeSendRequestModal();
    window.highlightRequestId = String(result.request_id);
    showToast(`Request sent to ${toName} and is now pending.`);
    await refreshPendingBadge();
    await navigateTo('requests');
  } catch (err) {
    if (errorMessage) errorMessage.textContent = err.message;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = `Send request to ${toName}`;
    }
    errorMessage?.focus?.();
  }
}
