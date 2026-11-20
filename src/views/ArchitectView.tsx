import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileJson,
  GitBranch,
  History,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Server,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  deleteArchitecturePlan,
  exportArchitectureViaApi,
  generateArchitectureViaApi,
  listArchitectureVersions,
  listUserArchitectures,
  reviseArchitectureViaApi,
  saveArchitecturePlan,
} from '../services/architectService';
import type {
  ApiEndpointSpec,
  ArchitectureDiagram,
  ArchitectureDiagramNode,
  ArchitecturePlan,
  ArchitectureVersion,
  DatabaseSchemaTable,
  DiagramKind,
} from '../types/mideocode';

type ArchitectTab = 'overview' | 'diagrams' | 'database' | 'api' | 'versions';

const DIAGRAM_KINDS: { id: DiagramKind; label: string }[] = [
  { id: 'system', label: 'System Architecture' },
  { id: 'er', label: 'Entity-Relationship' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'journey', label: 'User Journey' },
  { id: 'api', label: 'API Interaction' },
  { id: 'component', label: 'Component Structure' },
  { id: 'dataflow', label: 'Data Flow' },
];

const LAYER_COLORS: Record<ArchitectureDiagramNode['layer'], { fill: string; stroke: string }> = {
  client: { fill: '#1e3a8a', stroke: '#60a5fa' },
  api: { fill: '#312e81', stroke: '#818cf8' },
  service: { fill: '#064e3b', stroke: '#34d399' },
  data: { fill: '#4c1d95', stroke: '#a78bfa' },
  auth: { fill: '#78350f', stroke: '#fbbf24' },
  external: { fill: '#334155', stroke: '#94a3b8' },
};

