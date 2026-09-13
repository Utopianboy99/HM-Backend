require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const admin = require('./firebase/firebase.config');
const { connectDb } = require('./db');
const { verifyToken } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

// ── Service connection checks ─────────────────────────────────────────────
async function checkMongoDB() {
  await connectDb();
  console.log('  ✅ MongoDB       connected');
}

async function checkOpenAI() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await openai.models.list();
  console.log('  ✅ OpenAI        connected');
  return openai;
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
    checkOpenAI(),
    checkFirebase(),
  ]);

  const [mongo, openai, firebase] = results;

  if (mongo.status === 'rejected') {
    console.error('  ❌ MongoDB       failed —', mongo.reason?.message);
  }
  if (openai.status === 'rejected') {
    console.error('  ❌ OpenAI        failed —', openai.reason?.message);
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
  app.use(cors());
  app.use(express.json());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' },
  });

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
    console.log(`\n🚀 HustleMatch API running on http://localhost:${port}`);
    console.log('\n📋 Public endpoints:');
    console.log('   POST /auth/signup           — Create account (Firebase + MongoDB dual-write, no token issued)');
    console.log('   POST /auth/signin           — Sync profile after client-side Firebase sign-in (requires Bearer ID token)');
    console.log('\n📋 Protected endpoints (Authorization: Bearer <idToken>):');
    console.log('   POST /auth/complete-profile');
    console.log('   /users /jobs /applications /transactions /messages /notifications — CRUD\n');
  });
}

boot();