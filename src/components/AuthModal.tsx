import React, { useEffect, useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Mail,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MideoLogo } from './MideoLogo';
import {
  signInWithGoogleReal,
  registerWithEmailReal,
  loginWithEmailReal,
  sendPasswordResetReal,
} from '../services/authService';

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal, notify } = useMideo();

  const [tab, setTab] = useState<'signin' | 'register' | 'reset'>(authModalTab);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    setTab(authModalTab);
    setErrorMsg(null);
    setInfoMsg(null);
  }, [authModalTab, authModalOpen]);

  if (!authModalOpen) return null;

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const user = await signInWithGoogleReal();
      if (user) {
        notify('success', `Signed in as ${user.displayName || user.email}`);
        closeAuthModal();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (tab === 'register') {
      if (displayName.trim().length < 2) {
        setErrorMsg('Please enter your display name (at least 2 characters).');
        return;
      }
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        setErrorMsg('Password must be at least 8 characters and include both letters and numbers.');
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'register') {
        await registerWithEmailReal(displayName, email, password);
        notify('success', 'Account created. A verification email has been sent to your inbox.');
        closeAuthModal();
      } else if (tab === 'signin') {
        await loginWithEmailReal(email, password);
        notify('success', 'Welcome back to MideoCode.');
        closeAuthModal();
      } else if (tab === 'reset') {
        await sendPasswordResetReal(email);
        setInfoMsg('Password reset instructions sent to your email address.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8 shadow-2xl max-h-[92vh] overflow-y-auto relative">
        <button
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
            onClick={() => { setTab('signin'); setErrorMsg(null); setInfoMsg(null); }}
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
            onClick={() => { setTab('register'); setErrorMsg(null); setInfoMsg(null); }}
            className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'register'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
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
              <span>or</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        {/* Email & Password / Reset Forms */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
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
                    onClick={() => { setTab('reset'); setErrorMsg(null); setInfoMsg(null); }}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars with letters & numbers"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              {tab === 'register' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Minimum 8 characters, at least 1 letter and 1 number.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'register'
              ? 'Create Account'
              : tab === 'reset'
                ? 'Send Reset Link'
                : 'Sign In'}
          </button>

          {tab === 'reset' && (
            <button
              type="button"
              onClick={() => { setTab('signin'); setErrorMsg(null); setInfoMsg(null); }}
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
