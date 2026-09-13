const mongoose = require('mongoose');
const { Schema } = mongoose;
// NOTE: merged against the real production models/User.js provided by the
// user — do not diverge from these choices without re-confirming:
//   - firebase_uid is REQUIRED (not just unique/sparse)
//   - created_at/updated_at are manual fields with default: Date.now,
//     NOT Mongoose's built-in `timestamps` schema option
//   - export uses the mongoose.models.User || mongoose.model(...) guard
//     to avoid OverwriteModelError on hot-reload (nodemon etc.)

// ─── Sub-schemas ──────────────────────────────────────────────────────────────
const FreelancerProfileSchema = new Schema({
  skills:            { type: [String], default: [] },
  hourly_rate:       { type: Number, default: null },
  experience_level:  { type: String, enum: ['entry', 'intermediate', 'expert'], default: null },
  portfolio_links:   { type: [String], default: [] }, // legacy free-text list, superseded by portfolio_links object below for new users
}, { _id: false });

const ClientProfileSchema = new Schema({
  company_name: { type: String, default: null },
  company_size: { type: String, enum: ['solo', 'small', 'medium', 'large'], default: null },
  industry:     { type: String, default: null },
}, { _id: false });

const WorkStyleSchema = new Schema({
  team_preference:      { type: String, enum: ['solo', 'small_team', 'large_team', 'no_preference'], default: null },
  values:                { type: [String], default: [] }, // speed, quality, learning, money, impact, innovation
  communication_style:  { type: String, enum: ['structured', 'casual', 'direct', 'collaborative'], default: null },
  risk_tolerance:        { type: String, enum: ['safe', 'balanced', 'bold'], default: null },
}, { _id: false });

const PortfolioLinksSchema = new Schema({
  github:   { type: String, default: null },
  linkedin: { type: String, default: null },
  website:  { type: String, default: null },
  behance:  { type: String, default: null },
}, { _id: false });

// ─── Main schema ──────────────────────────────────────────────────────────────
const VALID_ROLES = ['freelancer', 'client', 'admin'];
const VALID_GOALS = [
  'find_work', 'hire_talent', 'network', 'start_business',
  'find_partners', 'explore',
];
const VALID_AVAILABILITY = ['full_time', 'part_time', 'open', 'not_looking'];

const UserSchema = new Schema({
  id:            { type: String, required: true, unique: true, index: true },
  firebase_uid:  { type: String, required: true, unique: true, index: true },

  email:         { type: String, required: true, unique: true, index: true },
  password_hash: { type: String, default: null }, // legacy — Firebase is source of truth now

  full_name: { type: String, required: true },
  phone:     { type: String, default: null },
  role:      { type: String, enum: VALID_ROLES, required: true },

  profile_photo_url: { type: String, default: null },
  bio:               { type: String, default: null },

  // legacy flat skills field (used by generic /users POST) — role_details
  // during onboarding writes to freelancer_profile.skills instead. Kept for
  // backward compat with existing /users route; do not use for new writes.
  skills: { type: [String], default: [] },

  location_city:    { type: String, default: null },
  location_country: { type: String, default: null },
  lat:              { type: Number, default: null },
  lng:              { type: Number, default: null },

  is_verified:   { type: Boolean, default: false },
  is_active:     { type: Boolean, default: true },
  last_login_at: { type: Date, default: null },

  avg_rating:    { type: Number, default: 0 },
  total_reviews: { type: Number, default: 0 },

  // ── Onboarding — Tier 1 (required, blocks dashboard) ────────────────────────
  onboarding_step:         { type: Number, default: 0 },
  onboarding_completed:    { type: Boolean, default: false },
  onboarding_completed_at: { type: Date, default: null },

  goals:        { type: [String], enum: VALID_GOALS, default: [] },
  availability: { type: String, enum: VALID_AVAILABILITY, default: null },

  freelancer_profile: { type: FreelancerProfileSchema, default: () => ({}) },
  client_profile:     { type: ClientProfileSchema, default: () => ({}) },

  // ── Onboarding — Tier 2 (progressive enrichment, never blocks) ──────────────
  interests:       { type: [String], default: [] },
  work_style:      { type: WorkStyleSchema, default: () => ({}) },
  portfolio_links: { type: PortfolioLinksSchema, default: () => ({}) },
  profile_strength: { type: Number, default: 0, min: 0, max: 100 },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null },
});

// Manual updated_at bump on every save, matching the pattern your route
// files already use elsewhere (e.g. `updates.updated_at = new Date()` in
// users.js/jobs.js PUT handlers) — this keeps it consistent for saves that
// go through `.save()` directly (like the onboarding routes) rather than
// `findOneAndUpdate`, which don't get that treatment otherwise.
//
// Written as a plain synchronous function (no `next` callback param) —
// none of this logic is async, and this form works identically across
// Mongoose versions regardless of how the internal hook dispatcher decides
// to invoke callback-style vs promise-style middleware.
UserSchema.pre('save', function () {
  if (!this.isNew) {
    this.updated_at = new Date();
  }
});

// ─── Profile strength calculation ─────────────────────────────────────────────
// Runs on every save. Kept server-side and deterministic so the frontend never
// computes or trusts a client-supplied percentage.
UserSchema.pre('save', function () {
  let strength = 0;

  if (this.profile_photo_url) strength += 10;
  if (this.bio && this.bio.trim().length > 0) strength += 10;

  const hasRoleDetails = this.role === 'freelancer'
    ? (this.freelancer_profile?.skills?.length ?? 0) >= 3
    : Boolean(this.client_profile?.company_name);
  if (hasRoleDetails) strength += 15;

  const hasPortfolio = Object.values(this.portfolio_links?.toObject?.() ?? this.portfolio_links ?? {})
    .some((v) => Boolean(v));
  if (hasPortfolio) strength += 15;

  if (this.work_style?.team_preference) strength += 10;
  if (this.is_verified) strength += 20;
  if ((this.interests?.length ?? 0) >= 3) strength += 10;
  if (this.onboarding_completed) strength += 10;

  this.profile_strength = Math.min(strength, 100);
});

// Guard: onboarding_completed_at should only ever be set once, and only when
// onboarding_completed flips true. Prevents a buggy PATCH from re-stamping it.
UserSchema.pre('save', function () {
  if (this.isModified('onboarding_completed') && this.onboarding_completed && !this.onboarding_completed_at) {
    this.onboarding_completed_at = new Date();
  }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Attached as static properties on the model (not separate module exports)
// so `const User = require('./User')` continues to work exactly as it does
// today in your other route files — no import-site changes needed anywhere.
User.VALID_ROLES = VALID_ROLES;
User.VALID_GOALS = VALID_GOALS;
User.VALID_AVAILABILITY = VALID_AVAILABILITY;

module.exports = User;