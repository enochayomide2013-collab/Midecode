import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import {
  browserGetSessionUser,
  browserLoginAccount,
  browserLogoutSession,
  browserRegisterAccount,
  browserResetPassword,
  isLocalFallbackToken,
  shouldFallbackForHttpStatus,
} from './localBrowserStore';

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
  const name =
    (code ? regionFormatter?.of(code) || code : '') ||
    (parsed.countryCallingCode ? `+${parsed.countryCallingCode}` : '');
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

export interface ServerAuthUserPayload {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  country?: string;
  photoURL?: string;
  role: 'member' | 'moderator' | 'admin';
  emailVerified: boolean;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  role: 'member' | 'moderator' | 'admin';
  emailVerified: boolean;
  providerData: Array<{ providerId: string; email?: string | null }>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

// Keep active session Bearer token strictly in memory (never in localStorage/sessionStorage)
let memorySessionToken: string | null = null;
let currentAuthUser: AppUser | null = null;
let bootstrapPromise: Promise<AppUser | null> | null = null;
const authListeners = new Set<(user: AppUser | null) => void>();

function toAppUser(raw: ServerAuthUserPayload): AppUser {
  return {
    uid: raw.uid,
    email: raw.email || null,
    displayName: raw.displayName || null,
    phoneNumber: raw.phoneNumber || null,
    photoURL: raw.photoURL || null,
    role: raw.role || 'member',
    emailVerified: Boolean(raw.emailVerified),
    providerData: [{ providerId: 'password', email: raw.email || null }],
    getIdToken: async () => memorySessionToken || '',
  };
}

function setSessionState(user: ServerAuthUserPayload | null, token: string | null): AppUser | null {
  memorySessionToken = token;
  currentAuthUser = user ? toAppUser(user) : null;
  for (const listener of authListeners) {
    try {
      listener(currentAuthUser);
    } catch {
      // Ignore subscriber error
    }
  }
  return currentAuthUser;
}

export const auth = {
  get currentUser(): AppUser | null {
    return currentAuthUser;
  },
};

export function getCurrentSessionToken(): string | null {
  return memorySessionToken;
}

export async function bootstrapAuthSession(): Promise<AppUser | null> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const localSession = browserGetSessionUser();
    if (localSession && isLocalFallbackToken(localSession.token)) {
      return setSessionState(localSession.user, localSession.token);
    }

    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'MideoCode',
          ...(memorySessionToken ? { Authorization: `Bearer ${memorySessionToken}` } : {}),
        },
      });
      const contentType = res.headers.get('content-type');
      if (shouldFallbackForHttpStatus(res.status, contentType)) {
        if (localSession) {
          return setSessionState(localSession.user, localSession.token);
        }
        return setSessionState(null, null);
      }
      if (!res.ok) {
        if (localSession) {
          return setSessionState(localSession.user, localSession.token);
        }
        return setSessionState(null, null);
      }
      const data = (await res.json()) as {
        user: ServerAuthUserPayload | null;
        token: string | null;
      };
      if (data.user && data.token) {
        return setSessionState(data.user, data.token);
      }
      if (localSession) {
        return setSessionState(localSession.user, localSession.token);
      }
      return setSessionState(null, null);
    } catch {
      if (localSession) {
        return setSessionState(localSession.user, localSession.token);
      }
      return currentAuthUser;
    } finally {
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

export function onAppAuthStateChanged(callback: (user: AppUser | null) => void): () => void {
  authListeners.add(callback);
  if (currentAuthUser) {
    queueMicrotask(() => callback(currentAuthUser));
  } else {
    void bootstrapAuthSession().then((user) => {
      if (authListeners.has(callback) && !currentAuthUser && user === null) {
        callback(null);
      }
    });
  }
  return () => {
    authListeners.delete(callback);
  };
}

const pendingRegistrationNames = new Map<string, string>();
const pendingRegistrationByEmail = new Map<string, string>();
const pendingRegistrationPhones = new Map<string, { phoneNumber: string; country?: string }>();
const pendingRegistrationPhoneByEmail = new Map<string, { phoneNumber: string; country?: string }>();

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

export function setPendingRegistrationPhone(
  uid: string,
  phoneNumber: string,
  country?: string,
  email?: string,
): void {
  const cleanPhone = phoneNumber.trim().slice(0, 32);
  const cleanCountry = country?.trim().slice(0, 80);
  if (!cleanPhone) return;
  const entry = { phoneNumber: cleanPhone, country: cleanCountry || undefined };
  if (uid) {
    pendingRegistrationPhones.set(uid, entry);
  }
  if (email) {
    pendingRegistrationPhoneByEmail.set(email.trim().toLowerCase(), entry);
  }
}

export function getPendingRegistrationPhone(
  uid: string,
  email?: string | null,
): { phoneNumber: string; country?: string } | null {
  return (
    pendingRegistrationPhones.get(uid) ||
    (email ? pendingRegistrationPhoneByEmail.get(email.trim().toLowerCase()) : undefined) ||
    null
  );
}

export function clearPendingRegistrationPhone(uid: string, email?: string | null): void {
  pendingRegistrationPhones.delete(uid);
  if (email) {
    pendingRegistrationPhoneByEmail.delete(email.trim().toLowerCase());
  }
}

export function getCurrentAuthHostname(): string {
  return typeof window !== 'undefined' && window.location?.hostname
    ? window.location.hostname
    : '';
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export async function registerWithEmailReal(
  fullName: string,
  email: string,
  password: string,
  phoneInfo?: { phoneNumber: string; country?: string },
): Promise<AppUser> {
  const cleanedName = fullName.trim().slice(0, 80);
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phoneInfo?.phoneNumber?.trim().slice(0, 32) || '';
  const cleanCountry = phoneInfo?.country?.trim().slice(0, 80) || '';
  const effectiveName =
    cleanedName || (cleanEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'MideoCode Learner').slice(0, 80);

  if (effectiveName && cleanEmail) {
    pendingRegistrationByEmail.set(cleanEmail, effectiveName);
  }
  if (cleanPhone && cleanEmail) {
    pendingRegistrationPhoneByEmail.set(cleanEmail, {
      phoneNumber: cleanPhone,
      country: cleanCountry || undefined,
    });
  }

  const finalizeRegistration = (userPayload: ServerAuthUserPayload, token: string): AppUser => {
    setPendingRegistrationName(userPayload.uid, effectiveName, cleanEmail);
    if (cleanPhone) {
      setPendingRegistrationPhone(userPayload.uid, cleanPhone, cleanCountry, cleanEmail);
    }
    const signedInUser = setSessionState(userPayload, token);
    if (!signedInUser) {
      throw new AuthServiceError('Session creation failed.', 'auth/session-init-failed', getCurrentAuthHostname());
    }
    return signedInUser;
  };

  try {
    let useFallback = false;
    let res: Response | null = null;
    let rawBody = '';
    let data: {
      user?: ServerAuthUserPayload;
      token?: string;
      error?: string;
      code?: string;
    } = {};

    try {
      res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'MideoCode',
        },
        body: JSON.stringify({
          fullName: effectiveName,
          email: cleanEmail,
          phoneNumber: cleanPhone,
          country: cleanCountry,
          password,
        }),
      });
      rawBody = await res.text();
      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as typeof data;
        } catch {
          // Non-JSON response (e.g. HTML 404/fallback from static server)
        }
      }
      if (shouldFallbackForHttpStatus(res.status, res.headers.get('content-type'), Boolean(data.error))) {
        useFallback = true;
      }
    } catch (networkErr) {
      console.warn('[Auth] /api/auth/register unreachable, using browser account store fallback:', networkErr);
      useFallback = true;
    }

    if (useFallback) {
      const localResult = await browserRegisterAccount({
        fullName: effectiveName,
        email: cleanEmail,
        phoneNumber: cleanPhone,
        country: cleanCountry,
        password,
      });
      return finalizeRegistration(localResult.user, localResult.token);
    }

    if (!res || !res.ok || !data.user || !data.token) {
      const resolvedCode = data.code || `http/${res?.status || 'unknown'}`;
      const resolvedMessage =
        data.error ||
        (res?.status
          ? `Account registration failed (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}).`
          : 'Account registration failed due to an unexpected server response.');
      console.error('[Auth] registerWithEmailReal failed:', {
        status: res?.status,
        statusText: res?.statusText,
        code: resolvedCode,
        message: resolvedMessage,
        rawBodyPreview: !data.error ? rawBody.slice(0, 300) : undefined,
        hostname: getCurrentAuthHostname(),
      });
      throw new AuthServiceError(resolvedMessage, resolvedCode, getCurrentAuthHostname());
    }

    return finalizeRegistration(data.user, data.token);
  } catch (err) {
    if (cleanEmail) {
      pendingRegistrationByEmail.delete(cleanEmail);
      pendingRegistrationPhoneByEmail.delete(cleanEmail);
    }
    if (err instanceof AuthServiceError) throw err;
    const message = err instanceof Error ? err.message : 'Account registration failed.';
    const code =
      err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'auth/registration-failed';
    console.error('[Auth] registerWithEmailReal exception:', {
      code,
      message,
      hostname: getCurrentAuthHostname(),
      error: err,
    });
    throw new AuthServiceError(message, code, getCurrentAuthHostname());
  }
}

