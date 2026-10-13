const express       = require('express');
const db            = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { validateRating, isPositiveInteger } = require('../validation');
const router        = express.Router();

// POST /api/ratings — submit a rating after completed swap
router.post('/', requireAuth, async (req, res) => {
  const validation = validateRating(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { request_id, ratee_id, score, comment } = validation.value;

  try {
    // Ensure the swap is completed
    const [rows] = await db.query(
      "SELECT * FROM swap_requests WHERE request_id=? AND status='completed'",
      [request_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Swap is not completed yet' });

    const swap = rows[0];
    const uid  = req.session.userId;
    if (Number(swap.from_user) !== Number(uid) && Number(swap.to_user) !== Number(uid))
      return res.status(403).json({ error: 'You are not part of this swap' });
    const expectedRatee = Number(swap.from_user) === Number(uid) ? Number(swap.to_user) : Number(swap.from_user);
    if (Number(ratee_id) !== expectedRatee)
      return res.status(400).json({ error: 'You can only rate the other person in this swap' });

    try {
      await db.query(
        'INSERT INTO ratings (request_id,rater_id,ratee_id,score,comment) VALUES (?,?,?,?,?)',
        [request_id, uid, ratee_id, score, comment || null]
      );
      // Trigger in DB automatically updates avg_rating
      res.json({ success: true });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already rated this swap' });
      throw e;
    }
  } catch (err) {
    console.error('Submitting rating failed:', err);
    res.status(500).json({ error: 'Unable to submit rating' });
  }
});

// GET /api/ratings/leaderboard — top rated users
router.get('/leaderboard', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM v_leaderboard LIMIT 10');
    res.json({ leaderboard: rows });
  } catch (error) {
    console.error('Loading leaderboard failed:', error);
    res.status(500).json({ error: 'Unable to load leaderboard' });
  }
});

// GET /api/ratings/user/:id — ratings received by a user
router.get('/user/:id', async (req, res) => {
  if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'User ID must be a positive integer' });
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS rater_name, u.avatar AS rater_avatar
       FROM ratings r JOIN users u ON u.user_id = r.rater_id
       WHERE r.ratee_id = ? ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json({ ratings: rows });
  } catch (error) {
    console.error('Loading user ratings failed:', error);
    res.status(500).json({ error: 'Unable to load ratings' });
  }
});

module.exports = router;
