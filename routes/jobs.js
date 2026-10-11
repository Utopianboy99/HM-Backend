const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Job = require('../models/Job');
const { requireRole } = require('../middleware/auth');

const VALID_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const VALID_PAYMENT_TYPES = ['fixed', 'hourly', 'milestone'];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[JOBS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── POST /jobs ────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const clientId = req.user.mongoId;

    const { title, description, category, location_city, location_country, is_remote, budget, payment_type, currency, slots, duration_days, start_date, deadline } = req.body;

    // Required field validation
    if (!title || !budget) {
      return res.status(400).json({ error: 'title and budget are required.' });
    }

    if (!VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` });
    }

    const status = 'open'; // default, always open on create
    const job = new Job({
      userId: clientId,
      title,
      description: description || null,
      category: category || null,
      location_city: location_city || null,
      location_country: location_country || null,
      is_remote: is_remote ?? false,
      budget: parseFloat(budget),
      payment_type: payment_type || 'fixed',
      currency: currency || 'ZAR',
      status,
      slots: slots || 1,
      duration_days: duration_days || null,
      start_date: start_date || null,
      deadline: deadline || null,
    });

    await job.save();
    log('CREATE', job);
    return res.status(201).json(job);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create job.' });
  }
});

// ── GET /jobs ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Coerce query values to strings, escape q for $regex
    const q = (req.query.q || '').toString().replace(/[.*+?^${}()|[\]\\]/, '\\$&');
    const category = req.query.category;
    const payment_type = req.query.payment_type;
    const is_remote = req.query.is_remote;
    const location_city = req.query.location_city;
    const min_budget = parseFloat(req.query.min_budget) || 0;
    const max_budget = parseFloat(req.query.max_budget) || Infinity;
    const status = req.query.status || 'open';

    const filter = {
      $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
    };

    if (q) filter.title = new RegExp(q, 'i');
    if (category) filter.category = category;
    if (payment_type) filter.payment_type = payment_type;
    if (is_remote !== undefined) filter.is_remote = is_remote === 'true';
    if (location_city) filter.location_city = location_city;
    if (min_budget) filter.budget = { $gte: min_budget };
    if (max_budget) {
      if (!filter.budget) filter.budget = {};
      filter.budget.$lte = max_budget;
    }
    if (status) filter.status = status;

    const [jobs, total] = await Promise.all([
      Job.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      Job.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: jobs.length });

    return res.json({
      items: jobs,
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// ── GET /jobs/mine ────────────────────────────────────────────────────────────
router.get('/mine', async (req, res) => {
  try {
    const clientId = req.user.mongoId;

    const [jobs, total] = await Promise.all([
      Job.find({ userId: clientId, deleted_at: null }).sort({ createdAt: -1 }).exec(),
      Job.countDocuments({ userId: clientId, deleted_at: null }).exec(),
    ]);

    log('READ MINE', { page: 1, limit, total: jobs.length, returned: jobs.length });

    return res.json({
      items: jobs,
      page: 1,
      limit,
      total,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch your jobs.' });
  }
});

// ── GET /jobs/:id ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
      },
      { updatedAt: new Date() },
      { new: true }
    ).exec();

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    log('READ ONE', job);
    return res.json(job);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch job.' });
  }
});

// ── PUT /jobs/:id ────────────────────────────────────────────────────────────
router.put('/:id', requireRole('client'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Only owner or admin can update
    if (job.userId.toString() !== req.user.mongoId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the job owner can update this job.' });
    }

    const { status, payment_type } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    if (payment_type && !VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` });
    }

    const updates = {};
    if (status) updates.status = status;
    if (payment_type) updates.payment_type = payment_type;
    updates.updatedAt = new Date();

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).exec();

    log('UPDATE', updatedJob);
    return res.json(updatedJob);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update job.' });
  }
});

// ── DELETE /jobs/:id ────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('client'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Only owner or admin can delete
    if (job.userId.toString() !== req.user.mongoId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the job owner can delete this job.' });
    }

    const deletedJob = await Job.findByIdAndUpdate(
      req.params.id,
      { deleted_at: new Date(), status: 'cancelled', updatedAt: new Date() },
      { new: true }
    ).exec();

    log('DELETE (soft)', { _id: deletedJob._id, title: deletedJob.title, deleted_at: deletedJob.deleted_at });
    return res.json({ message: `Job '${deletedJob.title}' has been deleted.`, deleted_at: deletedJob.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete job.' });
  }
});

// ── GET /jobs/:id/applications ────────────────────────────────────────────────
router.get('/:id/applications', requireRole('client'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Only owner can see applications
    if (job.userId.toString() !== req.user.mongoId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the job owner can view applications.' });
    }

    const applications = await Application.find({ job_id: req.params.id, deleted_at: null })
      .populate('applicant_id', 'full_name bio skills location_city avg_rating total_reviews')
      .exec();

    log('READ APPLICATIONS', { job_id: req.params.id, count: applications.length });

    return res.json({
      applications: applications.map(a => ({
        _id: a._id,
        applicant: {
          _id: a.applicant_id._id,
          full_name: a.applicant_id.full_name,
          bio: a.applicant_id.bio,
          skills: a.applicant_id.skills,
          location_city: a.applicant_id.location_city,
          avg_rating: a.applicant_id.avg_rating,
          total_reviews: a.applicant_id.total_reviews,
        },
        proposed_rate: a.proposed_rate,
        status: a.status,
        cover_letter: a.cover_letter,
        applied_at: a.applied_at,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch applications.' });
  }
});

// Status transition helper
function validateStatusTransition(from, to) {
  const validTransitions = {
    open: ['open', 'in_progress', 'completed', 'cancelled'],
    in_progress: ['completed'],
    completed: [],
    cancelled: [],
  };
  if (from === 'open' && ['in_progress', 'completed', 'cancelled'].includes(to)) return true;
  if (from === 'in_progress' && to === 'completed') return true;
  return false;
}

// ── POST /jobs/:id/applications ────────────────────────────────────────────────
// (Handled by routes/applications.js POST, but documented here for flow)

// ── Status transition middleware ────────────────────────────────────────────────
router.put('/:id/transition', requireRole('client'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    if (job.userId.toString() !== req.user.mongoId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the job owner can transition status.' });
    }

    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Transition target status is required.' });
    }

    if (!VALID_STATUSES.includes(to)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Validate transition
    if (!validateStatusTransition(job.status, to)) {
      return res.status(409).json({ error: `Invalid transition from '${job.status}' to '${to}'.` });
    }

    // If accepting an application that moves job to in_progress, handled in applications.js
    // For direct status transitions:
    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      { status: to, updatedAt: new Date() },
      { new: true }
    ).exec();

    log('STATUS TRANSITION', { from: job.status, to, job });
    return res.json(updatedJob);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to transition job status.' });
  }
});

module.exports = router;