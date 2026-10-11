const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const messageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  sender_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipient_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  body: { type: String, required: true },
  attachments: { type: [String], default: [] },
  is_read: { type: Boolean, default: false },
  sent_at: { type: Date, default: Date.now },
  read_at: { type: Date, default: null },
  deleted_at: { type: Date, default: null },
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;
