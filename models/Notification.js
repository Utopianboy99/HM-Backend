const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const VALID_CHANNELS = ['in_app', 'email', 'sms', 'push'];
const VALID_TYPES = [
  'new_application', 'application_accepted', 'application_rejected',
  'new_message', 'payment_received', 'job_posted', 'review_received', 'system',
];

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  user_id: { type: String, required: true },
  type: { type: String, required: true, enum: VALID_TYPES },
  title: { type: String, required: true },
  body: { type: String, default: null },
  ref_entity: { type: String, default: null },
  ref_entity_id: { type: String, default: null },
  channel: { type: String, required: true, enum: VALID_CHANNELS },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  read_at: { type: Date, default: null },
});

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

module.exports = Notification;
