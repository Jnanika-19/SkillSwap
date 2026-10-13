async function loadNotes() {
  const el = document.getElementById('page-notes');
  el.innerHTML = loadingHTML();

  try {
    const { requests } = await API.getRequests();
    const active = requests.filter(r => ['accepted', 'completed'].includes(r.status));

    if (active.length === 0) {
      el.innerHTML = `
        <div class="page-header"><h1>Session Notes</h1><p>Log what you teach and learn in each session.</p></div>
        <div class="empty-state">
          <div class="empty-icon">&#9776;</div>
          <p>No active swaps yet. Accept a swap request to start logging sessions!</p>
          <br><button class="btn-primary" onclick="navigateTo('requests')">Go to Requests</button>
        </div>`;
      return;
    }

    const selectedId = active.some(r => Number(r.request_id) === Number(window._notesSelectedReq))
      ? window._notesSelectedReq
      : active[0].request_id;
    window._notesSelectedReq = selectedId;

    el.innerHTML = `
      <div class="page-header">
        <h1>Session Notes</h1>
        <p>Track what is taught and learned in each session of your swap.</p>
      </div>

      <div class="swap-selector">
        <div class="field-label" id="select-swap-label">Select Swap</div>
        <div class="swap-tabs" id="swap-tabs">
          ${active.map(r => {
            const isSender = Number(r.from_user) === Number(currentUser?.user_id);
            const other = isSender ? r.to_name : r.from_name;
            const otherAv = isSender ? r.to_avatar : r.from_avatar;
            return `
              <button type="button" class="swap-tab ${Number(r.request_id) === Number(selectedId) ? 'active' : ''}"
                   data-request-id="${r.request_id}"
                   aria-pressed="${Number(r.request_id) === Number(selectedId)}"
                   aria-describedby="select-swap-label"
                   onclick="selectSwap(${r.request_id})">
                ${avatarMarkup(isSender ? r.to_profile_picture : r.from_profile_picture, otherAv, 'sm')}
                <span>
                  <span style="display:block;font-size:13px;font-weight:500">${escapeHTML(other)}</span>
                  <span style="display:block;font-size:11px;color:var(--muted)">${escapeHTML(r.offered_skill)} &#8644; ${escapeHTML(r.requested_skill)}</span>
                </span>
              </button>`;
          }).join('')}
        </div>
      </div>

      <div id="notes-content">${loadingHTML()}</div>
    `;

    loadNotesForSwap(selectedId);
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function selectSwap(rid) {
  window._notesSelectedReq = rid;
  document.querySelectorAll('.swap-tab').forEach(t => {
    t.classList.toggle('active', Number(t.dataset.requestId) === rid)
    t.setAttribute('aria-pressed', String(Number(t.dataset.requestId) === rid));
  });
  loadNotesForSwap(rid);
}

async function loadNotesForSwap(rid) {
  const el = document.getElementById('notes-content');
  if (!el) return;
  el.innerHTML = loadingHTML();

  try {
    const [notesData, materialsData, quizzesData] = await Promise.all([
      API.get(`/api/notes/${rid}`),
      API.get(`/api/notes/${rid}/materials`),
      API.get(`/api/notes/quizzes/${rid}`)
    ]);
    const { notes, progress } = notesData;
    const bySession = {};
    notes.forEach(n => {
      if (!bySession[n.session_no]) bySession[n.session_no] = [];
      bySession[n.session_no].push(n);
    });

    const sessionNums = Object.keys(bySession).sort((a, b) => a - b);

    el.innerHTML = `
      ${progress ? `
      <div class="progress-bar-card">
        <div class="progress-stats">
          <div class="prog-stat"><span class="prog-val">${progress.sessions_done || 0}</span><span class="prog-lbl">Sessions Done</span></div>
          <div class="prog-stat"><span class="prog-val">${progress.total_notes || 0}</span><span class="prog-lbl">Total Notes</span></div>
          <div class="prog-stat"><span class="prog-val">${progress.total_minutes || 0}m</span><span class="prog-lbl">Time Spent</span></div>
          <div class="prog-stat"><span class="prog-val">${progress.last_session ? new Date(progress.last_session).toLocaleDateString() : '-'}</span><span class="prog-lbl">Last Session</span></div>
        </div>
      </div>` : ''}

      <div class="add-note-card">
        <div class="section-title">Log a New Session Note</div>
        <div class="add-note-form">
          <div class="note-form-row">
            <div class="field" style="flex:0 0 120px">
              <label for="note-session-no">Session #</label>
              <input type="number" id="note-session-no" min="1" max="10000" placeholder="Auto" value="${(progress?.sessions_done || 0) + 1}" />
            </div>
            <div class="field" style="flex:0 0 120px">
              <label for="note-duration">Duration (min)</label>
              <input type="number" id="note-duration" min="1" max="1440" value="60" />
            </div>
            <div class="field" style="flex:1">
              <label for="note-topic">Topic Covered</label>
              <input type="text" id="note-topic" maxlength="200" placeholder="e.g. React Hooks - useState & useEffect" required />
            </div>
          </div>
          <div class="field">
            <label for="note-notes">What was taught / learned</label>
            <textarea id="note-notes" maxlength="5000" rows="3" placeholder="Describe what was covered in this session..."></textarea>
          </div>
          <div class="field">
            <label for="note-resources">Resources / Links shared</label>
            <input type="text" id="note-resources" maxlength="2000" placeholder="https://docs.example.com, YouTube link, etc." />
          </div>
          <button type="button" class="btn-primary" id="btn-add-note" onclick="addNote(this, ${rid})">Add Session Note</button>
        </div>
      </div>

      <div class="section-title" style="margin-top:1.5rem">Session Timeline</div>
      ${sessionNums.length === 0
        ? `<div class="empty-state" style="padding:2rem"><p>No notes yet. Log your first session above!</p></div>`
        : sessionNums.map(sno => `
            <div class="session-block">
              <div class="session-header">
                <span class="session-badge">Session ${sno}</span>
                <span style="font-size:12px;color:var(--muted)">${bySession[sno].length} note(s)</span>
              </div>
              ${bySession[sno].map(n => noteCardHTML(n)).join('')}
            </div>
          `).join('')
      }

      <section class="learning-tools-card" aria-labelledby="materials-heading">
        <div class="section-title" id="materials-heading">Learning Materials</div>
        <p class="muted">Share PDFs, short videos, and text files with the other person in this swap.</p>
        <form class="material-upload-form" onsubmit="uploadStudyMaterial(event, ${rid})">
          <div class="field"><label for="material-title">Title</label><input id="material-title" name="title" maxlength="120" placeholder="e.g. React Hooks reference" required /></div>
          <div class="field"><label for="material-description">Description (optional)</label><input id="material-description" name="description" maxlength="1000" placeholder="What should your partner know?" /></div>
          <div class="field"><label for="material-file">Choose a file</label><input id="material-file" name="file" type="file" accept=".pdf,.mp4,.webm,.mov,.txt,.md,application/pdf,video/mp4,video/webm,video/quicktime,text/plain,text/markdown" required /><small>PDF up to 25 MB, video up to 100 MB, TXT/Markdown up to 2 MB.</small></div>
          <button type="submit" class="btn-primary">Upload Material</button>
        </form>
        <div id="study-material-list" class="study-material-list">
          ${materialsData.materials.length ? materialsData.materials.map(materialCardHTML).join('') : '<p class="muted">No materials shared yet.</p>'}
        </div>
      </section>

      <section class="learning-tools-card" aria-labelledby="quiz-heading">
        <div class="section-title" id="quiz-heading">Practice Quizzes</div>
        <p class="muted">Create a multiple-choice quiz or try one your swap partner shared.</p>
        <div class="quiz-builder">
          <div class="field"><label for="study-quiz-title">Quiz title</label><input id="study-quiz-title" maxlength="120" placeholder="e.g. JavaScript basics" /></div>
          <div id="quiz-question-editor"></div>
          <div class="quiz-builder-actions"><button type="button" class="btn-ghost" onclick="addQuizQuestion()">Add question</button><button type="button" class="btn-primary" onclick="createStudyQuiz(this, ${rid})">Create Quiz</button></div>
        </div>
        <div id="study-quiz-list" class="study-quiz-list">
          ${quizzesData.quizzes.length ? quizzesData.quizzes.map(quizCardHTML).join('') : '<p class="muted">No quizzes yet. Create one to help each other practice.</p>'}
        </div>
      </section>
    `;
    addQuizQuestion();
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}

function noteCardHTML(n) {
  const isOwn = Number(n.author_id) === Number(currentUser?.user_id);
  return `
    <div class="note-card ${isOwn ? 'own' : 'other'}">
      <div class="note-header">
        ${avatarMarkup(n.author_profile_picture, n.author_avatar, 'sm')}
        <div>
          <span class="note-author">${escapeHTML(n.author_name)}</span>
          <span class="note-time">${new Date(n.created_at).toLocaleDateString()} &middot; ${n.duration_min} min</span>
        </div>
        ${isOwn ? `<button type="button" class="del-btn" onclick="deleteNote(this, ${n.note_id})" title="Delete" aria-label="Delete note">&times;</button>` : ''}
      </div>
      <div class="note-topic">${escapeHTML(n.topic)}</div>
      ${n.notes ? `<div class="note-body">${escapeHTML(n.notes)}</div>` : ''}
      ${n.resources ? `<div class="note-resources">${escapeHTML(n.resources)}</div>` : ''}
    </div>
  `;
}

function formatMaterialSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function materialCardHTML(material) {
  const fileUrl = `/api/notes/materials/${Number(material.material_id)}/file`;
  const isOwn = Number(material.author_id) === Number(currentUser?.user_id);
  const isVideo = String(material.mime_type).startsWith('video/');
  const isPdf = material.mime_type === 'application/pdf';
  let preview = isPdf
    ? `<a class="btn-ghost material-open-link" href="${fileUrl}" target="_blank" rel="noopener">Open PDF</a>`
    : `<a class="btn-ghost material-open-link" href="${fileUrl}" download>Download text file</a>`;
  if (isVideo) preview = `<video class="study-video" controls preload="metadata" src="${fileUrl}">Your browser does not support video playback. <a href="${fileUrl}">Download the video</a>.</video>`;
  return `
    <article class="study-material-card">
      <div class="study-material-heading">
        <div><strong>${escapeHTML(material.title)}</strong><div class="muted">${escapeHTML(material.original_name)} · ${formatMaterialSize(material.file_size)} · shared by ${escapeHTML(material.author_name)}</div></div>
        ${isOwn ? `<button type="button" class="del-btn" onclick="deleteStudyMaterial(this, ${Number(material.material_id)})" aria-label="Delete ${escapeHTML(material.title)}">&times;</button>` : ''}
      </div>
      ${material.description ? `<p>${escapeHTML(material.description)}</p>` : ''}
      ${preview}
    </article>`;
}

function quizCardHTML(quiz) {
  const isOwn = Number(quiz.author_id) === Number(currentUser?.user_id);
  const previousScore = quiz.latest_attempt
    ? `<p class="quiz-last-score" role="status">Your latest score: ${Number(quiz.latest_attempt.score)} / ${Number(quiz.latest_attempt.total)}</p>`
    : '';
  return `
    <article class="study-quiz-card" data-quiz-card="${Number(quiz.quiz_id)}">
      <div class="study-material-heading"><div><strong>${escapeHTML(quiz.title)}</strong><div class="muted">Created by ${escapeHTML(quiz.author_name)} · ${quiz.questions.length} question(s)</div></div>
        ${isOwn ? `<button type="button" class="del-btn" onclick="deleteStudyQuiz(this, ${Number(quiz.quiz_id)})" aria-label="Delete ${escapeHTML(quiz.title)}">&times;</button>` : ''}
      </div>
      ${quiz.questions.map((question, qIndex) => `
        <fieldset class="study-quiz-question"><legend>${qIndex + 1}. ${escapeHTML(question.question_text)}</legend>
          ${(Array.isArray(question.choices) ? question.choices : []).map((choice, optionIndex) => `
            <label class="study-quiz-option"><input type="radio" name="quiz-${Number(quiz.quiz_id)}-question-${qIndex}" value="${optionIndex}" /> <span>${escapeHTML(choice)}</span></label>
          `).join('')}
        </fieldset>`).join('')}
      <button type="button" class="btn-primary" onclick="submitStudyQuiz(this, ${Number(quiz.quiz_id)}, ${quiz.questions.length})">Check Answers</button>
      <span class="quiz-feedback" aria-live="polite"></span>
      ${previousScore}
    </article>`;
}

function addQuizQuestion() {
  const editor = document.getElementById('quiz-question-editor');
  if (!editor) return;
  const index = editor.querySelectorAll('.quiz-question-edit').length;
  if (index >= 20) return showToast('A quiz can have up to 20 questions.', 'error');
  const item = document.createElement('fieldset');
  item.className = 'quiz-question-edit';
  item.innerHTML = `
    <legend>Question ${index + 1}</legend>
    <div class="field"><label for="quiz-question-${index}">Question</label><input id="quiz-question-${index}" class="quiz-question-text" maxlength="500" placeholder="Write a question" /></div>
    <div class="quiz-option-editor">
      ${[0, 1, 2, 3].map(option => `<label class="quiz-option-input"><input type="radio" name="quiz-correct-${index}" value="${option}" ${option === 0 ? 'checked' : ''} aria-label="Mark option ${option + 1} correct" /><input class="quiz-choice-text" maxlength="200" aria-label="Option ${option + 1}" placeholder="Option ${option + 1}" /></label>`).join('')}
    </div>`;
  editor.appendChild(item);
}

async function uploadStudyMaterial(event, requestId) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const file = form.querySelector('[name="file"]').files[0];
  if (!file) return showToast('Choose a file first.', 'error');
  const formData = new FormData(form);
  button.disabled = true;
  button.textContent = 'Uploading…';
  try {
    await API.post(`/api/notes/${requestId}/materials`, formData);
    showToast('Learning material uploaded.');
    await loadNotesForSwap(requestId);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Upload Material';
  }
}

async function deleteStudyMaterial(button, materialId) {
  if (!confirm('Delete this shared material?')) return;
  button.disabled = true;
  try {
    await API.delete(`/api/notes/materials/${materialId}`);
    showToast('Material deleted.');
    await loadNotesForSwap(window._notesSelectedReq);
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
}

async function createStudyQuiz(button, requestId) {
  const title = document.getElementById('study-quiz-title')?.value.trim() || '';
  const editors = [...document.querySelectorAll('#quiz-question-editor .quiz-question-edit')];
  const questions = editors.map(editor => ({
    question: editor.querySelector('.quiz-question-text').value.trim(),
    choices: [...editor.querySelectorAll('.quiz-choice-text')].map(input => input.value.trim()),
    correct_index: Number(editor.querySelector('input[type="radio"]:checked')?.value)
  }));
  if (!title || questions.some(question => !question.question || question.choices.some(choice => !choice))) {
    return showToast('Enter a quiz title, every question, and all four options.', 'error');
  }
  button.disabled = true;
  try {
    await API.post(`/api/notes/quizzes/${requestId}`, { title, questions });
    showToast('Quiz created. Your swap partner can take it.');
    await loadNotesForSwap(requestId);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function submitStudyQuiz(button, quizId, questionCount) {
  const card = button.closest('[data-quiz-card]');
  const answers = [];
  for (let index = 0; index < questionCount; index += 1) {
    const selected = card.querySelector(`input[name="quiz-${quizId}-question-${index}"]:checked`);
    if (!selected) return showToast('Choose an answer for every question.', 'error');
    answers.push(Number(selected.value));
  }
  button.disabled = true;
  try {
    const result = await API.post(`/api/notes/quizzes/${quizId}/submit`, { answers });
    const feedback = card.querySelector('.quiz-feedback');
    feedback.textContent = `Score: ${result.score} / ${result.total}`;
    feedback.classList.add('quiz-last-score');
    showToast('Quiz submitted.');
    await loadNotesForSwap(window._notesSelectedReq);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteStudyQuiz(button, quizId) {
  if (!confirm('Delete this quiz and its attempts?')) return;
  button.disabled = true;
  try {
    await API.delete(`/api/notes/quizzes/${quizId}`);
    showToast('Quiz deleted.');
    await loadNotesForSwap(window._notesSelectedReq);
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
}

async function addNote(btn, rid) {
  const topicInput = document.getElementById('note-topic');
  const topic = topicInput ? topicInput.value.trim() : '';
  const notes = document.getElementById('note-notes')?.value.trim() || '';
  const resources = document.getElementById('note-resources')?.value.trim() || '';
  const rawSession = document.getElementById('note-session-no')?.value.trim();
  const rawDuration = document.getElementById('note-duration')?.value.trim();
  const session_no = rawSession ? Number(rawSession) : null;
  const duration_min = rawDuration ? Number(rawDuration) : 60;

  if (!topic) return showToast('Please enter a topic', 'error');
  if (btn && btn.disabled) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving note…';
  }

  try {
    const payload = { topic, notes, resources, duration_min };
    if (session_no) payload.session_no = session_no;
    await API.post(`/api/notes/${rid}`, payload);
    showToast('Session note added!');
    await loadNotesForSwap(rid);
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add Session Note';
    }
  }
}

async function deleteNote(btn, noteId) {
  if (!confirm('Delete this note?')) return;
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await API.delete(`/api/notes/entry/${noteId}`);
    showToast('Note deleted');
    await loadNotesForSwap(window._notesSelectedReq);
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}
