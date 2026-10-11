const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { requireRole } = require('../middleware/auth');

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[MESSAGES] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── POST /messages ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const senderId = req.user.mongoId;
    const { job_id, recipient_id, body } = req.body;

    if (!job_id || !recipient_id || !body) {
      return res.status(400).json({ error: 'job_id, recipient_id, and body are required.' });
    }

    // Validate recipient is a real user
    const recipient = await User.findById(recipient_id, { deleted_at: null }).exec();
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient user not found.' });
    }

    // Validate conversation: sender and recipient must be client + applicant of same job
    const job = await Job.findById(job_id, { deleted_at: null }).exec();
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Check: recipient must be an applicant of this job (has pending/accepted application)
    const isApplicant = await Application.exists({
      job_id: job_id,
      applicant_id: recipient_id,
      status: { $ne: 'withdrawn' },
      deleted_at: null,
    });

    if (!isApplicant) {
      return res.status(403).json({ error: 'Recipient is not an applicant of this job.' });
    }

    // Check: sender must be the job owner or an applicant of this job
    const isOwner = job.userId.toString() === senderId;
    const isSenderApplicant = await Application.exists({
      job_id: job_id,
      applicant_id: senderId,
      deleted_at: null,
    });

    if (!isOwner && !isSenderApplicant) {
      return res.status(403).json({ error: 'Sender is not associated with this job.' });
    }

    // Derive conversation_id: ${jobId}:${recipientId} (server-side)
    const conversation_id = `${job_id}:${recipient_id}`;

    const message = new Message({
      conversation_id,
      sender_id: senderId,
      recipient_id: recipient_id,
      body,
    });

    await message.save();
    log('CREATE', { _id: message._id, conversation_id: message.conversation_id });
    return res.status(201).json(message);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create message.' });
  }
});

// ── GET /messages ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const callerId = req.user.mongoId;

    const filter = { $or: [{ sender_id: callerId }, { recipient_id: callerId }] };

    if (req.query.conversation_id) {
      filter.conversation_id = req.query.conversation_id;
    }

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate('sender_id', 'full_name')
        .populate('recipient_id', 'full_name')
        .sort({ sent_at: -1 })
        .exec(),
      Message.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { count: messages.length });

    return res.json({
      data: messages,
      total,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// ── GET /messages/conversations ──────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const callerId = req.user.mongoId;

    // Find all conversation IDs where caller is either sender or recipient
    const messages = await Message.find({
      $or: [{ sender_id: callerId }, { recipient_id: callerId }] },
    )
      .sort({ conversation_id: 1, sent_at: -1 })
      .exec();

    // Group by conversation_id to get unique conversations
    const conversationMap = new Map();

    messages.forEach((msg) => {
      const key = msg.conversation_id;
      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          conversation_id: key,
          participants: [],
          last_message: msg.body,
          unread_count: 0,
          last_sent_at: msg.sent_at,
        });
      }

      // Add participant (the other person in the conversation)
      const otherId = msg.sender_id.toString() === callerId ? msg.recipient_id : msg.sender_id;
      if (!conversationMap.get(key).participants.includes(otherId)) {
        conversationMap.get(key).participants.push(otherId);
      }

      // Track unread messages for caller
      if (msg.recipient_id.toString() === callerId && !msg.is_read) {
        conversationMap.get(key).unread_count++;
      }

      // Update last sent_at
      if (!conversationMap.get(key).last_sent_at || msg.sent_at > conversationMap.get(key).last_sent_at) {
        conversationMap.get(key).last_sent_at = msg.sent_at;
      }
    });

    // Populate participant names
    for (const [, conv] of conversationMap) {
      for (const pid of conv.participants) {
        const user = await User.findById(pid, { deleted_at: null }).lean().exec();
        if (user) {
          conv.participant_name = user.full_name;
          break; // just need one name to display
        }
      }
    }

    log('READ CONVERSATIONS', { conversationCount: conversationMap.size });

    return res.json({
      conversations: Array.from(conversationMap.values()),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// ── PUT /messages/:id/read ────────────────────────────────────────────────────
router.put('/:id/read', async (req, res) => {
  try {
    const messageId = req.params.id;

    const message = await Message.findByIdAndUpdate(
      messageId,
      { is_read: true, read_at: new Date() },
      { new: true }
    ).exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    log('MARK READ', { _id: message._id, is_read: message.is_read });
    return res.json(message);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to mark message as read.' });
  }
});

module.exports = router;