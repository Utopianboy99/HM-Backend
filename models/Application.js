const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const VALID_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'];

const applicationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  job_id: { type: String, required: true },
  applicant_id: { type: String, required: true },
  cover_letter: { type: String, default: null },
  proposed_rate: { type: Number, required: true },
  attachments: { type: [String], default: [] },
  status: { type: String, default: 'pending', enum: VALID_STATUSES },
  client_note: { type: String, default: null },
  applied_at: { type: Date, default: Date.now },
  reviewed_at: { type: Date, default: null },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null },
});

const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);

module.exports = Application;
