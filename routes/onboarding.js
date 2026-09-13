const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Tier 1 — required steps only. Tier 2 (interests, work_style,
// portfolio_links) lives in a separate /users/:id/enrich route (Step 4) and
// never touches onboarding_step/onboarding_completed.
const STEPS = ['goal', 'role_details', 'location', 'availability', 'photo'];

const VALID_GOALS = User.VALID_GOALS;
const VALID_AVAILABILITY = User.VALID_AVAILABILITY;

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[ONBOARDING] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ─── GET current onboarding state ─────────────────────────────────────────────
// Used by the frontend on load to decide: show wizard (and which step), or
// send straight to dashboard.
router.get('/status', async (req, res) => {
  try {
    const user = await User.findOne({ firebase_uid: req.user.uid, deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      step: user.onboarding_step,
      step_name: STEPS[user.onboarding_step] || 'complete',
      completed: user.onboarding_completed,
      total_steps: STEPS.length,
      role: user.role,
      mongo_id: user._id.toString(),
      full_name: user.full_name,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch onboarding status.' });
  }
});

// ─── PATCH a single onboarding step ────────────────────────────────────────────
router.patch('/step/:stepName', async (req, res) => {
  try {
    const { stepName } = req.params;
    const stepIndex = STEPS.indexOf(stepName);

    if (stepIndex === -1) {
      return res.status(400).json({ error: `Unknown step: ${stepName}` });
    }

    const user = await User.findOne({ firebase_uid: req.user.uid, deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.onboarding_completed) {
      return res.status(409).json({ error: 'Onboarding already completed.' });
    }

    // Reject out-of-order writes — a client replaying a later step's payload
    // against a user still on an earlier step should not silently advance
    // or corrupt state. Re-submitting the CURRENT step (idempotent retry) is
    // allowed; jumping ahead is not.
    if (stepIndex > user.onboarding_step) {
      return res.status(409).json({
        error: `Complete step '${STEPS[user.onboarding_step]}' first.`,
        current_step: STEPS[user.onboarding_step],
      });
    }

    switch (stepName) {
      case 'goal': {
        const { goals } = req.body;
        if (!Array.isArray(goals) || goals.length === 0) {
          return res.status(400).json({ error: 'goals must be a non-empty array.' });
        }
        const invalid = goals.filter((g) => !VALID_GOALS.includes(g));
        if (invalid.length > 0) {
          return res.status(400).json({ error: `Invalid goal(s): ${invalid.join(', ')}. Must be one of: ${VALID_GOALS.join(', ')}` });
        }
        user.goals = goals;
        break;
      }

      case 'role_details': {
        if (user.role === 'freelancer') {
          const { skills, hourly_rate, experience_level } = req.body;
          if (!Array.isArray(skills) || skills.length < 3) {
            return res.status(400).json({ error: 'skills must be an array with at least 3 items.' });
          }
          if (!hourly_rate || isNaN(parseFloat(hourly_rate))) {
            return res.status(400).json({ error: 'hourly_rate is required and must be a number.' });
          }
          const VALID_EXPERIENCE = ['entry', 'intermediate', 'expert'];
          if (!VALID_EXPERIENCE.includes(experience_level)) {
            return res.status(400).json({ error: `experience_level must be one of: ${VALID_EXPERIENCE.join(', ')}` });
          }
          user.freelancer_profile = {
            skills,
            hourly_rate: parseFloat(hourly_rate),
            experience_level,
          };
        } else if (user.role === 'client') {
          const { company_name, company_size, industry } = req.body;
          if (!company_name) {
            return res.status(400).json({ error: 'company_name is required.' });
          }
          const VALID_SIZES = ['solo', 'small', 'medium', 'large'];
          if (!VALID_SIZES.includes(company_size)) {
            return res.status(400).json({ error: `company_size must be one of: ${VALID_SIZES.join(', ')}` });
          }
          user.client_profile = {
            company_name,
            company_size,
            industry: industry || null,
          };
        } else {
          // admin or any future role — no role_details required, just pass through
        }
        break;
      }

      case 'location': {
        const { location_city, location_country, lat, lng } = req.body;
        if (!location_city || !location_country) {
          return res.status(400).json({ error: 'location_city and location_country are required.' });
        }
        user.location_city = location_city;
        user.location_country = location_country;
        user.lat = lat ?? null;
        user.lng = lng ?? null;
        break;
      }

      case 'availability': {
        const { availability } = req.body;
        if (!VALID_AVAILABILITY.includes(availability)) {
          return res.status(400).json({ error: `availability must be one of: ${VALID_AVAILABILITY.join(', ')}` });
        }
        user.availability = availability;
        break;
      }

      case 'photo': {
        // Skippable — only set if provided, never required.
        if (req.body.profile_photo_url) {
          user.profile_photo_url = req.body.profile_photo_url;
        }
        break;
      }
    }

    // Only advance if this was the current step (not a re-submit of a
    // completed earlier step, which shouldn't happen given the guard above,
    // but stepIndex === user.onboarding_step is the only case that legitimately
    // advances the counter).
    if (stepIndex === user.onboarding_step) {
      user.onboarding_step = stepIndex + 1;
    }

    if (user.onboarding_step >= STEPS.length) {
      user.onboarding_completed = true;
      // onboarding_completed_at is stamped by the pre-save hook in the model.
    }

    await user.save();

    log('STEP COMPLETE', {
      uid: user.firebase_uid,
      step: stepName,
      new_step_index: user.onboarding_step,
      completed: user.onboarding_completed,
    });

    return res.json({
      step: user.onboarding_step,
      step_name: STEPS[user.onboarding_step] || 'complete',
      completed: user.onboarding_completed,
      profile_strength: user.profile_strength,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update onboarding step.' });
  }
});

module.exports = router;