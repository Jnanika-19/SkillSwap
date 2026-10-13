'use strict';

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { validateSessionNote, isPositiveInteger } = require('../validation');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads', 'session-materials');
fs.mkdirSync(uploadDir, { recursive: true });

const extensions = {
  '.pdf': { kind: 'pdf', mime: 'application/pdf', maxBytes: 25 * 1024 * 1024 },
  '.mp4': { kind: 'video', mime: 'video/mp4', maxBytes: 100 * 1024 * 1024 },
  '.webm': { kind: 'video', mime: 'video/webm', maxBytes: 100 * 1024 * 1024 },
  '.mov': { kind: 'video', mime: 'video/quicktime', maxBytes: 100 * 1024 * 1024 },
  '.txt': { kind: 'text', mime: 'text/plain', maxBytes: 2 * 1024 * 1024 },
  '.md': { kind: 'text', mime: 'text/markdown', maxBytes: 2 * 1024 * 1024 }
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 2, fieldSize: 2000 },
  fileFilter: (_req, file, callback) => {
    const rule = extensions[path.extname(file.originalname).toLowerCase()];
    if (!rule) return callback(new Error('Choose a PDF, MP4/WebM/MOV video, or TXT/Markdown file.'));
    if (file.mimetype && file.mimetype !== rule.mime && file.mimetype !== 'application/octet-stream'
      && !(rule.kind === 'text' && file.mimetype === 'text/plain')) {
      return callback(new Error('The selected file type does not match its extension.'));
    }
    callback(null, true);
  }
});

async function getSwap(requestId, userId, requireActive = true) {
  const activeClause = requireActive ? "AND status IN ('accepted','completed')" : '';
  const [rows] = await db.query(
    `SELECT request_id, from_user, to_user, status FROM swap_requests
     WHERE request_id=? AND (from_user=? OR to_user=?) ${activeClause}`,
    [requestId, userId, userId]
  );
  return rows[0] || null;
}

async function removeUploadedFile(file) {
  if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
}

function cleanOriginalName(name) {
  return path.basename(String(name || 'material').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '_').slice(0, 255) || 'material';
}

async function hasValidSignature(file, rule) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (rule.kind === 'pdf') return buffer.subarray(0, bytesRead).toString('ascii').startsWith('%PDF-');
    if (rule.mime === 'video/mp4' || rule.mime === 'video/quicktime') {
      return bytesRead >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp';
    }
    if (rule.mime === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (rule.kind === 'text') {
      const content = await fs.promises.readFile(file.path);
      if (content.includes(0)) return false;
      try { new TextDecoder('utf-8', { fatal: true }).decode(content); return true; }
      catch { return false; }
    }
    return false;
  } finally {
    await handle.close();
  }
}

function parseChoices(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

function validateQuiz(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (title.length < 2 || title.length > 120) return { error: 'Quiz title must be between 2 and 120 characters.' };
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 20) {
    return { error: 'A quiz needs between 1 and 20 questions.' };
  }
  const questions = [];
  for (const item of body.questions) {
    const question = typeof item?.question === 'string' ? item.question.trim() : '';
    const choices = Array.isArray(item?.choices) ? item.choices.map(choice => typeof choice === 'string' ? choice.trim() : '') : [];
    const correctIndex = Number(item?.correct_index);
    if (question.length < 2 || question.length > 500) return { error: 'Each question must be between 2 and 500 characters.' };
    if (choices.length < 2 || choices.length > 6 || choices.some(choice => !choice || choice.length > 200)) {
      return { error: 'Each question needs 2 to 6 non-empty choices, up to 200 characters each.' };
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      return { error: 'Choose the correct answer for every question.' };
    }
    questions.push({ question, choices, correctIndex });
  }
  return { value: { title, questions } };
}

// GET /api/notes/:request_id
router.get('/:request_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  try {
    const swap = await getSwap(req.params.request_id, req.session.userId, false);
    if (!swap) return res.status(403).json({ error: 'Access denied' });
    const [notes] = await db.query(`
      SELECT sn.*, u.name AS author_name, u.avatar AS author_avatar, u.profile_picture AS author_profile_picture
      FROM session_notes sn JOIN users u ON u.user_id = sn.author_id
      WHERE sn.request_id = ? ORDER BY sn.session_no ASC, sn.created_at ASC
    `, [req.params.request_id]);
    const [progress] = await db.query('SELECT * FROM v_session_progress WHERE request_id=?', [req.params.request_id]);
    res.json({ notes, progress: progress[0] || null, swap });
  } catch (error) {
    console.error('Loading session notes failed:', error);
    res.status(500).json({ error: 'Unable to load session notes' });
  }
});