export async function loginWithEmailReal(
  email: string,
  password: string,
  rememberMe = true,
): Promise<AppUser> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    let useFallback = false;
    let res: Response | null = null;
    let rawBody = '';
    let data: {
      user?: ServerAuthUserPayload;
      token?: string;
      error?: string;
      code?: string;
    } = {};

    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'MideoCode',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          rememberMe,
        }),
      });
      rawBody = await res.text();
      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as typeof data;
        } catch {
          // Non-JSON response
        }
      }
      if (shouldFallbackForHttpStatus(res.status, res.headers.get('content-type'), Boolean(data.error))) {
        useFallback = true;
      }
    } catch (networkErr) {
      console.warn('[Auth] /api/auth/login unreachable, using browser account store fallback:', networkErr);
      useFallback = true;
    }

    if (useFallback) {
      const localResult = await browserLoginAccount({
        email: cleanEmail,
        password,
        rememberMe,
      });
      const signedInUser = setSessionState(localResult.user, localResult.token);
      if (!signedInUser) {
        throw new AuthServiceError('Session initialization failed.', 'auth/session-init-failed');
      }
      return signedInUser;
    }

    if (!res || !res.ok || !data.user || !data.token) {
      // Also check browser fallback account if user previously registered during static fallback
      if (res?.status === 401 && data.code === 'auth/user-not-found') {
        try {
          const localResult = await browserLoginAccount({ email: cleanEmail, password, rememberMe });
          const signedInLocal = setSessionState(localResult.user, localResult.token);
          if (signedInLocal) return signedInLocal;
        } catch {
          // Not in browser store either; surface server error cleanly
        }
      }
      const resolvedCode = data.code || `http/${res?.status || 'unknown'}`;
      const resolvedMessage = data.error || `Sign-in failed (HTTP ${res?.status || 'unknown'}).`;
      console.error('[Auth] loginWithEmailReal failed:', {
        status: res?.status,
        code: resolvedCode,
        message: resolvedMessage,
        hostname: getCurrentAuthHostname(),
      });
      throw new AuthServiceError(resolvedMessage, resolvedCode, getCurrentAuthHostname());
    }

    const signedInUser = setSessionState(data.user, data.token);
    if (!signedInUser) {
      throw new AuthServiceError('Session initialization failed.', 'auth/session-init-failed');
    }
    return signedInUser;
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    const message = err instanceof Error ? err.message : 'Sign-in failed.';
    const code =
      err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'auth/invalid-credential';
    console.error('[Auth] loginWithEmailReal exception:', { code, message, error: err });
    throw new AuthServiceError(message, code, getCurrentAuthHostname());
  }
}

