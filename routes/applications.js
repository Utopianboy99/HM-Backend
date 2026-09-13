const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const openai = require('../OpenAI/openai');
const Application = require('../models/Application');
const VALID_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[APPLICATIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

router.post('/', async (req, res) => {
  try {
    const { job_id, applicant_id, proposed_rate } = req.body;
    if (!job_id || !applicant_id || !proposed_rate) {
      return res.status(400).json({ error: 'job_id, applicant_id, and proposed_rate are required.' });
    }

    const existing = await Application.findOne({ job_id, applicant_id, deleted_at: null }).exec();
    if (existing) {
      return res.status(409).json({ error: 'This applicant has already applied to this job.' });
    }

    const application = new Application({
      id: randomUUID(),
      job_id,
      applicant_id,
      cover_letter: req.body.cover_letter || null,
      proposed_rate: parseFloat(proposed_rate),
      attachments: req.body.attachments || [],
      status: 'pending',
    });

    await application.save();

    // Increment applications_count on the Job
    const Job = require('../models/Job');
    await Job.findByIdAndUpdate(job_id, { $inc: { applications_count: 1 } }).exec();

    log('CREATE', application);
    return res.status(201).json(application);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create application.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { deleted_at: null };
    if (req.query.job_id) filter.job_id = req.query.job_id;
    if (req.query.applicant_id) filter.applicant_id = req.query.applicant_id;
    if (req.query.status) filter.status = req.query.status;

    const [applications, total] = await Promise.all([
      Application.find(filter).skip(skip).limit(limit).sort({ applied_at: -1 }).exec(),
      Application.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: applications.length });

    return res.json({
      data: applications,
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
    return res.status(500).json({ error: 'Failed to fetch applications.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const application = await Application.findOne({ id: req.params.id, deleted_at: null }).exec();
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    log('READ ONE', application);
    return res.json(application);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch application.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const protectedFields = ['id', 'job_id', 'applicant_id', 'applied_at', 'deleted_at'];
    const updates = { ...req.body };
    protectedFields.forEach((field) => delete updates[field]);

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    if (updates.status && updates.status !== 'pending') {
      updates.reviewed_at = new Date();
    }

    updates.updated_at = new Date();

    const application = await Application.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      updates,
      { new: true }
    ).exec();

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    log('UPDATE', application);
    return res.json(application);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update application.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const application = await Application.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), status: 'withdrawn', updated_at: new Date() },
      { new: true }
    ).exec();

    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    log('DELETE (soft)', { id: application.id, deleted_at: application.deleted_at });
    return res.json({ message: 'Application withdrawn.', deleted_at: application.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete application.' });
  }
});

module.exports = router;