// POST /api/notes/:request_id
router.post('/:request_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  const validation = validateSessionNote(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { session_no, topic, notes, resources, duration_min } = validation.value;
  try {
    if (!await getSwap(req.params.request_id, req.session.userId)) return res.status(403).json({ error: 'You can only add notes to active or completed swaps' });
    let sessionNum = session_no;
    if (!sessionNum) {
      const [lastNote] = await db.query('SELECT MAX(session_no) AS last FROM session_notes WHERE request_id=? AND author_id=?', [req.params.request_id, req.session.userId]);
      sessionNum = (lastNote[0].last || 0) + 1;
    }
    const [result] = await db.query(
      `INSERT INTO session_notes (request_id, author_id, session_no, topic, notes, resources, duration_min)
       VALUES (?,?,?,?,?,?,?)`,
      [req.params.request_id, req.session.userId, sessionNum, topic, notes || null, resources || null, duration_min]
    );
    const [inserted] = await db.query(
      'SELECT sn.*, u.name AS author_name FROM session_notes sn JOIN users u ON u.user_id=sn.author_id WHERE note_id=?',
      [result.insertId]
    );
    res.json({ success: true, note: inserted[0] });
  } catch (error) {
    console.error('Adding session note failed:', error);
    res.status(500).json({ error: 'Unable to add session note' });
  }
});

router.get('/:request_id/materials', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  try {
    if (!await getSwap(req.params.request_id, req.session.userId)) return res.status(403).json({ error: 'Materials are available only to members of an active or completed swap.' });
    const [materials] = await db.query(
      `SELECT m.material_id, m.request_id, m.author_id, m.title, m.description, m.original_name,
              m.mime_type, m.file_size, m.created_at, u.name AS author_name
       FROM session_materials m JOIN users u ON u.user_id=m.author_id
       WHERE m.request_id=? ORDER BY m.created_at DESC`, [req.params.request_id]
    );
    res.json({ materials: materials.map(material => ({ ...material, file_url: `/api/notes/materials/${material.material_id}/file` })) });
  } catch (error) {
    console.error('Loading session materials failed:', error);
    res.status(500).json({ error: 'Unable to load session materials' });
  }
});

router.post('/:request_id/materials', requireAuth, async (req, res, next) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  try {
    if (!await getSwap(req.params.request_id, req.session.userId)) return res.status(403).json({ error: 'You can upload materials only to an active or completed swap.' });
  } catch (error) {
    console.error('Checking session material access failed:', error);
    return res.status(500).json({ error: 'Unable to upload material' });
  }
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'Files must be 100 MB or smaller.' : 'Upload one file at a time.' });
    }
    return res.status(400).json({ error: error.message || 'Unable to read the uploaded file.' });
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const rule = extensions[path.extname(file.originalname).toLowerCase()];
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (file.size > rule.maxBytes) {
    await removeUploadedFile(file);
    return res.status(413).json({ error: rule.kind === 'video' ? 'Videos must be 100 MB or smaller.' : rule.kind === 'pdf' ? 'PDFs must be 25 MB or smaller.' : 'Text files must be 2 MB or smaller.' });
  }
  if (!title || title.length > 120 || description.length > 1000) {
    await removeUploadedFile(file);
    return res.status(400).json({ error: 'Enter a title up to 120 characters and a description up to 1000 characters.' });
  }
  try {
    if (!await hasValidSignature(file, rule)) {
      await removeUploadedFile(file);
      return res.status(400).json({ error: 'The file content does not match a supported PDF, video, or UTF-8 text file.' });
    }
    const [result] = await db.query(
      `INSERT INTO session_materials (request_id, author_id, title, description, original_name, stored_name, mime_type, file_size)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.params.request_id, req.session.userId, title, description || null, cleanOriginalName(file.originalname), file.filename, rule.mime, file.size]
    );
    res.status(201).json({ success: true, material_id: result.insertId });
  } catch (error) {
    await removeUploadedFile(file);
    console.error('Saving session material failed:', error);
    res.status(500).json({ error: 'Unable to save session material' });
  }
});

router.get('/materials/:material_id/file', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.material_id)) return res.status(400).json({ error: 'Material ID must be a positive integer' });
  try {
    const [rows] = await db.query('SELECT * FROM session_materials WHERE material_id=?', [req.params.material_id]);
    const material = rows[0];
    if (!material) return res.status(404).json({ error: 'Material not found' });
    if (!await getSwap(material.request_id, req.session.userId, false)) return res.status(403).json({ error: 'Access denied' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', material.mime_type);
    if (material.mime_type.startsWith('text/')) res.attachment(material.original_name);
    else res.setHeader('Content-Disposition', `inline; filename="${material.original_name.replace(/["\\\r\n]/g, '_')}"`);
    res.sendFile(material.stored_name, { root: uploadDir }, error => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Unable to read this material file' });
    });
  } catch (error) {
    console.error('Opening session material failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Unable to open session material' });
  }
});

