const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const VALID_ROLES = ['freelancer', 'client', 'admin'];
const openai = require('../OpenAI/openai.js');

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[USERS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

router.post('/', async (req, res) => {
  try {
    const { email, full_name, role } = req.body;
    if (!email || !full_name || !role) {
      return res.status(400).json({ error: 'email, full_name, and role are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await User.findOne({ email, deleted_at: null }).exec();
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const user = new User({
      id: randomUUID(),
      email,
      password_hash: req.body.password_hash || null,
      full_name,
      phone: req.body.phone || null,
      role,
      profile_photo_url: req.body.profile_photo_url || null,
      bio: req.body.bio || null,
      skills: req.body.skills || [],
      location_city: req.body.location_city || null,
      location_country: req.body.location_country || null,
      lat: req.body.lat || null,
      lng: req.body.lng || null,
    });

    await user.save();
    log('CREATE', user);
    return res.status(201).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ deleted_at: null }).skip(skip).limit(limit).sort({ created_at: -1 }).exec(),
      User.countDocuments({ deleted_at: null }).exec(),
    ]);

    log('READ ALL', { page, limit, total, returned: users.length });

    return res.json({
      data: users,
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
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id, deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    log('READ ONE', user);
    return res.json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const protectedFields = ['id', 'created_at', 'deleted_at', 'avg_rating', 'total_reviews'];
    const updates = { ...req.body };
    protectedFields.forEach((field) => delete updates[field]);

    if (updates.role && !VALID_ROLES.includes(updates.role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    updates.updated_at = new Date();

    const user = await User.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      updates,
      { new: true }
    ).exec();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    log('UPDATE', user);
    return res.json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), is_active: false, updated_at: new Date() },
      { new: true }
    ).exec();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    log('DELETE (soft)', { id: user.id, full_name: user.full_name });
    return res.json({ message: `User '${user.full_name}' has been deleted.`, deleted_at: user.deleted_at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;
