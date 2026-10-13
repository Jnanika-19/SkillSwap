'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const authModule = require('../routes/auth');
const usersModule = require('../routes/users');
const matchesModule = require('../routes/matches');
const requestsModule = require('../routes/requests');
const notificationsModule = require('../routes/notifications');
const { validateRegistration, validateSwapRequest, validateSkill, validateRating, validateSessionNote } = require('../validation');

function createFakeDb() {
  const users = new Map();
  const requests = new Map();
  const resetTokens = new Map();
  const notifications = [];
  let nextUserId = 1;
  let nextRequestId = 1;
  let nextNotificationId = 1;

  return {
    users,
    requests,
    resetTokens,
    notifications,
    matchQuery: null,
    async query(rawSql, params = []) {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO users')) {
        const [name, email, password, department, bio, avatar] = params;
        if ([...users.values()].some(user => user.email === email)) {
          const error = new Error('duplicate');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const user = { user_id: nextUserId++, name, email, password, department, bio, avatar, avg_rating: '0.00', swap_count: 0 };
        users.set(user.user_id, user);
        return [{ insertId: user.user_id }];
      }
      if (sql.startsWith('SELECT * FROM users WHERE email=')) {
        const user = [...users.values()].find(row => row.email === params[0]);
        return [user ? [{ ...user }] : []];
      }
      if (sql.startsWith('SELECT user_id FROM users WHERE email=')) {
        const user = [...users.values()].find(row => row.email === params[0]);
        return [user ? [{ user_id: user.user_id }] : []];
      }
      if (sql.startsWith('DELETE FROM password_reset_tokens WHERE user_id=')) {
        for (const [hash, token] of resetTokens) if (token.user_id === Number(params[0])) resetTokens.delete(hash);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO password_reset_tokens')) {
        const [token_hash, user_id] = params;
        resetTokens.set(token_hash, { user_id: Number(user_id), valid: true });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT user_id FROM password_reset_tokens')) {
        const token = resetTokens.get(params[0]);
        return [token?.valid ? [{ user_id: token.user_id }] : []];
      }
      if (sql.startsWith('UPDATE users SET password=')) {
        const [password, user_id] = params;
        users.get(Number(user_id)).password = password;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO notifications')) {
        const [user_id, request_id, title, message] = params;
        notifications.push({ notification_id: nextNotificationId++, user_id: Number(user_id), request_id: Number(request_id), title, message, is_read: false });
        return [{ insertId: nextNotificationId - 1 }];
      }
      if (sql.startsWith('SELECT notification_id, request_id, title, message, is_read, created_at FROM notifications')) {
        return [notifications.filter(item => item.user_id === Number(params[0])).map(item => ({ ...item, created_at: '2026-01-01 12:00:00' }))];
      }
      if (sql.startsWith('SELECT COUNT(*) AS unread FROM notifications')) {
        return [[{ unread: notifications.filter(item => item.user_id === Number(params[0]) && !item.is_read).length }]];
      }
      if (sql.startsWith('UPDATE notifications SET is_read=TRUE WHERE notification_id=')) {
        const item = notifications.find(entry => entry.notification_id === Number(params[0]) && entry.user_id === Number(params[1]));
        if (item) item.is_read = true;
        return [{ affectedRows: item ? 1 : 0 }];
      }
      if (sql.startsWith('UPDATE notifications SET is_read=TRUE WHERE user_id=')) {
        const unread = notifications.filter(item => item.user_id === Number(params[0]) && !item.is_read);
        unread.forEach(item => { item.is_read = true; });
        return [{ affectedRows: unread.length }];
      }
      if (sql.startsWith('SELECT user_id,name,') && sql.includes('FROM users WHERE user_id=')) {
        const user = users.get(Number(params[0]));
        if (!user) return [[]];
        const res = { user_id: user.user_id, name: user.name, department: user.department, bio: user.bio, avatar: user.avatar, avg_rating: user.avg_rating, swap_count: user.swap_count };
        if (sql.includes('email')) res.email = user.email;
        return [[res]];
      }
      if (sql.startsWith('SELECT * FROM skills_offered WHERE user_id=')) {
        return [[]];
      }
      if (sql.startsWith('SELECT * FROM skills_requested WHERE user_id=')) {
        return [[]];
      }
      if (sql.startsWith('SELECT user_id FROM users WHERE user_id=') || sql.startsWith('SELECT user_id, name FROM users WHERE user_id=')) {
        const user = users.get(Number(params[0]));
        return [user ? [{ user_id: user.user_id, name: user.name }] : []];
      }
      if (sql.startsWith('SELECT u.user_id,')) {
        this.matchQuery = { sql, params };
        return [[{ user_id: 2, name: 'Rohan', skill_overlap: 1, match_score: 15, matched_skills: 'Python' }]];
      }
      if (sql.startsWith('SELECT request_id, from_user, to_user, status FROM swap_requests') || sql.startsWith('SELECT request_id FROM swap_requests')) {
        const u1 = Number(params[0]);
        const u2 = Number(params[1]);
        return [[...requests.values()]
          .filter(row => ((row.from_user === u1 && row.to_user === u2) || (row.from_user === u2 && row.to_user === u1)) && (row.status === 'pending' || row.status === 'accepted'))
          .map(row => ({ request_id: row.request_id, from_user: row.from_user, to_user: row.to_user, status: row.status }))];
      }
      if (sql.startsWith('INSERT INTO swap_requests')) {
        const [from_user, to_user, offered_skill, requested_skill, message] = params;
        const row = { request_id: nextRequestId++, from_user, to_user, offered_skill, requested_skill, message, status: 'pending' };
        requests.set(row.request_id, row);
        return [{ insertId: row.request_id }];
      }
      if (sql.startsWith('SELECT * FROM swap_requests WHERE request_id=')) {
        const request = requests.get(Number(params[0]));
        return [request ? [{ ...request }] : []];
      }
      if (sql.startsWith('UPDATE swap_requests SET status=')) {
        const [status, requestId] = params;
        requests.get(Number(requestId)).status = status;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM swap_requests WHERE request_id=')) {
        const [rid, uid] = params;
        const reqRow = requests.get(Number(rid));
        if (reqRow && reqRow.from_user === Number(uid) && reqRow.status === 'pending') {
          requests.delete(Number(rid));
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('SELECT from_user, status FROM swap_requests WHERE request_id=')) {
        const reqRow = requests.get(Number(params[0]));
        return [reqRow ? [{ from_user: reqRow.from_user, status: reqRow.status }] : []];
      }
      if (sql.startsWith('SELECT sr.*')) {
        const uid = Number(params[0]);
        return [[...requests.values()].filter(row => row.from_user === uid || row.to_user === uid).map(row => ({ ...row, user_rated: 0 }))];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async getConnection() {
      return {
        query: this.query.bind(this),
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {}
      };
    }
  };
}

async function startHarness({ loginLimit = 10, registerLimit = 5, forgotLimit = 5, resetLimit = 10 } = {}) {
  const db = createFakeDb();
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-only-secret-at-least-32-characters-long', resave: false, saveUninitialized: false }));
  app.use('/api/auth', authModule.createAuthRouter(db, { loginLimit, registerLimit, forgotLimit, resetLimit, windowMs: 60_000 }));
  app.use('/api/users', usersModule.createUsersRouter(db));
  app.use('/api/matches', matchesModule.createMatchesRouter(db));
  app.use('/api/requests', requestsModule.createRequestsRouter(db));
  app.use('/api/notifications', notificationsModule.createNotificationsRouter(db));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  return {
    db,
    async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
    async request(path, { method = 'GET', body, cookie } = {}) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      const setCookie = response.headers.get('set-cookie');
      return { status: response.status, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
    }
  };
}

test('registration validates fields, hashes the password, and login checks the hash', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const seededHash = schema.match(/ayesha@college\.edu', '([^']+)'/)[1];
  assert.equal(await bcrypt.compare('demo123', seededHash), true);
  harness.db.users.set(99, {
    user_id: 99, name: 'Ayesha Khan', email: 'ayesha@college.edu', password: seededHash,
    department: 'Computer Science', bio: 'Sample account', avatar: 'AK', avg_rating: '0.00', swap_count: 0
  });
  const seededLogin = await harness.request('/api/auth/login', {
    method: 'POST', body: { email: 'ayesha@college.edu', password: 'demo123' }
  });
  assert.equal(seededLogin.status, 200);

  const invalid = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'A', email: 'invalid', password: 'short' }
  });
  assert.equal(invalid.status, 400);

  const registered = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Ayesha Khan', email: ' AYESHA@example.edu ', password: 'correct-horse-battery' }
  });
  assert.equal(registered.status, 200);
  assert.equal(registered.data.user.email, 'ayesha@example.edu');
  assert.notEqual(harness.db.users.get(1).password, 'correct-horse-battery');
  assert.equal(await bcrypt.compare('correct-horse-battery', harness.db.users.get(1).password), true);

  const bypass = await harness.request('/api/auth/login', {
    method: 'POST', body: { email: 'ayesha@example.edu', password: 'demo123' }
  });
  assert.equal(bypass.status, 401);

  const loggedIn = await harness.request('/api/auth/login', {
    method: 'POST', body: { email: ' AYESHA@example.edu ', password: 'correct-horse-battery' }
  });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.user.password, undefined);
});