router.delete('/materials/:material_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.material_id)) return res.status(400).json({ error: 'Material ID must be a positive integer' });
  try {
    const [rows] = await db.query('SELECT * FROM session_materials WHERE material_id=? AND author_id=?', [req.params.material_id, req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Material not found or not yours to delete.' });
    await db.query('DELETE FROM session_materials WHERE material_id=?', [req.params.material_id]);
    await fs.promises.unlink(path.join(uploadDir, rows[0].stored_name)).catch(error => {
      if (error.code !== 'ENOENT') console.error('Removing deleted session material file failed:', error);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting session material failed:', error);
    res.status(500).json({ error: 'Unable to delete session material' });
  }
});

router.post('/quizzes/:request_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  const validation = validateQuiz(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  let connection;
  try {
    if (!await getSwap(req.params.request_id, req.session.userId)) return res.status(403).json({ error: 'You can create quizzes only for an active or completed swap.' });
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [quizResult] = await connection.query(
      'INSERT INTO session_quizzes (request_id, author_id, title) VALUES (?,?,?)',
      [req.params.request_id, req.session.userId, validation.value.title]
    );
    for (const question of validation.value.questions) {
      await connection.query(
        'INSERT INTO session_quiz_questions (quiz_id, question_text, choices, correct_index) VALUES (?,?,?,?)',
        [quizResult.insertId, question.question, JSON.stringify(question.choices), question.correctIndex]
      );
    }
    await connection.commit();
    res.status(201).json({ success: true, quiz_id: quizResult.insertId });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Creating session quiz failed:', error);
    res.status(500).json({ error: 'Unable to create quiz' });
  } finally {
    connection?.release();
  }
});

router.get('/quizzes/:request_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.request_id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
  try {
    if (!await getSwap(req.params.request_id, req.session.userId, false)) return res.status(403).json({ error: 'Access denied' });
    const [quizzes] = await db.query(
      `SELECT q.quiz_id, q.request_id, q.author_id, q.title, q.created_at, u.name AS author_name
       FROM session_quizzes q JOIN users u ON u.user_id=q.author_id
       WHERE q.request_id=? ORDER BY q.created_at DESC`, [req.params.request_id]
    );
    if (!quizzes.length) return res.json({ quizzes: [] });
    const ids = quizzes.map(quiz => quiz.quiz_id);
    const placeholders = ids.map(() => '?').join(',');
    const [questions] = await db.query(
      `SELECT question_id, quiz_id, question_text, choices FROM session_quiz_questions WHERE quiz_id IN (${placeholders}) ORDER BY question_id`, ids
    );
    const [attempts] = await db.query(
      `SELECT quiz_id, score, total, submitted_at FROM session_quiz_attempts
       WHERE user_id=? AND quiz_id IN (${placeholders}) ORDER BY submitted_at DESC`, [req.session.userId, ...ids]
    );
    const latestAttempt = new Map();
    for (const attempt of attempts) if (!latestAttempt.has(attempt.quiz_id)) latestAttempt.set(attempt.quiz_id, attempt);
    res.json({ quizzes: quizzes.map(quiz => ({
      ...quiz,
      questions: questions.filter(question => question.quiz_id === quiz.quiz_id).map(question => ({ ...question, choices: parseChoices(question.choices) })),
      latest_attempt: latestAttempt.get(quiz.quiz_id) || null
    })) });
  } catch (error) {
    console.error('Loading session quizzes failed:', error);
    res.status(500).json({ error: 'Unable to load quizzes' });
  }
});

router.post('/quizzes/:quiz_id/submit', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.quiz_id)) return res.status(400).json({ error: 'Quiz ID must be a positive integer' });
  try {
    const [quizzes] = await db.query('SELECT * FROM session_quizzes WHERE quiz_id=?', [req.params.quiz_id]);
    const quiz = quizzes[0];
    if (!quiz || !await getSwap(quiz.request_id, req.session.userId, false)) return res.status(404).json({ error: 'Quiz not found' });
    const [questions] = await db.query('SELECT question_id, choices, correct_index FROM session_quiz_questions WHERE quiz_id=? ORDER BY question_id', [quiz.quiz_id]);
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length !== questions.length) return res.status(400).json({ error: 'Answer every question before submitting.' });
    let score = 0;
    const results = [];
    for (let index = 0; index < questions.length; index += 1) {
      const answer = answers[index];
      const choices = parseChoices(questions[index].choices);
      if (!Number.isInteger(answer) || answer < 0 || answer >= choices.length) return res.status(400).json({ error: 'One or more answers are invalid.' });
      const correct = answer === Number(questions[index].correct_index);
      if (correct) score += 1;
      results.push({ question_id: questions[index].question_id, correct, correct_index: Number(questions[index].correct_index) });
    }
    await db.query('INSERT INTO session_quiz_attempts (quiz_id, user_id, score, total) VALUES (?,?,?,?)',
      [quiz.quiz_id, req.session.userId, score, questions.length]);
    res.json({ score, total: questions.length, results });
  } catch (error) {
    console.error('Submitting session quiz failed:', error);
    res.status(500).json({ error: 'Unable to submit quiz' });
  }
});

