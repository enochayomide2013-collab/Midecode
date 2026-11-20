import React, { useState } from 'react';
import { CheckCircle2, Code2, Eye, FlaskConical, GitCommitHorizontal, Globe, Layers, Lock, Plus, Rocket, Users } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { GUIDED_PROJECTS } from '../data/projectsData';
import { updateProjectMeta } from '../services/dataService';
import { getProjectFiles } from '../services/dataService';
import { extractReadableError } from '../services/firebase';
import type { Project } from '../types/mideocode';

export function ProjectsView() {
  const {
    firebaseUser,
    projects,
    sharedProjects,
    openInIde,
    setActiveIdeProjectId,
    setActiveView,
    openVersionsForProject,
    openTestLabForProject,
    openCollabForProject,
    openArchitectForProject,
    refreshUserData,
    grantXp,
    notify,
  } = useMideo();

  const [langFilter, setLangFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [customModal, setCustomModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customLang, setCustomLang] = useState<'web' | 'javascript' | 'python'>('web');

  const filteredTemplates = GUIDED_PROJECTS.filter((tpl) => {
    const matchLang = langFilter === 'all' || tpl.language === langFilter;
    const matchDiff = diffFilter === 'all' || tpl.difficulty === diffFilter;
    return matchLang && matchDiff;
  });

  const handleToggleMilestone = async (proj: Project, milestoneId: string) => {
    try {
      const current = proj.milestonesCompleted || [];
      const next = current.includes(milestoneId)
        ? current.filter((m) => m !== milestoneId)
        : [...current, milestoneId];
      await updateProjectMeta(proj.id, { milestonesCompleted: next });
      await refreshUserData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update milestone.');
    }
  };

  const handleCompleteProject = async (proj: Project) => {
    const tpl = GUIDED_PROJECTS.find((t) => t.id === proj.guidedProjectId);
    if (tpl && (proj.milestonesCompleted?.length || 0) < tpl.milestones.length) {
      notify('error', 'Complete all project milestones before marking the project complete.');
      return;
    }
    try {
      await updateProjectMeta(proj.id, { status: 'completed', isPortfolio: true });
      await grantXp('project', proj.id, `Completed project: ${proj.title}`);
      await refreshUserData();
    } catch (err) {
      notify('error', extractReadableError(err, 'Unable to mark project complete.'));
    }
  };

  const handleToggleVisibility = async (proj: Project) => {
    const nextVis = proj.visibility === 'public' ? 'private' : 'public';
    try {
      const files = await getProjectFiles(proj.id);
      await updateProjectMeta(proj.id, { visibility: nextVis }, files);
      await refreshUserData();
      notify('info', `Project "${proj.title}" is now ${nextVis}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update project visibility.');
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    const starterFiles =
      customLang === 'python'
        ? [{ name: 'main.py', folder: '', language: 'python', content: '# ' + customTitle + '\nprint("Ready")\n' }]
        : customLang === 'javascript'
          ? [{ name: 'index.js', folder: '', language: 'javascript', content: '// ' + customTitle + '\nconsole.log("Ready");\n' }]
          : [
              { name: 'index.html', folder: '', language: 'html', content: `<h1>${customTitle}</h1>\n<p>${customDesc}</p>` },
              { name: 'styles.css', folder: '', language: 'css', content: 'body { font-family: system-ui, sans-serif; padding: 24px; }' },
              { name: 'script.js', folder: '', language: 'javascript', content: 'console.log("App started");' },
            ];
    try {
      setCustomModal(false);
      await openInIde({
        title: customTitle.trim(),
        language: customLang,
        files: starterFiles,
      });
      setCustomTitle('');
      setCustomDesc('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create custom project.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mideo Projects</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Guided engineering builds and custom portfolio projects synced with Mideo IDE and Mideo Cloud.
          </p>
        </div>
        <button
          onClick={() => setCustomModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Start Blank Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {['all', 'web', 'python'].map((l) => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              className={`px-3 py-1 rounded text-xs font-medium capitalize cursor-pointer ${
                langFilter === l ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {l === 'all' ? 'All Languages' : l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {['all', 'beginner', 'intermediate'].map((d) => (
            <button
              key={d}
              onClick={() => setDiffFilter(d)}
              className={`px-3 py-1 rounded text-xs font-medium capitalize cursor-pointer ${
                diffFilter === d ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {d === 'all' ? 'All Levels' : d}
            </button>
          ))}
        </div>
      </div>

      {/* Guided Project Blueprints */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTemplates.map((tpl) => (
          <div key={tpl.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 flex flex-col justify-between space-y-5">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                {tpl.category} · {tpl.language} · {tpl.difficulty}
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tpl.title}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{tpl.description}</p>

              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Objectives & Milestones</p>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">
                  {tpl.milestones.map((m) => (
                    <li key={m.id}>{m.title}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500">{tpl.starterFiles.length} starter files</span>
              <button
                onClick={() =>
                  openInIde({
                    title: tpl.title,
                    language: tpl.language,
                    guidedProjectId: tpl.id,
                    files: tpl.starterFiles,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                Start Guided Project
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Active & Portfolio Projects */}
      {firebaseUser && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your Projects & Portfolio</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-slate-500">Start any guided or blank project above to build your portfolio.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {projects.map((proj) => {
                const tpl = GUIDED_PROJECTS.find((t) => t.id === proj.guidedProjectId);
                return (
                  <div key={proj.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {proj.language} · {proj.status} · v{proj.version}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">{proj.title}</h3>
                      </div>
                      <button
                        onClick={() => handleToggleVisibility(proj)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                      >
                        {proj.visibility === 'public' ? <Globe className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5" />}
                        {proj.visibility === 'public' ? 'Public' : 'Private'}
                      </button>
                    </div>

                    {tpl && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Milestone Checklist</p>
                        {tpl.milestones.map((m) => {
                          const checked = proj.milestonesCompleted?.includes(m.id);
                          return (
                            <label key={m.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(checked)}
                                onChange={() => handleToggleMilestone(proj, m.id)}
                              />
                              <span className={checked ? 'line-through text-slate-400' : ''}>{m.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveIdeProjectId(proj.id);
                            setActiveView('ide');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          Open in IDE
                        </button>
                        <button
                          onClick={() => openVersionsForProject(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <GitCommitHorizontal className="w-3.5 h-3.5" />
                          Versions
                        </button>
                        <button
                          onClick={() => openTestLabForProject(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <FlaskConical className="w-3.5 h-3.5" />
                          TestLab
                        </button>
                        <button
                          onClick={() => openCollabForProject(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Collab
                        </button>
                        {proj.architectureId && (
                          <button
                            onClick={() => openArchitectForProject(proj.id, proj.architectureId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            Architecture
                          </button>
                        )}
                        {proj.status !== 'completed' ? (
                          <button
                            onClick={() => handleCompleteProject(proj)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-600 dark:text-emerald-400 text-xs font-medium whitespace-nowrap cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Complete &amp; Add to Portfolio
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <Eye className="w-3.5 h-3.5" />
                            In Portfolio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sharedProjects.length > 0 && (
            <div className="pt-4 space-y-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Shared With Me</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {sharedProjects.map((proj) => {
                  const role = proj.collaboratorRoles?.[firebaseUser.uid] || 'viewer';
                  return (
                    <div
                      key={proj.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {proj.language} · Owner: {proj.ownerName} · v{proj.version}
                          </div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                            {proj.title}
                          </h3>
                        </div>
                        <span className="text-xs font-medium capitalize text-blue-600 dark:text-blue-400">
                          {role}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                        <button
                          onClick={() => {
                            setActiveIdeProjectId(proj.id);
                            setActiveView('ide');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          Open in IDE
                        </button>
                        <button
                          onClick={() => openVersionsForProject(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <GitCommitHorizontal className="w-3.5 h-3.5" />
                          Versions
                        </button>
                        <button
                          onClick={() => openCollabForProject(proj.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Collab
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {customModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCustom} className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-lg font-bold">Start Project from Scratch</h3>
            <div>
              <label className="block text-xs font-medium mb-1">Project Title</label>
              <input
                required
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="API Rate Limiter Demo"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={2}
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="What are you building?"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Runtime Template</label>
              <select
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value as 'web' | 'javascript' | 'python')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              >
                <option value="web">Web (HTML / CSS / JS)</option>
                <option value="javascript">JavaScript (Isolated Node VM)</option>
                <option value="python">Python 3 (Isolated Sandbox)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCustomModal(false)} className="px-3 py-2 text-xs cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
                Create Workspace
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