test('login and registration endpoints enforce their rate limits', async t => {
  const harness = await startHarness({ loginLimit: 2, registerLimit: 1 });
  t.after(() => harness.close());
  const login = () => harness.request('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.edu', password: 'password123' } });
  assert.equal((await login()).status, 401);
  assert.equal((await login()).status, 401);
  const limitedLogin = await login();
  assert.equal(limitedLogin.status, 429);
  assert.ok(limitedLogin.data.error.includes('Too many'));

  const register = () => harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Sam Student', email: 'sam@example.edu', password: 'password123' }
  });
  assert.equal((await register()).status, 200);
  assert.equal((await register()).status, 429);
});

test('password reset verification codes are single-use and replace the stored password hash', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const registered = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Sam Student', email: 'sam@example.edu', password: 'old-password-123' }
  });
  const requested = await harness.request('/api/auth/forgot-password', {
    method: 'POST', body: { email: 'sam@example.edu' }
  });
  assert.equal(requested.status, 200);
  assert.match(requested.data.verificationCode, /^\d{6}$/);
  const code = requested.data.verificationCode;

  const reset = await harness.request('/api/auth/reset-password', {
    method: 'POST', body: { code, password: 'new-password-456' }
  });
  assert.equal(reset.status, 200);
  assert.equal(await bcrypt.compare('new-password-456', harness.db.users.get(1).password), true);
  assert.equal((await harness.request('/api/auth/reset-password', {
    method: 'POST', body: { code, password: 'another-password-789' }
  })).status, 400);
  assert.equal((await harness.request('/api/auth/login', {
    method: 'POST', body: { email: 'sam@example.edu', password: 'new-password-456' }
  })).status, 200);
  assert.equal(registered.status, 200);
});