router.delete('/quizzes/:quiz_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.quiz_id)) return res.status(400).json({ error: 'Quiz ID must be a positive integer' });
  try {
    const [result] = await db.query('DELETE FROM session_quizzes WHERE quiz_id=? AND author_id=?', [req.params.quiz_id, req.session.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Quiz not found or not yours to delete.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting session quiz failed:', error);
    res.status(500).json({ error: 'Unable to delete quiz' });
  }
});

router.delete('/entry/:note_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.note_id)) return res.status(400).json({ error: 'Note ID must be a positive integer' });
  try {
    const [result] = await db.query('DELETE FROM session_notes WHERE note_id=? AND author_id=?', [req.params.note_id, req.session.userId]);
    if (!result.affectedRows) return res.status(403).json({ error: 'Not found or not your note' });
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting session note failed:', error);
    res.status(500).json({ error: 'Unable to delete session note' });
  }
});

router.get('/materials/:material_id/file', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.material_id)) return res.status(400).json({ error: 'Material ID must be a positive integer' });
  try {
    const [rows] = await db.query('SELECT * FROM session_materials WHERE material_id=?', [req.params.material_id]);
    const material = rows[0];
    if (!material) return res.status(404).json({ error: 'Material not found' });
    if (!await getSwap(material.request_id, req.session.userId, false)) return res.status(403).json({ error: 'Access denied' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(material.mime_type);
    if (material.mime_type.startsWith('text/')) res.attachment(material.original_name);
    else res.setHeader('Content-Disposition', `inline; filename="${material.original_name.replace(/["\\\r\n]/g, '_')}"`);
    res.sendFile(material.stored_name, { root: uploadDir }, error => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Unable to read this material file' });
    });
  } catch (error) {
    console.error('Opening session material failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Unable to open session material' });
  }
});

router.delete('/materials/:material_id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.material_id)) return res.status(400).json({ error: 'Material ID must be a positive integer' });
  try {
    const [rows] = await db.query('SELECT * FROM session_materials WHERE material_id=? AND author_id=?', [req.params.material_id, req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Material not found or not yours to delete.' });
    await db.query('DELETE FROM session_materials WHERE material_id=?', [req.params.material_id]);
    await fs.promises.unlink(path.join(uploadDir, rows[0].stored_name)).catch(error => {
      if (error.code !== 'ENOENT') console.error('Removing deleted session material file failed:', error);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting session material failed:', error);
    res.status(500).json({ error: 'Unable to delete session material' });
  }
});

module.exports = router;
