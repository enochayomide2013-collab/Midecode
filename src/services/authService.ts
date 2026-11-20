import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  linkWithPopup,
  EmailAuthProvider,
  linkWithCredential,
  reload,
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

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing authentication.';
    case 'auth/cancelled-popup-request':
      return 'Authentication request was cancelled.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Switching to redirect authentication or allow popups.';
    case 'auth/network-request-failed':
      return 'Network interruption occurred. Please check your connection and retry.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in or link accounts from your profile.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters and include a mix of letters and numbers.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Double-check your credentials or reset your password.';
    case 'auth/too-many-requests':
      return 'Too many attempts detected. For security, please wait before trying again.';
    case 'auth/internal-error':
      return 'Firebase Auth encountered an internal error. Please check that Email/Password and Google sign-in providers are enabled in your Firebase Console > Authentication, or try clearing browser cookies/site data.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled yet in Firebase Console > Authentication > Sign-in method.';
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
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function registerWithEmailReal(
  displayName: string,
  email: string,
  password: string,
): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    await sendEmailVerification(cred.user);
    return cred.user;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function loginWithEmailReal(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
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