test('matching endpoint requires authentication and returns bidirectional results', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  assert.equal((await harness.request('/api/matches')).status, 401);

  const registered = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Ayesha Khan', email: 'ayesha@example.edu', password: 'password123' }
  });
  const matches = await harness.request('/api/matches', { cookie: registered.cookie });
  assert.equal(matches.status, 200);
  assert.equal(matches.data.matches[0].matched_skills, 'Python');
  assert.match(harness.db.matchQuery.sql, /sr\.skill_name = so\.skill_name/);
  assert.match(harness.db.matchQuery.sql, /so2\.skill_name = sr2\.skill_name/);
  assert.deepEqual(harness.db.matchQuery.params, [1, 1, 1, 1, 1]);
});

test('swap lifecycle validates requests, controls participants, and enforces transitions', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const first = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Ayesha Khan', email: 'ayesha@example.edu', password: 'password123' }
  });
  const second = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Rohan Sharma', email: 'rohan@example.edu', password: 'password123' }
  });

  const invalid = await harness.request('/api/requests', {
    method: 'POST', cookie: first.cookie, body: { to_user: 2, offered_skill: ' ', requested_skill: 'Python' }
  });
  assert.equal(invalid.status, 400);

  const created = await harness.request('/api/requests', {
    method: 'POST', cookie: first.cookie,
    body: { to_user: 2, offered_skill: 'Figma', requested_skill: 'Python', message: 'Let us swap' }
  });
  assert.equal(created.status, 201);
  const requestId = created.data.request_id;
  assert.equal(harness.db.notifications[0].user_id, 2);
  assert.equal(harness.db.notifications[0].title, 'New swap request');

  const secondInbox = await harness.request('/api/notifications', { cookie: second.cookie });
  assert.equal(secondInbox.data.unreadCount, 1);
  assert.equal(secondInbox.data.notifications.length, 1);
  await harness.request(`/api/notifications/${secondInbox.data.notifications[0].notification_id}/read`, {
    method: 'PATCH', cookie: second.cookie
  });
  assert.equal((await harness.request('/api/notifications', { cookie: second.cookie })).data.unreadCount, 0);

  const duplicate = await harness.request('/api/requests', {
    method: 'POST', cookie: first.cookie,
    body: { to_user: 2, offered_skill: 'Figma', requested_skill: 'Python' }
  });
  assert.equal(duplicate.status, 409);

  const wrongActor = await harness.request(`/api/requests/${requestId}/status`, {
    method: 'PATCH', cookie: first.cookie, body: { status: 'accepted' }
  });
  assert.equal(wrongActor.status, 403);

  const accepted = await harness.request(`/api/requests/${requestId}/status`, {
    method: 'PATCH', cookie: second.cookie, body: { status: 'accepted' }
  });
  assert.equal(accepted.status, 200);
  assert.equal(harness.db.notifications[1].user_id, 1);
  assert.equal(harness.db.notifications[1].title, 'Swap request accepted');

  const completed = await harness.request(`/api/requests/${requestId}/status`, {
    method: 'PATCH', cookie: first.cookie, body: { status: 'completed' }
  });
  assert.equal(completed.status, 200);
  assert.equal(harness.db.requests.get(requestId).status, 'completed');

  const invalidTransition = await harness.request(`/api/requests/${requestId}/status`, {
    method: 'PATCH', cookie: second.cookie, body: { status: 'declined' }
  });
  assert.equal(invalidTransition.status, 409);
});

