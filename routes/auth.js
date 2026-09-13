const express = require('express');
const { randomUUID } = require('crypto');
const admin = require('../firebase/firebase.config');
const User = require('../models/User');

const router = express.Router();

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

if (!FIREBASE_WEB_API_KEY) {
  // Fail loudly at boot rather than silently letting /signin accept any password.
  throw new Error(
    'FIREBASE_WEB_API_KEY is required. Get it from Firebase Console > Project Settings > General > Web API Key.'
  );
}

// Refresh an ID token using a Firebase refresh token via Identity Toolkit REST API
async function refreshIdToken(refreshToken) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.message || 'TOKEN_REFRESH_FAILED';
    const err = new Error(code);
    err.firebaseCode = code;
    throw err;
  }
  return data; // { access_token, expires_in, token_type, refresh_token, user_id }
}

function log(op, data) {
  console.log(`\n${'='.repeat(55)}\n[AUTH] ${op}\n${'-'.repeat(55)}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('='.repeat(55));
}

// Calls Firebase's Identity Toolkit REST API directly. This is the only way
// to actually verify a password server-side — the Admin SDK deliberately
// does not expose password verification (it's a privileged operation meant
// to run client-side against Google's servers). Doing it here keeps the
// frontend dumb: it just POSTs email/password to our backend like any
// normal API and gets back an idToken it can use as a Bearer token.
async function firebaseSignInWithPassword(email, password) {
  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.message || 'UNKNOWN_ERROR';
    const err = new Error(code);
    err.firebaseCode = code;
    throw err;
  }
  return data; // { idToken, refreshToken, localId, expiresIn, ... }
}

// ── SIGNUP ────────────────────────────────────────────────────────────────
// Dual-write: Firebase Auth owns the credential, MongoDB owns the profile.
// If the Mongo write fails after Firebase user creation succeeds, we roll
// back the Firebase user so the two stores never drift out of sync.
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
    console.error('FIREBASE CREATE USER ERROR:', firebaseError.code, firebaseError.message);
    if (firebaseError.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'This email is already registered.' });
    }
    if (firebaseError.code === 'auth/invalid-credential') {
      return res.status(400).json({ error: 'Invalid email or password format.' });
    }
    return res.status(500).json({ error: 'Failed to create account. ' + firebaseError.message });
  }

  let user;
  try {
    user = new User({
      id: randomUUID(),
      firebase_uid: firebaseUser.uid,
      email,
      password_hash: null, // Firebase is the credential store, not us
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

  // Mint a Firebase custom token so the frontend can exchange it client-side
  // via signInWithCustomToken() for a real session (see api/authClient.ts).
  // No need to re-verify the password here — we just set it moments ago.
  let customToken;
  try {
    customToken = await admin.auth().createCustomToken(firebaseUser.uid, {
      role,
      mongoId: user._id.toString(),
    });
  } catch (err) {
    console.error('Custom token creation failed after signup:', err);
    // Account exists correctly in both stores; client can retry via /auth/signin.
    return res.status(201).json({
      message: 'Account created. Please sign in.',
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    });
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
    customToken,
  });
});

// ── SIGNIN ────────────────────────────────────────────────────────────────
// Actually verifies the password via Identity Toolkit REST — this is the
// fix for the bug where getUserByEmail() let anyone in without a password check.
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  let tokens;
  try {
    tokens = await firebaseSignInWithPassword(email, password);
  } catch (err) {
    const invalidCredCodes = ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD'];
    if (invalidCredCodes.includes(err.firebaseCode)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (err.firebaseCode === 'USER_DISABLED') {
      return res.status(403).json({ error: 'This account has been disabled.' });
    }
    console.error('Signin error:', err);
    return res.status(500).json({ error: 'Failed to sign in.' });
  }

  const user = await User.findOne({ firebase_uid: tokens.localId, deleted_at: null }).exec();
  if (!user) {
    // Credentials are valid in Firebase but there's no matching Mongo profile —
    // this is the dual-write drift case. Surface it distinctly so it's debuggable.
    console.error('AUTH/MONGO DRIFT: valid Firebase login with no Mongo user for uid', tokens.localId);
    return res.status(401).json({ error: 'No HustleMatch profile linked to this account.' });
  }

  user.last_login_at = new Date();
  await user.save();

  // Password already verified above via Identity Toolkit REST. Discard that
  // idToken/refreshToken pair and mint a custom token instead, so the client
  // exchanges it via signInWithCustomToken() and keeps auth.currentUser (and
  // httpClient.ts's getIdToken() refresh logic) working as designed.
  const customToken = await admin.auth().createCustomToken(tokens.localId, {
    role: user.role,
    mongoId: user._id.toString(),
  });

  log('SIGNIN', { uid: tokens.localId, email: user.email, full_name: user.full_name });

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
    customToken,
  });
});

// ── REFRESH TOKEN ───────────────────────────────────────────────────────────
// Exchange a Firebase refresh token for a new ID token + refresh token pair.
// Called by the frontend when the ID token expires (hourly).
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  let tokens;
  try {
    tokens = await refreshIdToken(refreshToken);
  } catch (err) {
    const invalidCodes = ['INVALID_REFRESH_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED'];
    if (invalidCodes.includes(err.firebaseCode)) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    console.error('Token refresh error:', err);
    return res.status(500).json({ error: 'Failed to refresh session.' });
  }

  // Verify the user still exists in our MongoDB
  const user = await User.findOne({ firebase_uid: tokens.user_id, deleted_at: null }).exec();
  if (!user) {
    return res.status(401).json({ error: 'User profile not found.' });
  }

  log('REFRESH', { uid: tokens.user_id, email: user.email });

  return res.status(200).json({
    message: 'Token refreshed successfully.',
    idToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
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

// ── PASSWORD RESET ───────────────────────────────────────────────────────────
// Uses Firebase's Identity Toolkit API to send password-reset emails.
// This is the preferred method because it leverages Firebase's built-in
// password-reset flow, email templates, and token management.

async function sendPasswordResetEmail(email) {
  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}:sendOobCode?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        requestType: 'PASSWORD_RESET',
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.message || 'UNKNOWN_ERROR';
    const err = new Error(code);
    err.firebaseCode = code;
    throw err;
  }
  return data; // { email, expiresIn, oobCode, ... }
}

router.post('/send-password-reset', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required.' });
  }

  try {
    // Check if the email exists in our Mongo DB
    const user = await User.findOne({ email, deleted_at: null }).exec();
    if (!user) {
      // Don't leak whether the email exists or not
      return res.status(200).json({
        message: 'If an account with this email exists, a password reset link has been sent.',
      });
    }

    // Send the password reset email via Firebase
    const result = await sendPasswordResetEmail(email);

    return res.status(200).json({
      message: 'Password reset link has been sent to your email address.',
      email,
    });
  } catch (err) {
    console.error('Password reset email error:', err);

    // Avoid exposing Firebase error codes to the frontend
    return res.status(200).json({
      message: 'If an account with this email exists, a password reset link has been sent.',
    });
  }
});

// POST /auth/reset-password — Reset password using the reset token
// The reset token comes from Firebase's password-reset link and is
// passed by the frontend after user clicks the email link.
async function resetPasswordWithToken(oobCode, newPassword) {
  const res = await fetch(
    `${IDENTITY_TOOLKIT_BASE}:resetPassword?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oobCode,
        newPassword,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const code = data?.error?.message || 'UNKNOWN_ERROR';
    const err = new Error(code);
    err.firebaseCode = code;
    throw err;
  }
  return data; // { email, expiresIn, ... }
}

router.post('/reset-password', async (req, res) => {
  const { oobCode, newPassword } = req.body;

  if (!oobCode || !newPassword) {
    return res.status(400).json({ error: 'oobCode and newPassword are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const result = await resetPasswordWithToken(oobCode, newPassword);

    return res.status(200).json({
      message: 'Password has been reset successfully.',
      email: result.email,
    });
  } catch (err) {
    console.error('Password reset error:', err);

    // Provide user-friendly error messages based on Firebase error codes
    if (err.firebaseCode === 'INVALID_OOB_CODE') {
      return res.status(400).json({
        error: 'This password reset link is invalid or has expired. Please request a new one.',
      });
    }

    if (err.firebaseCode === 'EXPIRED_OOB_CODE') {
      return res.status(400).json({
        error: 'This password reset link has expired. Please request a new one.',
      });
    }

    return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

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

  const existing = await User.findOne({ firebase_uid: decoded.uid }).exec();
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