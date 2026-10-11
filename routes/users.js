const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const User = require('../models/User');

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[USERS] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── DELETE POST /users ──
// Signup is handled by POST /auth/signup; this route is removed.

// ── GET /users ────────────────────────────────────────────────────────────────
router.get('/', requireRole('admin'), async (req, res) => {
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

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const caller = req.user.mongoId;

    // Allow caller to read their own full profile, admin sees all
    const filter = { deleted_at: null };
    if (caller !== targetId) {
      // Non-admin callers only get public fields
      filter._id = true; // will still find, but we'll limit projection
    }

    const user = await User.findById(targetId, { deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Non-admin, non-owner: return only public fields
    if (caller !== targetId) {
      return res.json({
        _id: user._id,
        full_name: user.full_name,
        bio: user.bio,
        skills: user.skills,
        city: user.location_city,
        rating: user.avg_rating,
      });
    }

    // Owner or admin: return full profile
    return res.json({
      _id: user._id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      profile_photo_url: user.profile_photo_url,
      bio: user.bio,
      skills: user.skills,
      location_city: user.location_city,
      location_country: user.location_country,
      lat: user.lat,
      lng: user.lng,
      is_verified: user.is_verified,
      is_active: user.is_active,
      last_login_at: user.last_login_at,
      avg_rating: user.avg_rating,
      total_reviews: user.total_reviews,
      onboarding_step: user.onboarding_step,
      onboarding_completed: user.onboarding_completed,
      onboarding_completed_at: user.onboarding_completed_at,
      goals: user.goals,
      availability: user.availability,
      profile_strength: user.profile_strength,
      interests: user.interests,
      work_style: user.work_style,
      portfolio_links: user.portfolio_links,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ── PUT /users/:id ────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const caller = req.user.mongoId;

    // Only owner or admin can update
    if (caller !== targetId) {
      return res.status(403).json({ error: 'Only the owner can update this profile.' });
    }

    // Whitelist updatable fields — never allow client to set: role, is_verified,
    // firebase_uid, avg_rating, total_reviews, views_count, applications_count, any *_at
    const whitelisted = [
      'full_name', 'phone', 'bio', 'skills',
      'location_city', 'location_country', 'profile_photo_url',
    ];
    const updates = {};
    for (const key of whitelisted) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: targetId, deleted_at: null },
      { ...updates, updated_at: new Date() },
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

// ── DELETE /users/:id ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const caller = req.user.mongoId;

    // Only owner or admin can delete
    if (caller !== targetId) {
      return res.status(403).json({ error: 'Only the owner can delete this profile.' });
    }

    const user = await User.findOneAndUpdate(
      { _id: targetId, deleted_at: null },
      { deleted_at: new Date(), is_active: false, updated_at: new Date() },
      { new: true }
    ).exec();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    log('DELETE (soft)', { id: user.id, full_name: user.full_name });
    return res.json({ message: `User '${user.full_name}' has been deleted.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;