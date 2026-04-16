import React, { useCallback, useEffect, useRef, useState } from 'react';
import RichTextEditor from '../../components/RichTextEditor';
import {
  FileText,
  RefreshCw,
  X,
  Loader2,
  Cpu,
  Save,
  Bot,
  Image as ImageIcon,
  Music,
  Video,
  Globe,
  File,
  CheckCircle,
  Anvil,
  Camera,
  Download,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useNotice } from '../../contexts/NoticeContext';
import { useAIAssist } from '../../contexts/AIAssistContext';
import {
  getVaultApi,
  getBrainItemsApi,
  saveTranscriptApi,
  getApiBaseUrl,
  withSessionToken,
} from '../../services/backendApi';

// --- SESSION CACHE KEYS ---
const TRANSCRIPT_DRAFT_HTML_KEY = 'aio_transcript_editor_draft_html';
const TRANSCRIPT_DRAFT_TITLE_KEY = 'aio_transcript_editor_draft_title';
const FORGE_WORKBENCH_STATE_KEY = 'aio_forge_workbench_state';

const EMPTY_STATE = {
  title: '',
  transcript: '',
  executiveSummary: '',
  keyDecisions: [],
  actionItems: [],
  discussionHighlights: [],
  notesAndObservations: [],
  intentHint: '',
  purposeNote: '',
  priority: '',
  status: 'Draft',
  specialist: 'HAMMER',
  sourceContext: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive a displayable media-type label and lucide icon for a vault item. */
const getAssetMeta = (item) => {
  const mt = (item?.mediaType || '').toLowerCase();
  const rk = item?.recordKind || '';
  const at = (item?.artifactType || '').toLowerCase();

  if (mt === 'audio') return { label: 'AUDIO', Icon: Music, color: 'text-amber-400' };
  if (mt === 'video') return { label: 'VIDEO', Icon: Video, color: 'text-purple-400' };
  if (mt === 'image') return { label: 'IMAGE', Icon: ImageIcon, color: 'text-emerald-400' };
  if (rk === 'artifact' && (at === 'transcript')) return { label: 'TRANSCRIPT', Icon: FileText, color: 'text-cyan-400' };
  if (rk === 'artifact' && (at === 'script' || at === 'runofshow')) return { label: 'DOCUMENT', Icon: FileText, color: 'text-sky-400' };
  if (rk === 'artifact' && at === 'publish') return { label: 'WEB', Icon: Globe, color: 'text-indigo-400' };
  return { label: 'FILE', Icon: File, color: 'text-slate-500' };
};

/**
 * Extract any available text content from a vault artifact's metadata dict.
 * The metadata field is an opaque dict — we probe known reasonable keys.
 */
const extractArtifactContent = (item) => {
  const m = item?.metadata || {};
  return (
    m.content ||
    m.text ||
    m.transcriptText ||
    m.transcript_text ||
    m.body ||
    m.html ||
    m.rawText ||
    m.raw_text ||
    null
  );
};

/** True if this asset type has a preview-able sourceUrl. */
const isPreviewable = (item) => {
  const mt = (item?.mediaType || '').toLowerCase();
  return (mt === 'image' || mt === 'audio' || mt === 'video') && Boolean(item?.sourceUrl);
};

/** Resolve a raw sourceUrl to a playable URL, following Studio's exact playback path. */
const resolvePlaybackUrl = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith('/api/')) {
    return withSessionToken(`${getApiBaseUrl()}${url}`);
  }
  return url;
};

/** True if this is a text/transcript artifact we can try to hydrate into the editor. */
const isHydratableArtifact = (item) => {
  if (item?.recordKind !== 'artifact') return false;
  const at = (item?.artifactType || '').toLowerCase();
  return at === 'transcript' || at === 'script' || at === 'runofshow';
};

const getSpecialistLabel = () => 'Hammer';

const buildForgeSourceContextFromAsset = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  return {
    assetId: item.assetId || item.id || null,
    title: item.title || item.filename || 'Source Asset',
    filename: item.filename || item.metadata?.original_filename || item.title || '',
    sourceUrl: item.sourceUrl || '',
    mediaType: item.mediaType || '',
    recordKind: item.recordKind || '',
    artifactType: item.artifactType || '',
    source: item.source || '',
    ingestMeta: item.ingestMeta || item.ingest_meta || item.metadata?.ingestMeta || item.metadata?.ingest_meta || null,
  };
};

