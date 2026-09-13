const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const openai = require('../OpenAI/openai');
const Transaction = require('../models/Transaction');
const VALID_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[TRANSACTIONS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

router.post('/', async (req, res) => {
  try {
    const { job_id, payer_id, payee_id, amount, payment_method } = req.body;
    if (!job_id || !payer_id || !payee_id || !amount || !payment_method) {
      return res.status(400).json({ error: 'job_id, payer_id, payee_id, amount, and payment_method are required.' });
    }

    const transaction = new Transaction({
      id: randomUUID(),
      job_id,
      payer_id,
      payee_id,
      amount: parseFloat(amount),
      currency: req.body.currency || 'ZAR',
      payment_method,
      status: req.body.status || 'pending',
      metadata: req.body.metadata || {},
    });

    await transaction.save();
    log('CREATE', transaction);
    return res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create transaction.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { deleted_at: null };
    if (req.query.job_id) filter.job_id = req.query.job_id;
    if (req.query.payer_id) filter.payer_id = req.query.payer_id;
    if (req.query.payee_id) filter.payee_id = req.query.payee_id;
    if (req.query.status) filter.status = req.query.status;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).skip(skip).limit(limit).sort({ initiated_at: -1 }).exec(),
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

router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ id: req.params.id, deleted_at: null }).exec();
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    log('READ ONE', transaction);
    return res.json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch transaction.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const protectedFields = ['id', 'job_id', 'payer_id', 'payee_id', 'initiated_at', 'deleted_at'];
    const updates = { ...req.body };
    protectedFields.forEach((field) => delete updates[field]);

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    if (updates.status === 'completed') {
      updates.completed_at = new Date();
    }

    const transaction = await Transaction.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { ...updates, metadata: updates.metadata || {}, },
      { new: true }
    ).exec();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    log('UPDATE', transaction);
    return res.json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), status: 'refunded' },
      { new: true }
    ).exec();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    log('DELETE (soft)', { id: transaction.id, deleted_at: transaction.deleted_at });
    return res.json({ message: 'Transaction marked as refunded.', deleted_at: transaction.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

module.exports = router;
