async function loadSkills() {
  const el = document.getElementById('page-skills');
  el.innerHTML = loadingHTML();

  try {
    const { offered, requested } = await API.getMySkills();

    el.innerHTML = `
      <div class="page-header">
        <h1>My Skills</h1>
        <p>Skills you offer are what others can learn from you. Skills you want drive your matches.</p>
      </div>

      <div class="skills-grid">
        <div class="card">
          <div class="section-title">Skills I Offer</div>
          <div id="offered-list">
            ${offered.length === 0
              ? '<p class="muted">No skills added yet.</p>'
              : offered.map(s => skillRowHTML(s, 'offered')).join('')}
          </div>
          <form class="add-skill-row" id="form-add-offered" onsubmit="addOffered(event)">
            <label class="sr-only" for="new-offered-name">Skill you can teach</label>
            <input type="text" id="new-offered-name" maxlength="80" required placeholder="Skill name (e.g. Python)" />
            <label class="sr-only" for="new-offered-prof">Your proficiency</label>
            <select id="new-offered-prof" aria-label="Your proficiency">
              <option value="beginner">Beginner</option>
              <option value="intermediate" selected>Intermediate</option>
              <option value="expert">Expert</option>
            </select>
            <button type="submit" class="btn-primary btn-sm" id="btn-add-offered">Add skill</button>
          </form>
        </div>

        <div class="card">
          <div class="section-title">Skills I Want to Learn</div>
          <div id="requested-list">
            ${requested.length === 0
              ? '<p class="muted">No skills added yet.</p>'
              : requested.map(s => skillRowHTML(s, 'requested')).join('')}
          </div>
          <form class="add-skill-row" id="form-add-requested" onsubmit="addRequested(event)">
            <label class="sr-only" for="new-req-name">Skill you want to learn</label>
            <input type="text" id="new-req-name" maxlength="80" required placeholder="Skill name (e.g. Figma)" />
            <label class="sr-only" for="new-req-urgency">Learning urgency</label>
            <select id="new-req-urgency" aria-label="Learning urgency">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
            <button type="submit" class="btn-primary btn-sm" id="btn-add-requested">Add skill</button>
          </form>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function skillRowHTML(s, type) {
  const meta = type === 'offered' ? s.proficiency : `${s.urgency} urgency`;
  const delFn = type === 'offered' ? `delOffered(this, ${s.id})` : `delRequested(this, ${s.id})`;
  return `
    <div class="skill-item" id="skill-${type}-${s.id}">
      <div>
        <div class="skill-name">${escapeHTML(s.skill_name)}</div>
        <div class="skill-meta">${escapeHTML(meta)}</div>
      </div>
      <button type="button" class="del-btn" onclick="${delFn}" title="Remove" aria-label="Remove ${escapeHTML(s.skill_name)}">&times;</button>
    </div>
  `;
}

async function addOffered(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('new-offered-name');
  const btn = document.getElementById('btn-add-offered');
  const name = input ? input.value.trim() : '';
  const prof = document.getElementById('new-offered-prof')?.value || 'intermediate';
  if (!name) return showToast('Enter a skill you can teach first.', 'error');
  if (btn && btn.disabled) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    await API.addOffered({ skill_name: name, proficiency: prof });
    if (input) input.value = '';
    showToast(`"${name}" added!`);
    await loadSkills();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add skill';
    }
  }
}

async function addRequested(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('new-req-name');
  const btn = document.getElementById('btn-add-requested');
  const name = input ? input.value.trim() : '';
  const urgency = document.getElementById('new-req-urgency')?.value || 'medium';
  if (!name) return showToast('Enter a skill you want to learn first.', 'error');
  if (btn && btn.disabled) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    await API.addRequested({ skill_name: name, urgency });
    if (input) input.value = '';
    showToast(`"${name}" added!`);
    await loadSkills();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add skill';
    }
  }
}

async function delOffered(btn, id) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await API.deleteOffered(id);
    document.getElementById(`skill-offered-${id}`)?.remove();
    showToast('Skill removed');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function delRequested(btn, id) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await API.deleteRequested(id);
    document.getElementById(`skill-requested-${id}`)?.remove();
    showToast('Skill removed');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}
