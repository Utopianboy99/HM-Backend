const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  conversation_id: { type: String, required: true },
  sender_id: { type: String, required: true },
  recipient_id: { type: String, required: true },
  body: { type: String, required: true },
  attachments: { type: [String], default: [] },
  is_read: { type: Boolean, default: false },
  sent_at: { type: Date, default: Date.now },
  read_at: { type: Date, default: null },
  deleted_at: { type: Date, default: null },
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;
