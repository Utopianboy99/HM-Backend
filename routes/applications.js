const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Application = require('../models/Application');
const Job = require('../models/Job');
const { requireRole } = require('../middleware/auth');

const VALID_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[APPLICATIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── POST /applications ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const applicantId = req.user.mongoId;
    const { job_id } = req.body;

    if (!job_id) {
      return res.status(400).json({ error: 'job_id is required.' });
    }

    // Validate job exists and is open, not owned by caller
    const job = await Job.findById(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    if (job.status !== 'open') {
      return res.status(409).json({ error: 'Cannot apply to a job that is not open.' });
    }

    if (job.userId.toString() === applicantId) {
      return res.status(409).json({ error: 'Cannot apply to your own job.' });
    }

    // Duplicate check: unique compound index on { job_id, applicant_id }
    const existing = await Application.findOne({ job_id, applicant_id: applicantId, deleted_at: null }).exec();
    if (existing) {
      return res.status(409).json({ error: 'You have already applied to this job.' });
    }

    const application = new Application({
      job_id,
      applicant_id: applicantId,
      proposed_rate: req.body.proposed_rate || 0,
      cover_letter: req.body.cover_letter || null,
      status: 'pending',
    });

    await application.save();

    log('CREATE', application);
    return res.status(201).json(application);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create application.' });
  }
});

// ── GET /applications/mine ────────────────────────────────────────────────────
router.get('/mine', async (req, res) => {
  try {
    const applicantId = req.user.mongoId;

    const [applications, total] = await Promise.all([
      Application.find({ applicant_id: applicantId, deleted_at: null })
        .populate('job_id', 'title budget payment_type')
        .sort({ applied_at: -1 })
        .exec(),
      Application.countDocuments({ applicant_id: applicantId, deleted_at: null }).exec(),
    ]);

    log('READ MINE', { count: applications.length });

    return res.json({
      applications: applications.map(a => ({
        _id: a._id,
        job_id: a.job_id._id,
        title: a.job_id.title,
        budget: a.job_id.budget,
        payment_type: a.job_id.payment_type,
        proposed_rate: a.proposed_rate,
        cover_letter: a.cover_letter,
        status: a.status,
        applied_at: a.applied_at,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch your applications.' });
  }
});

// ── PUT /applications/:id ────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const applicationId = req.params.id;
    const caller = req.user.mongoId;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const job = await Job.findById(application.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const isOwner = job.userId.toString() === caller;
    const isApplicant = application.applicant_id.toString() === caller;

    // Job owner can set: reviewed | accepted | rejected
    if (isOwner) {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'status is required.' });
      }

      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      application.status = status;
      application.reviewed_at = new Date();

      // When application becomes accepted, set job to in_progress
      if (status === 'accepted') {
        job.status = 'in_progress';
      }

      await job.save();
      await application.save();

      log('UPDATE (owner)', { application, job });
      return res.json({ application, job });
    }

    // Applicant can only set withdrawn
    if (isApplicant) {
      const { status } = req.body;
      if (status !== 'withdrawn') {
        return res.status(400).json({ error: 'Applicants can only set status to withdrawn.' });
      }

      application.status = 'withdrawn';
      application.deleted_at = new Date();
      await application.save();

      log('UPDATE (applicant - withdrawn)', application);
      return res.json(application);
    }

    // Anyone else gets 403
    return res.status(403).json({ error: 'Only the job owner or applicant can update this application.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update application.' });
  }
});

module.exports = router;