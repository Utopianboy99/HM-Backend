// firebase/auth.ts
// Deliberately does NOT export a signUpWithEmail / createUserWithEmailAndPassword
// helper. Account creation must go through your backend's /auth/signup so a
// Mongo user record (role, walletId, etc.) is created alongside the Firebase
// user — see api/authClient.ts. Creating users directly client-side would
// produce a Firebase account with no matching HustleMatch account, which
// verifyToken's User.findOne({ firebase_uid }) lookup would reject forever.
//
// Also deliberately does NOT export a customToken exchange helper. This app's
// session model is: backend creates accounts, client authenticates directly
// via signInWithEmailAndPassword using credentials it already holds (see
// authClient.ts for why). If a future feature needs the backend to be the
// sole authenticator (e.g. server-side social login token exchange), a
// signInWithCustomToken-based helper can be reintroduced then — it isn't
// needed for the current email/password flow and reintroducing it
// unconditionally reopens the token-shape mismatch bug this replaced.
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { firebaseApp } from './app';

export const auth = getAuth(firebaseApp);

/**
 * The real password check, for both signup (immediately after backend
 * account creation) and login. Firebase Auth itself is the credential
 * store — this is the only place a password is ever verified.
 */
export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Fresh ID token for the current user, or null if signed out. Never cache
 * this — tokens expire hourly and the SDK refreshes internally on each call.
 */
export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export type { User };