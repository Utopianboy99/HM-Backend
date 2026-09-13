/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                  HustleMatch — backend.js                   ║
 * ║   Single-file server: Express + MongoDB + Base64 Auth       ║
 * ║   Server will NOT start if MongoDB fails to connect.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Authentication: HTTP Basic Auth (Base64-encoded "email:password")
 *   - Signup: POST /auth/signup  → stores bcrypt hash in MongoDB
 *   - Signin: POST /auth/signin  → returns a signed JWT
 *   - Protected routes: Authorization: Bearer <jwt>
 *
 * Sections (Ctrl+F to jump):
 *   [1] Imports & Config
 *   [2] MongoDB Connection
 *   [3] Mongoose Models
 *   [4] Middleware Factories
 *   [5] Route Handlers — Auth
 *   [6] Route Handlers — Users
 *   [7] Route Handlers — Jobs
 *   [8] Route Handlers — Applications
 *   [9] Route Handlers — Transactions
 *   [10] Route Handlers — Messages
 *   [11] Route Handlers — Notifications
 *   [12] Boot Sequence
 */

'use strict';
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// [1] IMPORTS & CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// JWT secret — set JWT_SECRET in your .env
const JWT_SECRET  = process.env.JWT_SECRET || process.env.JWT_SECRET2 ;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET env var is not set. Exiting.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// [2] MONGODB CONNECTION
// ─────────────────────────────────────────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] MONGOOSE MODELS
// ─────────────────────────────────────────────────────────────────────────────

