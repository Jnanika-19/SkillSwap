'use strict';

const express = require('express');
const defaultDb = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { validateSwapRequest, isPositiveInteger } = require('../validation');

function createRequestsRouter(db) {
  const router = express.Router();

  async function notifyUser(userId, requestId, title, message) {
    try {
      await db.query(
        'INSERT INTO notifications (user_id, request_id, title, message) VALUES (?, ?, ?, ?)',
        [userId, requestId, title, message]
      );
    } catch (error) {
      // A notification should never make an otherwise successful swap action fail.
      console.error('Creating swap notification failed:', error);
    }
  }

  router.get('/', requireAuth, async (req, res) => {
    try {
      const uid = Number(req.session.userId);
      const [rows] = await db.query(`
        SELECT sr.*,
          u1.name AS from_name, u1.avatar AS from_avatar, u1.profile_picture AS from_profile_picture, u1.bio AS from_bio, u1.department AS from_dept,
          u2.name AS to_name, u2.avatar AS to_avatar, u2.profile_picture AS to_profile_picture, u2.bio AS to_bio, u2.department AS to_dept,
          (SELECT COUNT(*) FROM ratings r WHERE r.request_id = sr.request_id AND r.rater_id = ?) AS user_rated
        FROM swap_requests sr
        JOIN users u1 ON u1.user_id = sr.from_user
        JOIN users u2 ON u2.user_id = sr.to_user
        WHERE sr.from_user = ? OR sr.to_user = ?
        ORDER BY sr.created_at DESC
      `, [uid, uid, uid]);
      res.json({ requests: rows });
    } catch (error) {
      console.error('Loading swap requests failed:', error);
      res.status(500).json({ error: 'Unable to load swap requests' });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
    const validation = validateSwapRequest(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });

    const { to_user, offered_skill, requested_skill, message } = validation.value;
    const fromUser = Number(req.session.userId);
    if (to_user === fromUser) return res.status(400).json({ error: 'You cannot send a request to yourself' });

    try {
      const [recipients] = await db.query('SELECT user_id, name FROM users WHERE user_id=?', [to_user]);
      if (!recipients.length) return res.status(404).json({ error: 'Recipient not found' });
      const [existing] = await db.query(
        `SELECT request_id, from_user, to_user, status FROM swap_requests
         WHERE ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))
           AND status IN ('pending', 'accepted')`,
        [fromUser, to_user, to_user, fromUser]
      );
      if (existing.length) {
        if (existing.some(r => r.status === 'accepted')) {
          return res.status(409).json({ error: 'You already have an active swap with this user' });
        }
        if (existing.some(r => Number(r.from_user) === fromUser)) {
          return res.status(409).json({ error: 'You already have a pending request with this user' });
        }
        return res.status(409).json({ error: 'This user already sent you a swap request. Check your incoming requests.' });
      }

      const [result] = await db.query(
        'INSERT INTO swap_requests (from_user,to_user,offered_skill,requested_skill,message) VALUES (?,?,?,?,?)',
        [fromUser, to_user, offered_skill, requested_skill, message || null]
      );
      console.info('Swap request saved:', { requestId: result.insertId, fromUser, toUser: to_user });
      const senderName = req.session.name || 'A SkillSwap member';
      const notificationTitle = 'New swap request';
      const notificationMessage = (message ? `${senderName}: ${message}` : `${senderName} would like to swap ${offered_skill} for ${requested_skill}.`).slice(0, 255);
      // Return the saved request immediately. Notification delivery must not keep
      // the sender's button spinning if the notifications table is slow/unavailable.
      void notifyUser(to_user, result.insertId, notificationTitle, notificationMessage);
      res.status(201).json({ success: true, request_id: result.insertId });
    } catch (error) {
      console.error('Creating swap request failed:', error);
      res.status(500).json({ error: 'Unable to create swap request' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });

    try {
      const uid = Number(req.session.userId);
      const [result] = await db.query(
        "DELETE FROM swap_requests WHERE request_id=? AND from_user=? AND status='pending'",
        [req.params.id, uid]
      );
      if (result.affectedRows) return res.json({ success: true });

      const [rows] = await db.query('SELECT from_user, status FROM swap_requests WHERE request_id=?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Request not found' });
      if (Number(rows[0].from_user) !== uid) return res.status(403).json({ error: 'Only the sender can cancel this request' });
      return res.status(409).json({ error: 'Only a pending request can be cancelled' });
    } catch (error) {
      console.error('Cancelling swap request failed:', error);
      return res.status(500).json({ error: 'Unable to cancel swap request' });
    }
  });

  router.patch('/:id/status', requireAuth, async (req, res) => {
    if (!isPositiveInteger(req.params.id)) return res.status(400).json({ error: 'Request ID must be a positive integer' });
    const { status } = req.body || {};
    const allowed = ['accepted', 'declined', 'completed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    try {
      const uid = Number(req.session.userId);
      const [rows] = await db.query('SELECT * FROM swap_requests WHERE request_id=?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Request not found' });

      const request = rows[0];
      const isRecipient = Number(request.to_user) === uid;
      const isParticipant = isRecipient || Number(request.from_user) === uid;
      if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });
      if ((status === 'accepted' || status === 'declined') && !isRecipient) {
        return res.status(403).json({ error: 'Only the recipient can accept or decline' });
      }

      const transitionAllowed = request.status === 'pending'
        ? status === 'accepted' || status === 'declined'
        : request.status === 'accepted' && status === 'completed';
      if (!transitionAllowed) return res.status(409).json({ error: `Cannot change a ${request.status} request to ${status}` });

      await db.query('UPDATE swap_requests SET status=? WHERE request_id=?', [status, req.params.id]);
      const recipientId = uid === Number(request.from_user) ? Number(request.to_user) : Number(request.from_user);
      const notificationCopy = {
        accepted: ['Swap request accepted', 'Your skill swap request was accepted.'],
        declined: ['Swap request declined', 'Your skill swap request was declined.'],
        completed: ['Swap completed', 'Your skill swap was marked complete.']
      }[status];
      void notifyUser(recipientId, Number(req.params.id), ...notificationCopy);
      res.json({ success: true });
    } catch (error) {
      console.error('Updating swap request failed:', error);
      res.status(500).json({ error: 'Unable to update swap request' });
    }
  });

  return router;
}

const router = createRequestsRouter(defaultDb);
router.createRequestsRouter = createRequestsRouter;
module.exports = router;
