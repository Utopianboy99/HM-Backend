const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const openai = require('../OpenAI/openai');
const Notification = require('../models/Notification');
const VALID_CHANNELS = ['in_app', 'email', 'sms', 'push'];
const VALID_TYPES = [
  'new_application', 'application_accepted', 'application_rejected',
  'new_message', 'payment_received', 'job_posted', 'review_received', 'system',
];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[NOTIFICATIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

router.post('/', async (req, res) => {
  try {
    const { user_id, type, title, channel } = req.body;
    if (!user_id || !type || !title || !channel) {
      return res.status(400).json({ error: 'user_id, type, title, and channel are required.' });
    }
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const notification = new Notification({
      id: randomUUID(),
      user_id,
      type,
      title,
      body: req.body.body || null,
      ref_entity: req.body.ref_entity || null,
      ref_entity_id: req.body.ref_entity_id || null,
      channel,
    });

    await notification.save();
    log('CREATE', notification);
    return res.status(201).json(notification);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create notification.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.user_id) query.user_id = req.query.user_id;
    if (req.query.is_read !== undefined) query.is_read = req.query.is_read === 'true';
    if (req.query.type) query.type = req.query.type;

    const [notifications, total] = await Promise.all([
      Notification.find(query).skip(skip).limit(limit).sort({ created_at: -1 }).exec(),
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

router.get('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOne({ id: req.params.id }).exec();
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    log('READ ONE', notification);
    return res.json(notification);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch notification.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.is_read !== undefined) {
      updates.is_read = req.body.is_read;
      if (req.body.is_read === true) {
        updates.read_at = new Date();
      }
    }

    const notification = await Notification.findOneAndUpdate(
      { id: req.params.id },
      updates,
      { new: true }
    ).exec();

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    log('UPDATE (mark read)', notification);
    return res.json(notification);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ id: req.params.id }).exec();
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    log('DELETE', { id: notification.id, title: notification.title });
    return res.json({ message: `Notification '${notification.title}' deleted.`, id: notification.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

module.exports = router;
