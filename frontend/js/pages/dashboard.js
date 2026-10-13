async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = loadingHTML();

  try {
    const [{ offered = [], requested = [] }, { requests = [] }, { matches = [] }, streak = { currentStreak: 0, longestStreak: 0, week: [] }] = await Promise.all([
      API.getMySkills(),
      API.getRequests(),
      API.getMatches(),
      API.getStreak()
    ]);

    const userId = Number(currentUser?.user_id);
    const incoming = requests.filter(r => Number(r.to_user) === userId && r.status === 'pending');
    const outgoing = requests.filter(r => Number(r.from_user) === userId && r.status === 'pending');
    const active = requests.filter(r => r.status === 'accepted');
    const completed = requests.filter(r => r.status === 'completed');
    const needsRating = completed.filter(r => Number(r.user_rated) === 0);
    const pendingTotal = incoming.length + outgoing.length;
    const firstName = escapeHTML((currentUser?.name || 'Student').split(' ')[0]);
    const hasMatches = matches.length > 0;
    const ratingValue = (Number(currentUser?.avg_rating) || 0) > 0 ? Number(currentUser.avg_rating).toFixed(1) : '-';

    const badge = document.getElementById('pending-badge');
    if (badge) {
      badge.textContent = incoming.length;
      badge.classList.toggle('hidden', incoming.length === 0);
    }

    // Determine high-priority next action recommendation
    let nextActionTitle = 'Your learning network';
    let nextActionCopy = 'Add skills you can teach and want to learn to find the right exchange partner.';
    let nextActionBtnText = 'Add your skills';
    let nextActionTarget = 'skills';

    if (offered.length === 0) {
      nextActionTitle = 'List skills you can teach';
      nextActionCopy = 'Share your strengths so campus peers can discover you and propose a swap.';
      nextActionBtnText = 'Add skills to teach &rarr;';
      nextActionTarget = 'skills';
    } else if (requested.length === 0) {
      nextActionTitle = 'List skills you want to learn';
      nextActionCopy = 'Tell SkillSwap what you are looking to learn to unlock bidirectional matches.';
      nextActionBtnText = 'Add skills wanted &rarr;';
      nextActionTarget = 'skills';
    } else if (incoming.length > 0) {
      nextActionTitle = `Incoming request${incoming.length > 1 ? 's' : ''} awaiting review`;
      nextActionCopy = `You have ${incoming.length} student${incoming.length > 1 ? 's' : ''} waiting to start exchanging skills with you.`;
      nextActionBtnText = 'Review requests &rarr;';
      nextActionTarget = 'requests';
    } else if (active.length > 0) {
      nextActionTitle = `${active.length} active skill swap${active.length > 1 ? 's' : ''} in progress`;
      nextActionCopy = 'Track sessions, log notes, and share learning resources with your swap partners.';
      nextActionBtnText = 'Log session notes &rarr;';
      nextActionTarget = 'notes';
    } else if (needsRating.length > 0) {
      nextActionTitle = 'Completed swaps ready for review';
      nextActionCopy = 'Leave feedback for your exchange partner. Mutual 3+ star ratings issue completion certificates!';
      nextActionBtnText = 'Rate your partner &rarr;';
      nextActionTarget = 'requests';
    } else if (hasMatches) {
      nextActionTitle = `${matches.length} bidirectional match${matches.length === 1 ? '' : 'es'} ready`;
      nextActionCopy = 'You and your peers already have reciprocal skills ready to swap.';
      nextActionBtnText = 'Explore matches &rarr;';
      nextActionTarget = 'matches';
    }

    el.innerHTML = `
      <div class="page-header">
        <h1>Welcome back, ${firstName}</h1>
        <p>Here's what's happening with your skill exchanges.</p>
      </div>

      <section class="dashboard-hero" aria-label="Next steps in your learning network">
        <div class="dashboard-hero-copy">
          <div class="hero-kicker"><span></span> NEXT BEST ACTION</div>
          <h2>${nextActionTitle}</h2>
          <p>${nextActionCopy}</p>
          <div class="hero-actions">
            <button type="button" class="btn-primary" onclick="navigateTo('${nextActionTarget}')">${nextActionBtnText}</button>
            <button type="button" class="hero-secondary" onclick="navigateTo('${nextActionTarget === 'skills' ? 'matches' : 'skills'}')">${nextActionTarget === 'skills' ? 'View Matches' : 'Manage Skills'}</button>
          </div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="hero-orbit orbit-one"></div>
          <div class="hero-orbit orbit-two"></div>
          <div class="hero-exchange-card">
            <span class="hero-card-icon">&#10022;</span>
            <span><strong>Learn by sharing</strong><small>Skills grow better together</small></span>
          </div>
          <div class="hero-float hero-float-one">Teach <b>&#8599;</b></div>
          <div class="hero-float hero-float-two">Learn <b>&#8598;</b></div>
        </div>
      </section>

      <section class="streak-card" aria-labelledby="streak-heading">
        <div class="streak-summary">
          <div class="streak-flame" aria-hidden="true">&#128293;</div>
          <div><h2 id="streak-heading">Learning streak</h2>
            <p><strong>${streak.currentStreak}</strong> day${streak.currentStreak === 1 ? '' : 's'} in a row <span aria-hidden="true">&middot;</span> longest: ${streak.longestStreak} day${streak.longestStreak === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div class="streak-week" role="img" aria-label="Learning activity over the last seven days: ${streak.week.map(day => `${new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} ${day.active ? 'active' : 'inactive'}`).join(', ')}">
          ${streak.week.map(day => `<div class="streak-day ${day.active ? 'is-active' : ''}" aria-hidden="true"><span>${new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span><i></i></div>`).join('')}
        </div>
      </section>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon">&#9670;</div>
          <div class="stat-val">${offered.length}</div>
          <div class="stat-lbl">Skills Offered</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#9671;</div>
          <div class="stat-val">${requested.length}</div>
          <div class="stat-lbl">Skills Wanted</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#9678;</div>
          <div class="stat-val">${matches.length}</div>
          <div class="stat-lbl">Matches Found</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#9677;</div>
          <div class="stat-val">${pendingTotal}</div>
          <div class="stat-lbl">Pending Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#9733;</div>
          <div class="stat-val">${ratingValue}</div>
          <div class="stat-lbl">Your Rating</div>
        </div>
      </div>

      ${active.length > 0 ? `
        <div class="section-title">Active Swaps in Progress (${active.length})</div>
        <div style="margin-bottom:2rem">
          ${active.map(r => requestCardHTML(r)).join('')}
        </div>
      ` : ''}

      ${incoming.length > 0 ? `
        <div class="section-title">Incoming Requests Awaiting Response (${incoming.length})</div>
        <div style="margin-bottom:2rem">
          ${incoming.map(r => requestCardHTML(r)).join('')}
        </div>
      ` : ''}

      ${outgoing.length > 0 ? `
        <div class="section-title">Waiting for a Reply (${outgoing.length})</div>
        <div style="margin-bottom:2rem">
          ${outgoing.map(r => requestCardHTML(r)).join('')}
        </div>
      ` : ''}

      ${hasMatches ? `
        <div class="section-title">Top Bidirectional Matches</div>
        <div class="card-grid" style="margin-bottom:2rem">
          ${matches.slice(0, 3).map(m => {
            const related = requests
              .filter(r => (Number(r.from_user) === userId && Number(r.to_user) === Number(m.user_id))
                || (Number(r.to_user) === userId && Number(r.from_user) === Number(m.user_id)))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const state = related.find(r => ['pending', 'accepted'].includes(r.status));
            return matchCardHTML(m, state, Number(state?.from_user) === userId);
          }).join('')}
        </div>
      ` : `
        <div class="card" style="margin-bottom:2rem;text-align:center;padding:2rem">
          <p style="color:var(--muted);margin-bottom:12px">Add skills you can teach and skills you want to learn to get matched with peers!</p>
          <button type="button" class="btn-primary" onclick="navigateTo('skills')">Add Skills &rarr;</button>
        </div>
      `}
    `;
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}
