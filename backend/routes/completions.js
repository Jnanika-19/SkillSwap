const express       = require('express');
const db            = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const router        = express.Router();

// ============================================================
// SKILL COMPLETIONS — Idea 4: Completion Certificates
// Auto-created by DB trigger when both users rate >= 3 stars.
// These routes just READ the completion data.
// ============================================================

// GET /api/completions/me  — my completed skills (as learner)
router.get('/me', requireAuth, async (req, res) => {
  const uid = req.session.userId;
  try {
    const [completions] = await db.query(`
      SELECT sc.*,
        u2.name    AS teacher_name,
        u2.avatar  AS teacher_avatar,
        u2.profile_picture AS teacher_profile_picture,
        u2.bio AS teacher_bio,
        u2.department AS teacher_dept
      FROM skill_completions sc
      JOIN users u2 ON u2.user_id = sc.teacher_id
      WHERE sc.learner_id = ?
      ORDER BY sc.completed_at DESC
    `, [uid]);
    res.json({ completions });
  } catch (error) {
    console.error('Loading learner completions failed:', error);
    res.status(500).json({ error: 'Unable to load completions' });
  }
});

// GET /api/completions/taught  — skills I have taught others
router.get('/taught', requireAuth, async (req, res) => {
  const uid = req.session.userId;
  try {
    const [taught] = await db.query(`
      SELECT sc.*,
        u1.name    AS learner_name,
        u1.avatar  AS learner_avatar,
        u1.profile_picture AS learner_profile_picture,
        u1.bio AS learner_bio,
        u1.department AS learner_dept
      FROM skill_completions sc
      JOIN users u1 ON u1.user_id = sc.learner_id
      WHERE sc.teacher_id = ?
      ORDER BY sc.completed_at DESC
    `, [uid]);
    res.json({ taught });
  } catch (error) {
    console.error('Loading taught completions failed:', error);
    res.status(500).json({ error: 'Unable to load taught completions' });
  }
});

// GET /api/completions/all  — all completions (public, for explore page)
router.get('/all', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM v_skill_completions LIMIT 50');
    res.json({ completions: rows });
  } catch (error) {
    console.error('Loading all completions failed:', error);
    res.status(500).json({ error: 'Unable to load completions' });
  }
});

// GET /api/completions/stats  — platform-wide stats
router.get('/stats', async (req, res) => {
  try {
    const [[{ total }]]    = await db.query('SELECT COUNT(*) AS total FROM skill_completions');
    const [[{ skills }]]   = await db.query('SELECT COUNT(DISTINCT skill_learned) AS skills FROM skill_completions');
    const [[{ avg_score }]]= await db.query('SELECT ROUND(AVG(avg_score),2) AS avg_score FROM skill_completions');
    const [topSkills]      = await db.query(`
      SELECT skill_learned AS skill, COUNT(*) AS times_learned
      FROM skill_completions
      GROUP BY skill_learned ORDER BY times_learned DESC LIMIT 5
    `);
    res.json({ total, skills, avg_score, topSkills });
  } catch (error) {
    console.error('Loading completion stats failed:', error);
    res.status(500).json({ error: 'Unable to load completion stats' });
  }
});

module.exports = router;
