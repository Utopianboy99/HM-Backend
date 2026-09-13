const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const openai = require('../OpenAI/openai');
const Message = require('../models/Message');

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[MESSAGES] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

router.post('/', async (req, res) => {
  try {
    const { conversation_id, sender_id, recipient_id, body } = req.body;
    if (!conversation_id || !sender_id || !recipient_id || !body) {
      return res.status(400).json({ error: 'conversation_id, sender_id, recipient_id, and body are required.' });
    }

    const message = new Message({
      id: randomUUID(),
      conversation_id,
      sender_id,
      recipient_id,
      body,
      attachments: req.body.attachments || [],
    });

    await message.save();
    log('CREATE', message);
    return res.status(201).json(message);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create message.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = { deleted_at: null };
    if (req.query.conversation_id) filter.conversation_id = req.query.conversation_id;
    if (req.query.sender_id) filter.sender_id = req.query.sender_id;
    if (req.query.recipient_id) filter.recipient_id = req.query.recipient_id;

    const [messages, total] = await Promise.all([
      Message.find(filter).skip(skip).limit(limit).sort({ sent_at: -1 }).exec(),
      Message.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: messages.length });

    return res.json({
      data: messages,
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
    return res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { is_read: true, read_at: new Date() },
      { new: true }
    ).exec();
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }
    log('READ ONE', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch message.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const protectedFields = ['id', 'conversation_id', 'sender_id', 'recipient_id', 'sent_at', 'deleted_at'];
    const updates = { ...req.body };
    protectedFields.forEach((field) => delete updates[field]);
    updates.updated_at = new Date();

    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      updates,
      { new: true }
    ).exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    log('UPDATE', message);
    return res.json(message);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update message.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date() },
      { new: true }
    ).exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    log('DELETE (soft)', { id: message.id, deleted_at: message.deleted_at });
    return res.json({ message: 'Message deleted.', deleted_at: message.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

module.exports = router;
