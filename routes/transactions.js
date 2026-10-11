const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Transaction = require('../models/Transaction');

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[TRANSACTIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── GET /transactions ──────────────────────────────────────────────────────────
// Read routes limited to the caller's own transactions
router.get('/', async (req, res) => {
  try {
    const callerId = req.user.mongoId;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { $or: [{ payer_id: callerId }, { payee_id: callerId }], deleted_at: null };

    if (req.query.job_id) filter.job_id = req.query.job_id;
    if (req.query.status) filter.status = req.query.status;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ initiated_at: -1 })
        .exec(),
      Transaction.countDocuments(filter).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: transactions.length });

    return res.json({
      data: transactions,
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
    return res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// ── GET /transactions/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      $or: [{ payer_id: req.user.mongoId }, { payee_id: req.user.mongoId }],
      deleted_at: null,
    }).exec();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    return res.json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch transaction.' });
  }
});

// ── POST /transactions ────────────────────────────────────────────────────────
// Phase: Paystack — disabled for MVP
router.post('/', async (req, res) => {
  return res.status(501).json({ error: 'Transaction creation is disabled for the MVP. Paystack integration pending.' });
});

// ── PUT /transactions/:id ─────────────────────────────────────────────────────
// Phase: Paystack — disabled for MVP
router.put('/:id', async (req, res) => {
  return res.status(501).json({ error: 'Transaction update is disabled for the MVP. Paystack integration pending.' });
});

// ── DELETE /transactions/:id ──────────────────────────────────────────────────
// Phase: Paystack — disabled for MVP
router.delete('/:id', async (req, res) => {
  return res.status(501).json({ error: 'Transaction deletion is disabled for the MVP. Paystack integration pending.' });
});

module.exports = router;