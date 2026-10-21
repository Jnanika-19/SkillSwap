require('./config');

const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');

const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/users');
const matchRoutes       = require('./routes/matches');
const requestRoutes     = require('./routes/requests');
const ratingRoutes      = require('./routes/ratings');
const noteRoutes        = require('./routes/notes');        // Idea 3
const completionRoutes  = require('./routes/completions'); // Idea 4
const streakRoutes      = require('./routes/streaks');
const notificationRoutes = require('./routes/notifications');
const db                = require('./db/connection');
const MySQLSessionStore = require('./db/session-store');

const app = express();
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  console.error('SESSION_SECRET must be set to a random value of at least 32 characters. See backend/.env.example.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const sessionStore = new MySQLSessionStore(db);

// ── Middleware ─────────────────────────────────────────────
const frontendOrigin = process.env.CORS_ORIGIN;
if (frontendOrigin) app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

app.use(session({
  secret:            sessionSecret,
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge:   7 * 24 * 60 * 60 * 1000   // 7 days
  }
}));

// Count a user once per calendar day after a successful learning-related action.
app.use((req, res, next) => {
  const activityPaths = [
    /^\/api\/users\/me\/skills\/(offered|requested)$/,
    /^\/api\/requests(?:\/\d+\/status)?$/,
    /^\/api\/notes\/\d+$/,
    /^\/api\/ratings$/
  ];
  const isActivityAction = ['POST', 'PATCH'].includes(req.method)
    && activityPaths.some(pattern => pattern.test(req.path));
  if (isActivityAction) {
    const sendJson = res.json.bind(res);
    res.json = payload => {
      if (res.statusCode >= 400 || !req.session?.userId) return sendJson(payload);
      // Activity/streak tracking is best-effort and must not delay the API result.
      // In particular, a request that has already been saved should respond even
      // if the activity table is slow or unavailable.
      db.query('INSERT IGNORE INTO user_activity (user_id, activity_date) VALUES (?, CURRENT_DATE)', [req.session.userId])
        .catch(error => console.error('Recording learning activity failed:', error));
      return sendJson(payload);
    };
  }
  next();
});

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/matches',     matchRoutes);
app.use('/api/requests',    requestRoutes);
app.use('/api/ratings',     ratingRoutes);
app.use('/api/notes',       noteRoutes);
app.use('/api/completions', completionRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// ── Serve Frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'An unexpected server error occurred' });
});

// ── Start ──────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
const databaseName = process.env.DB_NAME || 'skillswap';

async function startServer() {
  if (process.env.DB_PASS === 'your_mysql_password') {
    console.error('backend/.env still contains the example DB_PASS placeholder. Replace it with the MySQL password that worked in your mysql command.');
    process.exitCode = 1;
    await db.end().catch(() => {});
    return;
  }

  try {
    // Don't report a healthy web server when login and app data cannot work.
    await db.query('SELECT 1 FROM users LIMIT 0');
    await sessionStore.init();
  } catch (error) {
    console.error(`Cannot connect to the SkillSwap database "${databaseName}" or find its users table.`);
    console.error('Check that MySQL is running, the schema is installed, and DB_HOST, DB_USER, DB_PASS, and DB_NAME in backend/.env are correct.');
    if (error.code) console.error(`Database error code: ${error.code}`);
    await db.end().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, () => {
    console.log(`\n🔄  Skill Swap Platform running at http://localhost:${PORT}`);
    console.log(`📦  MySQL database: ${databaseName}`);
  });

  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Open http://localhost:${PORT} if SkillSwap is already running, or stop the process using that port and try again.`);
      process.exitCode = 1;
      db.end().catch(() => {});
      return;
    }
    console.error('Could not start SkillSwap:', error);
    process.exitCode = 1;
    db.end().catch(() => {});
  });
}

startServer();