test('shared validators reject oversized or malformed payloads', () => {
  assert.equal(validateRegistration({ name: 'Alex', email: 'a@b.com', password: '12345678', bio: 'x'.repeat(2001) }).error,
    'Bio must be 2000 characters or fewer');
  assert.equal(validateSwapRequest({ to_user: 0, offered_skill: 'React', requested_skill: 'Python' }).error,
    'to_user must be a positive integer');
  assert.ok(validateSkill({ skill_name: 'JavaScript', proficiency: 'guru' }, 'offered').error);
  assert.ok(validateRating({ request_id: 1, ratee_id: 2, score: 2.5 }).error);
  assert.ok(validateSessionNote({ topic: 'React', duration_min: 1441 }).error);
});

test('user profile endpoint preserves email privacy for own user and hides it from others/public', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const userA = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Alice', email: 'alice@example.edu', password: 'password123' }
  });
  const userB = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Bob', email: 'bob@example.edu', password: 'password123' }
  });

  const ownProfile = await harness.request('/api/users/1', { cookie: userA.cookie });
  assert.equal(ownProfile.status, 200);
  assert.equal(ownProfile.data.user.email, 'alice@example.edu');

  const otherProfile = await harness.request('/api/users/1', { cookie: userB.cookie });
  assert.equal(otherProfile.status, 200);
  assert.equal(otherProfile.data.user.email, undefined);

  const guestProfile = await harness.request('/api/users/1');
  assert.equal(guestProfile.status, 200);
  assert.equal(guestProfile.data.user.email, undefined);

  const notFound = await harness.request('/api/users/999');
  assert.equal(notFound.status, 404);
});

