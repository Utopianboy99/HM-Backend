const express = require('express');
const { randomUUID } = require('crypto');
const admin = require('../firebase/firebase.config');
const User = require('../models/User');

const router = express.Router();

// ── Session model ───────────────────────────────────────────────────────────
// This backend NEVER issues or verifies passwords, and NEVER mints session
// tokens (no customToken, no Identity Toolkit REST call, no idToken/refreshToken
// pass-through). Password verification and session establishment happen
// entirely client-side via the Firebase Client SDK's signInWithEmailAndPassword
// / createUserWithEmailAndPassword-equivalent flow (see authClient.ts).
//
// This backend's job is exactly two things:
//   1. Dual-write account creation: Firebase Auth user (admin.auth().createUser)
//      + MongoDB profile, with rollback on partial failure.
//   2. Profile reads/writes for an already-authenticated caller, gated by
//      verifyToken middleware (which validates the ID token the client obtained
//      directly from Firebase).
//
// Rationale: the Firebase Client SDK already handles password verification,
// session persistence, and silent token refresh correctly and securely.
// Re-implementing any part of that server-side (REST verification, custom
// token exchange) adds a secret to manage (FIREBASE_WEB_API_KEY), an extra
// network round trip, and a second source of truth for "is this session
// valid" that has to be kept in sync with the SDK's own state — which is
// exactly the class of bug that broke this flow previously.

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[AUTH] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// ── SIGNUP ────────────────────────────────────────────────────────────────
// Dual-write: Firebase Auth owns the credential, MongoDB owns the profile.
// If the Mongo write fails after Firebase user creation succeeds, we roll
// back the Firebase user so the two stores never drift out of sync.
//
// Returns the profile only — no token. The client already holds the
// plaintext password it just submitted, so immediately after this call
// succeeds it calls signInWithEmailAndPassword(email, password) itself to
// establish a real Firebase Client SDK session (see authClient.ts::signup).
router.post('/signup', async (req, res) => {
  const { email, password, full_name, role, phone } = req.body;

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({
      error: 'email, password, full_name, and role are required.',
    });
  }

  const VALID_ROLES = ['freelancer', 'client'];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters.' });
  }

  const existing = await User.findOne({ email, deleted_at: null }).exec();
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  let firebaseUser;
  try {
    firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: full_name,
    });
  } catch (firebaseError) {
    if (firebaseError.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'This email is already registered.' });
    }
    console.error('Firebase createUser error:', firebaseError);
    return res.status(500).json({ error: 'Failed to create account.' });
  }

  let user;
  try {
    user = new User({
      id: randomUUID(),
      firebase_uid: firebaseUser.uid,
      email,
      full_name,
      phone: phone || null,
      role,
      is_verified: false,
    });
    await user.save();

    await admin.auth().setCustomUserClaims(firebaseUser.uid, {
      role,
      mongoId: user._id.toString(),
    });
  } catch (mongoError) {
    // Roll back the Firebase side so we never have a Firebase user with no
    // matching Mongo profile — that's the exact drift dual-write exists to prevent.
    console.error('Mongo write failed after Firebase user created — rolling back:', mongoError);
    await admin.auth().deleteUser(firebaseUser.uid).catch((cleanupErr) => {
      console.error('CRITICAL: orphaned Firebase user, manual cleanup needed:', firebaseUser.uid, cleanupErr);
    });
    return res.status(500).json({ error: 'Failed to create account.' });
  }

  log('SIGNUP', { uid: firebaseUser.uid, email, full_name, role });

  return res.status(201).json({
    message: 'Account created successfully.',
    user: {
      id: user.id,
      firebase_uid: firebaseUser.uid,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_verified: user.is_verified,
    },
  });
});

// ── SIGNIN ────────────────────────────────────────────────────────────────
// Password verification happens entirely client-side via
// signInWithEmailAndPassword — this backend never sees or checks the
// password. By the time this route is called, the client already holds a
// valid Firebase ID token from that client-side sign-in, so this call is
// authenticated (see verifyToken middleware applied in server.js) and its
// only job is to look up / sync the Mongo profile and stamp last_login_at.
//
// If you'd rather skip this route entirely, the frontend can call
// GET /users/me directly after signInWithEmailAndPassword succeeds — this
// route exists mainly to bundle the last_login_at update into the same
// round trip.
router.post('/signin', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required — sign in via Firebase first.' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(header.split(' ')[1]);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const user = await User.findOne({ firebase_uid: decoded.uid, deleted_at: null }).exec();
  if (!user) {
    // Valid Firebase credential, but no matching Mongo profile — dual-write
    // drift case. Surface it distinctly so it's debuggable.
    console.error('AUTH/MONGO DRIFT: valid Firebase session with no Mongo user for uid', decoded.uid);
    return res.status(401).json({ error: 'No HustleMatch profile linked to this account.' });
  }

  user.last_login_at = new Date();
  await user.save();

  log('SIGNIN', { uid: decoded.uid, email: user.email, full_name: user.full_name });

  return res.status(200).json({
    message: 'Signed in successfully.',
    user: {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_verified: user.is_verified,
    },
  });
});

// NOTE: /auth/refresh has been removed. Token refresh is handled internally
// by the Firebase Client SDK (auth.currentUser.getIdToken() auto-refreshes
// as needed) — there is no client-visible refresh token to exchange in this
// architecture, so a backend refresh endpoint has no purpose.

// ── COMPLETE PROFILE (for future OAuth/social-login flows) ─────────────────
router.post('/complete-profile', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required.' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(header.split(' ')[1]);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const { full_name, role, phone } = req.body;
  if (!full_name || !role) {
    return res.status(400).json({ error: 'full_name and role are required.' });
  }

  const VALID_ROLES = ['freelancer', 'client'];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'role must be freelancer or client.' });
  }

  // Guard against duplicate-user creation: a retried request after a slow
  // response, or a double-submit from the client, must not create a second
  // Mongo profile for the same firebase_uid.
  const existing = await User.findOne({ firebase_uid: decoded.uid, deleted_at: null }).exec();
  if (existing) {
    return res.status(409).json({ error: 'Account already exists.', user: existing });
  }

  const user = new User({
    id: randomUUID(),
    firebase_uid: decoded.uid,
    email: decoded.email,
    full_name,
    phone: phone || null,
    role,
    is_verified: decoded.email_verified ?? false,
  });

  await user.save();

  await admin.auth().setCustomUserClaims(decoded.uid, {
    role,
    mongoId: user._id.toString(),
  });

  return res.status(201).json(user);
});

module.exports = router;