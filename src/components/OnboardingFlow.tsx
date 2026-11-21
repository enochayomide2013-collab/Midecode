import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryCode } from 'libphonenumber-js';
import { Check, ArrowRight, Loader2, Phone, Camera } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MideoLogo } from './MideoLogo';
import { processAndUploadAvatar, saveOnboardingProfile } from '../services/dataService';
import {
  SUPPORTED_COUNTRIES,
  formatPhoneAsYouType,
  getCountryByCode,
  normalizePhoneToE164,
} from '../services/authService';
import { CAREER_PATHWAYS } from '../data/challengesData';
import type { ExperienceLevel } from '../types/mideocode';

const LANGUAGE_OPTIONS = ['HTML/CSS', 'JavaScript', 'TypeScript', 'Python', 'SQL', 'Go', 'Rust', 'Java'];
const GOAL_OPTIONS = [
  'Launch a developer career',
  'Build full-stack web apps',
  'Master algorithms & interviews',
  'Automate workflows with Python',
  'Learn database design',
];
const INTEREST_OPTIONS = ['Frontend UI', 'Backend APIs', 'Algorithms', 'Databases', 'AI Tooling', 'Cloud Workspaces'];

export function OnboardingFlow() {
  const { firebaseUser, profile, refreshUserData, notify } = useMideo();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [countryCode, setCountryCode] = useState<CountryCode>('NG');
  const [phoneInput, setPhoneInput] = useState(profile?.phoneNumber || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [experience, setExperience] = useState<ExperienceLevel>(profile?.experienceLevel || 'beginner');
  const [languages, setLanguages] = useState<string[]>(profile?.preferredLanguages || ['JavaScript', 'HTML/CSS']);
  const [goals, setGoals] = useState<string[]>(profile?.learningGoals || ['Build full-stack web apps']);
  const [interests, setInterests] = useState<string[]>(profile?.interests || ['Frontend UI']);
  const [careerPathId, setCareerPathId] = useState(profile?.activeCareerPathId || 'frontend-developer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.displayName && !displayName) {
      setDisplayName(profile.displayName);
    }
  }, [profile?.displayName, displayName]);

  const selectedCountry = useMemo(() => getCountryByCode(countryCode), [countryCode]);

  const livePhoneCheck = useMemo(() => {
    if (!phoneInput.trim()) return null;
    return normalizePhoneToE164(selectedCountry, phoneInput);
  }, [selectedCountry, phoneInput]);

  if (!firebaseUser || !profile) return null;

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const handlePhoneInputChange = (val: string) => {
    setPhoneError(null);
    const { formatted, detectedCountry } = formatPhoneAsYouType(val, countryCode);
    setPhoneInput(formatted);
    if (detectedCountry && detectedCountry !== countryCode) {
      setCountryCode(detectedCountry);
    }
  };

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const uploadedUrl = await processAndUploadAvatar(file);
      setPhotoURL(uploadedUrl);
      notify('success', 'Profile photo uploaded.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e?: React.FormEvent, skipOptional = false) => {
    if (e) e.preventDefault();
    setPhoneError(null);

    let validatedPhone: string | undefined;
    let resolvedCountry: string | undefined;
    if (phoneInput.trim()) {
      const check = normalizePhoneToE164(selectedCountry, phoneInput);
      if (!check.valid) {
        if (!skipOptional) {
          setPhoneError(check.error || 'Please enter a valid phone number.');
          return;
        }
      } else {
        validatedPhone = check.e164;
        const countryObj = getCountryByCode(check.detectedCountry);
        resolvedCountry = `${countryObj.name} (${countryObj.code})`;
      }
    }

    setSaving(true);
    try {
      await saveOnboardingProfile(firebaseUser.uid, {
        displayName: displayName.trim() || profile.displayName || 'Developer',
        phoneNumber: validatedPhone,
        country: resolvedCountry,
        photoURL: photoURL.trim() || undefined,
        experienceLevel: experience,
        preferredLanguages: skipOptional ? ['JavaScript'] : languages.length ? languages : ['JavaScript'],
        learningGoals: skipOptional ? ['Learn programming fundamentals'] : goals,
        interests: skipOptional ? ['Web Development'] : interests,
        activeCareerPathId: careerPathId,
      });
      await refreshUserData();
      notify('success', 'Your personalized MideoCode roadmap is ready.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save onboarding preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-10">
        <div className="mb-6">
          <MideoLogo variant="full" heightClass="h-11" />
        </div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Welcome to MideoCode</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Personalize your workspace</h1>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(undefined, true)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            Skip optional steps
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-7">
          {/* Profile Photo & Display Name */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
            <div className="sm:col-span-4 flex items-center gap-3.5">
              <div className="relative shrink-0">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={displayName || 'Profile avatar'}
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                    {(displayName || profile.displayName || 'M').charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  title="Upload profile picture"
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-slate-900 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-white flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarSelected}
                  className="hidden"
                />
              </div>
              <div className="text-xs">
                <div className="font-medium text-slate-800 dark:text-slate-200">Profile Picture</div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="text-blue-600 dark:text-blue-400 hover:underline mt-0.5 cursor-pointer"
                >
                  {uploadingPhoto ? 'Uploading...' : photoURL ? 'Change photo' : 'Upload photo'}
                </button>
              </div>
            </div>

            <div className="sm:col-span-8">
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your developer name"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Phone Number Question */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Phone Number <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Stored privately in your profile so we understand your region and can support your account.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value as CountryCode)}
                aria-label="Country calling code"
                className="sm:w-52 px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.dial})
                  </option>
                ))}
              </select>
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={(e) => handlePhoneInputChange(e.target.value)}
                  placeholder={`${selectedCountry.dial} phone number or +international (optional)`}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
            {phoneError ? (
              <p className="text-xs text-red-500 mt-1.5">{phoneError}</p>
            ) : livePhoneCheck ? (
              <p
                className={`text-xs font-mono mt-1.5 ${
                  livePhoneCheck.valid
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {livePhoneCheck.valid
                  ? `Formatted: ${livePhoneCheck.nationalFormatted}`
                  : `Enter a valid ${selectedCountry.name} (${selectedCountry.dial}) or +E.164 phone number`}
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Current Programming Experience</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setExperience(lvl)}
                  className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    experience === lvl
                      ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="text-sm font-semibold capitalize">{lvl}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lvl === 'beginner'
                      ? 'Starting from fundamentals'
                      : lvl === 'intermediate'
                        ? 'Built small apps or scripts'
                        : 'Shipping production code'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Preferred Languages</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleItem(languages, setLanguages, lang)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Primary Career Focus</label>
            <select
              value={careerPathId}
              onChange={(e) => setCareerPathId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
            >
              {CAREER_PATHWAYS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Learning Goals</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((g) => {
                const active = goals.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleItem(goals, setGoals, g)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-violet-600 bg-violet-600/15 text-violet-600 dark:text-violet-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Areas of Interest</label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((item) => {
                const active = interests.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleItem(interests, setInterests, item)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Build My Roadmap &amp; Enter Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
