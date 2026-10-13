async function loadCompletions() {
  const el = document.getElementById('page-completions');
  el.innerHTML = loadingHTML();

  try {
    const [{ completions }, { taught }, { total, skills, avg_score, topSkills }] = await Promise.all([
      API.get('/api/completions/me'),
      API.get('/api/completions/taught'),
      API.get('/api/completions/stats')
    ]);

    el.innerHTML = `
      <div class="page-header">
        <h1>Skill Completions</h1>
        <p>Skills you have genuinely learned and taught, verified by mutual ratings.</p>
      </div>

      <div class="comp-stats-row">
        <div class="comp-stat-card">
          <div class="comp-stat-icon">&#10003;</div>
          <div class="comp-stat-val">${total}</div>
          <div class="comp-stat-lbl">Platform Completions</div>
        </div>
        <div class="comp-stat-card">
          <div class="comp-stat-icon">&#42;</div>
          <div class="comp-stat-val">${skills}</div>
          <div class="comp-stat-lbl">Unique Skills on Platform</div>
        </div>
        <div class="comp-stat-card">
          <div class="comp-stat-icon">&#9733;</div>
          <div class="comp-stat-val">${avg_score || '-'}</div>
          <div class="comp-stat-lbl">Platform Avg Rating</div>
        </div>
        <div class="comp-stat-card">
          <div class="comp-stat-icon">&#9650;</div>
          <div class="comp-stat-val">${escapeHTML(topSkills[0]?.skill || '-')}</div>
          <div class="comp-stat-lbl">Most Learned on Platform</div>
        </div>
      </div>

      <div class="section-title">Skills I Have Learned (${completions.length})</div>
      ${completions.length === 0
        ? `<div class="empty-card">
             <p>No completed swaps yet. Complete a swap and get rated to earn your first certificate!</p>
           </div>`
        : `<div class="cert-grid">${completions.map(c => certCardHTML(c, 'learned')).join('')}</div>`
      }

      <div class="section-title" style="margin-top:1.5rem">Skills I Have Taught (${taught.length})</div>
      ${taught.length === 0
        ? `<div class="empty-card"><p>No skills taught yet.</p></div>`
        : `<div class="cert-grid">${taught.map(c => certCardHTML(c, 'taught')).join('')}</div>`
      }

      ${topSkills.length > 0 ? `
        <div class="section-title" style="margin-top:1.5rem">Most Popular Skills on Platform</div>
        <div class="card">
          ${topSkills.map((s, i) => `
            <div class="top-skill-row">
              <span class="top-skill-rank">${i + 1}</span>
              <span class="top-skill-name">${escapeHTML(s.skill)}</span>
              <span class="top-skill-count">${s.times_learned} swap${s.times_learned > 1 ? 's' : ''}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function certCardHTML(c, type) {
  const isLearned = type === 'learned';
  const person = isLearned
    ? { name: c.teacher_name, avatar: c.teacher_avatar, picture: c.teacher_profile_picture, bio: c.teacher_bio, dept: c.teacher_dept, role: 'Taught by' }
    : { name: c.learner_name, avatar: c.learner_avatar, picture: c.learner_profile_picture, bio: c.learner_bio, dept: c.learner_dept, role: 'Learned by' };

  const mainSkill = isLearned ? c.skill_learned : c.skill_taught;
  const otherSkill = isLearned ? c.skill_taught : c.skill_learned;

  return `
    <div class="cert-card ${isLearned ? 'cert-learned' : 'cert-taught'}">
      <div class="cert-badge">${isLearned ? 'Learned' : 'Taught'}</div>
      <div class="cert-skill">${escapeHTML(mainSkill)}</div>
      <div class="cert-exchange">in exchange for teaching <strong>${escapeHTML(otherSkill)}</strong></div>

      <div class="cert-meta-row">
        ${avatarMarkup(person.picture, person.avatar || '??', 'sm')}
        <div>
          <div style="font-size:12px;font-weight:500;color:var(--text)">${person.role}: ${escapeHTML(person.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${escapeHTML(person.dept || 'Student')}</div>
          ${person.bio ? `<div class="muted">${escapeHTML(person.bio)}</div>` : ''}
        </div>
      </div>

      <div class="cert-footer">
        <div class="cert-info-item">
          <span>${starsHTML(Math.round(c.avg_score))} ${Number(c.avg_score).toFixed(1)}</span>
        </div>
        <div class="cert-info-item">
          ${c.total_sessions} session${c.total_sessions !== 1 ? 's' : ''}
        </div>
        <div class="cert-info-item">
          ${new Date(c.completed_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  `;
}