// ── User ──────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    id:                { type: String, default: () => randomUUID(), unique: true },
    email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash:     { type: String, required: true },
    full_name:         { type: String, required: true, trim: true },
    phone:             { type: String, default: null },
    role:              { type: String, enum: ['freelancer', 'client', 'admin'], required: true },
    profile_photo_url: { type: String, default: null },
    bio:               { type: String, default: null },
    skills:            { type: [String], default: [] },
    location_city:     { type: String, default: null },
    location_country:  { type: String, default: null },
    lat:               { type: Number, default: null },
    lng:               { type: Number, default: null },
    is_active:         { type: Boolean, default: true },
    is_verified:       { type: Boolean, default: false },
    avg_rating:        { type: Number, default: 0 },
    total_reviews:     { type: Number, default: 0 },
    last_login_at:     { type: Date, default: null },
    deleted_at:        { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
UserSchema.index({ email: 1 });
const User = mongoose.model('User', UserSchema);

// ── Job ───────────────────────────────────────────────────────────────────────
const JobSchema = new mongoose.Schema(
  {
    userId:             { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    title:              { type: String, required: true, trim: true },
    description:        { type: String, default: null },
    category:           { type: String, default: null },
    tags:               { type: [String], default: [] },
    location:           { type: String, default: null },
    location_city:      { type: String, default: null },
    location_country:   { type: String, default: null },
    lat:                { type: Number, default: null },
    lng:                { type: Number, default: null },
    is_remote:          { type: Boolean, default: false },
    budget:             { type: Number, required: true },
    payment_type:       { type: String, enum: ['fixed', 'hourly', 'milestone'], default: 'fixed' },
    currency:           { type: String, default: 'ZAR' },
    status:             { type: String, enum: ['open', 'in_progress', 'completed', 'cancelled'], default: 'open' },
    slots:              { type: Number, default: 1 },
    duration_days:      { type: Number, default: null },
    start_date:         { type: Date, default: null },
    deadline:           { type: Date, default: null },
    views_count:        { type: Number, default: 0 },
    applications_count: { type: Number, default: 0 },
    deleted_at:         { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);
JobSchema.index({ status: 1 });
JobSchema.index({ userId: 1 });
const Job = mongoose.model('Job', JobSchema);

// ── Application ───────────────────────────────────────────────────────────────
const ApplicationSchema = new mongoose.Schema(
  {
    id:            { type: String, default: () => randomUUID(), unique: true },
    job_id:        { type: String, required: true },
    applicant_id:  { type: String, required: true },
    cover_letter:  { type: String, default: null },
    proposed_rate: { type: Number, required: true },
    attachments:   { type: [String], default: [] },
    status:        { type: String, enum: ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
    reviewed_at:   { type: Date, default: null },
    deleted_at:    { type: Date, default: null },
  },
  { timestamps: { createdAt: 'applied_at', updatedAt: 'updated_at' } }
);
ApplicationSchema.index({ job_id: 1, applicant_id: 1 });
const Application = mongoose.model('Application', ApplicationSchema);

// ── Transaction ───────────────────────────────────────────────────────────────
const TransactionSchema = new mongoose.Schema(
  {
    id:             { type: String, default: () => randomUUID(), unique: true },
    job_id:         { type: String, required: true },
    payer_id:       { type: String, required: true },
    payee_id:       { type: String, required: true },
    amount:         { type: Number, required: true },
    currency:       { type: String, default: 'ZAR' },
    payment_method: { type: String, required: true },
    status:         { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    metadata:       { type: mongoose.Schema.Types.Mixed, default: {} },
    completed_at:   { type: Date, default: null },
    deleted_at:     { type: Date, default: null },
  },
  { timestamps: { createdAt: 'initiated_at', updatedAt: 'updated_at' } }
);
TransactionSchema.index({ job_id: 1 });
TransactionSchema.index({ payer_id: 1, payee_id: 1 });
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ── Message ───────────────────────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema(
  {
    id:              { type: String, default: () => randomUUID(), unique: true },
    conversation_id: { type: String, required: true },
    sender_id:       { type: String, required: true },
    recipient_id:    { type: String, required: true },
    body:            { type: String, required: true },
    attachments:     { type: [String], default: [] },
    is_read:         { type: Boolean, default: false },
    read_at:         { type: Date, default: null },
    deleted_at:      { type: Date, default: null },
  },
  { timestamps: { createdAt: 'sent_at', updatedAt: 'updated_at' } }
);
MessageSchema.index({ conversation_id: 1 });
const Message = mongoose.model('Message', MessageSchema);

// ── Notification ──────────────────────────────────────────────────────────────
const VALID_NOTIF_CHANNELS = ['in_app', 'email', 'sms', 'push'];
const VALID_NOTIF_TYPES = [
  'new_application', 'application_accepted', 'application_rejected',
  'new_message', 'payment_received', 'job_posted', 'review_received', 'system',
];

const NotificationSchema = new mongoose.Schema(
  {
    id:            { type: String, default: () => randomUUID(), unique: true },
    user_id:       { type: String, required: true },
    type:          { type: String, enum: VALID_NOTIF_TYPES, required: true },
    title:         { type: String, required: true },
    body:          { type: String, default: null },
    ref_entity:    { type: String, default: null },
    ref_entity_id: { type: String, default: null },
    channel:       { type: String, enum: VALID_NOTIF_CHANNELS, required: true },
    is_read:       { type: Boolean, default: false },
    read_at:       { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);
NotificationSchema.index({ user_id: 1, is_read: 1 });
const Notification = mongoose.model('Notification', NotificationSchema);

// ─────────────────────────────────────────────────────────────────────────────
// [4] MIDDLEWARE FACTORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parseBasicAuth — decodes "Authorization: Basic <base64(email:password)>"
 * Returns { email, password } or null if the header is missing / malformed.
 */
function parseBasicAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return null;
    return {
      email:    decoded.slice(0, colonIdx).toLowerCase().trim(),
      password: decoded.slice(colonIdx + 1),
    };
  } catch {
    return null;
  }
}

/**
 * verifyToken — validates JWT from "Authorization: Bearer <token>"
 * Attaches the decoded payload to req.user for downstream handlers.
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required (Bearer token).' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * requireRole — RBAC gate. Pass one or more allowed roles.
 * Reads role from the JWT payload (set at signup/signin).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Access denied. Required role(s): ${roles.join(', ')}` });
    }
    next();
  };
}

// Structured logger
function log(module, op, data) {
  console.log(`\n${'─'.repeat(55)}\n[${module}] ${op}\n${'─'.repeat(55)}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// [5] AUTH ROUTES   — /auth  (public, rate-limited)
// ─────────────────────────────────────────────────────────────────────────────
const authRouter = express.Router();

/**
 * POST /auth/signup
 *
 * Credentials supplied as HTTP Basic Auth (Base64):
 *   Authorization: Basic base64("email:password")
 *
 * Body JSON: { full_name, role, phone? }
 */
authRouter.post('/signup', async (req, res) => {
  try {
    const creds = parseBasicAuth(req);
    if (!creds) {
      return res.status(400).json({
        error: 'Credentials required. Send Authorization: Basic base64("email:password").',
      });
    }

    const { email, password } = creds;
    const { full_name, role, phone } = req.body;

    if (!full_name || !role) {
      return res.status(400).json({ error: 'full_name and role are required in the request body.' });
    }
    if (!['freelancer', 'client'].includes(role)) {
      return res.status(400).json({ error: 'role must be one of: freelancer, client' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await User.findOne({ email, deleted_at: null }).exec();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await User.create({
      id: randomUUID(),
      email,
      password_hash,
      full_name,
      phone: phone || null,
      role,
    });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, mongoId: user._id.toString() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    log('AUTH', 'SIGNUP', { id: user.id, email, role });
    return res.status(201).json({
      message: 'Account created successfully.',
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      token,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create account.' });
  }
});

/**
 * POST /auth/signin
 *
 * Credentials supplied as HTTP Basic Auth (Base64):
 *   Authorization: Basic base64("email:password")
 */
authRouter.post('/signin', async (req, res) => {
  try {
    const creds = parseBasicAuth(req);
    if (!creds) {
      return res.status(400).json({
        error: 'Credentials required. Send Authorization: Basic base64("email:password").',
      });
    }

    const { email, password } = creds;

    const user = await User.findOne({ email, deleted_at: null }).exec();
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    user.last_login_at = new Date();
    await user.save();

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, mongoId: user._id.toString() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    log('AUTH', 'SIGNIN', { id: user.id, email });
    return res.status(200).json({
      message: 'Signed in successfully.',
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      token,
    });
  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ error: err.message || 'Failed to sign in.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [6] USERS ROUTES   — /users  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const usersRouter = express.Router();
const VALID_ROLES = ['freelancer', 'client', 'admin'];

// POST /users
usersRouter.post('/', async (req, res) => {
  try {
    const { email, full_name, role, password } = req.body;
    if (!email || !full_name || !role || !password) {
      return res.status(400).json({ error: 'email, full_name, role, and password are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await User.findOne({ email: email.toLowerCase(), deleted_at: null }).exec();
    if (existing) return res.status(409).json({ error: 'A user with this email already exists.' });

    const password_hash = await bcrypt.hash(password, 12);

    const user = await User.create({
      id: randomUUID(),
      email,
      password_hash,
      full_name,
      phone:             req.body.phone || null,
      role,
      profile_photo_url: req.body.profile_photo_url || null,
      bio:               req.body.bio || null,
      skills:            req.body.skills || [],
      location_city:     req.body.location_city || null,
      location_country:  req.body.location_country || null,
      lat:               req.body.lat || null,
      lng:               req.body.lng || null,
    });

    log('USERS', 'CREATE', { id: user.id, email: user.email });
    const { password_hash: _ph, ...safe } = user.toObject();
    return res.status(201).json(safe);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
});

// GET /users
usersRouter.get('/', async (req, res) => {
  try {
    const users = await User.find({ deleted_at: null }).select('-password_hash').exec();
    log('USERS', 'READ ALL', { count: users.length });
    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// GET /users/:id
usersRouter.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id, deleted_at: null }).select('-password_hash').exec();
    if (!user) return res.status(404).json({ error: 'User not found.' });
    log('USERS', 'READ ONE', { id: user.id });
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// PUT /users/:id
usersRouter.put('/:id', async (req, res) => {
  try {
    const protected_ = ['id', 'created_at', 'deleted_at', 'avg_rating', 'total_reviews'];
    const updates = { ...req.body };
    protected_.forEach(f => delete updates[f]);

    // Re-hash password if being updated
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 12);
      delete updates.password;
    }

    if (updates.role && !VALID_ROLES.includes(updates.role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    updates.updated_at = new Date();

    const user = await User.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      updates,
      { new: true }
    ).select('-password_hash').exec();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    log('USERS', 'UPDATE', { id: user.id });
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

// DELETE /users/:id  (soft)
usersRouter.delete('/:id', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), is_active: false, updated_at: new Date() },
      { new: true }
    ).exec();

    if (!user) return res.status(404).json({ error: 'User not found.' });
    log('USERS', 'DELETE (soft)', { id: user.id });
    return res.json({ message: `User '${user.full_name}' deleted.`, deleted_at: user.deleted_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [7] JOBS ROUTES   — /jobs  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const jobsRouter = express.Router();
const JOB_STATUSES      = ['open', 'in_progress', 'completed', 'cancelled'];
const JOB_PAYMENT_TYPES = ['fixed', 'hourly', 'milestone'];

// POST /jobs
jobsRouter.post('/', async (req, res) => {
  try {
    const userId = req.body.userId || req.body.posted_by;
    const { title, budget } = req.body;

    if (!title || !budget || !userId) {
      return res.status(400).json({ error: 'title, budget, and userId are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'userId must be a valid MongoDB ObjectId.' });
    }

    const payment_type = req.body.payment_type || 'fixed';
    if (!JOB_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${JOB_PAYMENT_TYPES.join(', ')}` });
    }

    const status = req.body.status || 'open';
    if (!JOB_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}` });
    }

    const job = await Job.create({
      userId,
      title,
      description:      req.body.description || null,
      category:         req.body.category || null,
      tags:             req.body.tags || [],
      location:         req.body.location || null,
      location_city:    req.body.location_city || null,
      location_country: req.body.location_country || null,
      lat:              req.body.lat || null,
      lng:              req.body.lng || null,
      is_remote:        req.body.is_remote ?? false,
      budget:           parseFloat(budget),
      payment_type,
      currency:         req.body.currency || 'ZAR',
      status,
      slots:            req.body.slots || 1,
      duration_days:    req.body.duration_days || null,
      start_date:       req.body.start_date || null,
      deadline:         req.body.deadline || null,
    });

    log('JOBS', 'CREATE', { id: job._id, title: job.title });
    return res.status(201).json(job);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create job.' });
  }
});

// GET /jobs
jobsRouter.get('/', async (req, res) => {
  try {
    const jobs = await Job.find({
      $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
    }).exec();
    log('JOBS', 'READ ALL', { count: jobs.length });
    return res.json(jobs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// GET /jobs/:id
jobsRouter.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] },
      { $inc: { views_count: 1 }, updatedAt: new Date() },
      { new: true }
    ).exec();

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    log('JOBS', 'READ ONE', { id: job._id });
    return res.json(job);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch job.' });
  }
});

// PUT /jobs/:id
jobsRouter.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const protected_ = ['_id', 'userId', 'createdAt', 'deleted_at', 'views_count', 'applications_count'];
    const updates = { ...req.body };
    protected_.forEach(f => delete updates[f]);

    if (updates.status && !JOB_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}` });
    }
    if (updates.payment_type && !JOB_PAYMENT_TYPES.includes(updates.payment_type)) {
      return res.status(400).json({ error: `payment_type must be one of: ${JOB_PAYMENT_TYPES.join(', ')}` });
    }

    updates.updatedAt = new Date();

    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] },
      { $set: updates },
      { new: true }
    ).exec();

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    log('JOBS', 'UPDATE', { id: job._id });
    return res.json(job);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update job.' });
  }
});

// DELETE /jobs/:id  (soft)
jobsRouter.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid job ID format.' });
    }

    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] },
      { $set: { deleted_at: new Date(), status: 'cancelled', updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    log('JOBS', 'DELETE (soft)', { id: job._id, title: job.title });
    return res.json({ message: `Job '${job.title}' deleted.`, deleted_at: job.deleted_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete job.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [8] APPLICATIONS ROUTES   — /applications  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const applicationsRouter = express.Router();
const APP_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'];

// POST /applications
applicationsRouter.post('/', async (req, res) => {
  try {
    const { job_id, applicant_id, proposed_rate } = req.body;
    if (!job_id || !applicant_id || !proposed_rate) {
      return res.status(400).json({ error: 'job_id, applicant_id, and proposed_rate are required.' });
    }

    const duplicate = await Application.findOne({ job_id, applicant_id, deleted_at: null }).exec();
    if (duplicate) return res.status(409).json({ error: 'This applicant has already applied to this job.' });

    const application = await Application.create({
      id: randomUUID(),
      job_id,
      applicant_id,
      cover_letter:  req.body.cover_letter || null,
      proposed_rate: parseFloat(proposed_rate),
      attachments:   req.body.attachments || [],
      status:        'pending',
    });

    log('APPLICATIONS', 'CREATE', { id: application.id, job_id, applicant_id });
    return res.status(201).json(application);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create application.' });
  }
});

// GET /applications
applicationsRouter.get('/', async (req, res) => {
  try {
    const applications = await Application.find({ deleted_at: null }).exec();
    log('APPLICATIONS', 'READ ALL', { count: applications.length });
    return res.json(applications);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch applications.' });
  }
});

// GET /applications/:id
applicationsRouter.get('/:id', async (req, res) => {
  try {
    const application = await Application.findOne({ id: req.params.id, deleted_at: null }).exec();
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    log('APPLICATIONS', 'READ ONE', { id: application.id });
    return res.json(application);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch application.' });
  }
});

// PUT /applications/:id
applicationsRouter.put('/:id', async (req, res) => {
  try {
    const protected_ = ['id', 'job_id', 'applicant_id', 'applied_at', 'deleted_at'];
    const updates = { ...req.body };
    protected_.forEach(f => delete updates[f]);

    if (updates.status && !APP_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${APP_STATUSES.join(', ')}` });
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

    if (!application) return res.status(404).json({ error: 'Application not found.' });
    log('APPLICATIONS', 'UPDATE', { id: application.id, status: application.status });
    return res.json(application);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update application.' });
  }
});

// DELETE /applications/:id  (soft — marks as withdrawn)
applicationsRouter.delete('/:id', async (req, res) => {
  try {
    const application = await Application.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), status: 'withdrawn', updated_at: new Date() },
      { new: true }
    ).exec();

    if (!application) return res.status(404).json({ error: 'Application not found.' });
    log('APPLICATIONS', 'DELETE (soft)', { id: application.id });
    return res.json({ message: 'Application withdrawn.', deleted_at: application.deleted_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete application.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [9] TRANSACTIONS ROUTES   — /transactions  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const transactionsRouter = express.Router();
const TXN_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

// POST /transactions
transactionsRouter.post('/', async (req, res) => {
  try {
    const { job_id, payer_id, payee_id, amount, payment_method } = req.body;
    if (!job_id || !payer_id || !payee_id || !amount || !payment_method) {
      return res.status(400).json({ error: 'job_id, payer_id, payee_id, amount, and payment_method are required.' });
    }

    const txn = await Transaction.create({
      id:             randomUUID(),
      job_id,
      payer_id,
      payee_id,
      amount:         parseFloat(amount),
      currency:       req.body.currency || 'ZAR',
      payment_method,
      status:         req.body.status || 'pending',
      metadata:       req.body.metadata || {},
    });

    log('TRANSACTIONS', 'CREATE', { id: txn.id, amount: txn.amount });
    return res.status(201).json(txn);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create transaction.' });
  }
});

// GET /transactions
transactionsRouter.get('/', async (req, res) => {
  try {
    const txns = await Transaction.find({ deleted_at: null }).exec();
    log('TRANSACTIONS', 'READ ALL', { count: txns.length });
    return res.json(txns);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// GET /transactions/:id
transactionsRouter.get('/:id', async (req, res) => {
  try {
    const txn = await Transaction.findOne({ id: req.params.id, deleted_at: null }).exec();
    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    log('TRANSACTIONS', 'READ ONE', { id: txn.id });
    return res.json(txn);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch transaction.' });
  }
});

// PUT /transactions/:id
transactionsRouter.put('/:id', async (req, res) => {
  try {
    const protected_ = ['id', 'job_id', 'payer_id', 'payee_id', 'initiated_at', 'deleted_at'];
    const updates = { ...req.body };
    protected_.forEach(f => delete updates[f]);

    if (updates.status && !TXN_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${TXN_STATUSES.join(', ')}` });
    }
    if (updates.status === 'completed') updates.completed_at = new Date();

    const txn = await Transaction.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { ...updates, metadata: updates.metadata || {} },
      { new: true }
    ).exec();

    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    log('TRANSACTIONS', 'UPDATE', { id: txn.id, status: txn.status });
    return res.json(txn);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// DELETE /transactions/:id  (soft — marks as refunded)
transactionsRouter.delete('/:id', async (req, res) => {
  try {
    const txn = await Transaction.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date(), status: 'refunded' },
      { new: true }
    ).exec();

    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    log('TRANSACTIONS', 'DELETE (soft)', { id: txn.id });
    return res.json({ message: 'Transaction marked as refunded.', deleted_at: txn.deleted_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [10] MESSAGES ROUTES   — /messages  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const messagesRouter = express.Router();

// POST /messages
messagesRouter.post('/', async (req, res) => {
  try {
    const { conversation_id, sender_id, recipient_id, body } = req.body;
    if (!conversation_id || !sender_id || !recipient_id || !body) {
      return res.status(400).json({ error: 'conversation_id, sender_id, recipient_id, and body are required.' });
    }

    const message = await Message.create({
      id: randomUUID(),
      conversation_id,
      sender_id,
      recipient_id,
      body,
      attachments: req.body.attachments || [],
    });

    log('MESSAGES', 'CREATE', { id: message.id, conversation_id });
    return res.status(201).json(message);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create message.' });
  }
});

// GET /messages
messagesRouter.get('/', async (req, res) => {
  try {
    const messages = await Message.find({ deleted_at: null }).exec();
    log('MESSAGES', 'READ ALL', { count: messages.length });
    return res.json(messages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// GET /messages/:id  (auto-marks as read)
messagesRouter.get('/:id', async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { is_read: true, read_at: new Date() },
      { new: true }
    ).exec();

    if (!message) return res.status(404).json({ error: 'Message not found.' });
    log('MESSAGES', 'READ ONE', { id: message.id });
    return res.json(message);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch message.' });
  }
});

// PUT /messages/:id
messagesRouter.put('/:id', async (req, res) => {
  try {
    const protected_ = ['id', 'conversation_id', 'sender_id', 'recipient_id', 'sent_at', 'deleted_at'];
    const updates = { ...req.body };
    protected_.forEach(f => delete updates[f]);
    updates.updated_at = new Date();

    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      updates,
      { new: true }
    ).exec();

    if (!message) return res.status(404).json({ error: 'Message not found.' });
    log('MESSAGES', 'UPDATE', { id: message.id });
    return res.json(message);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update message.' });
  }
});

// DELETE /messages/:id  (soft)
messagesRouter.delete('/:id', async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { id: req.params.id, deleted_at: null },
      { deleted_at: new Date() },
      { new: true }
    ).exec();

    if (!message) return res.status(404).json({ error: 'Message not found.' });
    log('MESSAGES', 'DELETE (soft)', { id: message.id });
    return res.json({ message: 'Message deleted.', deleted_at: message.deleted_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [11] NOTIFICATIONS ROUTES   — /notifications  (protected)
// ─────────────────────────────────────────────────────────────────────────────
const notificationsRouter = express.Router();

// POST /notifications
notificationsRouter.post('/', async (req, res) => {
  try {
    const { user_id, type, title, channel } = req.body;
    if (!user_id || !type || !title || !channel) {
      return res.status(400).json({ error: 'user_id, type, title, and channel are required.' });
    }
    if (!VALID_NOTIF_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: `channel must be one of: ${VALID_NOTIF_CHANNELS.join(', ')}` });
    }
    if (!VALID_NOTIF_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_NOTIF_TYPES.join(', ')}` });
    }

    const notification = await Notification.create({
      id:            randomUUID(),
      user_id,
      type,
      title,
      body:          req.body.body || null,
      ref_entity:    req.body.ref_entity || null,
      ref_entity_id: req.body.ref_entity_id || null,
      channel,
    });

    log('NOTIFICATIONS', 'CREATE', { id: notification.id, user_id, type });
    return res.status(201).json(notification);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create notification.' });
  }
});

// GET /notifications  (supports ?user_id=&is_read=)
notificationsRouter.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.user_id) query.user_id = req.query.user_id;
    if (req.query.is_read !== undefined) query.is_read = req.query.is_read === 'true';

    const notifications = await Notification.find(query).exec();
    log('NOTIFICATIONS', 'READ ALL', { count: notifications.length });
    return res.json(notifications);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// GET /notifications/:id
notificationsRouter.get('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOne({ id: req.params.id }).exec();
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    log('NOTIFICATIONS', 'READ ONE', { id: notification.id });
    return res.json(notification);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch notification.' });
  }
});

// PUT /notifications/:id  (typically used to mark as read)
notificationsRouter.put('/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.is_read !== undefined) {
      updates.is_read = req.body.is_read;
      if (req.body.is_read === true) updates.read_at = new Date();
    }

    const notification = await Notification.findOneAndUpdate(
      { id: req.params.id },
      updates,
      { new: true }
    ).exec();

    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    log('NOTIFICATIONS', 'UPDATE (mark read)', { id: notification.id, is_read: notification.is_read });
    return res.json(notification);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// DELETE /notifications/:id  (hard delete)
notificationsRouter.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ id: req.params.id }).exec();
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    log('NOTIFICATIONS', 'DELETE', { id: notification.id });
    return res.json({ message: `Notification '${notification.title}' deleted.`, id: notification.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// [12] BOOT SEQUENCE
// ─────────────────────────────────────────────────────────────────────────────
async function boot() {
  console.log('\n🔌 HustleMatch API — starting up...\n');

  // ── 1. MongoDB — hard gate ─────────────────────────────────────────────────
  try {
    await connectMongo();
    console.log('  ✅ MongoDB       connected');
  } catch (err) {
    console.error('  ❌ MongoDB       failed —', err.message);
    console.error('\n🛑 Server not started. MongoDB connection is required.\n');
    process.exit(1);
  }

  // ── 2. Global middleware ───────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── 3. Rate limiters ───────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
  });

  // ── 4. Health check (unauthenticated) ─────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      name:      'HustleMatch API',
      version:   '1.0.0',
      status:    'ok',
      timestamp: new Date().toISOString(),
      mongo:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  // ── 5. Public auth routes ─────────────────────────────────────────────────
  app.use('/auth', authLimiter, authRouter);

  // ── 6. Protected routes ────────────────────────────────────────────────────
  app.use(apiLimiter);
  app.use(verifyToken);

  app.use('/users',         usersRouter);
  app.use('/jobs',          jobsRouter);
  app.use('/applications',  applicationsRouter);
  app.use('/transactions',  transactionsRouter);
  app.use('/messages',      messagesRouter);
  app.use('/notifications', notificationsRouter);

  // ── 7. 404 handler ─────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  });

  // ── 8. Global error handler ────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  });

  // ── 9. Listen ─────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n🚀 HustleMatch API  →  http://localhost:${PORT}`);
    console.log('\n  Public endpoints:');
    console.log('    GET  /health');
    console.log('    POST /auth/signup   (Basic Auth: base64(email:password))');
    console.log('    POST /auth/signin   (Basic Auth: base64(email:password))');
    console.log('\n  Protected endpoints (Bearer JWT required):');
    console.log('    CRUD /users');
    console.log('    CRUD /jobs');
    console.log('    CRUD /applications');
    console.log('    CRUD /transactions');
    console.log('    CRUD /messages');
    console.log('    CRUD /notifications\n');
  });
}

boot();