export function ArchitectView() {
  const {
    firebaseUser,
    architectLaunch,
    clearArchitectLaunch,
    sendArchitectureToBuild,
    notify,
  } = useMideo();

  const [plans, setPlans] = useState<ArchitecturePlan[]>([]);
  const [activePlan, setActivePlan] = useState<ArchitecturePlan | null>(null);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [tab, setTab] = useState<ArchitectTab>('overview');
  const [loading, setLoading] = useState(true);

  // Generate new plan state
  const [newPrompt, setNewPrompt] = useState('');
  const [newConstraints, setNewConstraints] = useState('');
  const [generating, setGenerating] = useState(false);

  // Diagram workspace state
  const [activeDiagramKind, setActiveDiagramKind] = useState<DiagramKind>('system');
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [revising, setRevising] = useState(false);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Export preview modal
  const [exportPreview, setExportPreview] = useState<{ filename: string; content: string } | null>(null);

  // Explicit confirmations for destructive schema/version operations
  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null);
  const [confirmDeleteField, setConfirmDeleteField] = useState<{ tableId: string; fieldIndex: number; name: string } | null>(null);
  const [confirmDeleteEndpointId, setConfirmDeleteEndpointId] = useState<string | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<ArchitectureVersion | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState<ArchitecturePlan | null>(null);

  const loadPlans = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const list = await listUserArchitectures(firebaseUser.uid);
      const sorted = [...list].sort((a, b) => {
        const ams = (a.updatedAt as { toMillis?: () => number })?.toMillis?.() || 0;
        const bms = (b.updatedAt as { toMillis?: () => number })?.toMillis?.() || 0;
        return bms - ams;
      });
      setPlans(sorted);
      if (sorted.length > 0 && !activePlan) {
        setActivePlan(sorted[0]);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load architectures.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, activePlan, notify]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (!architectLaunch) return;
    if (architectLaunch.architectureId) {
      const found = plans.find((p) => p.id === architectLaunch.architectureId);
      if (found) setActivePlan(found);
    }
    clearArchitectLaunch();
  }, [architectLaunch, plans, clearArchitectLaunch]);

  useEffect(() => {
    if (!activePlan) {
      setVersions([]);
      return;
    }
    listArchitectureVersions(activePlan.id)
      .then((v) => setVersions(v))
      .catch(() => setVersions([]));
  }, [activePlan?.id, activePlan?.versionNumber]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !newPrompt.trim()) return;
    setGenerating(true);
    try {
      const generated = await generateArchitectureViaApi({
        prompt: newPrompt.trim(),
        constraints: newConstraints.trim() || undefined,
      });
      const saved = await saveArchitecturePlan(
        firebaseUser.uid,
        {
          ...generated,
          versionNumber: 1,
          status: 'draft',
        },
        'Initial AI architecture generation',
      );
      setPlans((prev) => [saved, ...prev]);
      setActivePlan(saved);
      setNewPrompt('');
      setNewConstraints('');
      setTab('overview');
      notify('success', `Architecture "${saved.title}" designed and saved.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Architecture generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePlan = async (summary = 'Updated architecture design', statusOverride?: ArchitecturePlan['status']) => {
    if (!firebaseUser || !activePlan) return;
    setSaving(true);
    try {
      const updated = await saveArchitecturePlan(
        firebaseUser.uid,
        {
          ...activePlan,
          status: statusOverride || activePlan.status,
        },
        summary,
      );
      setActivePlan(updated);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      notify('success', `Saved v${updated.versionNumber} of "${updated.title}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save architecture.');
    } finally {
      setSaving(false);
    }
  };

  const handleReviseWithAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activePlan || !revisionPrompt.trim()) return;
    setRevising(true);
    try {
      const revised = await reviseArchitectureViaApi({
        currentPlan: activePlan,
        revisionPrompt: revisionPrompt.trim(),
      });
      const saved = await saveArchitecturePlan(
        firebaseUser.uid,
        {
          ...revised,
          id: activePlan.id,
          projectId: activePlan.projectId,
          versionNumber: activePlan.versionNumber + 1,
          status: activePlan.status,
        },
        `AI revision: ${revisionPrompt.trim().slice(0, 120)}`,
      );
      setActivePlan(saved);
      setPlans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setRevisionPrompt('');
      notify('success', `Revised architecture saved as v${saved.versionNumber}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Revision failed.');
    } finally {
      setRevising(false);
    }
  };

  const currentDiagram: ArchitectureDiagram | undefined = useMemo(() => {
    if (!activePlan) return undefined;
    return activePlan.diagrams.find((d) => d.kind === activeDiagramKind) || activePlan.diagrams[0];
  }, [activePlan, activeDiagramKind]);

  const updateCurrentDiagram = (updater: (d: ArchitectureDiagram) => ArchitectureDiagram) => {
    if (!activePlan || !currentDiagram) return;
    setActivePlan({
      ...activePlan,
      diagrams: activePlan.diagrams.map((d) => (d.kind === currentDiagram.kind ? updater(d) : d)),
    });
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(20, Math.min(760, ((e.clientX - rect.left) / rect.width) * 900));
    const y = Math.max(20, Math.min(440, ((e.clientY - rect.top) / rect.height) * 520));
    updateCurrentDiagram((diag) => ({
      ...diag,
      nodes: diag.nodes.map((n) => (n.id === draggingNodeId ? { ...n, x: Math.round(x), y: Math.round(y) } : n)),
    }));
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current || !activePlan) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePlan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${activeDiagramKind}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!svgRef.current || !activePlan) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1040;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#090D16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `${activePlan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${activeDiagramKind}.png`;
            a.click();
            URL.revokeObjectURL(pngUrl);
          }
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleExport = async (format: 'sql' | 'openapi_json' | 'firestore_schema') => {
    if (!activePlan) return;
    try {
      const res = await exportArchitectureViaApi(format, activePlan);
      setExportPreview(res);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const selectedNode = currentDiagram?.nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Architect
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            AI software architecture designer with editable 7-view diagrams, database &amp; OpenAPI designers, and direct Smart Workspace build handoff.
          </p>
        </div>

        {activePlan && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSavePlan('Saved manual edits')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : `Save v${activePlan.versionNumber}`}
            </button>
            <button
              type="button"
              onClick={() => handleSavePlan('Approved architecture plan', 'approved')}
              disabled={saving || activePlan.status === 'approved'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-600 text-emerald-600 dark:text-emerald-400 text-xs font-semibold whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {activePlan.status === 'approved' ? 'Approved' : 'Approve Plan'}
            </button>
            <button
              type="button"
              onClick={() => sendArchitectureToBuild(activePlan)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Rocket className="w-3.5 h-3.5" />
              Send Architecture to Build
            </button>
          </div>
        )}
      </div>

      {/* Main Split: Plan Selector + Prompt Builder (left) | Designer Workspace (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-5">
          <form
            onSubmit={handleGenerate}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3.5"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              Design New System
            </h2>
            <textarea
              rows={3}
              required
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Describe the application you want to design (e.g., Multi-tenant SaaS invoicing platform with role permissions, webhooks, and analytics)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <input
              value={newConstraints}
              onChange={(e) => setNewConstraints(e.target.value)}
              placeholder="Optional constraints (e.g., PostgreSQL, REST API, React)"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={generating || !newPrompt.trim()}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? 'Designing Architecture...' : 'Generate Architecture'}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 space-y-3">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Saved Architectures ({plans.length})
            </h2>
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading plans...</div>
            ) : plans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No architecture plans yet. Describe an application idea above to create your first blueprint.
              </p>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setActivePlan(p)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      activePlan?.id === p.id
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {p.title}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          v{p.versionNumber} · {p.status.replace(/_/g, ' ')} · {p.databaseTables.length} tables · {p.apiEndpoints.length} APIs
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setConfirmDeletePlan(p);
                        }}
                        aria-label={`Delete ${p.title}`}
                        className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right: Active Architecture Designer */}
        <div className="lg:col-span-8 space-y-5">
          {!activePlan ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center space-y-3">
              <Layers className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">No Architecture Selected</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Enter an application description on the left to generate a complete architecture plan, database schema, API specification, and 7 interactive visual diagrams.
              </p>
            </div>
          ) : (
            <>
              {/* Workspace Sub-Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'overview', label: 'Overview & Modules' },
                      { id: 'diagrams', label: 'Diagrams (7)' },
                      { id: 'database', label: `Database (${activePlan.databaseTables.length})` },
                      { id: 'api', label: `API (${activePlan.apiEndpoints.length})` },
                      { id: 'versions', label: `Versions (${versions.length})` },
                    ] as { id: ArchitectTab; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                        tab === item.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Natural Language Architecture Revision Bar */}
              <form
                onSubmit={handleReviseWithAi}
                className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
              >
                <input
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  placeholder="Revise with AI (e.g., Add Redis caching layer, multi-currency billing table, and webhook retries)..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                />
                <button
                  type="submit"
                  disabled={revising || !revisionPrompt.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  {revising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {revising ? 'Revising...' : 'Revise Plan'}
                </button>
              </form>

              {/* OVERVIEW & MODULES TAB */}
              {tab === 'overview' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        v{activePlan.versionNumber} · {activePlan.status.replace(/_/g, ' ')}
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        {activePlan.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                        {activePlan.overview}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white mb-1">Frontend Layer</div>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{activePlan.frontendSpec}</p>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white mb-1">Backend &amp; Services</div>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{activePlan.backendSpec}</p>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white mb-1">Authentication &amp; Security</div>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{activePlan.authSpec}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tech Stack Recommendations */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recommended Technology Stack
                    </h3>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {activePlan.techStack.map((t, i) => (
                        <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {t.layer}: <span className="text-blue-600 dark:text-blue-400">{t.choice}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 sm:text-right max-w-md">{t.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Modules & Folder Layout */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      System Modules &amp; File Structure
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activePlan.modules.map((m) => (
                        <div key={m.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{m.name}</span>
                            <span className="text-[11px] font-mono text-slate-500">{m.folderPath}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{m.purpose}</p>
                          <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 pt-1">
                            {m.keyFiles.join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* INTERACTIVE 7-VIEW DIAGRAM WORKSPACE */}
              {tab === 'diagrams' && currentDiagram && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1">
                      {DIAGRAM_KINDS.map((dk) => (
                        <button
                          key={dk.id}
                          type="button"
                          onClick={() => {
                            setActiveDiagramKind(dk.id);
                            setSelectedNodeId(null);
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                            activeDiagramKind === dk.id
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {dk.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
                        aria-label="Zoom out"
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-mono tabular-nums px-1.5">{Math.round(zoom * 100)}%</span>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                        aria-label="Zoom in"
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadSvg}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        SVG
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadPng}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        PNG
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    {currentDiagram.summary} · Drag nodes to reposition or click a node below to edit its label.
                  </p>

                  {/* Interactive SVG Canvas */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#090D16] overflow-auto">
                    <svg
                      ref={svgRef}
                      viewBox="0 0 900 520"
                      className="w-full h-[460px] select-none"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                      onPointerMove={handleSvgPointerMove}
                      onPointerUp={() => setDraggingNodeId(null)}
                      onPointerLeave={() => setDraggingNodeId(null)}
                    >
                      <defs>
                        <marker id="mideo-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                          <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                        </marker>
                      </defs>

                      {/* Edges */}
                      {currentDiagram.edges.map((edge) => {
                        const fromNode = currentDiagram.nodes.find((n) => n.id === edge.from);
                        const toNode = currentDiagram.nodes.find((n) => n.id === edge.to);
                        if (!fromNode || !toNode) return null;
                        const x1 = fromNode.x + 85;
                        const y1 = fromNode.y + 30;
                        const x2 = toNode.x + 85;
                        const y2 = toNode.y + 30;
                        const mx = (x1 + x2) / 2;
                        const my = (y1 + y2) / 2;
                        return (
                          <g key={edge.id}>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="#475569"
                              strokeWidth="1.5"
                              markerEnd="url(#mideo-arrow)"
                            />
                            {edge.label && (
                              <text
                                x={mx}
                                y={my - 5}
                                textAnchor="middle"
                                fill="#94a3b8"
                                fontSize="10"
                                fontFamily="monospace"
                              >
                                {edge.label}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Draggable Nodes */}
                      {currentDiagram.nodes.map((node) => {
                        const palette = LAYER_COLORS[node.layer] || LAYER_COLORS.service;
                        const isSelected = node.id === selectedNodeId;
                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            style={{ cursor: 'grab' }}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              setDraggingNodeId(node.id);
                              setSelectedNodeId(node.id);
                            }}
                          >
                            <rect
                              width="170"
                              height="60"
                              rx="8"
                              fill={palette.fill}
                              stroke={isSelected ? '#ffffff' : palette.stroke}
                              strokeWidth={isSelected ? '2.5' : '1.5'}
                            />
                            <text
                              x="12"
                              y="24"
                              fill="#f8fafc"
                              fontSize="12"
                              fontWeight="600"
                              fontFamily="sans-serif"
                            >
                              {node.label.slice(0, 21)}
                            </text>
                            <text
                              x="12"
                              y="42"
                              fill="#cbd5e1"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {(node.sublabel || node.layer).slice(0, 24)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Selected Node Inspector & Add Node */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    {selectedNode ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <input
                          value={selectedNode.label}
                          onChange={(e) =>
                            updateCurrentDiagram((d) => ({
                              ...d,
                              nodes: d.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: e.target.value } : n)),
                            }))
                          }
                          aria-label="Edit node label"
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                        />
                        <input
                          value={selectedNode.sublabel || ''}
                          onChange={(e) =>
                            updateCurrentDiagram((d) => ({
                              ...d,
                              nodes: d.nodes.map((n) => (n.id === selectedNode.id ? { ...n, sublabel: e.target.value } : n)),
                            }))
                          }
                          placeholder="Sublabel"
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                        />
                        <select
                          value={selectedNode.layer}
                          onChange={(e) =>
                            updateCurrentDiagram((d) => ({
                              ...d,
                              nodes: d.nodes.map((n) =>
                                n.id === selectedNode.id
                                  ? { ...n, layer: e.target.value as ArchitectureDiagramNode['layer'] }
                                  : n,
                              ),
                            }))
                          }
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                        >
                          <option value="client">Client</option>
                          <option value="api">API</option>
                          <option value="service">Service</option>
                          <option value="data">Data</option>
                          <option value="auth">Auth</option>
                          <option value="external">External</option>
                        </select>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Click any node in the diagram to edit its properties.</span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const newId = `node_${Date.now().toString(36)}`;
                        updateCurrentDiagram((d) => ({
                          ...d,
                          nodes: [
                            ...d.nodes,
                            { id: newId, label: 'New Component', sublabel: 'service', layer: 'service', x: 80, y: 80 },
                          ],
                        }));
                        setSelectedNodeId(newId);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Node
                    </button>
                  </div>
                </div>
              )}

              {/* DATABASE DESIGNER TAB */}
              {tab === 'database' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      Database Schema Designer
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExport('sql')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export SQL DDL
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('firestore_schema')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                        Export Firestore Schema
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newTbl: DatabaseSchemaTable = {
                            id: `tbl_${Date.now().toString(36)}`,
                            name: `table_${activePlan.databaseTables.length + 1}`,
                            description: 'New entity table',
                            fields: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true }],
                            indexes: [],
                          };
                          setActivePlan({
                            ...activePlan,
                            databaseTables: [...activePlan.databaseTables, newTbl],
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Table
                      </button>
                    </div>
                  </div>

                  {activePlan.databaseTables.map((tbl) => (
                    <div
                      key={tbl.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={tbl.name}
                            onChange={(e) =>
                              setActivePlan({
                                ...activePlan,
                                databaseTables: activePlan.databaseTables.map((t) =>
                                  t.id === tbl.id ? { ...t, name: e.target.value } : t,
                                ),
                              })
                            }
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold"
                          />
                          <span className="text-xs text-slate-500">{tbl.description}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTableId(tbl.id)}
                          className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Table
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                              <th className="py-2 pr-2">Field</th>
                              <th className="py-2 pr-2">Type</th>
                              <th className="py-2 pr-2">PK</th>
                              <th className="py-2 pr-2">Unique</th>
                              <th className="py-2 pr-2">Nullable</th>
                              <th className="py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {tbl.fields.map((field, fIdx) => (
                              <tr key={fIdx}>
                                <td className="py-2 pr-2">
                                  <input
                                    value={field.name}
                                    onChange={(e) =>
                                      setActivePlan({
                                        ...activePlan,
                                        databaseTables: activePlan.databaseTables.map((t) =>
                                          t.id === tbl.id
                                            ? {
                                                ...t,
                                                fields: t.fields.map((f, i) =>
                                                  i === fIdx ? { ...f, name: e.target.value } : f,
                                                ),
                                              }
                                            : t,
                                        ),
                                      })
                                    }
                                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs w-36"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    value={field.type}
                                    onChange={(e) =>
                                      setActivePlan({
                                        ...activePlan,
                                        databaseTables: activePlan.databaseTables.map((t) =>
                                          t.id === tbl.id
                                            ? {
                                                ...t,
                                                fields: t.fields.map((f, i) =>
                                                  i === fIdx ? { ...f, type: e.target.value } : f,
                                                ),
                                              }
                                            : t,
                                        ),
                                      })
                                    }
                                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs w-28"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.isPrimaryKey)}
                                    onChange={(e) =>
                                      setActivePlan({
                                        ...activePlan,
                                        databaseTables: activePlan.databaseTables.map((t) =>
                                          t.id === tbl.id
                                            ? {
                                                ...t,
                                                fields: t.fields.map((f, i) =>
                                                  i === fIdx ? { ...f, isPrimaryKey: e.target.checked } : f,
                                                ),
                                              }
                                            : t,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.unique)}
                                    onChange={(e) =>
                                      setActivePlan({
                                        ...activePlan,
                                        databaseTables: activePlan.databaseTables.map((t) =>
                                          t.id === tbl.id
                                            ? {
                                                ...t,
                                                fields: t.fields.map((f, i) =>
                                                  i === fIdx ? { ...f, unique: e.target.checked } : f,
                                                ),
                                              }
                                            : t,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.nullable)}
                                    onChange={(e) =>
                                      setActivePlan({
                                        ...activePlan,
                                        databaseTables: activePlan.databaseTables.map((t) =>
                                          t.id === tbl.id
                                            ? {
                                                ...t,
                                                fields: t.fields.map((f, i) =>
                                                  i === fIdx ? { ...f, nullable: e.target.checked } : f,
                                                ),
                                              }
                                            : t,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmDeleteField({
                                        tableId: tbl.id,
                                        fieldIndex: fIdx,
                                        name: field.name,
                                      })
                                    }
                                    className="text-slate-400 hover:text-red-500 cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setActivePlan({
                            ...activePlan,
                            databaseTables: activePlan.databaseTables.map((t) =>
                              t.id === tbl.id
                                ? {
                                    ...t,
                                    fields: [
                                      ...t.fields,
                                      { name: 'new_column', type: 'text', nullable: true },
                                    ],
                                  }
                                : t,
                            ),
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Field
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* API DESIGNER TAB */}
              {tab === 'api' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-blue-500" />
                      API Endpoint Designer
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExport('openapi_json')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                        Export OpenAPI 3.0
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ep: ApiEndpointSpec = {
                            id: `ep_${Date.now().toString(36)}`,
                            method: 'GET',
                            path: '/api/v1/resource',
                            summary: 'Fetch resource items',
                            authRequired: true,
                            requestSchema: '{}',
                            responseSchema: '{ items: [] }',
                            validationRules: ['Authenticated user required'],
                            errorResponses: [{ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' }],
                          };
                          setActivePlan({
                            ...activePlan,
                            apiEndpoints: [...activePlan.apiEndpoints, ep],
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Endpoint
                      </button>
                    </div>
                  </div>

                  {activePlan.apiEndpoints.map((ep) => (
                    <div
                      key={ep.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={ep.method}
                            onChange={(e) =>
                              setActivePlan({
                                ...activePlan,
                                apiEndpoints: activePlan.apiEndpoints.map((x) =>
                                  x.id === ep.id
                                    ? { ...x, method: e.target.value as ApiEndpointSpec['method'] }
                                    : x,
                                ),
                              })
                            }
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs font-bold"
                          >
                            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <input
                            value={ep.path}
                            onChange={(e) =>
                              setActivePlan({
                                ...activePlan,
                                apiEndpoints: activePlan.apiEndpoints.map((x) =>
                                  x.id === ep.id ? { ...x, path: e.target.value } : x,
                                ),
                              })
                            }
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs w-56"
                          />
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ep.authRequired}
                              onChange={(e) =>
                                setActivePlan({
                                  ...activePlan,
                                  apiEndpoints: activePlan.apiEndpoints.map((x) =>
                                    x.id === ep.id ? { ...x, authRequired: e.target.checked } : x,
                                  ),
                                })
                              }
                            />
                            <span>Auth Required</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEndpointId(ep.id)}
                            className="text-red-500 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <input
                        value={ep.summary}
                        onChange={(e) =>
                          setActivePlan({
                            ...activePlan,
                            apiEndpoints: activePlan.apiEndpoints.map((x) =>
                              x.id === ep.id ? { ...x, summary: e.target.value } : x,
                            ),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Request Schema</label>
                          <textarea
                            rows={2}
                            value={ep.requestSchema}
                            onChange={(e) =>
                              setActivePlan({
                                ...activePlan,
                                apiEndpoints: activePlan.apiEndpoints.map((x) =>
                                  x.id === ep.id ? { ...x, requestSchema: e.target.value } : x,
                                ),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Response Schema</label>
                          <textarea
                            rows={2}
                            value={ep.responseSchema}
                            onChange={(e) =>
                              setActivePlan({
                                ...activePlan,
                                apiEndpoints: activePlan.apiEndpoints.map((x) =>
                                  x.id === ep.id ? { ...x, responseSchema: e.target.value } : x,
                                ),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ARCHITECTURE VERSION HISTORY TAB */}
              {tab === 'versions' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <History className="w-4 h-4 text-blue-500" />
                    Architecture Revision History ({versions.length})
                  </div>

                  {versions.length === 0 ? (
                    <p className="text-xs text-slate-500">Save changes or revise with AI to build version history.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {versions.map((ver) => (
                        <div key={ver.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                              v{ver.versionNumber} · {ver.label}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {ver.changeSummary} · {ver.snapshot.databaseTables?.length || 0} tables ·{' '}
                              {ver.snapshot.apiEndpoints?.length || 0} endpoints
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreVersion(ver)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Export Preview Modal */}
      {exportPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {exportPreview.filename}
              </h3>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([exportPreview.content], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = exportPreview.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download File
              </button>
            </div>
            <pre className="p-4 rounded-lg bg-[#090D16] text-slate-100 font-mono text-xs overflow-auto max-h-[420px]">
              {exportPreview.content}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setExportPreview(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs before Destructive Changes */}
      {confirmDeleteTableId && activePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Database Table?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Confirm removing this table and all its field definitions from the current architecture draft.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTableId(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePlan({
                    ...activePlan,
                    databaseTables: activePlan.databaseTables.filter((t) => t.id !== confirmDeleteTableId),
                  });
                  setConfirmDeleteTableId(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteField && activePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Remove column "{confirmDeleteField.name}"?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Confirm removing this column from the schema table.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteField(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePlan({
                    ...activePlan,
                    databaseTables: activePlan.databaseTables.map((t) =>
                      t.id === confirmDeleteField.tableId
                        ? { ...t, fields: t.fields.filter((_, i) => i !== confirmDeleteField.fieldIndex) }
                        : t,
                    ),
                  });
                  setConfirmDeleteField(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Remove Column
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteEndpointId && activePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete API Endpoint?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This removes the endpoint specification from the API contract.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEndpointId(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePlan({
                    ...activePlan,
                    apiEndpoints: activePlan.apiEndpoints.filter((x) => x.id !== confirmDeleteEndpointId),
                  });
                  setConfirmDeleteEndpointId(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Endpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRestoreVersion && activePlan && firebaseUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Restore Architecture v{confirmRestoreVersion.versionNumber}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This saves your restored snapshot as a new version while preserving full history.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreVersion(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const snap = confirmRestoreVersion.snapshot;
                  const saved = await saveArchitecturePlan(
                    firebaseUser.uid,
                    {
                      ...snap,
                      id: activePlan.id,
                      projectId: activePlan.projectId,
                      versionNumber: activePlan.versionNumber + 1,
                    },
                    `Restored from architecture v${confirmRestoreVersion.versionNumber}`,
                  );
                  setActivePlan(saved);
                  setPlans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
                  setConfirmRestoreVersion(null);
                  notify('success', `Restored v${confirmRestoreVersion.versionNumber} as v${saved.versionNumber}.`);
                }}
                className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeletePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Delete "{confirmDeletePlan.title}"?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This permanently removes this architecture blueprint. Linked Smart Workspace projects remain untouched.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletePlan(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteArchitecturePlan(confirmDeletePlan.id);
                  const remaining = plans.filter((p) => p.id !== confirmDeletePlan.id);
                  setPlans(remaining);
                  if (activePlan?.id === confirmDeletePlan.id) {
                    setActivePlan(remaining[0] || null);
                  }
                  setConfirmDeletePlan(null);
                  notify('info', 'Architecture deleted.');
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
