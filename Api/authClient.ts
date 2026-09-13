// api/authClient.ts
// Session model: the backend never issues or verifies tokens. All password
// verification and session establishment happens via the Firebase Client SDK
// directly (signInWithEmailAndPassword). The backend's job is limited to:
//   - POST /auth/signup: dual-write account creation (Firebase + Mongo), no token returned
//   - POST /auth/signin: authenticated profile sync (last_login_at), requires
//     a Bearer ID token the client already obtained itself
//
// This intentionally does NOT use signInWithCustomToken — that pattern only
// makes sense when the backend is the only party that can authenticate the
// user (e.g. server-side social login token exchange). Here, the client
// already holds the plaintext password (the user just typed it), so it can
// authenticate directly and skip an extra round trip and an extra token type.

import {
  signInWithEmailPassword,
  signOutUser,
} from '../firebase/firebaseAuth';
import { apiRequest } from './httpClient';

export type UserRole = 'freelancer' | 'client';

export interface SignupPayload {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

export interface SigninPayload {
  email: string;
  password: string;
}

export interface BackendUser {
  id: string;
  firebase_uid: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_verified: boolean;
}

interface AuthResponse {
  message: string;
  user: BackendUser;
}

export async function signup(payload: SignupPayload): Promise<BackendUser> {
  // Step 1: backend creates the Firebase user + Mongo profile (dual-write).
  // No token comes back — there's nothing to exchange.
  const res = await apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
    authenticated: false,
  });

  // Step 2: the client already has the plaintext password (the user just
  // typed it into the signup form) — use it to sign in directly via the
  // Firebase Client SDK. This is what actually establishes auth.currentUser
  // and enables httpClient.ts's getIdToken() auto-refresh to work.
  await signInWithEmailPassword(payload.email, payload.password);

  return res.user;
}

export async function signin(payload: SigninPayload): Promise<BackendUser> {
  // Step 1: real password verification happens here, client-side, via
  // Firebase. This establishes auth.currentUser and the SDK's session.
  await signInWithEmailPassword(payload.email, payload.password);

  // Step 2: now that a real Firebase session exists, call the backend to
  // sync last_login_at and fetch the canonical Mongo profile. apiRequest
  // pulls the ID token from auth.currentUser and attaches it automatically.
  const res = await apiRequest<AuthResponse>('/auth/signin', {
    method: 'POST',
    authenticated: true, // apiRequest pulls the token from auth.currentUser itself
  });

  return res.user;
}

export async function signOut() {
  await signOutUser();
}