const express       = require('express');
const defaultDb     = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { validateSkill, isPositiveInteger } = require('../validation');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createUsersRouter(db) {
const router        = express.Router();
const uploadRoot = process.env.VERCEL
  ? path.join('/tmp', 'skillswap-uploads')
  : path.join(__dirname, '..', 'uploads');
const avatarDir = path.join(uploadRoot, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });
const avatarTypes = {
  '.png': { mime: 'image/png', signature: bytes => bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  '.jpg': { mime: 'image/jpeg', signature: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  '.jpeg': { mime: 'image/jpeg', signature: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  '.webp': { mime: 'image/webp', signature: bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' }
};
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, avatarDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const type = avatarTypes[extension];
    if (!type || (file.mimetype && file.mimetype !== type.mime)) return callback(new Error('Choose a PNG, JPG, or WebP image.'));
    callback(null, true);
  }
});

// Update editable public profile details.
router.patch('/me/profile', requireAuth, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const department = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim() : '';
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
  if (department.length > 60) return res.status(400).json({ error: 'Department must be 60 characters or fewer.' });
  if (bio.length > 2000) return res.status(400).json({ error: 'Description must be 2000 characters or fewer.' });
  const avatar = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  try {
    await db.query('UPDATE users SET name=?, department=?, bio=?, avatar=? WHERE user_id=?',
      [name, department || null, bio || null, avatar, req.session.userId]);
    req.session.name = name;
    const [rows] = await db.query(
      'SELECT user_id,name,email,department,bio,avatar,profile_picture,avg_rating,swap_count FROM users WHERE user_id=?',
      [req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Updating user profile failed:', error);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

// Upload public profile picture. Files are stored under random names and served only as images.
router.post('/me/avatar', requireAuth, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, error => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'Profile pictures must be 3 MB or smaller.' : error.message || 'Unable to upload profile picture.' });
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a profile picture.' });
  const type = avatarTypes[path.extname(file.originalname).toLowerCase()];
  try {
    const bytes = await fs.promises.readFile(file.path);
    if (!type.signature(bytes)) {
      await fs.promises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'The image contents do not match PNG, JPG, or WebP.' });
    }
    const [oldRows] = await db.query('SELECT profile_picture FROM users WHERE user_id=?', [req.session.userId]);
    if (!oldRows.length) {
      await fs.promises.unlink(file.path).catch(() => {});
      return res.status(404).json({ error: 'Profile not found.' });
    }
    const pictureUrl = `/api/users/avatar/${file.filename}`;
    await db.query('UPDATE users SET profile_picture=? WHERE user_id=?', [pictureUrl, req.session.userId]);
    const oldUrl = oldRows[0].profile_picture;
    if (typeof oldUrl === 'string' && /^\/api\/users\/avatar\/[a-f0-9]{32}\.(?:png|jpe?g|webp)$/.test(oldUrl)) {
      await fs.promises.unlink(path.join(avatarDir, path.basename(oldUrl))).catch(() => {});
    }
    const [users] = await db.query(
      'SELECT user_id,name,email,department,bio,avatar,profile_picture,avg_rating,swap_count FROM users WHERE user_id=?',
      [req.session.userId]
    );
    res.json({ success: true, user: users[0] });
  } catch (error) {
    await fs.promises.unlink(file.path).catch(() => {});
    console.error('Uploading profile picture failed:', error);
    res.status(500).json({ error: 'Unable to save profile picture.' });
  }
});

router.get('/avatar/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-f0-9]{32}\.(?:png|jpe?g|webp)$/.test(filename)) return res.status(404).end();
  try {
    const pictureUrl = `/api/users/avatar/${filename}`;
    const [rows] = await db.query('SELECT profile_picture FROM users WHERE profile_picture=? LIMIT 1', [pictureUrl]);
    if (!rows.length) return res.status(404).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filename, { root: avatarDir }, error => {
      if (error && !res.headersSent) res.status(error.statusCode || 404).end();
    });
  } catch (error) {
    console.error('Loading profile picture failed:', error);
    if (!res.headersSent) res.status(500).end();
  }
});

