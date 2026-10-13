const express       = require('express');
const defaultDb     = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
function createMatchesRouter(db) {
const router        = express.Router();

// ============================================================
// GET /api/matches — bidirectional matching for logged-in user
//
// Logic: Find users where:
//   (a) They offer at least one skill I am requesting  AND
//   (b) I offer at least one skill they are requesting
//
// Score = (overlap_count × 10) + (avg_rating × 5)
//       + 5 bonus if same department
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  const uid = req.session.userId;

  const sql = `
    SELECT
      u.user_id,
      u.name,
      u.department,
      MAX(u.bio) AS bio,
      u.avatar,
      MAX(u.profile_picture) AS profile_picture,
      u.avg_rating,
      u.swap_count,
      COUNT(DISTINCT so.skill_name)  AS skill_overlap,
      (COUNT(DISTINCT so.skill_name) * 10)
        + (u.avg_rating * 5)
        + IF(u.department = me.department, 5, 0) AS match_score,
      GROUP_CONCAT(DISTINCT so.skill_name ORDER BY so.skill_name) AS matched_skills
    FROM users u
    JOIN users me ON me.user_id = ?

    /* Condition (a): they offer something I want */
    JOIN skills_offered  so ON so.user_id   = u.user_id
    JOIN skills_requested sr ON sr.user_id  = ?
                             AND sr.skill_name = so.skill_name

    /* Condition (b): I offer something they want */
    WHERE u.user_id != ?
      AND u.user_id IN (
        SELECT sr2.user_id
        FROM skills_requested sr2
        JOIN skills_offered so2
          ON so2.skill_name = sr2.skill_name
         AND so2.user_id    = ?
        WHERE sr2.user_id  != ?
      )

    GROUP BY u.user_id, u.name, u.department, u.avatar, u.avg_rating, u.swap_count, me.department
    ORDER BY match_score DESC
    LIMIT 20
  `;

  try {
    const [rows] = await db.query(sql, [uid, uid, uid, uid, uid]);
    res.json({ matches: rows });
  } catch (err) {
    console.error('Loading matches failed:', err);
    res.status(500).json({ error: 'Unable to load matches' });
  }
});

return router;
}

const router = createMatchesRouter(defaultDb);
router.createMatchesRouter = createMatchesRouter;
module.exports = router;
