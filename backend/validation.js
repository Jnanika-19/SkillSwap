'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateRegistration(body = {}) {
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const department = text(body.department);
  const bio = text(body.bio);

  if (name.length < 2 || name.length > 100) return { error: 'Name must be between 2 and 100 characters' };
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { error: 'Enter a valid email address' };
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return { error: 'Password must be at least 8 characters and no more than 72 bytes' };
  }
  if (department.length > 60) return { error: 'Department must be 60 characters or fewer' };
  if (bio.length > 2000) return { error: 'Bio must be 2000 characters or fewer' };

  return { value: { name, email, password, department, bio } };
}

function validateLogin(body = {}) {
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return { error: 'Email and password are required' };
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { error: 'Enter a valid email address' };
  if (Buffer.byteLength(password, 'utf8') > 72) return { error: 'Invalid credentials' };
  return { value: { email, password } };
}

function validateSwapRequest(body = {}) {
  const toUser = Number(body.to_user);
  const offeredSkill = text(body.offered_skill);
  const requestedSkill = text(body.requested_skill);
  const message = text(body.message);
  if (!Number.isSafeInteger(toUser) || toUser < 1) return { error: 'to_user must be a positive integer' };
  if (!offeredSkill || offeredSkill.length > 80) return { error: 'offered_skill must be between 1 and 80 characters' };
  if (!requestedSkill || requestedSkill.length > 80) return { error: 'requested_skill must be between 1 and 80 characters' };
  if (message.length > 1000) return { error: 'message must be 1000 characters or fewer' };
  return { value: { to_user: toUser, offered_skill: offeredSkill, requested_skill: requestedSkill, message } };
}

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validateSkill(body = {}, kind) {
  const skillName = text(body.skill_name);
  if (!skillName || skillName.length > 80) return { error: 'skill_name must be between 1 and 80 characters' };

  if (kind === 'offered') {
    const proficiency = body.proficiency === undefined ? 'intermediate' : body.proficiency;
    if (!['beginner', 'intermediate', 'expert'].includes(proficiency)) return { error: 'proficiency must be beginner, intermediate, or expert' };
    return { value: { skill_name: skillName, proficiency } };
  }

  const urgency = body.urgency === undefined ? 'medium' : body.urgency;
  if (!['low', 'medium', 'high'].includes(urgency)) return { error: 'urgency must be low, medium, or high' };
  return { value: { skill_name: skillName, urgency } };
}

function validateRating(body = {}) {
  const requestId = Number(body.request_id);
  const rateeId = Number(body.ratee_id);
  const score = Number(body.score);
  const comment = text(body.comment);
  if (!Number.isSafeInteger(requestId) || requestId < 1) return { error: 'request_id must be a positive integer' };
  if (!Number.isSafeInteger(rateeId) || rateeId < 1) return { error: 'ratee_id must be a positive integer' };
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: 'score must be an integer from 1 to 5' };
  if (comment.length > 1000) return { error: 'comment must be 1000 characters or fewer' };
  return { value: { request_id: requestId, ratee_id: rateeId, score, comment } };
}

function validateSessionNote(body = {}) {
  const topic = text(body.topic);
  const notes = text(body.notes);
  const resources = text(body.resources);
  const rawSession = body.session_no;
  const sessionNum = rawSession === undefined || rawSession === null || rawSession === '' || Number(rawSession) === 0 ? null : Number(rawSession);
  const duration = body.duration_min === undefined || body.duration_min === null || body.duration_min === '' ? 60 : Number(body.duration_min);
  if (!topic || topic.length > 200) return { error: 'topic must be between 1 and 200 characters' };
  if (notes.length > 5000) return { error: 'notes must be 5000 characters or fewer' };
  if (resources.length > 2000) return { error: 'resources must be 2000 characters or fewer' };
  if (sessionNum !== null && (!Number.isSafeInteger(sessionNum) || sessionNum < 1 || sessionNum > 10000)) {
    return { error: 'session_no must be an integer from 1 to 10000' };
  }
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 1440) return { error: 'duration_min must be an integer from 1 to 1440' };
  return { value: { session_no: sessionNum, topic, notes, resources, duration_min: duration } };
}

module.exports = { validateRegistration, validateLogin, validateSwapRequest, validateSkill, validateRating, validateSessionNote, isPositiveInteger };
