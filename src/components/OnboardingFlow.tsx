import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryCode } from 'libphonenumber-js';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Code2,
  EyeOff,
  Flame,
  LayoutDashboard,
  Loader2,
  Moon,
  Music,
  Phone,
  Rocket,
  Sliders,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MideoLogo } from './MideoLogo';
import {
  createProjectWithFiles,
  processAndUploadAvatar,
  saveOnboardingProfile,
  saveUserSettings,
} from '../services/dataService';
import {
  SUPPORTED_COUNTRIES,
  formatPhoneAsYouType,
  getCountryByCode,
  getCountryInfoFromPhone,
  normalizePhoneToE164,
} from '../services/authService';
import { CAREER_PATHWAYS } from '../data/challengesData';
import { focusSound } from '../utils/focusSound';
import type {
  AiStylePreference,
  EditorTheme,
  ExperienceLevel,
  FocusAudioPreference,
  ThemeMode,
  WorkspaceStartMode,
} from '../types/mideocode';

const LANGUAGE_OPTIONS = ['HTML/CSS', 'JavaScript', 'TypeScript', 'Python', 'SQL', 'Go', 'Rust', 'Java'];
const GOAL_OPTIONS = [
  'Launch a developer career',
  'Build full-stack web apps',
  'Master algorithms & interviews',
  'Automate workflows with Python',
  'Learn database design',
];
const INTEREST_OPTIONS = ['Frontend UI', 'Backend APIs', 'Algorithms', 'Databases', 'AI Tooling', 'Cloud Workspaces'];
const HEAR_ABOUT_US_OPTIONS = ['Google Search', 'Twitter / X', 'YouTube', 'Friend / Colleague', 'AI Studio / Google Cloud', 'GitHub', 'Other'];
const PRIMARY_FOCUS_OPTIONS = ['Full-Stack Web Development', 'AI Tooling & Automation', 'Cloud Architecture & DevOps', 'Algorithms & Competitive Coding', 'Mobile & Cross-Platform'];
const CODING_COMMITMENT_OPTIONS = ['Less than 5 hours / week', '5 - 15 hours / week', '15 - 35 hours / week', '35+ hours / week'];

const STARTING_MODE_OPTIONS: Array<{
  id: WorkspaceStartMode;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', title: 'Dashboard', desc: 'Overview, XP, streak & quick links', icon: LayoutDashboard },
  { id: 'academy', title: 'Learn & Courses', desc: 'Interactive lessons & quizzes', icon: BookOpen },
  { id: 'ide', title: 'Cloud IDE', desc: 'Jump straight into writing code', icon: Code2 },
  { id: 'missions', title: 'Missions', desc: 'Real-world engineering tasks', icon: Rocket },
  { id: 'challenges', title: 'Challenges', desc: 'Algorithms & interview drills', icon: Flame },
];

type StarterTemplateId = 'none' | 'web' | 'javascript' | 'python' | 'sql';

