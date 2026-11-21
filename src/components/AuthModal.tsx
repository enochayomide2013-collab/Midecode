import React, { useEffect, useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Mail,
  User as UserIcon,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MideoLogo } from './MideoLogo';
import { FIREBASE_PROJECT_ID } from '../services/firebase';
import {
  AuthServiceError,
  clearPendingGoogleLink,
  getCurrentAuthHostname,
  getPendingGoogleLink,
  isValidEmailAddress,
  signInWithGoogleReal,
  registerWithEmailReal,
  loginWithEmailReal,
  sendPasswordResetReal,
} from '../services/authService';

interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal, refreshUserData, notify } = useMideo();

  const [tab, setTab] = useState<'signin' | 'register' | 'reset'>(authModalTab);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [pendingGoogleLinkEmail, setPendingGoogleLinkEmail] = useState<string | null>(null);

  useEffect(() => {
    setTab(authModalTab);
    setErrorMsg(null);
    setErrorCode(null);
    setFieldErrors({});
    setUnauthorizedHost(null);
    setInfoMsg(null);
    setPendingGoogleLinkEmail(getPendingGoogleLink()?.email || null);
    if (!authModalOpen) {
      setPassword('');
      setConfirmPassword('');
      clearPendingGoogleLink();
      setPendingGoogleLinkEmail(null);
    }
  }, [authModalTab, authModalOpen]);

  if (!authModalOpen) return null;

  const switchTab = (next: 'signin' | 'register' | 'reset', opts?: { keepLink?: boolean }) => {
    setTab(next);
    setErrorMsg(null);
    setErrorCode(null);
    setFieldErrors({});
    setUnauthorizedHost(null);
    setInfoMsg(null);
    if (!opts?.keepLink) {
      clearPendingGoogleLink();
      setPendingGoogleLinkEmail(null);
    }
  };

  const handleCopyHostname = async (host: string) => {
    try {
      await navigator.clipboard.writeText(host);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setErrorCode(null);
    setFieldErrors({});
    setUnauthorizedHost(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const user = await signInWithGoogleReal();
      if (user) {
        notify('success', `Signed in as ${user.displayName || user.email}`);
        closeAuthModal();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google authentication failed.';
      const code = err instanceof AuthServiceError ? err.code || null : null;

      if (code === 'auth/account-exists-with-different-credential') {
        const pendingEmail =
          (err instanceof AuthServiceError && err.pendingEmail) ||
          getPendingGoogleLink()?.email ||
          '';
        if (pendingEmail) {
          setEmail(pendingEmail);
          setPendingGoogleLinkEmail(pendingEmail);
        }
        setTab('signin');
        setInfoMsg(
          `Account exists for ${pendingEmail || 'this email'} with Email & Password. Enter your password below to sign in and link Google automatically.`,
        );
      } else {
        setErrorMsg(msg);
        setErrorCode(code);
        if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
          setUnauthorizedHost(
            (err instanceof AuthServiceError && err.hostname) || getCurrentAuthHostname(),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorCode(null);
    setUnauthorizedHost(null);
    setInfoMsg(null);

    const nextFieldErrors: FieldErrors = {};
    const cleanEmail = email.trim();

    if (!isValidEmailAddress(cleanEmail)) {
      nextFieldErrors.email = 'Enter a valid email address (e.g. name@domain.com).';
    }

    if (tab === 'register') {
      if (fullName.trim().length < 2) {
        nextFieldErrors.fullName = 'Please enter your full name (at least 2 characters).';
      }
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        nextFieldErrors.password =
          'Password must be at least 8 characters and include both letters and numbers.';
      }
      if (password !== confirmPassword) {
        nextFieldErrors.confirmPassword = 'Password and Confirm Password do not match.';
      }
    } else if (tab === 'signin') {
      if (!password) {
        nextFieldErrors.password = 'Enter your password.';
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setErrorMsg(
        nextFieldErrors.fullName ||
          nextFieldErrors.email ||
          nextFieldErrors.password ||
          nextFieldErrors.confirmPassword ||
          'Please check the highlighted fields.',
      );
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      if (tab === 'register') {
        const user = await registerWithEmailReal(fullName.trim(), cleanEmail, password);
        await refreshUserData().catch(() => {});
        notify(
          'success',
          `Account created! Welcome to MideoCode, ${user.displayName || fullName.trim()}.`,
        );
        closeAuthModal();
      } else if (tab === 'signin') {
        const wasLinking = Boolean(
          pendingGoogleLinkEmail &&
            pendingGoogleLinkEmail.toLowerCase() === cleanEmail.toLowerCase(),
        );
        await loginWithEmailReal(cleanEmail, password, rememberMe);
        await refreshUserData().catch(() => {});
        notify(
          'success',
          wasLinking
            ? 'Signed in and linked your Google account.'
            : 'Welcome back to MideoCode.',
        );
        closeAuthModal();
      } else if (tab === 'reset') {
        await sendPasswordResetReal(cleanEmail);
        setInfoMsg('Password reset instructions sent to your email address.');
      }
    } catch (err) {
      const code = err instanceof AuthServiceError ? err.code || null : null;
      setErrorCode(code);
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch =
    confirmPassword.length > 0 && password.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8 shadow-2xl max-h-[92vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="Close authentication modal"
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Official Full MideoCode Logo above authentication form */}
        <div className="flex flex-col items-center text-center mb-5 pt-1">
          <MideoLogo variant="full" heightClass="h-14" className="mb-3" />
          <h2 id="auth-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
            {tab === 'register'
              ? 'Create your MideoCode account'
              : tab === 'reset'
                ? 'Reset Password'
                : 'Sign in to MideoCode'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Secured by Firebase Authentication · Email &amp; Google
          </p>
        </div>

        {/* Provider Switcher: Sign In / Sign Up */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => switchTab('signin')}
            className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'signin' || tab === 'reset'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'register'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {pendingGoogleLinkEmail && tab === 'signin' && (
          <div className="mb-4 p-3 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
            <Link2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p>
                Sign in with your password for{' '}
                <strong className="font-mono">{pendingGoogleLinkEmail}</strong> to securely link
                your Google account.
              </p>
              <button
                type="button"
                onClick={() => {
                  clearPendingGoogleLink();
                  setPendingGoogleLinkEmail(null);
                  setInfoMsg(null);
                }}
                className="text-[11px] underline cursor-pointer"
              >
                Cancel Google linking
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {errorCode === 'auth/email-already-in-use' && (
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className="text-[11px] font-semibold underline text-red-800 dark:text-red-200 cursor-pointer"
              >
                Sign in with this email instead →
              </button>
            )}
            {errorCode === 'auth/operation-not-allowed' && FIREBASE_PROJECT_ID && (
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold underline text-red-800 dark:text-red-200"
              >
                Enable Email/Password in Firebase Sign-in Method
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {unauthorizedHost && (
              <div className="pt-2 border-t border-red-300/60 dark:border-red-900/60 space-y-2">
                <div className="flex items-center justify-between gap-2 bg-white/70 dark:bg-slate-900/70 px-2.5 py-1.5 rounded border border-red-200 dark:border-red-900/60">
                  <code className="text-[11px] font-mono truncate">{unauthorizedHost}</code>
                  <button
                    type="button"
                    onClick={() => handleCopyHostname(unauthorizedHost)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0 cursor-pointer"
                  >
                    {copiedHost ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedHost ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {FIREBASE_PROJECT_ID && (
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold underline text-red-800 dark:text-red-200"
                  >
                    Open Firebase Authorized Domains Settings
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 rounded-lg border border-blue-300 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Google Sign-In / Sign-Up */}
        {tab !== 'reset' && (
          <>
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium flex items-center justify-center gap-3 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
              </svg>
              {tab === 'register' ? 'Sign up with Google' : 'Continue with Google'}
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>or with email</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        {/* Email & Password / Reset Forms */}
        <form onSubmit={handleEmailAuth} className="space-y-4" noValidate>
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: undefined }));
                  }}
                  placeholder="Enter your full name"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    fieldErrors.fullName
                      ? 'border-red-500 focus:ring-red-600'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                />
              </div>
              {fieldErrors.fullName && (
                <p className="text-[11px] text-red-500 mt-1">{fieldErrors.fullName}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="developer@example.com"
                className={`w-full pl-10 pr-3.5 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                  fieldErrors.email
                    ? 'border-red-500 focus:ring-red-600'
                    : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="text-[11px] text-red-500 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {tab !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                {tab === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchTab('reset', { keepLink: false })}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="At least 8 chars with letters & numbers"
                  className={`w-full pl-3.5 pr-10 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    fieldErrors.password
                      ? 'border-red-500 focus:ring-red-600'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="text-[11px] text-red-500 mt-1">{fieldErrors.password}</p>
              ) : (
                tab === 'register' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Minimum 8 characters, at least 1 letter and 1 number.
                  </p>
                )
              )}
            </div>
          )}

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                    }
                  }}
                  placeholder="Re-enter your password"
                  className={`w-full pl-3.5 pr-10 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    passwordsMismatch || fieldErrors.confirmPassword
                      ? 'border-red-500 focus:ring-red-600'
                      : passwordsMatch
                        ? 'border-emerald-500 focus:ring-emerald-600'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword ? (
                <p className="text-[11px] text-red-500 mt-1">{fieldErrors.confirmPassword}</p>
              ) : passwordsMismatch ? (
                <p className="text-[11px] text-red-500 mt-1">Passwords do not match.</p>
              ) : (
                passwordsMatch && (
                  <p className="text-[11px] text-emerald-500 mt-1">Passwords match.</p>
                )
              )}
            </div>
          )}

          {tab === 'signin' && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              <span>Keep me signed in on this device</span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'register'
              ? 'Create Account & Sign In'
              : tab === 'reset'
                ? 'Send Reset Link'
                : 'Sign In'}
          </button>

          {tab === 'reset' && (
            <button
              type="button"
              onClick={() => switchTab('signin')}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
