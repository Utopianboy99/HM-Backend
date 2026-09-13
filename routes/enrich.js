const express = require('express');
const router = express.Router();
const User = require('../models/User');
const upload = require('../multer.config');
const { generateJobDescription } = require('../OpenAI/prompts/job_description');
const { generateCoverLetter } = require('../OpenAI/prompts/cover_letter');
const { matchFreelancersToJob } = require('../OpenAI/prompts/match');
const { generateSearchResults } = require('../OpenAI/prompts/search');

// Tier 2 — progressive enrichment. Free-form: any field, any time, any order.
// Never touches onboarding_step or onboarding_completed. Safe to call
// repeatedly; partial payloads are fine (only provided fields are updated).

const VALID_TEAM_PREFERENCE = ['solo', 'small_team', 'large_team', 'no_preference'];
const VALID_COMMUNICATION_STYLE = ['structured', 'casual', 'direct', 'collaborative'];
const VALID_RISK_TOLERANCE = ['safe', 'balanced', 'bold'];
const VALID_WORK_VALUES = ['speed', 'quality', 'learning', 'money', 'impact', 'innovation'];
const VALID_PORTFOLIO_KEYS = ['github', 'linkedin', 'website', 'behance'];

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[ENRICH] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

router.patch('/', async (req, res) => {
  try {
    const user = await User.findOne({ firebase_uid: req.user.uid, deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { interests, work_style, portfolio_links, bio } = req.body;
    const touched = [];

    if (interests !== undefined) {
      if (!Array.isArray(interests) || interests.some((i) => typeof i !== 'string')) {
        return res.status(400).json({ error: 'interests must be an array of strings.' });
      }
      user.interests = interests;
      touched.push('interests');
    }

    if (work_style !== undefined) {
      if (typeof work_style !== 'object' || work_style === null || Array.isArray(work_style)) {
        return res.status(400).json({ error: 'work_style must be an object.' });
      }
      const { team_preference, values, communication_style, risk_tolerance } = work_style;

      if (team_preference !== undefined && !VALID_TEAM_PREFERENCE.includes(team_preference)) {
        return res.status(400).json({ error: `work_style.team_preference must be one of: ${VALID_TEAM_PREFERENCE.join(', ')}` });
      }
      if (communication_style !== undefined && !VALID_COMMUNICATION_STYLE.includes(communication_style)) {
        return res.status(400).json({ error: `work_style.communication_style must be one of: ${VALID_COMMUNICATION_STYLE.join(', ')}` });
      }
      if (risk_tolerance !== undefined && !VALID_RISK_TOLERANCE.includes(risk_tolerance)) {
        return res.status(400).json({ error: `work_style.risk_tolerance must be one of: ${VALID_RISK_TOLERANCE.join(', ')}` });
      }
      if (values !== undefined) {
        if (!Array.isArray(values) || values.some((v) => !VALID_WORK_VALUES.includes(v))) {
          return res.status(400).json({ error: `work_style.values must be an array from: ${VALID_WORK_VALUES.join(', ')}` });
        }
      }

      // Merge into existing sub-document rather than replacing wholesale —
      // a partial payload (e.g. only { risk_tolerance: 'bold' }) shouldn't
      // wipe out team_preference the user set in a previous call.
      user.work_style = {
        team_preference: team_preference !== undefined ? team_preference : user.work_style?.team_preference ?? null,
        values: values !== undefined ? values : user.work_style?.values ?? [],
        communication_style: communication_style !== undefined ? communication_style : user.work_style?.communication_style ?? null,
        risk_tolerance: risk_tolerance !== undefined ? risk_tolerance : user.work_style?.risk_tolerance ?? null,
      };
      touched.push('work_style');
    }

    if (portfolio_links !== undefined) {
      if (typeof portfolio_links !== 'object' || portfolio_links === null || Array.isArray(portfolio_links)) {
        return res.status(400).json({ error: 'portfolio_links must be an object.' });
      }
      const unknownKeys = Object.keys(portfolio_links).filter((k) => !VALID_PORTFOLIO_KEYS.includes(k));
      if (unknownKeys.length > 0) {
        return res.status(400).json({ error: `Unknown portfolio_links key(s): ${unknownKeys.join(', ')}. Must be one of: ${VALID_PORTFOLIO_KEYS.join(', ')}` });
      }
      for (const key of VALID_PORTFOLIO_KEYS) {
        if (portfolio_links[key] !== undefined && portfolio_links[key] !== null && !isValidUrl(portfolio_links[key])) {
          return res.status(400).json({ error: `portfolio_links.${key} must be a valid URL.` });
        }
      }

      // Same partial-merge approach as work_style.
      user.portfolio_links = {
        github: portfolio_links.github !== undefined ? portfolio_links.github : user.portfolio_links?.github ?? null,
        linkedin: portfolio_links.linkedin !== undefined ? portfolio_links.linkedin : user.portfolio_links?.linkedin ?? null,
        website: portfolio_links.website !== undefined ? portfolio_links.website : user.portfolio_links?.website ?? null,
        behance: portfolio_links.behance !== undefined ? portfolio_links.behance : user.portfolio_links?.behance ?? null,
      };
      touched.push('portfolio_links');
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string') {
        return res.status(400).json({ error: 'bio must be a string.' });
      }
      user.bio = bio;
      touched.push('bio');
    }

    if (touched.length === 0) {
      return res.status(400).json({
        error: 'No recognized fields provided. Expected one or more of: interests, work_style, portfolio_links, bio.',
      });
    }

    await user.save(); // profile_strength recomputed by the model's pre-save hook

    log('ENRICH', { uid: user.firebase_uid, touched, profile_strength: user.profile_strength });

    return res.json({
      updated_fields: touched,
      profile_strength: user.profile_strength,
      interests: user.interests,
      work_style: user.work_style,
      portfolio_links: user.portfolio_links,
      bio: user.bio,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// GET current enrichment state — frontend uses this to render the
// ProfileStrengthWidget and pre-fill any enrichment forms already completed.
router.get('/', async (req, res) => {
  try {
    const user = await User.findOne({ firebase_uid: req.user.uid, deleted_at: null }).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      profile_strength: user.profile_strength,
      interests: user.interests,
      work_style: user.work_style,
      portfolio_links: user.portfolio_links,
      bio: user.bio,
      profile_photo_url: user.profile_photo_url,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch profile enrichment state.' });
  }
});

// Upload profile photo
router.post('/upload-photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // In a production implementation, you would upload to Firebase Storage
    // and make the file publicly accessible. For now, we'll use the local
    // uploads directory and construct a relative URL.

    const photoUrl = `/uploads/${req.file.filename}`;

    return res.json({
      photoUrl,
      message: 'Photo uploaded successfully.',
    });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// POST AI-powered job description generation
router.post('/ai/job-description', async (req, res) => {
  try {
    const { title, budget, payment_type, location, category, skills } = req.body;
    if (!title || !budget) {
      return res.status(400).json({ error: 'title and budget are required.' });
    }

    const description = await generateJobDescription({ title, budget, payment_type, location, category, skills });
    return res.json({ job_description: description });
  } catch (error) {
    console.error('AI job description error:', error);
    return res.status(500).json({ error: 'Failed to generate job description.' });
  }
});

// POST AI-powered cover letter generation
router.post('/ai/cover-letter', async (req, res) => {
  try {
    const { freelancerName, freelancerSkills, jobTitle, jobDescription, proposedRate, freelancerExperience } = req.body;
    if (!freelancerName || !jobTitle || !proposedRate) {
      return res.status(400).json({ error: 'freelancerName, jobTitle, and proposedRate are required.' });
    }

    const coverLetter = await generateCoverLetter({ freelancerName, freelancerSkills, jobTitle, jobDescription, proposedRate, freelancerExperience });
    return res.json({ cover_letter: coverLetter });
  } catch (error) {
    console.error('AI cover letter error:', error);
    return res.status(500).json({ error: 'Failed to generate cover letter.' });
  }
});

// POST AI-powered freelancer matching
router.post('/ai/match', async (req, res) => {
  try {
    const { jobTitle, jobDescription, budget, requiredSkills, freelancerProfiles } = req.body;
    if (!jobTitle || !freelancerProfiles || !freelancerProfiles.length) {
      return res.status(400).json({ error: 'jobTitle, requiredSkills, and freelancerProfiles are required.' });
    }

    const ranking = await matchFreelancersToJob({ jobTitle, jobDescription, budget, requiredSkills, freelancerProfiles });
    return res.json({ matching_ranking: ranking });
  } catch (error) {
    console.error('AI matching error:', error);
    return res.status(500).json({ error: 'Failed to match freelancers.' });
  }
});

// POST AI-powered search results
router.post('/ai/search', async (req, res) => {
  try {
    const { query, jobs } = req.body;
    if (!query || !jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'query and jobs array are required.' });
    }

    const results = await generateSearchResults({ query, jobs });
    return res.json({ search_results: results });
  } catch (error) {
    console.error('AI search error:', error);
    return res.status(500).json({ error: 'Failed to generate search results.' });
  }
});

module.exports = router;