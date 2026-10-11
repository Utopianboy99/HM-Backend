const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const VALID_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

const transactionSchema = new mongoose.Schema({
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  payer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  payee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: 'ZAR' },
  payment_method: { type: String, required: true },
  status: { type: String, required: true, enum: VALID_STATUSES, default: 'pending' },
  initiated_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  deleted_at: { type: Date, default: null },
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
