const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Notification = require('../models/Notification');
const { notify } = require('../services/notify');

const VALID_TYPES = [
  'new_application', 'application_accepted', 'application_rejected',
  'new_message', 'payment_received', 'job_posted', 'review_received', 'system',
];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[NOTIFICATIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── GET /notifications ────────────────────────────────────────────────────────
// Callers only see their own notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user.mongoId;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = { user_id: userId };
    if (req.query.is_read !== undefined) query.is_read = req.query.is_read === 'true';
    if (req.query.type) query.type = req.query.type;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .exec(),
      Notification.countDocuments(query).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: notifications.length });

    return res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// ── PUT /notifications/:id/read ──────────────────────────────────────────────
router.put('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.mongoId;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user_id: userId },
      { is_read: true, read_at: new Date() },
      { new: true }
    ).exec();

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    log('UPDATE (mark read)', { _id: notification._id, is_read: notification.is_read });
    return res.json(notification);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

// ── DELETE /notifications/:id ────────────────────────────────────────────────
// Optional: delete a notification (admin or owner)
router.delete('/:id', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.mongoId;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user_id: userId,
    }).exec();

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    log('DELETE', { _id: notification._id, title: notification.title });
    return res.json({ message: 'Notification deleted.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

// ── POST /notifications ──────────────────────────────────────────────────────
// Removed: notifications are created only by server code via services/notify.js
// This route is intentionally not implemented; use the notify service instead.

module.exports = router;