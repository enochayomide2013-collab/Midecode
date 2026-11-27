import React, { useState } from 'react';
import { ShieldCheck, X, Mail, KeyRound, Loader2, Sparkles } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { getIdTokenHeader, tryReadJson } from '../services/authService';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccessGranted: () => void;
}

export function AdminAccessModal({ isOpen, onClose, onAccessGranted }: AdminAccessModalProps) {
  const { refreshUserData, refreshAuthState, notify } = useMideo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (cleanEmail !== 'enochayomide2013@gmail.com' || cleanPass !== '2013') {
      setError('Access denied.');
      return;
    }

    setVerifying(true);
    try {
      const authHeaders = await getIdTokenHeader();
      const res = await fetch('/api/admin/verify-credentials', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPass,
        }),
      });

      const data = await tryReadJson<{ ok?: boolean; error?: string }>(res);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Access denied.');
      }

      sessionStorage.setItem('mideocode_admin_password_unlocked', 'true');
      sessionStorage.setItem('mideocode_admin_email_unlocked', 'enochayomide2013@gmail.com');
      sessionStorage.setItem('mideocode_unrestricted_admin', 'true');

      await Promise.all([refreshAuthState().catch(() => {}), refreshUserData().catch(() => {})]);

      notify('success', 'Owner credentials verified. Unrestricted administrator access unlocked.');
      setError(null);
      setEmail('');
      setPassword('');
      onAccessGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access denied.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Admin Console Verification"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                Admin Console Verification
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Unrestricted owner access authentication
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300">
          To unlock unrestricted administrator rights across MideoCode, enter the Owner Email and Owner Password below. Once verified, your session cannot be restricted.
        </div>

        <form onSubmit={handleVerify} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Owner Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter owner email"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Owner Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter owner password"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono tracking-wider text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={verifying}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow disabled:opacity-50"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Unlock Admin'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
