const express = require('express');
const db = require('../db/connection');

const router = express.Router();

const sampleSkills = [
  { skill_name: 'Python', offered_count: 1, requested_count: 4 },
  { skill_name: 'React', offered_count: 1, requested_count: 4 },
  { skill_name: 'Machine Learning', offered_count: 1, requested_count: 4 },
  { skill_name: 'Figma', offered_count: 1, requested_count: 2 },
  { skill_name: 'Excel', offered_count: 1, requested_count: 0 },
  { skill_name: 'Docker', offered_count: 1, requested_count: 1 }
];

router.get('/', async (req, res) => {
  try {
    const [skills] = await db.query(`
      SELECT
        skill_name,
        SUM(offered_count) AS offered_count,
        SUM(requested_count) AS requested_count
      FROM (
        SELECT skill_name, COUNT(*) AS offered_count, 0 AS requested_count
        FROM skills_offered
        GROUP BY skill_name
        UNION ALL
        SELECT skill_name, 0 AS offered_count, COUNT(*) AS requested_count
        FROM skills_requested
        GROUP BY skill_name
      ) skill_totals
      GROUP BY skill_name
      ORDER BY requested_count DESC, offered_count DESC, skill_name
    `);

    res.json({ skills });
  } catch (error) {
    console.error('Loading skills failed:', error);
    res.json({ skills: sampleSkills, source: 'sample' });
  }
});

module.exports = router;
