import { getApp, getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  checkActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import type { UserProfile } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const firebaseWebClientId = import.meta.env.VITE_FIREBASE_WEB_CLIENT_ID;
const googleWebClientIdPattern = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;

const missingConfigValues = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || value.startsWith('YOUR_'))
  .map(([key]) => key);

export const missingFirebaseConfig = missingConfigValues;
export const isFirebaseConfigured = missingConfigValues.length === 0;

export function getFirebaseConfigurationError() {
  if (isFirebaseConfigured) return null;
  return `Missing Firebase configuration: ${missingConfigValues.join(', ')}`;
}

export function firebaseErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (code.includes('deadline-exceeded')) return 'The request timed out. Please try again.';
  if (code.includes('unavailable') || code.includes('network-request-failed')) return 'Network unavailable. Check your connection and try again.';
  if (code.includes('invalid-action-code')) return 'This reset link is invalid or has already been used.';
  if (code.includes('expired-action-code')) return 'This reset link has expired. Request a new email.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Invalid email or password.';
  if (code.includes('email-already-in-use')) return 'An account already exists with this email.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup') || code.includes('cancelled-popup-request')) return 'Google sign-in was cancelled.';
  if (code.includes('popup-blocked')) return 'Google sign-in was blocked. Allow pop-ups and try again.';
  if (code.includes('credential-already-in-use') || code.includes('account-exists-with-different-credential')) return 'This email is already linked to another sign-in method.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if (code.includes('network-request-failed')) return 'Network connection unavailable.';
  if (code.includes('configuration-not-found') || code.includes('invalid-api-key')) return `${getFirebaseConfigurationError() || 'Authentication is not configured.'} Add the Firebase values from .env.example and restart the app.`;
  if (code.includes('operation-not-allowed')) return 'This sign-in method is disabled in Firebase Console.';
  if (code.includes('unauthorized-domain')) return 'This app domain is not authorized in Firebase Console.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('quota-exceeded')) return 'Email delivery quota exceeded. Please try again later.';
  if (message) return `Authentication failed: ${message}`;
  return 'Authentication failed. Please try again.';
}

export function getFirebaseAuth() {
  if (!isFirebaseConfigured) {
    const error = new Error(getFirebaseConfigurationError() || 'SoberWatch authentication is not configured.') as Error & { code: string };
    error.code = 'auth/configuration-not-found';
    throw error;
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export function observeAuthState(listener: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export async function signInWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string, displayName?: string) {
  const auth = getFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
  return result.user;
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (Capacitor.isNativePlatform()) {
    if (!firebaseWebClientId || !googleWebClientIdPattern.test(firebaseWebClientId)) {
      const error = new Error('Missing Firebase Google Web client ID.') as Error & { code: string };
      error.code = 'auth/configuration-not-found';
      throw error;
    }
    await SocialLogin.initialize({
      google: {
        webClientId: firebaseWebClientId,
        mode: 'online',
      },
    });
    const result = await SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] },
    });
    if (result.result.responseType !== 'online') {
      throw new Error('Google returned an offline authorization response instead of an ID token.');
    }
    const idToken = result.result.idToken;
    if (!idToken || idToken.split('.').length !== 3) {
      throw new Error('Google returned an invalid ID token.');
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const firebaseResult = await signInWithCredential(auth, credential);
    return firebaseResult.user;
  }
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function completeGoogleRedirect() {
  const result = await getRedirectResult(getFirebaseAuth());
  return result?.user || null;
}

export async function resendVerificationEmail() {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Authentication required.');
  await sendEmailVerification(user);
}

export async function refreshFirebaseUser() {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  await user.reload();
  return getFirebaseAuth().currentUser;
}

export async function resetPassword(email: string) {
  const actionCodeSettings = {
    url: `${window.location.origin}/reset-password?source=soberwatch`,
    handleCodeInApp: true,
    android: {
      packageName: 'com.soberwatch.app',
      installApp: true,
      minimumVersion: '1',
    },
    iOS: {
      bundleId: 'com.soberwatch.app',
      appStoreId: '000000000',
    },
  };
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim(), actionCodeSettings);
}

export async function validatePasswordResetCode(oobCode: string) {
  return checkActionCode(getFirebaseAuth(), oobCode);
}

export async function applyPasswordReset(oobCode: string, newPassword: string) {
  await confirmPasswordReset(getFirebaseAuth(), oobCode, newPassword);
}

// Wait until Firebase has restored the persisted auth session (cold start), up to a
// bounded timeout, so token requests never race the async onAuthStateChanged restore.
async function waitForCurrentUser(timeoutMs = 8000): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;
  return new Promise<User | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        resolve(auth.currentUser);
      }
    }, timeoutMs);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

export async function getFirebaseIdToken(): Promise<string> {
  const user = await waitForCurrentUser();
  if (!user) throw new Error('Authentication required.');
  try {
    const token = await user.getIdToken();
    console.log("FIREBASE_UID:", user.uid);
    return token;
  } catch (error: any) {
    // Force a token refresh if the cached token is invalid/expired.
    if (error?.code?.includes('auth/invalid-user-token') || error?.code?.includes('auth/user-token-expired') || error?.code?.includes('auth/token-expired') || error?.code?.includes('auth/user-not-found')) {
      return user.getIdToken(true);
    }
    throw error;
  }
}

// Resolve to the authenticated uid (real Firebase session) or undefined once the
// auth session has been restored. Callers use this instead of a hardcoded UID.
export async function resolveAuthenticatedUid(): Promise<string | undefined> {
  const user = await waitForCurrentUser();
  return user?.uid;
}

// Wait for the Firebase auth session to be restored and return an optional profile,
// never throwing. Used on cold start so the app can align its UI with real auth state.
export async function waitForAuthRestore(timeoutMs = 8000): Promise<User | null> {
  const user = await waitForCurrentUser(timeoutMs);
  return user;
}

export async function logoutFirebase() {
  await signOut(getFirebaseAuth());
}

export function userToProfile(user: User) {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'SoberWatch User',
    photoUrl: user.photoURL || undefined,
    emailVerified: user.emailVerified,
    isGuest: false,
  };
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const db = getFirestore(getFirebaseAuth().app);
  const profileRef = doc(db, 'users', user.uid);
  const authProfile = userToProfile(user);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const existing = await getDoc(profileRef);
      const existingData = existing.exists() ? existing.data() : {};

      await setDoc(profileRef, {
        uid: user.uid,
        email: authProfile.email,
        displayName: authProfile.displayName,
        photoUrl: authProfile.photoUrl || null,
        emailVerified: authProfile.emailVerified,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      return {
        ...authProfile,
        ...existingData,
        uid: user.uid,
        email: typeof existingData.email === 'string' ? existingData.email : authProfile.email,
        displayName: typeof existingData.displayName === 'string' ? existingData.displayName : authProfile.displayName,
        photoUrl: typeof existingData.photoUrl === 'string' ? existingData.photoUrl : authProfile.photoUrl,
        emailVerified: authProfile.emailVerified,
        isGuest: false,
      };
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const isTransient = code.includes('deadline-exceeded') || code.includes('unavailable') || code.includes('network-request-failed');
      if (!isTransient || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error('Unable to initialize user profile.');
}
