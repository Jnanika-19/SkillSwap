const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function shiftDate(isoDate, amount) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(activity_date, '%Y-%m-%d') AS activity_date,
              DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS today
       FROM user_activity
       WHERE user_id=?
       ORDER BY activity_date DESC`,
      [req.session.userId]
    );

    const activeDates = rows.map(row => row.activity_date);
    const dateSet = new Set(activeDates);
    const today = rows[0]?.today || (await db.query("SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS today"))[0][0].today;

    let currentStreak = 0;
    let cursor = dateSet.has(today) ? today : shiftDate(today, -1);
    while (dateSet.has(cursor)) {
      currentStreak += 1;
      cursor = shiftDate(cursor, -1);
    }

    let longestStreak = 0;
    let run = 0;
    let previous = null;
    for (const day of [...activeDates].sort()) {
      run = previous && shiftDate(previous, 1) === day ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      previous = day;
    }

    const week = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(today, index - 6);
      return { date, active: dateSet.has(date) };
    });

    res.json({ currentStreak, longestStreak, week, today });
  } catch (error) {
    console.error('Loading learning streak failed:', error);
    res.status(500).json({ error: 'Unable to load learning streak' });
  }
});

module.exports = router;
