const mongoose = require('mongoose');

const VALID_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const VALID_PAYMENT_TYPES = ['fixed', 'hourly', 'milestone'];

const jobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    category: { type: String, default: null },
    tags: { type: [String], default: [] },
    location: { type: String, default: null },
    location_city: { type: String, default: null },
    location_country: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    is_remote: { type: Boolean, default: false },
    budget: { type: Number, required: true },
    payment_type: {
      type: String,
      enum: VALID_PAYMENT_TYPES,
      default: 'fixed',
    },
    currency: { type: String, default: 'ZAR' },
    status: {
      type: String,
      enum: VALID_STATUSES,
      default: 'open',
    },
    slots: { type: Number, default: 1 },
    duration_days: { type: Number, default: null },
    start_date: { type: String, default: null },
    deadline: { type: String, default: null },
    views_count: { type: Number, default: 0 },
    applications_count: { type: Number, default: 0 },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

module.exports = Job;
