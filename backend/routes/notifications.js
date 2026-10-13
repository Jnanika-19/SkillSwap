'use strict';

const express = require('express');
const defaultDb = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { isPositiveInteger } = require('../validation');

function createNotificationsRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      const uid = Number(req.session.userId);
      const [notifResult, countResult] = await Promise.all([
        db.query(`SELECT notification_id, request_id, title, message, is_read, created_at
                  FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [uid]),
        db.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND is_read=FALSE', [uid])
      ]);
      const notifications = notifResult[0] || [];
      const counts = countResult[0] || [];
      res.json({ notifications, unreadCount: Number(counts[0]?.unread) || 0 });
    } catch (error) {
      console.error('Loading notifications failed:', error);
      res.status(500).json({ error: 'Unable to load notifications' });
    }
  });

  router.patch('/:id/read', requireAuth, async (req, res) => {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Notification ID must be a positive integer' });
    try {
      await db.query('UPDATE notifications SET is_read=TRUE WHERE notification_id=? AND user_id=?', [req.params.id, req.session.userId]);
      res.json({ success: true });
    } catch (error) {
      console.error('Updating notification failed:', error);
      res.status(500).json({ error: 'Unable to update notification' });
    }
  });

  router.post('/read-all', requireAuth, async (req, res) => {
    try {
      await db.query('UPDATE notifications SET is_read=TRUE WHERE user_id=? AND is_read=FALSE', [req.session.userId]);
      res.json({ success: true });
    } catch (error) {
      console.error('Marking notifications read failed:', error);
      res.status(500).json({ error: 'Unable to update notifications' });
    }
  });

  return router;
}

const router = createNotificationsRouter(defaultDb);
router.createNotificationsRouter = createNotificationsRouter;
module.exports = router;
