import { useState } from 'react';
import { ArrowRight, Code2, ShieldCheck, Layers, Cpu, Terminal, BookOpen, Play } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MideoLogo } from './MideoLogo';
import { INTRO_VIDEO_URL, IntroVideoModal } from './IntroVideoModal';
import heroWorkspaceImg from '../assets/images/hero_mideocode_workspace_1795027184634.jpg';
import academySystemsImg from '../assets/images/academy_systems_visual_1795027183898.jpg';
import projectsBuilderImg from '../assets/images/projects_builder_visual_1795027185442.jpg';

export function LandingPage() {
  const { openAuthModal, theme, toggleTheme } = useMideo();
  const [introOpen, setIntroOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
      {/* Top Bar Contract: 3 zones — Official Logo, 4 concise single-line links, 1 primary CTA */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#070B14]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" aria-label="MideoCode Home" className="inline-flex items-center shrink-0">
            <MideoLogo variant="full" heightClass="h-10 sm:h-11" className="hidden sm:inline-flex" />
            <MideoLogo variant="mark" heightClass="h-8" className="inline-flex sm:hidden" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#academy" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Academy
            </a>
            <a href="#ide" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Cloud IDE
            </a>
            <a href="#systems" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Ecosystem
            </a>
            <a href="#security" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Security
            </a>
          </nav>

          <div className="shrink-0">
            <button
              onClick={() => openAuthModal('register')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section: 2-Column Balanced Split */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4">
                Learn. Code. Build. Become.
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.08] text-slate-900 dark:text-white text-balance mb-6">
                One engineering platform from first line to shipped software.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mb-8">
                MideoCode unifies structured courses, a multi-file Cloud IDE, Gemini-powered assistance, interactive labs, isolated coding challenges, and verified career roadmaps inside one connected workspace.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => openAuthModal('register')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Create Free Account
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openAuthModal('signin')}
                  className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign In
                </button>
                {INTRO_VIDEO_URL && (
                  <button
                    onClick={() => setIntroOpen(true)}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-300 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Watch Intro (40s)
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative">
                <img
                  src={heroWorkspaceImg}
                  alt="MideoCode software engineering workstation"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-xs text-slate-200">
                  <span>Multi-file CodeMirror IDE · Live Preview</span>
                  <span>Isolated JS & Python Runtimes</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column Architectural Strip */}
          <div className="mt-16 pt-10 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">12 Systems</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Academy, IDE, AI, Labs, Docs, Projects, Challenges, Quest, Community, Career, Cloud, Playground.
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">Real Firebase Auth</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Google OAuth and verified email/password authentication with seamless account linking.
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">Isolated Execution</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Sandboxed browser HTML/CSS/JS preview plus isolated Node VM and Python 3 challenge evaluators.
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">Cloud Versioning</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Firestore-synced multi-file workspaces, snapshot history, conflict detection, and safe recovery.
              </p>
            </div>
          </div>
        </section>

        {/* Mechanism Section 01-04 */}
        <section id="academy" className="border-t border-slate-200 dark:border-slate-800/80 py-20 bg-white dark:bg-[#0A0F1C]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-14">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Connected workflows instead of isolated tabs.
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Every lesson, reference article, experiment, and project links directly into your active coding workspace and cloud history.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1629]">
                  <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-4" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">01. Academy to IDE</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Open any course code example directly inside Mideo IDE as a cloud-saved multi-file project, or ask Mideo AI to explain selected lines.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1629]">
                  <Terminal className="w-5 h-5 text-violet-600 dark:text-violet-400 mb-4" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">02. Verified Challenges</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Submit JavaScript and Python solutions to isolated test runners with protected hidden test cases and backend-verified XP rewards.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1629]">
                  <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-4" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">03. Context-Aware Mideo AI</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Switch between Learn, Debug, Explain, Practice, Build, and Review modes with explicit user consent before sharing workspace code.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F1629]">
                  <Layers className="w-5 h-5 text-violet-600 dark:text-violet-400 mb-4" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">04. Cloud Version Control</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Snapshot project milestones, detect concurrent edit conflicts before overwriting, and export workspaces anytime.
                  </p>
                </div>
              </div>

              <div id="ide" className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[280px]">
                <img
                  src={academySystemsImg}
                  alt="Modular programming systems architecture"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Systems & Security Showcase */}
        <section id="systems" className="border-t border-slate-200 dark:border-slate-800/80 py-20">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[280px]">
              <img
                src={projectsBuilderImg}
                alt="Developer building real software projects"
                className="w-full h-full object-cover"
              />
            </div>

            <div id="security" className="lg:col-span-7 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 mb-3">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero-Trust Architecture</span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance mb-4">
                Built with verified identity, isolated sandboxes, and strict data ownership.
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                Authentication runs exclusively through Firebase Auth. Backend endpoints verify Firebase ID tokens, keep API keys strictly server-side, isolate untrusted submissions, and enforce Firestore security rules per UID.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-300 mb-8">
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                  <strong className="block text-slate-900 dark:text-white mb-1">Private by Default</strong>
                  Projects and playgrounds stay private unless you explicitly publish them.
                </div>
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                  <strong className="block text-slate-900 dark:text-white mb-1">PII Isolation</strong>
                  Email and phone records are strictly restricted to your own UID.
                </div>
              </div>

              <div>
                <button
                  onClick={() => openAuthModal('register')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  <Code2 className="w-4 h-4" />
                  Launch MideoCode Workspace
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <a href="#top" aria-label="MideoCode Home" className="inline-flex items-center shrink-0">
              <MideoLogo variant="full" heightClass="h-12" />
            </a>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Learn. Code. Build. Become.
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={toggleTheme} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
              Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme
            </button>
            <button onClick={() => openAuthModal('signin')} className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
              Sign In
            </button>
          </div>
        </div>
      </footer>

      {INTRO_VIDEO_URL && (
        <IntroVideoModal isOpen={introOpen} onClose={() => setIntroOpen(false)} />
      )}
    </div>
  );
}