const STARTER_TEMPLATES: Array<{
  id: StarterTemplateId;
  title: string;
  badge: string;
  language: 'web' | 'javascript' | 'python' | 'sql';
  files: { name: string; folder: string; language: string; content: string }[];
}> = [
  {
    id: 'none',
    title: 'No Starter Project',
    badge: 'Empty',
    language: 'web',
    files: [],
  },
  {
    id: 'web',
    title: 'Web App Starter',
    badge: 'HTML/CSS/JS',
    language: 'web',
    files: [
      {
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My MideoCode App</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="card">
      <h1>Hello, MideoCode!</h1>
      <p id="status">Ready to build something great.</p>
      <button id="btn">Click me</button>
    </main>
    <script src="app.js"></script>
  </body>
</html>`,
      },
      {
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `body {
  font-family: system-ui, sans-serif;
  background: #0b1120;
  color: #f8fafc;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
}
.card {
  padding: 2rem;
  border-radius: 1rem;
  background: #111827;
  border: 1px solid #1e293b;
  text-align: center;
}
button {
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  border: none;
  background: #2563eb;
  color: white;
  cursor: pointer;
}`,
      },
      {
        name: 'app.js',
        folder: '',
        language: 'javascript',
        content: `let clicks = 0;
const btn = document.getElementById('btn');
const status = document.getElementById('status');

btn?.addEventListener('click', () => {
  clicks += 1;
  if (status) status.textContent = \`Clicked \${clicks} time\${clicks === 1 ? '' : 's'}!\`;
});`,
      },
    ],
  },
  {
    id: 'javascript',
    title: 'JavaScript Sandbox',
    badge: 'Node / JS',
    language: 'javascript',
    files: [
      {
        name: 'index.js',
        folder: '',
        language: 'javascript',
        content: `function greetDeveloper(name) {
  return \`Welcome to your MideoCode workspace, \${name}!\`;
}

console.log(greetDeveloper('Builder'));
`,
      },
    ],
  },
  {
    id: 'python',
    title: 'Python Starter',
    badge: 'Python 3',
    language: 'python',
    files: [
      {
        name: 'main.py',
        folder: '',
        language: 'python',
        content: `def summarize_tasks(tasks):
    return [f"{i + 1}. {task}" for i, task in enumerate(tasks)]

if __name__ == "__main__":
    plan = summarize_tasks(["Set up workspace", "Write clean code", "Ship project"])
    for line in plan:
        print(line)
`,
      },
    ],
  },
  {
    id: 'sql',
    title: 'SQL Playground',
    badge: 'SQLite',
    language: 'sql',
    files: [
      {
        name: 'schema.sql',
        folder: '',
        language: 'sql',
        content: `CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  stars INTEGER DEFAULT 0
);

INSERT INTO projects (title, language, stars)
VALUES
  ('Portfolio Site', 'HTML/CSS', 12),
  ('API Service', 'Python', 24);

SELECT title, language, stars FROM projects ORDER BY stars DESC;
`,
      },
    ],
  },
];

export function OnboardingFlow() {
  const {
    firebaseUser,
    profile,
    settings,
    theme,
    previewTheme,
    setActiveView,
    setActiveIdeProjectId,
    setIdeFocusMode,
    refreshUserData,
    notify,
  } = useMideo();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Learning Profile
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
  const [hearAboutUs, setHearAboutUs] = useState(profile?.hearAboutUs || 'Google Search');
  const [primaryFocus, setPrimaryFocus] = useState(profile?.primaryFocus || 'Full-Stack Web Development');
  const [codingCommitment, setCodingCommitment] = useState(profile?.codingCommitment || '15 - 35 hours / week');
  const [careerPathId, setCareerPathId] = useState(profile?.activeCareerPathId || 'frontend-developer');

  // Step 2: IDE & Workspace Setup
  const [appTheme, setAppTheme] = useState<ThemeMode>(settings?.theme || theme || 'dark');
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(settings?.editorTheme || 'oneDark');
  const [editorFontSize, setEditorFontSize] = useState<number>(settings?.editorFontSize || 14);
  const [tabSize, setTabSize] = useState<2 | 4>(settings?.tabSize || 2);
  const [autosave, setAutosave] = useState<boolean>(settings?.autosave ?? true);
  const [startingView, setStartingView] = useState<WorkspaceStartMode>(
    settings?.startingView || profile?.startingView || 'dashboard',
  );
  const [starterTemplateId, setStarterTemplateId] = useState<StarterTemplateId>('web');
  const [aiStylePreference, setAiStylePreference] = useState<AiStylePreference>(
    settings?.aiStylePreference || profile?.aiStylePreference || 'balanced',
  );
  const [defaultFocusMode, setDefaultFocusMode] = useState<boolean>(
    settings?.defaultFocusMode ?? profile?.defaultFocusMode ?? false,
  );
  const [defaultFocusAudio, setDefaultFocusAudio] = useState<FocusAudioPreference>(
    settings?.defaultFocusAudio || profile?.defaultFocusAudio || 'off',
  );

  const [saving, setSaving] = useState(false);
  const [photoImgError, setPhotoImgError] = useState(false);

  useEffect(() => {
    if (profile?.displayName && !displayName) {
      setDisplayName(profile.displayName);
    }
    if (profile?.photoURL && !photoURL) {
      setPhotoURL(profile.photoURL);
    }
    if (profile?.phoneNumber && !phoneInput) {
      setPhoneInput(profile.phoneNumber);
      const parsed = getCountryInfoFromPhone(profile.phoneNumber);
      if (parsed?.code) {
        setCountryCode(parsed.code);
      }
    }
  }, [profile?.displayName, profile?.photoURL, profile?.phoneNumber, displayName, photoURL, phoneInput]);

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
      setPhotoImgError(false);
      notify('success', 'Profile photo uploaded.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSelectTheme = (nextTheme: ThemeMode) => {
    setAppTheme(nextTheme);
    setEditorTheme(nextTheme === 'dark' ? 'oneDark' : 'githubLight');
    previewTheme(nextTheme);
  };

  const handleSelectStarterForLanguages = (nextLangs: string[]) => {
    if (nextLangs.includes('Python') && !nextLangs.includes('HTML/CSS') && !nextLangs.includes('JavaScript')) {
      setStarterTemplateId('python');
    } else if (nextLangs.includes('SQL') && !nextLangs.includes('HTML/CSS') && !nextLangs.includes('JavaScript')) {
      setStarterTemplateId('sql');
    } else if (nextLangs.includes('JavaScript') && !nextLangs.includes('HTML/CSS')) {
      setStarterTemplateId('javascript');
    }
  };

  const handleSubmit = async (e?: React.FormEvent, skipOptional = false) => {
    if (e) e.preventDefault();
    setPhoneError(null);

    let validatedPhone: string | undefined;
    let resolvedCountry: string | undefined;
    if (phoneInput.trim()) {
      const check = normalizePhoneToE164(selectedCountry, phoneInput);
      if (check.valid) {
        validatedPhone = check.e164;
        const countryObj = getCountryByCode(check.detectedCountry);
        resolvedCountry = `${countryObj.name} (${countryObj.code})`;
      } else {
        validatedPhone = phoneInput.trim().slice(0, 32);
        resolvedCountry = `${selectedCountry.name} (${selectedCountry.code})`;
      }
    }

    const chosenStartView: WorkspaceStartMode = skipOptional ? 'dashboard' : startingView;
    const chosenTemplateId: StarterTemplateId = skipOptional ? 'none' : starterTemplateId;
    const chosenFocusMode = skipOptional ? false : defaultFocusMode;
    const chosenFocusAudio: FocusAudioPreference = skipOptional ? 'off' : defaultFocusAudio;
    const chosenAiStyle: AiStylePreference = skipOptional ? 'balanced' : aiStylePreference;

    setSaving(true);
    try {
      const cleanDisplayName = displayName.trim() || profile.displayName || 'Developer';

      await Promise.all([
        saveOnboardingProfile(firebaseUser.uid, {
          displayName: cleanDisplayName,
          phoneNumber: validatedPhone,
          country: resolvedCountry,
          photoURL: photoURL.trim() || undefined,
          experienceLevel: experience,
          preferredLanguages: skipOptional ? ['JavaScript'] : languages.length ? languages : ['JavaScript'],
          learningGoals: skipOptional ? ['Learn programming fundamentals'] : goals,
          interests: skipOptional ? ['Web Development'] : interests,
          hearAboutUs,
          primaryFocus,
          codingCommitment,
          activeCareerPathId: careerPathId,
          startingView: chosenStartView,
          aiStylePreference: chosenAiStyle,
          defaultFocusMode: chosenFocusMode,
          defaultFocusAudio: chosenFocusAudio,
          starterTemplateId: chosenTemplateId,
        }),
        saveUserSettings(firebaseUser.uid, {
          theme: appTheme,
          editorTheme,
          editorFontSize,
          tabSize,
          autosave,
          startingView: chosenStartView,
          aiStylePreference: chosenAiStyle,
          defaultFocusMode: chosenFocusMode,
          defaultFocusAudio: chosenFocusAudio,
        }),
      ]);

      if (chosenTemplateId !== 'none') {
        const template = STARTER_TEMPLATES.find((t) => t.id === chosenTemplateId);
        if (template && template.files.length > 0) {
          try {
            const created = await createProjectWithFiles(firebaseUser.uid, cleanDisplayName, {
              title: template.title,
              description: `Personalized starter workspace (${template.badge})`,
              language: template.language,
              files: template.files,
            });
            setActiveIdeProjectId(created.project.id);
          } catch {
            // Non-blocking if starter project creation fails
          }
        }
      }

      if (chosenFocusAudio !== 'off') {
        focusSound.play(chosenFocusAudio);
      }

      await refreshUserData();

      setActiveView(chosenStartView);
      if (chosenStartView === 'ide' && chosenFocusMode) {
        setIdeFocusMode(true);
      }

      notify('success', 'Your personalized MideoCode workspace is ready.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save workspace preferences.');
    } finally {
      setSaving(false);
    }
  };

  const indentSpaces = ' '.repeat(tabSize);
  const previewIsDark = editorTheme === 'oneDark';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-9 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <MideoLogo variant="full" heightClass="h-10" />
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(undefined, true)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            Skip optional steps →
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Welcome to MideoCode</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Personalize your workspace</h1>
          </div>

          {/* 2-Step Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                step === 1
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              1. Learning Profile
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                step === 2
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              2. IDE &amp; Workspace
            </button>
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {step === 1 ? (
            <>
              {/* Profile Photo & Display Name */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                <div className="sm:col-span-4 flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    {photoURL && !photoImgError ? (
                      <img
                        src={photoURL}
                        alt={displayName || 'Profile avatar'}
                        referrerPolicy="no-referrer"
                        onError={() => setPhotoImgError(true)}
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
                      accept="image/*"
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
                      placeholder={`${selectedCountry.dial} phone number (optional)`}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                {phoneError ? (
                  <p className="text-xs text-red-500 mt-1.5">{phoneError}</p>
                ) : livePhoneCheck?.valid ? (
                  <p className="text-xs font-mono mt-1.5 text-emerald-600 dark:text-emerald-400">
                    Formatted: {livePhoneCheck.nationalFormatted}
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
                        onClick={() => {
                          const next = active ? languages.filter((i) => i !== lang) : [...languages, lang];
                          setLanguages(next);
                          handleSelectStarterForLanguages(next);
                        }}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium mb-2">Primary Development Focus</label>
                  <select
                    value={primaryFocus}
                    onChange={(e) => setPrimaryFocus(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                  >
                    {PRIMARY_FOCUS_OPTIONS.map((focus) => (
                      <option key={focus} value={focus}>
                        {focus}
                      </option>
                    ))}
                  </select>
                </div>
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

              <div>
                <label className="block text-sm font-medium mb-2">Weekly Coding Commitment</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CODING_COMMITMENT_OPTIONS.map((comm) => (
                    <button
                      key={comm}
                      type="button"
                      onClick={() => setCodingCommitment(comm)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors cursor-pointer ${
                        codingCommitment === comm
                          ? 'border-emerald-600 bg-emerald-600/15 text-emerald-600 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      {comm}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Where did you hear about us?</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {HEAR_ABOUT_US_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setHearAboutUs(opt)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors cursor-pointer ${
                        hearAboutUs === opt
                          ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer ml-auto"
                >
                  Next: IDE &amp; Workspace Setup
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 1. Theme & Editor Preferences + Live Code Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-500" />
                    Theme &amp; Editor Appearance
                  </label>
                  <span className="text-[11px] text-slate-500">Updates live preview</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-6 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('dark')}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                          appTheme === 'dark'
                            ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Moon className="w-4 h-4 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold">Dark Mode</div>
                          <div className="text-[10px] opacity-75">Low-glare studio</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectTheme('light')}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                          appTheme === 'light'
                            ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Sun className="w-4 h-4 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold">Light Mode</div>
                          <div className="text-[10px] opacity-75">Crisp daylight</div>
                        </div>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Syntax Theme</label>
                        <select
                          value={editorTheme}
                          onChange={(e) => setEditorTheme(e.target.value as EditorTheme)}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        >
                          <option value="oneDark">One Dark</option>
                          <option value="githubLight">GitHub Light</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Font Size</label>
                        <select
                          value={editorFontSize}
                          onChange={(e) => setEditorFontSize(Number(e.target.value))}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        >
                          {[12, 13, 14, 15, 16, 18].map((sz) => (
                            <option key={sz} value={sz}>
                              {sz}px
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Tab Indent</label>
                        <select
                          value={tabSize}
                          onChange={(e) => setTabSize(Number(e.target.value) as 2 | 4)}
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        >
                          <option value={2}>2 spaces</option>
                          <option value={4}>4 spaces</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 cursor-pointer">
                      <span className="text-xs font-medium">Cloud Autosave in IDE</span>
                      <input
                        type="checkbox"
                        checked={autosave}
                        onChange={(e) => setAutosave(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-700 accent-blue-600"
                      />
                    </label>
                  </div>

                  {/* Live Mini Code Preview */}
                  <div
                    className={`lg:col-span-6 rounded-xl border p-3.5 font-mono overflow-hidden ${
                      previewIsDark
                        ? 'bg-[#0A0F1C] border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                    style={{ fontSize: `${editorFontSize}px`, lineHeight: 1.55 }}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-60 pb-2 mb-2 border-b border-current/10">
                      <span>workspace-preview.ts</span>
                      <span>
                        {editorTheme === 'oneDark' ? 'One Dark' : 'GitHub Light'} · {tabSize}sp
                      </span>
                    </div>
                    <pre className="m-0 whitespace-pre overflow-x-auto">
                      <code>
                        <span className={previewIsDark ? 'text-violet-400' : 'text-purple-700'}>function</span>{' '}
                        <span className={previewIsDark ? 'text-sky-300' : 'text-blue-700'}>launchWorkspace</span>
                        {'(user: string) {\n'}
                        {indentSpaces}
                        <span className={previewIsDark ? 'text-violet-400' : 'text-purple-700'}>return</span>{' '}
                        <span className={previewIsDark ? 'text-emerald-400' : 'text-emerald-700'}>
                          {`\`Ready, \${user}!\``}
                        </span>
                        {';\n}'}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* 2. Starting Workspace Mode */}
              <div>
                <label className="block text-sm font-semibold mb-2">How do you want to start?</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {STARTING_MODE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = startingView === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStartingView(opt.id)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col gap-1.5 ${
                          active
                            ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <div className="text-xs font-semibold">{opt.title}</div>
                        <div className="text-[10px] opacity-75 leading-snug">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Auto-Create Starter Project */}
              <div>
                <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  Auto-Create a Starter Project in Your IDE
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {STARTER_TEMPLATES.map((tpl) => {
                    const active = starterTemplateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setStarterTemplateId(tpl.id)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-600 bg-emerald-600/15 text-emerald-600 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        <div className="text-[10px] font-mono uppercase opacity-70">{tpl.badge}</div>
                        <div className="text-xs font-semibold mt-0.5">{tpl.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Mideo AI & Focus Defaults */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    Mideo AI Style
                  </div>
                  <select
                    value={aiStylePreference}
                    onChange={(e) => setAiStylePreference(e.target.value as AiStylePreference)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                  >
                    <option value="fast">Fast &amp; Concise</option>
                    <option value="balanced">Balanced (Smart + Quick)</option>
                    <option value="deep">Deep Step-by-Step Mentor</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-blue-500" />
                    IDE Focus Mode
                  </div>
                  <button
                    type="button"
                    onClick={() => setDefaultFocusMode((prev) => !prev)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      defaultFocusMode
                        ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {defaultFocusMode ? 'Distraction-Free On' : 'Standard Layout'}
                  </button>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-emerald-500" />
                    Focus Audio
                  </div>
                  <select
                    value={defaultFocusAudio}
                    onChange={(e) => setDefaultFocusAudio(e.target.value as FocusAudioPreference)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                  >
                    <option value="off">Off</option>
                    <option value="lofi">Lofi Chill</option>
                    <option value="rain">Cozy Rain</option>
                    <option value="whitenoise">White Noise</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Learning Profile
                </button>

                <button
                  type="submit"
                  disabled={saving || uploadingPhoto}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Launch My Workspace
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
