import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import { auth, googleProvider } from './firebase';

export interface CountryDialCode {
  code: CountryCode;
  name: string;
  dial: string;
}

const regionFormatter =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const PRIORITY_COUNTRY_CODES: CountryCode[] = ['NG', 'US', 'GB', 'CA', 'GH', 'KE', 'ZA', 'IN', 'DE', 'FR', 'AU'];

export const SUPPORTED_COUNTRIES: CountryDialCode[] = getCountries()
  .map((code) => ({
    code,
    name: regionFormatter?.of(code) || code,
    dial: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => {
    const idxA = PRIORITY_COUNTRY_CODES.indexOf(a.code);
    const idxB = PRIORITY_COUNTRY_CODES.indexOf(b.code);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

export function getCountryByCode(code: string): CountryDialCode {
  return (
    SUPPORTED_COUNTRIES.find((c) => c.code === code) ||
    SUPPORTED_COUNTRIES.find((c) => c.code === 'NG') ||
    SUPPORTED_COUNTRIES[0]
  );
}

export function formatPhoneAsYouType(rawInput: string, countryCode: CountryCode): {
  formatted: string;
  detectedCountry?: CountryCode;
} {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('+')) {
    const typer = new AsYouType();
    const formatted = typer.input(trimmed);
    const detectedCountry = typer.getCountry();
    return { formatted, detectedCountry };
  }
  const typer = new AsYouType(countryCode);
  return { formatted: typer.input(rawInput) };
}

export function normalizePhoneToE164(
  country: CountryDialCode,
  rawInput: string,
): {
  valid: boolean;
  e164: string;
  masked: string;
  nationalFormatted: string;
  detectedCountry: CountryCode;
  error?: string;
} {
  const trimmed = rawInput.trim();
  const parsed = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, country.code);

  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      e164: '',
      masked: '',
      nationalFormatted: '',
      detectedCountry: country.code,
      error: `Enter a valid ${country.name} (${country.dial}) or international (+...) phone number.`,
    };
  }

  const e164 = parsed.number;
  const tail = parsed.nationalNumber.slice(-4);
  const masked = `+${parsed.countryCallingCode} •••• ${tail}`;

  return {
    valid: true,
    e164,
    masked,
    nationalFormatted: parsed.formatInternational(),
    detectedCountry: parsed.country || country.code,
  };
}

export function getCountryInfoFromPhone(phoneNumber?: string | null): {
  code: CountryCode | null;
  name: string;
  dial: string;
  international: string;
} | null {
  if (!phoneNumber || !phoneNumber.trim()) return null;
  const parsed = parsePhoneNumberFromString(phoneNumber.trim());
  if (!parsed) return null;
  const code = parsed.country || null;
  const name = (code ? regionFormatter?.of(code) || code : '') || (parsed.countryCallingCode ? `+${parsed.countryCallingCode}` : '');
  return {
    code,
    name: code ? `${name} (${code})` : name,
    dial: parsed.countryCallingCode ? `+${parsed.countryCallingCode}` : '',
    international: parsed.formatInternational() || phoneNumber.trim(),
  };
}

export class AuthServiceError extends Error {
  code?: string;
  hostname?: string;
  pendingEmail?: string;

  constructor(message: string, code?: string, hostname?: string, pendingEmail?: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
    this.hostname = hostname;
    this.pendingEmail = pendingEmail;
  }
}

const pendingRegistrationNames = new Map<string, string>();
const pendingRegistrationByEmail = new Map<string, string>();
let pendingGoogleCredential: { email: string; credential: AuthCredential } | null = null;

export function setPendingRegistrationName(uid: string, fullName: string, email?: string): void {
  const cleaned = fullName.trim().slice(0, 80);
  if (uid && cleaned) {
    pendingRegistrationNames.set(uid, cleaned);
  }
  if (email && cleaned) {
    pendingRegistrationByEmail.set(email.trim().toLowerCase(), cleaned);
  }
}

export function getPendingRegistrationName(uid: string, email?: string | null): string | null {
  return (
    pendingRegistrationNames.get(uid) ||
    (email ? pendingRegistrationByEmail.get(email.trim().toLowerCase()) : undefined) ||
    null
  );
}

export function clearPendingRegistrationName(uid: string, email?: string | null): void {
  pendingRegistrationNames.delete(uid);
  if (email) {
    pendingRegistrationByEmail.delete(email.trim().toLowerCase());
  }
}

export function getPendingGoogleLink(): { email: string; credential: AuthCredential } | null {
  return pendingGoogleCredential;
}

export function clearPendingGoogleLink(): void {
  pendingGoogleCredential = null;
}