const readForgeWorkbenchState = () => {
  const raw = sessionStorage.getItem(FORGE_WORKBENCH_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const writeForgeWorkbenchState = (state) => {
  sessionStorage.setItem(FORGE_WORKBENCH_STATE_KEY, JSON.stringify(state));
  sessionStorage.setItem(TRANSCRIPT_DRAFT_TITLE_KEY, state?.title || '');
  sessionStorage.setItem(TRANSCRIPT_DRAFT_HTML_KEY, state?.transcript || '');
};

// ── Main Component ──────────────────────────────────────────────────────────

const Forge = () => {
  const { showNotice } = useNotice();
  const { openAIAssist } = useAIAssist() || {};
  const [loading, setLoading] = useState(true);
  const [forgeState, setForgeState] = useState(EMPTY_STATE);
  const savedStateRef = useRef(null);

  // Rail data
  const [vaultRailItems, setVaultRailItems] = useState([]);
  const [cortexRailItems, setCortexRailItems] = useState([]);
  const [vaultExpandedCats, setVaultExpandedCats] = useState({
    audio: false, video: false, images: false, documents: false, transcripts: false, website: false,
  });
  const [cortexExpandedCats, setCortexExpandedCats] = useState({
    summaries: false, notes: false, reports: false, strategies: false, operations: false,
  });

  // ── ACTIVE ASSET STATE ────────────────────────────────────────────────────
  // The full vault item object that is currently mounted in the workstation.
  // null = nothing mounted. Set by handleMountAsset().
  const [activeAsset, setActiveAsset] = useState(null);

  // Editor
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const [expandedAnalysis, setExpandedAnalysis] = useState({
    executiveSummary: false,
    keyDecisions: false,
    actionItems: false,
    discussionHighlights: false,
    notesAndObservations: false,
  });

  // --- Load vault + cortex rail data ---
  const loadForgeContext = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultData, cortexData] = await Promise.allSettled([
        getVaultApi(),
        getBrainItemsApi(),
      ]);
      if (vaultData.status === 'fulfilled') setVaultRailItems(Array.isArray(vaultData.value) ? vaultData.value : []);
      if (cortexData.status === 'fulfilled') setCortexRailItems(Array.isArray(cortexData.value) ? cortexData.value : []);
    } catch (_) {
      showNotice({ type: 'error', message: 'Forge uplink degraded. Some context data may be missing.' });
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    loadForgeContext();
    const cachedWorkbenchState = readForgeWorkbenchState();
    if (cachedWorkbenchState) {
      const restored = {
        ...EMPTY_STATE,
        ...cachedWorkbenchState,
        status: cachedWorkbenchState.status || 'Draft',
        specialist: cachedWorkbenchState.specialist || 'HAMMER',
      };
      setForgeState(restored);
      savedStateRef.current = restored;
      return;
    }

    const cachedTitle = sessionStorage.getItem(TRANSCRIPT_DRAFT_TITLE_KEY);
    const cachedHtml = sessionStorage.getItem(TRANSCRIPT_DRAFT_HTML_KEY);
    if (cachedTitle || cachedHtml) {
      const restored = {
        ...EMPTY_STATE,
        title: cachedTitle || '',
        transcript: cachedHtml || '',
        status: 'Draft',
        specialist: 'HAMMER',
      };
      setForgeState(restored);
      savedStateRef.current = restored;
    }
  }, [loadForgeContext]);

  // ── MOUNT ASSET ACTION ────────────────────────────────────────────────────
  /**
   * Called when a user clicks a vault item in the left rail.
   * Sets activeAsset to the full item object.
   * Optionally hydrates editor content for hydratable artifact types.
   */
  const handleMountAsset = useCallback((item) => {
    setActiveAsset(item);
    const sourceContext = buildForgeSourceContextFromAsset(item);

    // Populate title if the editor is untitled
    setForgeState(s => ({
      ...s,
      title: s.title || item.title || '',
      sourceContext,
    }));

    // Try to hydrate editor from artifact content if applicable
    if (isHydratableArtifact(item)) {
      const content = extractArtifactContent(item);
      if (content) {
        setForgeState(s => ({
          ...s,
          title: s.title || item.title || '',
          transcript: content,
          status: 'Draft',
          sourceContext,
        }));
        showNotice({ type: 'success', message: `Transcript loaded from: ${item.title}` });
      } else {
        showNotice({ type: 'info', message: `Mounted: ${item.title} — no inline content available` });
      }
    } else {
      showNotice({ type: 'info', message: `Mounted: ${item.title}` });
    }
  }, [showNotice]);

  // --- Vault rail categorization ---
  const getVaultByCategory = (cat) => {
    return vaultRailItems.filter(item => {
      const mt = (item.mediaType || '').toLowerCase();
      const at = (item.artifactType || '').toLowerCase();
      const rk = item.recordKind || '';
      if (cat === 'audio') return mt === 'audio';
      if (cat === 'video') return mt === 'video';
      if (cat === 'images') return mt === 'image';
      if (cat === 'transcripts') return rk === 'artifact' && at === 'transcript';
      if (cat === 'documents') return rk === 'artifact' && (at === 'script' || at === 'runofshow');
      if (cat === 'website') return rk === 'artifact' && at === 'publish';
      return false;
    });
  };

  // --- Cortex rail categorization ---
  const getCortexByCategory = (cat) => {
    return cortexRailItems.filter(item => {
      const cl = (item.category || '').toLowerCase();
      if (cat === 'summaries') return cl.includes('summar') || cl.includes('brief');
      if (cat === 'notes') return cl === 'note' || cl === 'notes';
      if (cat === 'reports') return cl.includes('report') || cl === 'brand';
      if (cat === 'strategies') return cl.includes('strateg') || cl.includes('market');
      if (cat === 'operations') return cl.includes('oper') || cl.includes('workflow') || cl.includes('sop');
      return false;
    });
  };

  // --- Save / Push Actions ---
  const handleSaveDraft = () => {
    writeForgeWorkbenchState(forgeState);
    savedStateRef.current = { ...forgeState };
    setForgeState(s => ({ ...s, status: 'Draft' }));
    showNotice({ type: 'success', message: 'Forge draft cached locally.' });
  };

  const handlePushToCortex = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const sourceContext = forgeState.sourceContext || null;
      const payload = {
        ...forgeState,
        status: 'Pushed',
        commitSurface: 'forge',
        assetId: sourceContext?.assetId || undefined,
        filename: sourceContext?.filename || undefined,
        sourceContext,
      };
      const result = await saveTranscriptApi(payload);
      if (result) {
        const nextState = { ...forgeState, status: 'Pushed' };
        writeForgeWorkbenchState(nextState);
        savedStateRef.current = nextState;
        setForgeState(s => ({ ...s, status: 'Pushed' }));
        loadForgeContext();
        showNotice({ type: 'success', message: 'Cognitive load committed to Cortex.' });
      }
    } catch (_) {
      showNotice({ type: 'error', message: 'Cortex uplink failed. Draft retained.' });
    } finally {
      setSaving(false);
    }
  }, [forgeState, loadForgeContext, saving, showNotice]);

  const handleModuleAiAssist = useCallback(async () => {
    if (openAIAssist) {
      openAIAssist({ context: { module: 'forge' } });
    }
  }, [openAIAssist]); // Stable - only recreate if openAIAssist changes

  const isDirty = JSON.stringify(forgeState) !== JSON.stringify(savedStateRef.current);

  useEffect(() => {
    if (activeAsset || !forgeState.sourceContext?.assetId) {
      return;
    }
    const matchedAsset = vaultRailItems.find((item) => (item.assetId || item.id) === forgeState.sourceContext.assetId);
    if (matchedAsset) {
      setActiveAsset(matchedAsset);
    }
  }, [activeAsset, forgeState.sourceContext, vaultRailItems]);

  // ─── SUB-COMPONENTS ───────────────────────────────────────────────────────

  const VaultCatRow = ({ cat, label }) => {
    const items = getVaultByCategory(cat);
    const isOpen = vaultExpandedCats[cat];
    return (
      <div className="space-y-1">
        <button
          onClick={() => setVaultExpandedCats(s => ({ ...s, [cat]: !s[cat] }))}
          className="w-full rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 px-3 py-2.5 text-left transition hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75 flex items-center justify-between"
        >
          <span className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{label}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
            {isOpen ? '▾' : '▸'} {items.length}
          </span>
        </button>
        {isOpen && items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => {
              const isActive = activeAsset?.assetId === item.assetId;
              const { Icon, color } = getAssetMeta(item);
              return (
                <button
                  key={item.assetId || item.id}
                  onClick={() => handleMountAsset(item)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    isActive
                      ? 'border-[var(--color-primary)] bg-[var(--color-bg-secondary)] shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_12px_24px_rgba(3,7,18,0.35)]'
                      : 'border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="mt-0.5 h-8 w-8 rounded-lg object-cover border border-[var(--color-border)]" />
                    ) : (
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                        <Icon size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)] truncate">
                          {item.title || item.filename || 'Asset'}
                        </div>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] truncate">
                        {item.source || item.status || ''}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {isOpen && items.length === 0 && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] italic px-2">empty</div>
        )}
      </div>
    );
  };

  const CortexCatRow = ({ cat }) => {
    const items = getCortexByCategory(cat);
    const isOpen = cortexExpandedCats[cat];
    const labels = { summaries: 'Summaries', notes: 'Notes', reports: 'Reports', strategies: 'Strategies', operations: 'Operations' };
    return (
      <div className="space-y-1">
        <button
          onClick={() => setCortexExpandedCats(s => ({ ...s, [cat]: !s[cat] }))}
          className="w-full rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 px-3 py-2.5 text-left transition hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75 flex items-center justify-between"
        >
          <span className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">{labels[cat] || cat}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
            {isOpen ? '▾' : '▸'} {items.length}
          </span>
        </button>
        {isOpen && items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => (
              <button
                key={item.id}
                className="w-full rounded-xl border border-[var(--color-border)]/40 bg-[var(--color-bg-secondary)]/55 px-3 py-2.5 text-left transition hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-bg-secondary)]/75"
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)]">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)] truncate">
                        {item.title || 'Knowledge Item'}
                      </div>
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] truncate">
                      {item.category || ''}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {isOpen && items.length === 0 && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] italic px-2">empty</div>
        )}
      </div>
    );
  };

  // ── INLINE ASSET REVIEW PANEL ─────────────────────────────────────────────
  /**
   * Renders a lightweight preview of the activeAsset in the center column.
   * Placed above the editor. Never replaces the editor.
   */
  const AssetReviewPanel = ({ asset }) => {
    if (!asset) {
      return (
        <div className="flex flex-col flex-shrink-0 border-b border-[#1E2024] bg-black/40">
          <div className="flex items-center gap-2 px-4 py-1 border-b border-[#1E2024] flex-shrink-0 bg-black/40">
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // IDLE</span>
          </div>
          <div className="p-4 min-h-[100px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-2">
                <FileText size={20} className="text-slate-600" />
              </div>
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">NO ASSET MOUNTED</div>
              <div className="text-[8px] text-slate-700 mt-1">Select an asset from the Vault</div>
            </div>
          </div>
        </div>
      );
    }

    const mt = (asset.mediaType || '').toLowerCase();
    const rk = asset.recordKind || '';
    const at = (asset.artifactType || '').toLowerCase();
    const { label, Icon, color } = getAssetMeta(asset);

    // ── IMAGE PREVIEW ──
    if (mt === 'image' && asset.sourceUrl) {
      const playbackUrl = resolvePlaybackUrl(asset.sourceUrl);
      return (
        <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/60 flex flex-col overflow-hidden" style={{ maxHeight: '260px' }}>
          <div className="flex items-center gap-2 px-4 py-1 border-b border-[#1E2024] flex-shrink-0 bg-black/40">
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // IMG</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-1 flex-shrink-0">
            <ImageIcon size={10} className="text-emerald-400" />
            <span className="text-[7px] font-black text-emerald-400 uppercase tracking-[0.3em]">IMAGE REVIEW</span>
            <span className="text-[7px] font-mono text-slate-700 ml-2 truncate">{asset.title}</span>
            <button onClick={() => setIsReviewModalOpen(true)} className="ml-auto text-[7px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-widest transition">
              VIEW FULL
            </button>
            <button onClick={() => setActiveAsset(null)} className="text-slate-600 hover:text-slate-400 transition">
              <X size={10} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden p-3 min-h-0 cursor-pointer" onClick={() => setIsReviewModalOpen(true)}>
            <img
              src={playbackUrl}
              alt={asset.title}
              className="max-h-full max-w-full object-contain rounded shadow-xl border border-white/5"
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>
      );
    }

    // ── AUDIO PLAYER ──
    if (mt === 'audio' && asset.sourceUrl) {
      const playbackUrl = resolvePlaybackUrl(asset.sourceUrl);
      return (
        <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/60 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-1 border-b border-[#1E2024] flex-shrink-0 bg-black/40">
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // AUDIO</span>
          </div>
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Music size={12} className="text-amber-400" />
            </div>
            <div className="flex flex-col min-w-0 flex-shrink-0" style={{ maxWidth: '180px' }}>
              <span className="text-[7px] font-black text-amber-400 uppercase tracking-[0.3em]">AUDIO</span>
              <span className="text-[8px] font-mono text-slate-400 truncate">{asset.title}</span>
            </div>
            <audio
              controls
              src={playbackUrl}
              className="flex-1 h-8 min-w-0"
              style={{ accentColor: '#f59e0b' }}
            />
            <button onClick={() => setIsReviewModalOpen(true)} className="flex-shrink-0 text-[7px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-widest transition">
              VIEW
            </button>
            <button onClick={() => setActiveAsset(null)} className="flex-shrink-0 text-slate-600 hover:text-slate-400 transition ml-1">
              <X size={10} />
            </button>
          </div>
        </div>
      );
    }

    // ── VIDEO PLAYER ──
    if (mt === 'video' && asset.sourceUrl) {
      const playbackUrl = resolvePlaybackUrl(asset.sourceUrl);
      return (
        <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/80 flex flex-col overflow-hidden" style={{ maxHeight: '300px' }}>
          <div className="flex items-center gap-2 px-4 py-1 border-b border-[#1E2024] flex-shrink-0 bg-black/40">
            <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // VIDEO</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-1 flex-shrink-0">
            <Video size={10} className="text-purple-400" />
            <span className="text-[7px] font-black text-purple-400 uppercase tracking-[0.3em]">VIDEO REVIEW</span>
            <span className="text-[7px] font-mono text-slate-700 ml-2 truncate">{asset.title}</span>
            <button onClick={() => setIsReviewModalOpen(true)} className="ml-auto text-[7px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-widest transition">
              VIEW FULL
            </button>
            <button onClick={() => setActiveAsset(null)} className="text-slate-600 hover:text-slate-400 transition">
              <X size={10} />
            </button>
          </div>
          <div className="flex items-center justify-center overflow-hidden p-2 bg-black min-h-0" style={{ height: '360px' }}>
            <video
              key={asset.assetId || asset.id}
              controls
              src={playbackUrl}
              className="h-full w-auto rounded shadow-xl"
              style={{ maxWidth: '100%' }}
            />
          </div>
        </div>
      );
    }

    // ── ARTIFACT / DOCUMENT CARD ──
    // For hydratable artifacts the content may already have been loaded into the
    // editor. Show a compact mounted-asset indicator card.
    const artifactContent = extractArtifactContent(asset);
    const wasHydrated = isHydratableArtifact(asset) && Boolean(artifactContent);

    return (
      <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/40 px-4 py-3 flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center flex-shrink-0`}>
          <Icon size={12} className={color} />
        </div>
        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <div className="flex items-center gap-2">
            <span className={`text-[7px] font-black uppercase tracking-[0.3em] ${color}`}>{label}</span>
            {wasHydrated && (
              <span className="text-[6px] font-black text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded uppercase tracking-widest">
                LOADED INTO EDITOR
              </span>
            )}
            {!wasHydrated && isHydratableArtifact(asset) && (
              <span className="text-[6px] font-black text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded uppercase tracking-widest">
                NO INLINE CONTENT
              </span>
            )}
          </div>
          <span className="text-[9px] font-bold text-slate-300 truncate">{asset.title}</span>
          {asset.source && (
            <span className="text-[6px] font-mono text-slate-700 uppercase tracking-widest truncate">{asset.source}</span>
          )}
        </div>
        <button onClick={() => setIsReviewModalOpen(true)} className="flex-shrink-0 text-[7px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-widest transition">
          VIEW
        </button>
        <button onClick={() => setActiveAsset(null)} className="flex-shrink-0 text-slate-600 hover:text-slate-400 transition">
          <X size={10} />
        </button>
      </div>
    );
  };

  // ─── EXPORT HELPERS ───────────────────────────────────────────────────────

  const handleExportHtml = () => {
    const s = forgeState;
    const esc = str => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(s.title || 'Forge Export')}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.6}h1{border-bottom:2px solid #0ea5e9;padding-bottom:.5rem}h2{color:#0369a1;margin-top:2rem}ul{padding-left:1.5rem}li{margin-bottom:.25rem}</style></head><body><h1>${esc(s.title || 'Untitled')}</h1>${s.executiveSummary ? `<h2>Executive Summary</h2><p>${esc(s.executiveSummary)}</p>` : ''}${s.keyDecisions.length ? `<h2>Key Decisions</h2><ul>${s.keyDecisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}${s.actionItems.length ? `<h2>Action Items</h2><ul>${s.actionItems.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}${s.transcript ? `<h2>Transcript</h2><div>${s.transcript}</div>` : ''}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(s.title || 'forge').replace(/[^a-zA-Z0-9]/g, '_')}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMd = () => {
    const s = forgeState;
    const stripHtml = h => { if (!h) return ''; let t = h; t = t.replace(/<br\s*\/?>/gi, '\n'); t = t.replace(/<\/?(?:h[1-6]|p|div|li)[^>]*>/gi, '\n'); t = t.replace(/<[^>]+>/g, ''); t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); return t.replace(/\n{3,}/g, '\n\n').trim(); };
    const lines = [`# ${s.title || 'Untitled Forge Session'}`, ''];
    if (s.executiveSummary) { lines.push('## Executive Summary', s.executiveSummary, ''); }
    if (s.keyDecisions.length) { lines.push('## Key Decisions', ...s.keyDecisions.map(d => `- ${d}`), ''); }
    if (s.actionItems.length) { lines.push('## Action Items', ...s.actionItems.map(a => `- ${a}`), ''); }
    if (s.discussionHighlights.length) { lines.push('## Discussion Highlights', ...s.discussionHighlights.map(h => `- ${h}`), ''); }
    if (s.transcript) { lines.push('## Transcript', stripHtml(s.transcript), ''); }
    if (s.notesAndObservations.length) { lines.push('## Notes & Observations', ...s.notesAndObservations.map(n => `- ${n}`), ''); }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(s.title || 'forge').replace(/[^a-zA-Z0-9]/g, '_')}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(forgeState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(forgeState.title || 'forge').replace(/[^a-zA-Z0-9]/g, '_')}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTxt = () => {
    const s = forgeState;
    const strip = h => { if (!h) return ''; let t = h; t = t.replace(/<br\s*\/?>/gi, '\n'); t = t.replace(/<\/?(?:h[1-6]|p|div|li)[^>]*>/gi, '\n'); t = t.replace(/<[^>]+>/g, ''); return t.replace(/\n{3,}/g, '\n\n').trim(); };
    const lines = [s.title || 'Untitled', ''];
    if (s.executiveSummary) { lines.push('Executive Summary', s.executiveSummary, ''); }
    if (s.keyDecisions.length) { lines.push('Key Decisions', ...s.keyDecisions.map(d => `- ${d}`), ''); }
    if (s.actionItems.length) { lines.push('Action Items', ...s.actionItems.map(a => `- ${a}`), ''); }
    if (s.transcript) { lines.push('Transcript', strip(s.transcript), ''); }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(s.title || 'forge').replace(/[^a-zA-Z0-9]/g, '_')}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="module-root-standard text-slate-300 select-none font-sans">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          { label: 'UPLINK REFRESH', icon: RefreshCw, onClick: loadForgeContext, variant: 'secondary' },
        ]}
        toolbarRightSlot={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">STATUS:</span>
              <span className={`text-[9px] font-mono ${forgeState.status === 'Pushed' ? 'text-cyan-500' : 'text-amber-500/80'}`}>{forgeState.status}</span>
            </div>
            
            {/* EXPORT DROPDOWN (TOOLBAR) */}
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="h-8 px-3 rounded border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <Download size={12} /> EXPORT <span className="text-[8px] opacity-40">▼</span>
              </button>
              {exportDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 z-[200] w-48 bg-[#111318] border border-[#2A2D35] rounded-xl shadow-2xl overflow-hidden ring-1 ring-white/5">
                  {[
                    { label: '.HTML DOCUMENT', action: handleExportHtml },
                    { label: '.MD DOCUMENT', action: handleExportMd },
                    { label: '.JSON DOCUMENT', action: handleExportJson },
                    { label: '.TXT DOCUMENT', action: handleExportTxt },
                  ].map(({ label, action }) => (
                    <button
                      key={label}
                      onClick={() => { setExportDropdownOpen(false); action(); }}
                      className="w-full text-left px-4 py-2.5 text-[9px] font-bold text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-400 border-b border-white/5 last:border-0 transition-colors uppercase tracking-[0.15em]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
        onModuleAi={handleModuleAiAssist}
      />

      <div className="module-content-stage flex gap-1.5 px-1.5 pb-1.5">

        {/* LEFT RAIL — VAULT */}
        <div className="w-[350px] flex-shrink-0 flex flex-col bg-[#0A0A0C] border border-[#1E2024] rounded-xl overflow-hidden select-none">
          <div className="px-3 py-2 border-b border-[#1E2024] flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('aio:open-boom'))}
              className="p-1 rounded hover:bg-[#1E2024] transition-colors"
              title="Boom Capture"
            >
              <Camera size={12} className="text-cyan-400" />
            </button>
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
            <span className="text-[7px] font-black text-cyan-500 uppercase tracking-[0.3em]">VAULT</span>
            {loading && <Loader2 size={8} className="text-slate-600 animate-spin ml-auto" />}
            {activeAsset && !loading && (
              <span className="ml-auto text-[6px] font-black text-cyan-600 uppercase tracking-widest">MOUNTED</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar py-1">
            {[
              { cat: 'audio', label: 'Audio' },
              { cat: 'video', label: 'Video' },
              { cat: 'images', label: 'Images' },
              { cat: 'transcripts', label: 'Transcripts' },
              { cat: 'documents', label: 'Documents' },
              { cat: 'website', label: 'Web Artifacts' },
            ].map(({ cat, label }) => (
              <VaultCatRow key={cat} cat={cat} label={label} />
            ))}
          </div>

          {/* Active asset footer in vault rail */}
          {activeAsset && (
            <div className="border-t border-[#1E2024] px-3 py-2 bg-cyan-500/5 flex-shrink-0">
              <div className="text-[6px] font-black text-cyan-600 uppercase tracking-widest mb-0.5">ACTIVE</div>
              <div className="text-[8px] font-bold text-cyan-300 truncate">{activeAsset.title}</div>
            </div>
          )}
        </div>

        {/* CENTER — REVIEW + EDITOR */}
        <div className="min-w-[150px] flex-1 flex-col bg-[#0A0A0C] relative overflow-hidden border border-[#1E2024] rounded-xl">
          {/* INLINE ASSET REVIEW PANEL — static 16:9 video + static editor, no flex layout shifting */}
          {activeAsset ? (
            <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/80">
              <AssetReviewPanel asset={activeAsset} />
            </div>
          ) : (
            <div className="flex-shrink-0 border-b border-[#1E2024] bg-black/40">
              <div className="flex items-center gap-2 px-4 py-1 border-b border-[#1E2024] flex-shrink-0 bg-black/40">
                <span className="text-[7px] uppercase tracking-[0.4em] text-slate-400 font-black">MON A // IDLE</span>
              </div>
              <div className="p-4 min-h-[100px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-2">
                    <FileText size={20} className="text-slate-600" />
                  </div>
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">NO ASSET MOUNTED</div>
                  <div className="text-[8px] text-slate-700 mt-1">Select an asset from the Vault</div>
                </div>
              </div>
            </div>
          )}

          {/* Editor status bar */}
          <div className="flex items-center justify-between bg-black/40 px-3 py-1 rounded border border-white/5 mx-2 mt-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                {activeAsset ? `ASSEMBLY // ${(activeAsset.title || '').slice(0, 28)}` : 'FORGE CORE // LIVE EDITOR'}
              </span>
              {isDirty && <span className="text-[7px] font-mono text-amber-500/60 uppercase">• UNSAVED</span>}
            </div>
            <button
              onClick={() => setIsEditorFullscreen(!isEditorFullscreen)}
              className="text-[7px] font-black text-slate-600 hover:text-cyan-400 uppercase tracking-widest transition"
            >
              {isEditorFullscreen ? 'COLLAPSE' : 'EXPAND EDITOR'}
            </button>
          </div>

          {/* Editor - static height, no flex shrinking/growing */}
          <div className="px-2 pb-2 h-[400px] flex-shrink-0">
            <div className="w-full h-full rounded overflow-hidden bg-black/40">
              <RichTextEditor
                key={forgeState.transcript ? 'data-loaded' : 'data-pending'}
                value={forgeState.transcript}
                onChange={(content) => setForgeState(s => ({ ...s, transcript: content, status: 'Draft' }))}
                placeholder={activeAsset ? `Assembling from: ${activeAsset.title}...` : 'Input mission transcript data...'}
                minHeight={400}
                tools="full"
              />
            </div>
          </div>

          {/* Focus mode overlay */}
          {isEditorFullscreen && (
            <div
              className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl flex flex-col p-10"
              onKeyDown={e => { if (e.key === 'Escape') setIsEditorFullscreen(false); }}
            >
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">{forgeState.title || 'UNTITLED FORGE SESSION'}</h2>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{forgeState.status} // FORGE FOCUS</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditorFullscreen(false)}
                  className="h-10 px-6 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                >
                  EXIT FOCUS <X size={14} />
                </button>
              </div>
              <div className="flex-1 rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-black/40">
                <RichTextEditor
                  value={forgeState.transcript}
                  onChange={(content) => setForgeState(s => ({ ...s, transcript: content, status: 'Draft' }))}
                  placeholder="Full transcript focus session..."
                  minHeight={800}
                  tools="full"
                />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL — BRAIN / METADATA */}
        <div className="w-[350px] flex-shrink-0 flex flex-col bg-[#0A0A0C] border border-[#1E2024] rounded-xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 no-scrollbar">

            {/* METADATA */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">PROP // METADATA</span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">DOCUMENT TITLE</label>
                  <input
                    value={forgeState.title}
                    onChange={e => setForgeState(s => ({ ...s, title: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-xs text-white focus:border-cyan-500/40 focus:outline-none transition font-mono"
                    placeholder="MISSION TITLE..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">INTENT</label>
                    <select
                      value={forgeState.intentHint}
                      onChange={e => setForgeState(s => ({ ...s, intentHint: e.target.value, status: 'Draft' }))}
                      className="w-full rounded bg-black/60 border border-[#2A2D35] px-2 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition uppercase font-black"
                    >
                      <option value="">AUTO</option>
                      <option value="meeting">MEETING</option>
                      <option value="interview">INTERVIEW</option>
                      <option value="presentation">PRESENTATION</option>
                      <option value="call">CALL</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">PRIORITY</label>
                    <select
                      value={forgeState.priority}
                      onChange={e => setForgeState(s => ({ ...s, priority: e.target.value, status: 'Draft' }))}
                      className="w-full rounded bg-black/60 border border-[#2A2D35] px-2 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition uppercase font-black"
                    >
                      <option value="">NORMAL</option>
                      <option value="low">LOW</option>
                      <option value="medium">MEDIUM</option>
                      <option value="high">HIGH</option>
                      <option value="critical">CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                    <span>AGENT ROUTE</span>
                    <span className="text-[7px] text-cyan-500/60 lowercase italic">Charlie → Alpha → {getSpecialistLabel(forgeState.specialist)}</span>
                  </label>
                  <select
                    value={forgeState.specialist}
                    onChange={e => setForgeState(s => ({ ...s, specialist: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-2 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition uppercase font-black"
                  >
                    <option value="HAMMER">HAMMER (CONTENT + ARTIFACTS)</option>
                    <option value="GHOST">GHOST (CODE + TECHNICAL)</option>
                  </select>
                  <div className="mt-1 text-[7px] font-mono text-slate-700 tracking-wider">
                    INTENT: ROUTE TO BEST-FIT AGENT → ALPHA QC → CORTEX
                  </div>
                </div>

                <div>
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">PURPOSE NOTE</label>
                  <textarea
                    value={forgeState.purposeNote}
                    onChange={e => setForgeState(s => ({ ...s, purposeNote: e.target.value, status: 'Draft' }))}
                    className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-1.5 text-[10px] text-slate-300 focus:border-cyan-500/40 focus:outline-none transition font-mono resize-none"
                    rows={2}
                    placeholder="Contextual mission note..."
                  />
                </div>
              </div>
            </div>

            {/* ANALYSIS */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">PROP // ANALYSIS</span>
              </div>

              <div className="space-y-2">
                {/* EXECUTIVE SUMMARY */}
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedAnalysis(s => ({ ...s, executiveSummary: !s.executiveSummary }))}
                    className="w-full rounded bg-black/40 border border-[#2A2D35] px-3 py-2 flex items-center justify-between hover:bg-black/60 transition"
                  >
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">EXECUTIVE SUMMARY</span>
                    <span className="text-[10px] text-slate-600">{expandedAnalysis.executiveSummary ? '▾' : '▸'}</span>
                  </button>
                  {expandedAnalysis.executiveSummary && (
                    <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <textarea
                        value={forgeState.executiveSummary}
                        onChange={e => setForgeState(s => ({ ...s, executiveSummary: e.target.value, status: 'Draft' }))}
                        className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-[11px] leading-relaxed text-white focus:border-cyan-500/40 focus:outline-none transition resize-y min-h-[80px]"
                        placeholder="Synthesized brief..."
                      />
                    </div>
                  )}
                </div>

                {/* KEY DECISIONS */}
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedAnalysis(s => ({ ...s, keyDecisions: !s.keyDecisions }))}
                    className="w-full rounded bg-black/40 border border-[#2A2D35] px-3 py-2 flex items-center justify-between hover:bg-black/60 transition"
                  >
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">KEY DECISIONS</span>
                    <span className="text-[10px] text-slate-600">{expandedAnalysis.keyDecisions ? '▾' : '▸'}</span>
                  </button>
                  {expandedAnalysis.keyDecisions && (
                    <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <textarea
                        value={forgeState.keyDecisions.join('\n')}
                        onChange={e => setForgeState(s => ({ ...s, keyDecisions: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                        className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition resize-y min-h-[60px] font-mono"
                        placeholder="One per line..."
                      />
                    </div>
                  )}
                </div>

                {/* ACTION ITEMS */}
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedAnalysis(s => ({ ...s, actionItems: !s.actionItems }))}
                    className="w-full rounded bg-black/40 border border-[#2A2D35] px-3 py-2 flex items-center justify-between hover:bg-black/60 transition"
                  >
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ACTION ITEMS</span>
                    <span className="text-[10px] text-slate-600">{expandedAnalysis.actionItems ? '▾' : '▸'}</span>
                  </button>
                  {expandedAnalysis.actionItems && (
                    <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <textarea
                        value={forgeState.actionItems.join('\n')}
                        onChange={e => setForgeState(s => ({ ...s, actionItems: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                        className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition resize-y min-h-[60px] font-mono"
                        placeholder="One per line..."
                      />
                    </div>
                  )}
                </div>

                {/* DISCUSSION HIGHLIGHTS */}
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedAnalysis(s => ({ ...s, discussionHighlights: !s.discussionHighlights }))}
                    className="w-full rounded bg-black/40 border border-[#2A2D35] px-3 py-2 flex items-center justify-between hover:bg-black/60 transition"
                  >
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">DISCUSSION HIGHLIGHTS</span>
                    <span className="text-[10px] text-slate-600">{expandedAnalysis.discussionHighlights ? '▾' : '▸'}</span>
                  </button>
                  {expandedAnalysis.discussionHighlights && (
                    <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <textarea
                        value={forgeState.discussionHighlights.join('\n')}
                        onChange={e => setForgeState(s => ({ ...s, discussionHighlights: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                        className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition resize-y min-h-[60px] font-mono"
                        placeholder="Key takeaways..."
                      />
                    </div>
                  )}
                </div>

                {/* NOTES & OBSERVATIONS */}
                <div className="space-y-1">
                  <button
                    onClick={() => setExpandedAnalysis(s => ({ ...s, notesAndObservations: !s.notesAndObservations }))}
                    className="w-full rounded bg-black/40 border border-[#2A2D35] px-3 py-2 flex items-center justify-between hover:bg-black/60 transition"
                  >
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">NOTES & OBSERVATIONS</span>
                    <span className="text-[10px] text-slate-600">{expandedAnalysis.notesAndObservations ? '▾' : '▸'}</span>
                  </button>
                  {expandedAnalysis.notesAndObservations && (
                    <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <textarea
                        value={forgeState.notesAndObservations.join('\n')}
                        onChange={e => setForgeState(s => ({ ...s, notesAndObservations: e.target.value.split('\n').filter(Boolean), status: 'Draft' }))}
                        className="w-full rounded bg-black/60 border border-[#2A2D35] px-3 py-2 text-[10px] text-white focus:border-cyan-500/40 focus:outline-none transition resize-y min-h-[60px] font-mono"
                        placeholder="Add mission logs..."
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="h-1.5" />
          </div>

          {/* STICKY ACTION BAR */}
          <div className="p-3 border-t border-white/5 bg-[#0A0A0C] flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => showNotice({ type: 'info', message: `Dispatching to ${forgeState.specialist}...` })}
                className="h-10 rounded border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2"
              >
                <Cpu size={12} /> {forgeState.specialist} ASSIST
              </button>
              <button
                onClick={handleSaveDraft}
                className="h-10 rounded border border-white/10 bg-white/5 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Save size={12} /> SAVE DRAFT
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => showNotice({ type: 'info', message: 'Archiving to Mission Vault...' })}
                className="h-10 rounded border border-blue-500/30 bg-blue-500/5 text-blue-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-blue-500/10 transition-all flex items-center justify-center"
              >
                VAULT
              </button>
              <button
                onClick={handlePushToCortex}
                disabled={saving}
                className="h-10 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                {saving ? 'PUSHING...' : 'CORTEX'}
              </button>
            </div>

            <div className="h-1" />
          </div>
        </div>

        {/* CORTEX RAIL */}
        <div className="w-[350px] flex-shrink-0 flex flex-col bg-[#08080A] border border-[#1E2024] rounded-xl overflow-hidden select-none">
          <div className="px-3 py-2 border-b border-[#1E2024] flex items-center gap-2 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.3em]">CORTEX</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar py-1">
            {['summaries', 'notes', 'reports', 'strategies', 'operations'].map(cat => (
              <CortexCatRow key={cat} cat={cat} />
            ))}
          </div>
        </div>

      </div>

      {/* DEEP-REVIEW MODAL */}
      {isReviewModalOpen && activeAsset && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
          onKeyDown={e => { if (e.key === 'Escape') setIsReviewModalOpen(false); }}
        >
          <div className="w-full max-w-6xl h-full flex flex-col bg-[#0A0A0C] border border-[#1E2024] rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2024] bg-black/40 flex-shrink-0">
              <div className="flex items-center gap-3">
                {(() => {
                  const mt = (activeAsset.mediaType || '').toLowerCase();
                  if (mt === 'image') return <ImageIcon size={20} className="text-emerald-400" />;
                  if (mt === 'audio') return <Music size={20} className="text-amber-400" />;
                  if (mt === 'video') return <Video size={20} className="text-purple-400" />;
                  return <FileText size={20} className="text-cyan-400" />;
                })()}
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DEEP REVIEW</div>
                  <div className="text-[12px] font-bold text-white truncate max-w-md">{activeAsset.title}</div>
                </div>
              </div>
              <button 
                onClick={() => setIsReviewModalOpen(false)} 
                className="p-2 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden p-6 bg-black/60 min-h-0">
              {(() => {
                const mt = (activeAsset.mediaType || '').toLowerCase();
                const playbackUrl = resolvePlaybackUrl(activeAsset.sourceUrl);

                if (mt === 'image' && activeAsset.sourceUrl) {
                  return (
                    <img 
                      src={playbackUrl}
                      alt={activeAsset.title}
                      className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  );
                }

                if (mt === 'audio' && activeAsset.sourceUrl) {
                  return (
                    <div className="w-full max-w-2xl">
                      <audio
                        controls
                        src={playbackUrl}
                        className="w-full h-16"
                        style={{ accentColor: '#f59e0b' }}
                      />
                    </div>
                  );
                }

                if (mt === 'video' && activeAsset.sourceUrl) {
                  return (
                    <video
                      key={activeAsset.assetId || activeAsset.id}
                      controls
                      src={playbackUrl}
                      className="max-h-full max-w-full rounded-lg shadow-2xl"
                    />
                  );
                }

                // Fallback for documents/artifacts
                return (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <FileText size={48} className="text-slate-600 mb-4" />
                    <div className="text-[14px] font-bold text-slate-300 mb-2">{activeAsset.title}</div>
                    <div className="text-[11px] text-slate-600 uppercase tracking-widest mb-4">
                      {activeAsset.artifactType || activeAsset.recordKind || 'ASSET'}
                    </div>
                    {activeAsset.source && (
                      <div className="text-[10px] font-mono text-slate-700">{activeAsset.source}</div>
                    )}
                    {!activeAsset.source && (
                      <div className="text-[10px] text-slate-700 italic">No preview available for this asset type</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Forge;


