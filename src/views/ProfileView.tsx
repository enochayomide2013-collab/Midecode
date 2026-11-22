import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryCode } from 'libphonenumber-js';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Camera,
  CheckCircle2,
  Link2,
  Loader2,
  Mail,
  Moon,
  Phone,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { db } from '../services/firebase';
import {
  SUPPORTED_COUNTRIES,
  formatPhoneAsYouType,
  getCountryByCode,
  getCountryInfoFromPhone,
  linkEmailAccountReal,
  linkGoogleAccountReal,
  normalizePhoneToE164,
  resendVerificationEmailReal,
} from '../services/authService';
import {
  processAndUploadAvatar,
  updateUserAvatar,
  updateUserPhoneNumber,
} from '../services/dataService';

export function ProfileView() {
  const {
    firebaseUser,
    profile,
    settings,
    theme,
    toggleTheme,
    updateEditorSettings,
    refreshUserData,
    refreshAuthState,
    notify,
  } = useMideo();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [savingName, setSavingName] = useState(false);

  // Profile picture states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [avatarUrlInput, setAvatarUrlInput] = useState('');

  // Contact phone number state (stored privately in Firestore profile, no SMS OTP)
  const [countryCode, setCountryCode] = useState<CountryCode>('NG');
  const [phoneInput, setPhoneInput] = useState(profile?.phoneNumber || '');
  const [savingPhone, setSavingPhone] = useState(false);

  // Account linking states (Google & Email/Password)
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkingEmail, setLinkingEmail] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || '');
  }, [profile?.displayName]);

  useEffect(() => {
    setPhoneInput(profile?.phoneNumber || '');
    const parsed = getCountryInfoFromPhone(profile?.phoneNumber);
    if (parsed?.code) {
      setCountryCode(parsed.code);
    }
  }, [profile?.phoneNumber]);

  const selectedCountry = useMemo(() => getCountryByCode(countryCode), [countryCode]);

  const livePhoneCheck = useMemo(() => {
    if (!phoneInput.trim()) return null;
    return normalizePhoneToE164(selectedCountry, phoneInput);
  }, [selectedCountry, phoneInput]);

  if (!firebaseUser || !profile) return null;

  const linkedProviders = new Set(firebaseUser.providerData.map((p) => p.providerId));
  const hasGoogle = linkedProviders.has('google.com');
  const hasPassword = linkedProviders.has('password');

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = displayName.trim().slice(0, 80);
    if (!clean) return;
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        displayName: clean,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
        displayName: clean,
        updatedAt: serverTimestamp(),
      });
      await refreshUserData();
      notify('success', 'Display name updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update display name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const uploadedUrl = await processAndUploadAvatar(file);
      await updateUserAvatar(firebaseUser.uid, uploadedUrl);
      await refreshUserData();
      notify('success', 'Profile picture updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update profile picture.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveAvatarUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = avatarUrlInput.trim();
    if (!clean) return;
    if (!/^https?:\/\/.+/i.test(clean)) {
      notify('error', 'Enter a valid http:// or https:// image URL.');
      return;
    }
    if (clean.length > 500) {
      notify('error', 'Image URL must be 500 characters or fewer.');
      return;
    }
    setUploadingAvatar(true);
    try {
      await updateUserAvatar(firebaseUser.uid, clean);
      await refreshUserData();
      setAvatarUrlInput('');
      setShowUrlInput(false);
      notify('success', 'Profile picture updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save profile picture URL.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      await updateUserAvatar(firebaseUser.uid, null);
      await refreshUserData();
      notify('info', 'Profile picture removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to remove profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePhoneInputChange = (val: string) => {
    const { formatted, detectedCountry } = formatPhoneAsYouType(val, countryCode);
    setPhoneInput(formatted);
    if (detectedCountry && detectedCountry !== countryCode) {
      setCountryCode(detectedCountry);
    }
  };

  const handleSavePhoneNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setSavingPhone(true);
      try {
        await updateUserPhoneNumber(firebaseUser.uid, null);
        await refreshUserData();
        notify('info', 'Phone number removed from profile.');
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Failed to update phone number.');
      } finally {
        setSavingPhone(false);
      }
      return;
    }
    const normalized = normalizePhoneToE164(selectedCountry, trimmed);
    if (!normalized.valid) {
      notify('error', normalized.error || 'Enter a valid international phone number.');
      return;
    }
    setSavingPhone(true);
    try {
      const countryObj = getCountryByCode(normalized.detectedCountry);
      await updateUserPhoneNumber(firebaseUser.uid, normalized.e164, `${countryObj.name} (${countryObj.code})`);
      await refreshUserData();
      notify('success', 'Phone number updated in your profile.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save phone number.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    try {
      const updated = await linkGoogleAccountReal(firebaseUser);
      if (updated.email) {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          email: updated.email,
          updatedAt: serverTimestamp(),
        });
      }
      await refreshAuthState();
      await refreshUserData();
      notify('success', 'Google account linked to your MideoCode profile.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not link Google account.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkPassword.length < 8) {
      notify('error', 'Password must be at least 8 characters.');
      return;
    }
    setLinkingEmail(true);
    try {
      const updated = await linkEmailAccountReal(firebaseUser, linkEmail, linkPassword);
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        email: updated.email || linkEmail.trim(),
        updatedAt: serverTimestamp(),
      });
      setLinkEmail('');
      setLinkPassword('');
      await refreshAuthState();
      await refreshUserData();
      notify('success', 'Email & password linked. Check your inbox for email verification.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not link email account.');
    } finally {
      setLinkingEmail(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profile &amp; Security Settings
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your profile picture, developer identity, contact details, connected Google/Email providers, and Mideo IDE preferences.
        </p>
      </div>

      {/* Identity Overview & Profile Picture Editor */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="Change profile picture"
                aria-label="Change profile picture"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-slate-900 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-white flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer"
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {profile.displayName}
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {firebaseUser.email || `ID: ${profile.uid.slice(0, 12)}`}
              </div>
              <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                  Level {profile.level} · {profile.xp} XP
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium capitalize">
                  Role: {profile.role}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUrlInput((s) => !s)}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Use Image URL
                </button>
                {profile.photoURL && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:border-red-500 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveDisplayName} className="flex items-center gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={savingName}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {savingName ? 'Saving...' : 'Update Name'}
            </button>
          </form>
        </div>

        {showUrlInput && (
          <form onSubmit={handleSaveAvatarUrl} className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              required
              value={avatarUrlInput}
              onChange={(e) => setAvatarUrlInput(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={uploadingAvatar}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Photo URL
              </button>
              <button
                type="button"
                onClick={() => { setShowUrlInput(false); setAvatarUrlInput(''); }}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Private Contact Phone Number */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSavePhoneNumber} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-500" />
                Contact Phone Number (Private)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value as CountryCode)}
                  aria-label="Country calling code"
                  className="sm:w-44 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.dial}) — {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={(e) => handlePhoneInputChange(e.target.value)}
                  placeholder={`${selectedCountry.dial} phone number or +E.164`}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              {livePhoneCheck && (
                <p
                  className={`text-[11px] font-mono ${
                    livePhoneCheck.valid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {livePhoneCheck.valid
                    ? `Formatted: ${livePhoneCheck.nationalFormatted}`
                    : `Format: ${selectedCountry.dial} number or full +E.164`}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={savingPhone}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {savingPhone ? 'Saving...' : 'Save Phone Number'}
            </button>
          </form>
        </div>
      </section>

      {/* Account Linking (Google & Email/Password) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Connected Sign-In Methods
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Link Google and Email &amp; Password to the same MideoCode account to preserve your projects, course progress, and XP across sign-in methods.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Google */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Google</span>
              {hasGoogle && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </div>
            <p className="text-xs text-slate-500">
              {hasGoogle
                ? `Linked (${firebaseUser.email || 'Google OAuth'})`
                : 'One-click Google Workspace & OAuth sign-in.'}
            </p>
            {!hasGoogle && (
              <button
                onClick={handleLinkGoogle}
                disabled={linkingGoogle}
                className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium cursor-pointer"
              >
                {linkingGoogle ? 'Linking...' : 'Link Google Account'}
              </button>
            )}
          </div>

          {/* Email */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-blue-500" />
                Email &amp; Password
              </span>
              {hasPassword && firebaseUser.emailVerified && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
            </div>
            {hasPassword ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 break-all">{firebaseUser.email}</p>
                {!firebaseUser.emailVerified && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        resendVerificationEmailReal(firebaseUser)
                          .then(() => notify('success', 'Verification email sent.'))
                          .catch((err) => notify('error', err.message))
                      }
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Resend Verification Email
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await refreshAuthState();
                          await refreshUserData();
                          notify('info', 'Checked latest email verification status.');
                        } catch (err) {
                          notify(
                            'error',
                            err instanceof Error ? err.message : 'Unable to refresh auth state.',
                          );
                        }
                      }}
                      className="py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      I&apos;ve Verified — Refresh
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleLinkEmail} className="space-y-2">
                <input
                  type="email"
                  required
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="Password (8+ chars)"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs"
                />
                <button
                  type="submit"
                  disabled={linkingEmail}
                  className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                >
                  {linkingEmail ? 'Linking...' : 'Link Email & Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Theme & IDE Preferences */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-violet-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Interface &amp; Mideo IDE Preferences
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-500">Application Theme</div>
            <button
              onClick={toggleTheme}
              className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 text-xs font-medium cursor-pointer"
            >
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-500">Editor Syntax Theme</div>
            <select
              value={settings?.editorTheme || 'oneDark'}
              onChange={(e) =>
                updateEditorSettings({
                  editorTheme: e.target.value as 'oneDark' | 'githubLight',
                })
              }
              className="w-full py-2 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs"
            >
              <option value="oneDark">One Dark</option>
              <option value="githubLight">GitHub Light</option>
            </select>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-500">Font Size &amp; Tabs</div>
            <div className="flex gap-2">
              <select
                value={settings?.editorFontSize || 14}
                onChange={(e) => updateEditorSettings({ editorFontSize: Number(e.target.value) })}
                className="flex-1 py-2 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs"
              >
                {[12, 13, 14, 15, 16, 18].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}px
                  </option>
                ))}
              </select>
              <select
                value={settings?.tabSize || 2}
                onChange={(e) => updateEditorSettings({ tabSize: Number(e.target.value) as 2 | 4 })}
                className="flex-1 py-2 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-500">Cloud Autosave</div>
            <button
              onClick={() => updateEditorSettings({ autosave: !(settings?.autosave ?? true) })}
              className="w-full py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 text-xs font-medium cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-500" />
              {settings?.autosave ?? true ? 'Autosave Enabled' : 'Manual Save Only'}
            </button>
          </div>
        </div>
      </section>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <span>
          Google OAuth &amp; Email authentication rely on your Firebase Console Authentication provider settings and authorized preview domain. Your contact phone number is stored privately per UID.
        </span>
      </div>
    </div>
  );
}