// GET /api/users/me/skills — get my offered + requested skills
router.get('/me/skills', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const [offered]    = await db.query('SELECT * FROM skills_offered WHERE user_id=?', [uid]);
    const [requested]  = await db.query('SELECT * FROM skills_requested WHERE user_id=?', [uid]);
    res.json({ offered, requested });
  } catch (error) {
    console.error('Loading user skills failed:', error);
    res.status(500).json({ error: 'Unable to load skills' });
  }
});

// POST /api/users/me/skills/offered
router.post('/me/skills/offered', requireAuth, async (req, res) => {
  const validation = validateSkill(req.body, 'offered');
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { skill_name, proficiency } = validation.value;
  try {
    await db.query(
      'INSERT INTO skills_offered (user_id,skill_name,proficiency) VALUES (?,?,?)',
      [req.session.userId, skill_name.trim(), proficiency || 'intermediate']
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Skill already added' });
    console.error('Adding offered skill failed:', error);
    res.status(500).json({ error: 'Unable to add skill' });
  }
});

// DELETE /api/users/me/skills/offered/:id
router.delete('/me/skills/offered/:id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Skill ID must be a positive integer' });
  try {
    await db.query('DELETE FROM skills_offered WHERE id=? AND user_id=?', [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting offered skill failed:', error);
    res.status(500).json({ error: 'Unable to delete skill' });
  }
});

// POST /api/users/me/skills/requested
router.post('/me/skills/requested', requireAuth, async (req, res) => {
  const validation = validateSkill(req.body, 'requested');
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { skill_name, urgency } = validation.value;
  try {
    await db.query(
      'INSERT INTO skills_requested (user_id,skill_name,urgency) VALUES (?,?,?)',
      [req.session.userId, skill_name.trim(), urgency || 'medium']
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Skill already added' });
    console.error('Adding requested skill failed:', error);
    res.status(500).json({ error: 'Unable to add skill' });
  }
});

// DELETE /api/users/me/skills/requested/:id
router.delete('/me/skills/requested/:id', requireAuth, async (req, res) => {
  if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Skill ID must be a positive integer' });
  try {
    await db.query('DELETE FROM skills_requested WHERE id=? AND user_id=?', [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Deleting requested skill failed:', error);
    res.status(500).json({ error: 'Unable to delete skill' });
  }
});

// GET /api/users/:id — profile
router.get('/:id', async (req, res) => {
  if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'User ID must be a positive integer' });
  try {
    const isSelf = Number(req.session?.userId) === Number(req.params.id);
    const selectFields = isSelf
      ? 'user_id,name,email,department,bio,avatar,profile_picture,avg_rating,swap_count'
      : 'user_id,name,department,bio,avatar,profile_picture,avg_rating,swap_count';
    const [rows] = await db.query(
      `SELECT ${selectFields} FROM users WHERE user_id=?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const [offered]   = await db.query('SELECT * FROM skills_offered WHERE user_id=?', [req.params.id]);
    const [requested] = await db.query('SELECT * FROM skills_requested WHERE user_id=?', [req.params.id]);
    res.json({ user: rows[0], offered, requested });
  } catch (error) {
    console.error('Loading user profile failed:', error);
    res.status(500).json({ error: 'Unable to load profile' });
  }
});

// GET /api/users — all users (for browse)
router.get('/', async (req, res) => {
  const { skill } = req.query;
  if (skill !== undefined && (typeof skill !== 'string' || skill.trim().length > 80)) {
    return res.status(400).json({ error: 'skill filter must be 80 characters or fewer' });
  }
  try {
    let query = 'SELECT user_id,name,department,bio,avatar,profile_picture,avg_rating,swap_count FROM users';
    let params = [];
    if (skill) {
      query = `SELECT DISTINCT u.user_id,u.name,u.department,u.bio,u.avatar,u.profile_picture,u.avg_rating,u.swap_count
               FROM users u JOIN skills_offered so ON so.user_id=u.user_id
               WHERE so.skill_name LIKE ?`;
      params = [`%${skill}%`];
    }
    const [rows] = await db.query(query, params);
    res.json({ users: rows });
  } catch (error) {
    console.error('Loading users list failed:', error);
    res.status(500).json({ error: 'Unable to load users' });
  }
});

return router;
}

const router = createUsersRouter(defaultDb);
router.createUsersRouter = createUsersRouter;
module.exports = router;

