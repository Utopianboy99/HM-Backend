require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('./firebase/firebase.config');
const { connectDb } = require('./db');
const { verifyToken } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;
const dnsHost = process.env.DNS_HOST || 'localhost';

// ── Service connection checks ─────────────────────────────────────────────
async function checkMongoDB() {
  await connectDb();
  console.log('  ✅ MongoDB       connected');

  // Ensure indexes after DB connection
  const Job = require('./models/Job');
  const Application = require('./models/Application');
  const Message = require('./models/Message');
  const Notification = require('./models/Notification');

  // Jobs indexes
  await Job.collection.createIndex({ status: 1, createdAt: -1 });
  await Job.collection.createIndex({ userId: 1 });

  // Applications indexes
try {
    await Application.collection.dropIndexes();
    await Application.collection.createIndex({ job_id: 1, applicant_id: 1 }, { unique: true });
  } catch {
    await Application.collection.drop();
    await Application.collection.createIndex({ job_id: 1, applicant_id: 1 }, { unique: true });
  }
  await Application.collection.createIndex({ applicant_id: 1 });

  // Messages index
  await Message.collection.createIndex({ conversation_id: 1, createdAt: 1 });

  // Notifications index
  await Notification.collection.createIndex({ user_id: 1, is_read: 1, createdAt: -1 });

  console.log('  📋 MongoDB indexes ensured');
}

async function checkFirebase() {
  // No FIREBASE_WEB_API_KEY check here: this backend never calls the
  // Identity Toolkit REST API and never verifies passwords server-side.
  // Password verification and session establishment happen entirely
  // client-side via the Firebase Client SDK. The Admin SDK credentials
  // below are all this backend needs — for creating users and verifying
  // ID tokens the client already obtained itself.
  await admin.auth().listUsers(1);
  console.log('  ✅ Firebase      connected');
}

// ── Boot sequence ───────────────────────────────────────────────────────────
async function boot() {
  console.log('\n🔌 Checking service connections...\n');

  const results = await Promise.allSettled([
    checkMongoDB(),
    checkFirebase(),
  ]);

  const [mongo, firebase] = results;

  if (mongo.status === 'rejected') {
    console.error('  ❌ MongoDB       failed —', mongo.reason?.message);
  }
  if (firebase.status === 'rejected') {
    console.error('  ❌ Firebase      failed —', firebase.reason?.message);
  }

  const anyFailed = results.some((r) => r.status === 'rejected');
  if (anyFailed) {
    console.error('\n🛑 Server not started. Fix the failed connections above.\n');
    process.exit(1);
  }

  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  app.set('trust proxy', 1);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.mongoId || req.ip || 'public',
    message: { error: 'Too many requests. Try again later.' },
  });

  // ── Central error handler ──────────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message, err.stack);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error.' });
  });

  // ── Async wrapper so thrown errors never crash the process ────────────────
  const asyncWrapper = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // ── Public routes ─────────────────────────────────────────────────────────
  // Note: POST /auth/signin is public at the router level but internally
  // requires a Bearer ID token (see routes/auth.js) — it's mounted here
  // rather than behind the global verifyToken so its 401 response can stay
  // auth-specific rather than falling through generic middleware.
  app.use('/auth', authLimiter, require('./routes/auth'));

  app.get('/health', (req, res) => {
    res.json({ name: 'HustleMatch API', version: '1.0.0', status: 'ok' });
  });

  // ── Protected routes (Firebase ID token required) ────────────────────────
  app.use(verifyToken);

  app.use('/users', require('./routes/users'));
  app.use('/jobs', require('./routes/jobs'));
  app.use('/applications', require('./routes/applications'));
  app.use('/transactions', require('./routes/transactions'));
  app.use('/messages', require('./routes/messages'));
  app.use('/notifications', require('./routes/notifications'));

  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  });

  app.listen(port, () => {
    console.log(`\n🚀 HustleMatch API running on http://${dnsHost}:${port}`);
    console.log('\n📋 Public endpoints:');
    console.log('   POST /auth/signup           — Create account (Firebase + MongoDB dual-write, no token issued)');
    console.log('   POST /auth/signin           — Sync profile after client-side Firebase sign-in (requires Bearer ID token)');
    console.log('\n📋 Protected endpoints (Authorization: Bearer <idToken>):');
    console.log('   POST /auth/complete-profile');
    console.log('   /users /jobs /applications /transactions /messages /notifications — CRUD\n');
  });
}

boot();