const admin = require('../firebase/firebase.config.js');
const User = require('../models/User.js');

async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      // Distinct code so the frontend knows to call POST /auth/refresh
      // with its stored refreshToken instead of forcing a full re-login.
      return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token.', code: 'TOKEN_INVALID' });
  }

  req.firebaseUser = decoded;

  const user = await User.findOne({ firebase_uid: decoded.uid, deleted_at: null }).lean();
  if (!user) {
    return res.status(401).json({ error: 'No HustleMatch account linked to this identity.' });
  }

  req.user = {
    uid: decoded.uid,
    mongoId: user._id.toString(),
    role: user.role, // ground truth from MongoDB, not just the claim
    email: user.email,
  };

  next();
}

module.exports = { verifyToken };