export function getCurrentAuthHostname(): string {
  return typeof window !== 'undefined' && window.location?.hostname
    ? window.location.hostname
    : '';
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  const hostname = getCurrentAuthHostname();

  switch (code) {
    case 'auth/unauthorized-domain':
      return `Google Sign-In is not yet authorized for "${hostname || 'this domain'}". Add "${hostname || 'this domain'}" in Firebase Console > Authentication > Settings > Authorized domains, or sign up / sign in with Email & Password below.`;
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In was cancelled. You can try again.';
    case 'auth/cancelled-popup-request':
      return 'Google Sign-In was cancelled. You can try again.';
    case 'auth/popup-blocked':
      return 'Google popup was blocked by your browser. Allow popups for MideoCode and click Continue with Google again.';
    case 'auth/network-request-failed':
      return 'Network interruption occurred. Please check your internet connection and retry.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Sign in below or reset your password.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already registered with Email & Password. Sign in with your password below to securely link your Google account.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters and include both letters and numbers.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact an administrator if you need assistance.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Double-check your credentials or use Forgot Password.';
    case 'auth/too-many-requests':
      return 'Too many attempts detected. For security, please wait a moment before trying again.';
    case 'auth/internal-error':
      return 'Google authentication is temporarily unavailable. Please verify connection/configuration and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled in Firebase Console > Authentication > Sign-in method.';
    case 'auth/credential-already-in-use':
      return 'This credential is already linked to a different MideoCode account. Sign in to that account instead.';
    case 'auth/provider-already-linked':
      return 'This authentication method is already linked to your account.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before linking a new credential.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export async function signInWithGoogleReal(): Promise<User | null> {
  try {
    await setPersistence(auth, browserLocalPersistence).catch(() => {});
    const result = await signInWithPopup(auth, googleProvider);
    clearPendingGoogleLink();
    return result.user;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    const customEmail =
      typeof err === 'object' &&
      err !== null &&
      'customData' in err &&
      typeof (err as { customData?: { email?: string } }).customData?.email === 'string'
        ? (err as { customData: { email: string } }).customData.email
        : undefined;

    if (code === 'auth/account-exists-with-different-credential') {
      const cred = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      if (cred && customEmail) {
        pendingGoogleCredential = { email: customEmail, credential: cred };
      }
      throw new AuthServiceError(mapFirebaseAuthError(err), code, getCurrentAuthHostname(), customEmail);
    }

    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (code === 'auth/popup-blocked' && !isInsideIframe) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return null;
      } catch (redirErr) {
        const redirCode =
          typeof redirErr === 'object' && redirErr !== null && 'code' in redirErr
            ? String((redirErr as { code: unknown }).code)
            : code;
        throw new AuthServiceError(mapFirebaseAuthError(redirErr), redirCode, getCurrentAuthHostname());
      }
    }
    throw new AuthServiceError(mapFirebaseAuthError(err), code, getCurrentAuthHostname());
  }
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    throw new AuthServiceError(mapFirebaseAuthError(err), code, getCurrentAuthHostname());
  }
}

export async function registerWithEmailReal(
  fullName: string,
  email: string,
  password: string,
): Promise<User> {
  const cleanedName = fullName.trim().slice(0, 80);
  const cleanEmail = email.trim();
  // Store fullName BEFORE creating the account so onAuthStateChanged reads the real name immediately
  if (cleanedName && cleanEmail) {
    pendingRegistrationByEmail.set(cleanEmail.toLowerCase(), cleanedName);
  }
  try {
    await setPersistence(auth, browserLocalPersistence).catch(() => {});
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (cleanedName) {
      setPendingRegistrationName(cred.user.uid, cleanedName, cleanEmail);
      await updateProfile(cred.user, { displayName: cleanedName }).catch(() => {});
      await reload(cred.user).catch(() => {});
    }
    // Non-blocking verification email so user stays signed in immediately upon account creation
    void sendEmailVerification(cred.user).catch(() => {});
    return auth.currentUser || cred.user;
  } catch (err) {
    if (cleanEmail) {
      pendingRegistrationByEmail.delete(cleanEmail.toLowerCase());
    }
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    throw new AuthServiceError(mapFirebaseAuthError(err), code, getCurrentAuthHostname());
  }
}

export async function loginWithEmailReal(
  email: string,
  password: string,
  rememberMe = true,
): Promise<User> {
  try {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence,
    ).catch(() => {});
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const pendingLink = getPendingGoogleLink();
    if (pendingLink && pendingLink.email.toLowerCase() === email.trim().toLowerCase()) {
      await linkWithCredential(cred.user, pendingLink.credential).catch(() => {});
      clearPendingGoogleLink();
      await reload(cred.user).catch(() => {});
    }
    return auth.currentUser || cred.user;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    throw new AuthServiceError(mapFirebaseAuthError(err), code, getCurrentAuthHostname());
  }
}

export async function sendPasswordResetReal(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function resendVerificationEmailReal(user: User): Promise<void> {
  try {
    await sendEmailVerification(user);
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function refreshAuthUser(user: User): Promise<User> {
  await reload(user);
  return auth.currentUser || user;
}

export async function linkGoogleAccountReal(user: User): Promise<User> {
  try {
    const res = await linkWithPopup(user, googleProvider);
    return res.user;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function linkEmailAccountReal(
  user: User,
  email: string,
  password: string,
): Promise<User> {
  try {
    const credential = EmailAuthProvider.credential(email.trim(), password);
    const res = await linkWithCredential(user, credential);
    await sendEmailVerification(res.user);
    return res.user;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function logoutReal(): Promise<void> {
  await signOut(auth);
}

export async function getIdTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

export async function fetchWithAuthAndRetry(
  input: string,
  init: RequestInit = {},
  options: { retries?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  const maxRetries = options.retries ?? 2;
  const baseDelayMs = options.retryDelayMs ?? 300;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const authHeaders = await getIdTokenHeader(attempt > 0);
      const mergedHeaders = {
        ...(init.headers as Record<string, string> | undefined),
        ...authHeaders,
      };
      const res = await fetch(input, { ...init, headers: mergedHeaders });

      // Refresh token once on 401 if a Firebase user is signed in
      if (res.status === 401 && attempt === 0 && auth.currentUser) {
        const freshHeaders = await getIdTokenHeader(true);
        return await fetch(input, {
          ...init,
          headers: {
            ...(init.headers as Record<string, string> | undefined),
            ...freshHeaders,
          },
        });
      }

      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed.');
}