test('swap request cancellation strictly enforces sender ownership and pending status', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const sender = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Alice', email: 'alice@example.edu', password: 'password123' }
  });
  const recipient = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Bob', email: 'bob@example.edu', password: 'password123' }
  });
  const stranger = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Charlie', email: 'charlie@example.edu', password: 'password123' }
  });

  const created = await harness.request('/api/requests', {
    method: 'POST', cookie: sender.cookie,
    body: { to_user: 2, offered_skill: 'React', requested_skill: 'Node' }
  });
  assert.equal(created.status, 201);
  const requestId = created.data.request_id;

  const recipientCancel = await harness.request(`/api/requests/${requestId}`, {
    method: 'DELETE', cookie: recipient.cookie
  });
  assert.equal(recipientCancel.status, 403);
  assert.equal(recipientCancel.data.error, 'Only the sender can cancel this request');

  const strangerCancel = await harness.request(`/api/requests/${requestId}`, {
    method: 'DELETE', cookie: stranger.cookie
  });
  assert.equal(strangerCancel.status, 403);
  assert.equal(strangerCancel.data.error, 'Only the sender can cancel this request');

  const senderCancel = await harness.request(`/api/requests/${requestId}`, {
    method: 'DELETE', cookie: sender.cookie
  });
  assert.equal(senderCancel.status, 200);
  assert.equal(senderCancel.data.success, true);

  const duplicateCancel = await harness.request(`/api/requests/${requestId}`, {
    method: 'DELETE', cookie: sender.cookie
  });
  assert.equal(duplicateCancel.status, 404);

  const req2 = await harness.request('/api/requests', {
    method: 'POST', cookie: sender.cookie,
    body: { to_user: 2, offered_skill: 'React', requested_skill: 'Node' }
  });
  assert.equal(req2.status, 201);
  await harness.request(`/api/requests/${req2.data.request_id}/status`, {
    method: 'PATCH', cookie: recipient.cookie, body: { status: 'accepted' }
  });
  const cancelAccepted = await harness.request(`/api/requests/${req2.data.request_id}`, {
    method: 'DELETE', cookie: sender.cookie
  });
  assert.equal(cancelAccepted.status, 409);
  assert.equal(cancelAccepted.data.error, 'Only a pending request can be cancelled');
});

test('swap request creation prevents reverse pending requests and duplicate requests during active swaps', async t => {
  const harness = await startHarness();
  t.after(() => harness.close());
  const userA = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Alice', email: 'alice@example.edu', password: 'password123' }
  });
  const userB = await harness.request('/api/auth/register', {
    method: 'POST', body: { name: 'Bob', email: 'bob@example.edu', password: 'password123' }
  });

  const req1 = await harness.request('/api/requests', {
    method: 'POST', cookie: userA.cookie,
    body: { to_user: 2, offered_skill: 'Java', requested_skill: 'Rust' }
  });
  assert.equal(req1.status, 201);

  const reverse = await harness.request('/api/requests', {
    method: 'POST', cookie: userB.cookie,
    body: { to_user: 1, offered_skill: 'Rust', requested_skill: 'Java' }
  });
  assert.equal(reverse.status, 409);
  assert.equal(reverse.data.error, 'This user already sent you a swap request. Check your incoming requests.');

  await harness.request(`/api/requests/${req1.data.request_id}/status`, {
    method: 'PATCH', cookie: userB.cookie, body: { status: 'accepted' }
  });

  const active1 = await harness.request('/api/requests', {
    method: 'POST', cookie: userA.cookie,
    body: { to_user: 2, offered_skill: 'Java', requested_skill: 'Rust' }
  });
  assert.equal(active1.status, 409);
  assert.equal(active1.data.error, 'You already have an active swap with this user');

  const active2 = await harness.request('/api/requests', {
    method: 'POST', cookie: userB.cookie,
    body: { to_user: 1, offered_skill: 'Rust', requested_skill: 'Java' }
  });
  assert.equal(active2.status, 409);
  assert.equal(active2.data.error, 'You already have an active swap with this user');
});