export async function resetPasswordWithPhoneReal(
  email: string,
  phoneNumber: string,
  newPassword: string,
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'MideoCode',
      },
      body: JSON.stringify({
        email: cleanEmail,
        phoneNumber: phoneNumber.trim(),
        newPassword,
      }),
    });
    const rawBody = await res.text();
    let data: { ok?: boolean; error?: string; code?: string } = {};
    if (rawBody) {
      try {
        data = JSON.parse(rawBody) as typeof data;
      } catch {
        // non-json
      }
    }
    if (shouldFallbackForHttpStatus(res.status, res.headers.get('content-type'), Boolean(data.error))) {
      await browserResetPassword({ email: cleanEmail, phoneNumber: phoneNumber.trim(), newPassword });
      return;
    }
    if (!res.ok || !data.ok) {
      throw new AuthServiceError(data.error || 'Could not reset password.', data.code);
    }
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    await browserResetPassword({ email: cleanEmail, phoneNumber: phoneNumber.trim(), newPassword });
  }
}

export async function refreshAuthUser(_user?: AppUser): Promise<AppUser> {
  const refreshed = await bootstrapAuthSession();
  if (!refreshed) {
    throw new Error('Not signed in.');
  }
  return refreshed;
}

export async function logoutReal(): Promise<void> {
  const token = memorySessionToken;
  setSessionState(null, null);
  browserLogoutSession();
  if (isLocalFallbackToken(token)) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'MideoCode',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    // Session cleared locally even if network fails
  }
}

export async function getIdTokenHeader(_forceRefresh = false): Promise<Record<string, string>> {
  if (!memorySessionToken) {
    await bootstrapAuthSession();
  }
  const headers: Record<string, string> = {
    'X-Requested-With': 'MideoCode',
  };
  if (memorySessionToken) {
    headers.Authorization = `Bearer ${memorySessionToken}`;
  }
  return headers;
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
      const res = await fetch(input, {
        ...init,
        credentials: 'same-origin',
        headers: mergedHeaders,
      });

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

export async function resendVerificationEmailReal(_user: AppUser): Promise<void> {
  // Local server accounts are fully verified upon creation
}
