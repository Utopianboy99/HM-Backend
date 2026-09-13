const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const openai = require('../OpenAI/openai');
const Job = require('../models/Job');
const VALID_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const VALID_PAYMENT_TYPES = ['fixed', 'hourly', 'milestone'];

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[JOBS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, budget } = req.body;
    const userId = req.body.userId || req.body.posted_by;

    // Required field validation
    if (!title || !budget || !userId) {
      return res.status(400).json({ error: 'title, budget, and userId (or posted_by) are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'userId (or posted_by) must be a valid MongoDB ObjectId.' });
    }

    const payment_type = req.body.payment_type || 'fixed';
    if (!VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` });
    }

    const status = req.body.status || 'open';
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const job = new Job({
      userId,
      title,
      description: req.body.description || null,
      category: req.body.category || null,
      tags: req.body.tags || [],
      location: req.body.location || null,
      location_city: req.body.location_city || null,
      location_country: req.body.location_country || null,
      lat: req.body.lat || null,
      lng: req.body.lng || null,
      is_remote: req.body.is_remote ?? false,
      budget: parseFloat(budget),
      payment_type,
      currency: req.body.currency || 'ZAR',
      status,
      slots: req.body.slots || 1,
      duration_days: req.body.duration_days || null,
      start_date: req.body.start_date || null,
      deadline: req.body.deadline || null,
    });

    await job.save();
    log('CREATE', job);
    return res.status(201).json(job);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create job.' });
  }
});

// ─── READ ALL ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
    };

    // Optional filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.is_remote !== undefined) filter.is_remote = req.query.is_remote === 'true';
    if (req.query.userId) filter.userId = req.query.userId;

    const [jobs, total] = await Promise.all([
      Job.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      Job.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: jobs.length });

    return res.json({
      data: jobs,
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
    return res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// ─── READ ONE ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // Validate that the id is a valid ObjectId before querying
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
      },
      { $inc: { views_count: 1 }, updatedAt: new Date() },
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

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    // Prevent overwriting protected fields
    const protectedFields = ['_id', 'userId', 'createdAt', 'deleted_at', 'views_count', 'applications_count'];
    const updates = { ...req.body };
    protectedFields.forEach((field) => delete updates[field]);

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    if (updates.payment_type && !VALID_PAYMENT_TYPES.includes(updates.payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${VALID_PAYMENT_TYPES.join(', ')}` });
    }

    updates.updatedAt = new Date();

    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
      },
      { $set: updates },
      { new: true }
    ).exec();

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    log('UPDATE', job);
    return res.json(job);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update job.' });
  }
});

// ─── DELETE (soft) ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
      },
      { $set: { deleted_at: new Date(), status: 'cancelled', updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    log('DELETE (soft)', { _id: job._id, title: job.title, deleted_at: job.deleted_at });
    return res.json({ message: `Job '${job.title}' has been deleted.`, deleted_at: job.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete job.' });
  }
});

module.exports = router;