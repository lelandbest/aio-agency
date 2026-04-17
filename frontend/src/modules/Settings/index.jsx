import React, { useState, useEffect, useRef } from 'react';
import * as Lucide from 'lucide-react';
import { Key, Settings, Save, User, Mail, Shield, Smartphone, Globe, Clock, PenTool, CreditCard, Box, Lock, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Edit2, Plus, Palette, Cog, Package, Inbox, FileCode, Layers, Search, Monitor, LogOut, Sparkles, Bot, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { BrainIcon, Crosshair, CommandSurfaceIcon } from '../../components/ui/icons';
import { clearStoredSessionToken } from '../../services/authStorage';
import ModuleHeader from '../../components/ModuleHeader';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import {
  addWorkspaceMemberApi,
  attachWorkspaceRoleApi,
  changePasswordApi,
  createWorkspaceApi,
  createWorkspaceRoleApi,
  deleteAvatarApi,
  deleteGlobalVariableApi,
  deleteUserAccountApi,
  deleteWorkspaceApi,
  detachWorkspaceRoleApi,
  executeOmegaApi,
  exportUserDataApi,
  getAiAgentsApi,
  getAuthSessionsApi,
  getCanonicalSettingsApi,
  getExportDownloadUrl,
  getExportStatusApi,
  getOmegaStatusApi,
  getProfileApi,
  getWorkspaceMembershipsApi,
  getWorkspaceRolesApi,
  logoutOtherSessionsApi,
  removeWorkspaceMemberApi,
  revokeAuthSessionApi,
  updateAiAgentApi,
  updateCanonicalTenantSettingsApi,
  updateProfileApi,
  updateSystemEmailTemplateApi,
  updateWorkspaceApi,
  updateWorkspaceMemberApi,
  updateWorkspaceRoleApi,
  uploadAvatarApi,
  upsertGlobalVariableApi,
  armOmegaApi,
  cancelOmegaApi
} from '../../services/backendApi';
import { useTransientSaveFeedback, saveButtonClassName } from '../../hooks/useTransientSaveFeedback';

const loadCanonicalTenantSettings = async () => {
  const bundle = await getCanonicalSettingsApi();
  return bundle?.tenantSettings || {};
};

const normalizeTranscriptionProviderSetting = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  if (normalized === 'elevenlabs' || normalized === 'eleven_labs' || normalized === 'elevenlabs_scribe') {
    return 'elevenlabs_scribe';
  }
  if (normalized === 'disabled' || normalized === 'off' || normalized === 'none') {
    return 'disabled';
  }
  return 'ffmpeg_transcribe';
};

const mapCanonicalGlobalVariables = (tenantSettings = {}) => {
  const variables = tenantSettings?.globalVariables || {};
  return Object.entries(variables).map(([key, details]) => ({
    id: details?.id || key,
    key,
    value: details?.value || '',
    label: details?.label || key,
    category: details?.category || 'custom',
    editableByClient: Boolean(details?.editableByClient),
    description: details?.description || '',
    isSecret: Boolean(details?.isSecret),
    isSystem: Boolean(details?.isSystem),
  }));
};

const mapCanonicalSystemEmailTemplates = (tenantSettings = {}, search = '') => {
  const templates = tenantSettings?.comms?.systemEmailTemplates || {};
  const rows = Object.values(templates).filter((template) => template && typeof template === 'object');
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? rows.filter((template) => [template.emailType, template.subject, template.sendTo].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
    : rows;
  return filtered
    .map((template) => ({
      id: template.id,
      templateKey: template.templateKey,
      emailType: template.emailType,
      subject: template.subject || '',
      sendTo: template.sendTo || '',
      enabled: Boolean(template.enabled),
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      editedByName: template.editedByName || template.edited_by_name,
      editedAt: template.editedAt || template.edited_at,
      config: template.config || {},
      updatedAt: template.updatedAt || template.updatedAt,
    }))
    .sort((left, right) => String(left.emailType || '').localeCompare(String(right.emailType || '')));
};

const formatOmegaCountdown = (executeAt, nowTick) => {
  if (!executeAt) {
    return 'Not armed';
  }
  const remainingMs = new Date(executeAt).getTime() - nowTick;
  if (remainingMs <= 0) {
    return 'Ready to execute';
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} remaining`;
};

const summarizeCapabilityDomains = (capabilities = []) => {
  const domains = Array.from(new Set((capabilities || []).map((capability) => String(capability).split('.')[0]).filter(Boolean)));
  return domains.join(', ');
};

const buildEntityRoleIndex = (roleBundle) => {
  const index = {};
  const roles = Array.isArray(roleBundle?.roles) ? roleBundle.roles : [];
  const entitySummaries = Array.isArray(roleBundle?.entitySummaries) ? roleBundle.entitySummaries : [];
  entitySummaries.forEach((entity) => {
    index[`${entity.entityType}:${entity.entityId}`] = {
      roleIds: entity.roleIds || [],
      roleNames: entity.roleNames || [],
      effectiveCapabilities: entity.effectiveCapabilities || [],
    };
  });
  return { index, roles };
};

const useWorkspaceRoleAuthority = (workspaceId, enabled = true) => {
  const [roleBundle, setRoleBundle] = useState(null);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState('');

  const reloadRoles = async () => {
    if (!workspaceId || !enabled) {
      setRoleBundle(null);
      return null;
    }
    setLoadingRoles(true);
    setRolesError('');
    try {
      const nextBundle = await getWorkspaceRolesApi(workspaceId);
      setRoleBundle(nextBundle);
      return nextBundle;
    } catch (loadError) {
      setRoleBundle(null);
      setRolesError(loadError.message || 'Unable to load roles.');
      return null;
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    reloadRoles();
  }, [workspaceId, enabled]);

  return {
    roleBundle,
    setRoleBundle,
    loadingRoles,
    rolesError,
    setRolesError,
    reloadRoles,
  };
};

const EntityRolePills = ({ roles = [], onDetach = null, disabled = false, emptyLabel = 'No roles attached.' }) => (
  <div className="flex flex-wrap gap-2">
    {roles.length ? roles.map((role) => (
      <div
        key={role.id}
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${role.isSystemRole
          ? 'border-cyan-500/30 bg-cyan-500/12 text-cyan-200'
          : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]'
          }`}
      >
        <span>{role.name}</span>
        {role.isLocked && <span className="text-[8px] opacity-70">LOCKED</span>}
        {onDetach && !disabled && (
          <button
            type="button"
            onClick={() => onDetach(role)}
            className="text-[9px] opacity-80 transition hover:opacity-100"
          >
            Remove
          </button>
        )}
      </div>
    )) : (
      <span className="text-xs text-[var(--color-text-secondary)]">{emptyLabel}</span>
    )}
  </div>
);

const RoleAssignmentEditor = ({
  workspaceId,
  entityType,
  entityId,
  availableRoles = [],
  assignedRoles = [],
  onRoleBundleUpdate,
  canManage = true,
  compact = false,
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextRole = availableRoles.find((role) => !assignedRoles.some((assignedRole) => assignedRole.id === role.id));
    setSelectedRoleId(nextRole?.id || '');
  }, [availableRoles, assignedRoles, entityType, entityId]);

  const handleAttach = async () => {
    if (!workspaceId || !selectedRoleId || !canManage) return;
    setSubmitting(true);
    setError('');
    try {
      const nextBundle = await attachWorkspaceRoleApi(workspaceId, selectedRoleId, { entityType, entityId });
      onRoleBundleUpdate?.(nextBundle);
    } catch (attachError) {
      setError(attachError.message || 'Unable to attach role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async (role) => {
    if (!workspaceId || !role?.id || !canManage) return;
    setSubmitting(true);
    setError('');
    try {
      const nextBundle = await detachWorkspaceRoleApi(workspaceId, role.id, entityType, entityId);
      onRoleBundleUpdate?.(nextBundle);
    } catch (detachError) {
      setError(detachError.message || 'Unable to detach role.');
    } finally {
      setSubmitting(false);
    }
  };

  const attachableRoles = availableRoles.filter((role) => !assignedRoles.some((assignedRole) => assignedRole.id === role.id));

  return (
    <div className={`space-y-2 ${compact ? '' : 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4'}`}>
      <EntityRolePills roles={assignedRoles} onDetach={handleDetach} disabled={!canManage || submitting} />
      <div className={`grid gap-2 ${compact ? 'md:grid-cols-[1fr_auto]' : 'md:grid-cols-[1fr_auto]'}`}>
        <select
          value={selectedRoleId}
          onChange={(event) => setSelectedRoleId(event.target.value)}
          disabled={!canManage || !attachableRoles.length || submitting}
          className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
        >
          <option value="">{attachableRoles.length ? 'Attach role…' : 'All roles attached'}</option>
          {attachableRoles.map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAttach}
          disabled={!canManage || !selectedRoleId || submitting}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-60"
        >
          Attach
        </button>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
};

const RolesAuthoritySurface = ({ focus = 'roles' }) => {
  const { tenant, user } = useAuth();
  const workspaceId = tenant?.id || '';
  const { hasCapability } = useAuth();
  const canManage = hasCapability('system.admin');
  const { roleBundle, setRoleBundle, loadingRoles, rolesError, setRolesError } = useWorkspaceRoleAuthority(workspaceId, Boolean(workspaceId));
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCapabilities, setDraftCapabilities] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [assignmentEntityType, setAssignmentEntityType] = useState('user');
  const [assignmentEntityId, setAssignmentEntityId] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();
  const roles = roleBundle?.roles || [];
  const capabilityCatalog = roleBundle?.capabilityCatalog || [];
  const directoryUsers = roleBundle?.directory?.users || [];
  const directoryBots = roleBundle?.directory?.bots || [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId) || roles[0] || null;

  useEffect(() => {
    if (!selectedRoleId && roles[0]?.id) {
      setSelectedRoleId(roles[0].id);
    } else if (selectedRoleId && !roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0]?.id || '');
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) return;
    setDraftName(selectedRole.name || '');
    setDraftDescription(selectedRole.description || '');
    setDraftCapabilities(selectedRole.capabilities || []);
  }, [selectedRole?.id]);

  useEffect(() => {
    const pool = assignmentEntityType === 'bot' ? directoryBots : directoryUsers;
    const nextEntity = pool.find((entity) => !selectedRole?.assignedEntities?.some((assignment) => assignment.entityType === entity.entityType && assignment.entityId === entity.entityId));
    setAssignmentEntityId(nextEntity?.entityId || '');
  }, [assignmentEntityType, directoryUsers, directoryBots, selectedRole?.id, selectedRole?.assignedEntities]);

  const handleCreateRole = async () => {
    if (!workspaceId || !newRoleName.trim() || !canManage) return;
    setSavingRole(true);
    setRolesError('');
    try {
      const nextBundle = await createWorkspaceRoleApi(workspaceId, {
        name: newRoleName.trim(),
        description: newRoleDescription.trim(),
        capabilities: [],
      });
      setRoleBundle(nextBundle);
      const createdRole = (nextBundle?.roles || []).find((role) => role.name === newRoleName.trim());
      setSelectedRoleId(createdRole?.id || '');
      setNewRoleName('');
      setNewRoleDescription('');
      triggerSavedAction('create-role');
    } catch (createError) {
      setRolesError(createError.message || 'Unable to create role.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveRole = async () => {
    if (!workspaceId || !selectedRole || !canManage || selectedRole.isLocked) return;
    setSavingRole(true);
    setRolesError('');
    try {
      const nextBundle = await updateWorkspaceRoleApi(workspaceId, selectedRole.id, {
        name: draftName.trim(),
        description: draftDescription.trim(),
        capabilities: draftCapabilities,
      });
      setRoleBundle(nextBundle);
      triggerSavedAction('save-role');
    } catch (saveError) {
      setRolesError(saveError.message || 'Unable to save role.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleToggleCapability = (capabilityId) => {
    if (selectedRole?.isLocked) return;
    setDraftCapabilities((current) =>
      current.includes(capabilityId)
        ? current.filter((value) => value !== capabilityId)
        : [...current, capabilityId]
    );
  };

  const handleAttachSelectedRole = async () => {
    if (!workspaceId || !selectedRole?.id || !assignmentEntityId || !canManage) return;
    setSavingRole(true);
    setRolesError('');
    try {
      const nextBundle = await attachWorkspaceRoleApi(workspaceId, selectedRole.id, {
        entityType: assignmentEntityType,
        entityId: assignmentEntityId,
      });
      setRoleBundle(nextBundle);
    } catch (attachError) {
      setRolesError(attachError.message || 'Unable to attach role.');
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Roles</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Named authority bundles with explicit capability scopes.</div>
          </div>
          <div className="flex max-h-full flex-col gap-3 overflow-y-auto p-4 no-scrollbar">
            <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
              <input
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder="Create role name"
                disabled={!canManage || savingRole}
                className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
              />
              <input
                value={newRoleDescription}
                onChange={(event) => setNewRoleDescription(event.target.value)}
                placeholder="Description"
                disabled={!canManage || savingRole}
                className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleCreateRole}
                disabled={!canManage || !newRoleName.trim() || savingRole}
                className={saveButtonClassName('w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-60', savedAction === 'create-role')}
              >
                {savedAction === 'create-role' ? 'Created' : 'Create Role'}
              </button>
            </div>

            <div className="space-y-2">
              {roles.map((role) => {
                const isActive = selectedRole?.id === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full rounded-[var(--radius-card)] border px-3 py-3 text-left transition ${isActive
                      ? 'border-[var(--color-primary)] bg-[var(--color-bg-tertiary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/40'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{role.name}</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{role.description || 'No description set.'}</div>
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">{role.assignedCount}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {role.isSystemRole && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-200">System</span>}
                      {role.isLocked && <span className="rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-200">Locked</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 no-scrollbar">
          {loadingRoles && <div className="text-sm text-[var(--color-text-secondary)]">Loading roles…</div>}
          {!loadingRoles && selectedRole && (
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Role Identity</div>
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    disabled={!canManage || selectedRole.isLocked}
                    className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
                  />
                  <textarea
                    value={draftDescription}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    disabled={!canManage || selectedRole.isLocked}
                    rows={3}
                    className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex flex-wrap gap-2">
                    {selectedRole.isSystemRole && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">System Role</span>}
                    {selectedRole.isLocked && <span className="rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">Locked</span>}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Role ID: <span className="font-mono text-[var(--color-text-primary)]">{selectedRole.id}</span></div>
                </div>

                <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Authority Summary</div>
                  <div className="text-2xl font-bold text-[var(--color-text-primary)]">{draftCapabilities.length}</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Capabilities enabled</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">{summarizeCapabilityDomains(draftCapabilities) || 'No domains enabled.'}</div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveRole}
                      disabled={!canManage || selectedRole.isLocked || savingRole}
                      className={saveButtonClassName('w-full rounded-[var(--radius-card)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60', savedAction === 'save-role')}
                    >
                      {savedAction === 'save-role' ? 'Saved' : 'Save Role'}
                    </button>
                  </div>
                </div>
              </div>

              {focus !== 'accessRules' && (
                <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Capabilities</div>
                      <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Grouped capability bundles define the role’s effective authority.</div>
                    </div>
                    {selectedRole.isLocked && <div className="text-xs text-amber-200">Locked system role capabilities are not editable.</div>}
                  </div>
                  <div className="space-y-3">
                    {capabilityCatalog.map((domain) => (
                      <div key={domain.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                        <div className="mb-3">
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">{domain.label}</div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {(domain.capabilities || []).map((capability) => {
                            const enabled = draftCapabilities.includes(capability.id);
                            return (
                              <button
                                key={capability.id}
                                type="button"
                                onClick={() => handleToggleCapability(capability.id)}
                                disabled={!canManage || selectedRole.isLocked}
                                className={`rounded-[var(--radius-card)] border px-3 py-3 text-left transition disabled:opacity-60 ${enabled
                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/12'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/40'
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{capability.label}</div>
                                  <div className={`h-5 w-10 rounded-full border transition ${enabled ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/20' : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'}`}>
                                    <div className={`mt-[1px] h-4 w-4 rounded-full bg-[var(--color-text-primary)] transition ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{capability.description}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {focus !== 'permissions' && (
                <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Assignments</div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Attach this role to one or more users or bots. Effective authority is the union of all attached role capabilities.</div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[140px_1fr_auto]">
                    <select
                      value={assignmentEntityType}
                      onChange={(event) => setAssignmentEntityType(event.target.value)}
                      disabled={!canManage || savingRole}
                      className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
                    >
                      <option value="user">User</option>
                      <option value="bot">Bot</option>
                    </select>
                    <select
                      value={assignmentEntityId}
                      onChange={(event) => setAssignmentEntityId(event.target.value)}
                      disabled={!canManage || savingRole}
                      className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
                    >
                      <option value="">Select {assignmentEntityType}</option>
                      {(assignmentEntityType === 'bot' ? directoryBots : directoryUsers)
                        .filter((entity) => !selectedRole.assignedEntities.some((assignment) => assignment.entityType === entity.entityType && assignment.entityId === entity.entityId))
                        .map((entity) => (
                          <option key={`${entity.entityType}:${entity.entityId}`} value={entity.entityId}>
                            {entity.label}{entity.secondaryLabel ? ` • ${entity.secondaryLabel}` : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAttachSelectedRole}
                      disabled={!canManage || !assignmentEntityId || savingRole}
                      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-60"
                    >
                      Attach
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedRole.assignedEntities.length ? selectedRole.assignedEntities.map((assignment) => (
                      <div key={assignment.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{assignment.entityLabel}</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{assignment.entityType} • {assignment.entitySecondaryLabel || assignment.entityId}</div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!canManage) return;
                              setSavingRole(true);
                              setRolesError('');
                              try {
                                const nextBundle = await detachWorkspaceRoleApi(workspaceId, selectedRole.id, assignment.entityType, assignment.entityId);
                                setRoleBundle(nextBundle);
                              } catch (detachError) {
                                setRolesError(detachError.message || 'Unable to detach role.');
                              } finally {
                                setSavingRole(false);
                              }
                            }}
                            disabled={!canManage || savingRole}
                            className="rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                          >
                            Detach
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-[var(--color-text-secondary)]">No entities currently attached.</div>
                    )}
                  </div>
                </div>
              )}

              {rolesError && <div className="rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{rolesError}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ GLOBAL VARIABLES MANAGER ============
const GlobalVarsManager = () => {
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState('');
  const [isSystem, setIsSystem] = useState(false);
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  useEffect(() => { fetchVars(); }, []);

  const fetchVars = async () => {
    setLoading(true);
    setError('');
    try {
      const tenantSettings = await loadCanonicalTenantSettings();
      setVars(mapCanonicalGlobalVariables(tenantSettings));
    } catch (loadError) {
      setError(loadError?.message || loadError?.detail || String(loadError) || 'Unable to load variables.');
    } finally {
      setLoading(false);
    }
  };

  const addVar = async () => {
    setError('');
    setStatus('');
    let finalKey = newKey.trim();
    if (!finalKey || !newValue) {
      setError("Key and Value are required.");
      return;
    }
    const isValidSystemKey = /^[A-Z0-9_]+$/.test(finalKey);
    const isTemplateKey = finalKey.startsWith('{{') && finalKey.endsWith('}}');

    if (!isValidSystemKey && !isTemplateKey) {
      finalKey = `{{${finalKey}}}`;
    }

    try {
      await upsertGlobalVariableApi({
        key: finalKey,
        value: newValue,
        description: newDesc,
        isSecret: isSecret,
        isSystem: isSystem || isValidSystemKey
      });
      setNewKey('');
      setNewValue('');
      setNewDesc('');
      setIsSecret(false);
      setIsSystem(false);
      setStatus('Variable saved.');
      triggerSavedAction('add-variable');
      await fetchVars();
    } catch (saveError) {
      setError(saveError?.message || saveError?.detail || String(saveError) || 'Unable to save variable.');
    }
  };

  const deleteVar = async (id) => {
    setError('');
    setStatus('');
    try {
      await deleteGlobalVariableApi(id);
      setVars(current => current.filter(item => item.id !== id));
      setStatus('Variable removed.');
    } catch (deleteError) {
      setError(deleteError?.message || deleteError?.detail || String(deleteError) || 'Unable to remove variable.');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8">
        <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg border border-[var(--color-border)] space-y-4">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3"><input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. userEmail)" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-4"><input value={newValue} onChange={e => setNewValue(e.target.value)} type={isSecret ? "password" : "text"} placeholder="Value" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-3"><input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-2 flex gap-2">
              <button onClick={() => setIsSecret(!isSecret)} className={`p-2 rounded-[var(--radius-card)] ${isSecret ? 'bg-yellow-500/20 text-yellow-500' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}`} title="Secret"><Lock size={16} /></button>
              <button onClick={() => setIsSystem(!isSystem)} className={`p-2 rounded-[var(--radius-card)] ${isSystem ? 'bg-blue-500/20 text-blue-300' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}`} title="System Variable"><Cog size={16} /></button>
              <button onClick={addVar} className={saveButtonClassName("flex-1 btn-primary-skeuo text-sm font-medium py-2 rounded-[var(--radius-card)]", savedAction === 'add-variable')}>{savedAction === 'add-variable' ? 'Saved' : 'Add'}</button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {status && <p className="text-xs text-emerald-400">{status}</p>}
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-12 px-4 text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider"><div className="col-span-3">Key</div><div className="col-span-4">Value</div><div className="col-span-4">Description</div><div className="col-span-1 text-right">Action</div></div>
          <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)]">{vars.map(v => (<div key={v.id} className="grid grid-cols-12 px-4 py-3 items-center text-sm"><div className="col-span-3 font-mono text-[var(--color-primary)]/70">{v.key}</div><div className="col-span-4 text-[var(--color-text-primary)] truncate font-mono">{v.isSecret ? '••••••••' : v.value}</div><div className="col-span-4 text-[var(--color-text-secondary)] text-xs">{v.description || '-'}</div><div className="col-span-1 text-right"><button onClick={() => deleteVar(v.id)} className="text-[var(--color-text-secondary)] hover:text-red-500"><Trash2 size={14} /></button></div></div>))}</div>
        </div>
      </div>
    </div>
  );
};

const WHITE_LABEL_AVAILABLE_ICONS = [
  'LayoutDashboard', 'Users', 'Bot', 'Workflow', 'Radio', 'Calendar',
  'MessageSquare', 'PenTool', 'GitMerge', 'FileText', 'ShoppingCart', 'Globe',
  'Phone', 'Settings', 'Video', 'CreditCard', 'Zap', 'Shield', 'Tag', 'Layout',
  'Activity', 'Crosshair', 'Box', 'CheckSquare', 'Key', 'Lock',
  'Briefcase', 'FileInput', 'Webhook', 'Link', 'Power', 'Download', 'Package', 'Clock',
  'Server', 'Chrome', 'PhoneCall', 'Paperclip', 'CheckCircle', 'AlertCircle', 'Play',
  'User', 'Bell', 'Smartphone', 'MapPin', 'Receipt', 'Cpu', 'Target', 'ShieldCheck',
  'AlertOctagon', 'Bookmark', 'Flag', 'TrendingUp', 'DollarSign', 'Type', 'ListChecks'
];

const LucideIcon = ({ name, size = 16, className = "", color = "currentColor" }) => {
  const Icon = Lucide[name] || Lucide.Box;
  return <Icon size={size} className={className} style={{ color }} />;
};

const cloneMenuStructure = (value) => JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));

const buildDefaultBrandingData = () => ({
  menuBackgroundColor: 'var(--color-bg-primary)',
  menuTextColor: 'var(--color-text-primary)',
  layout: 'sidebar-left',
  theme: 'auto',
  companyLogo: '',
  companyName: 'AIO CRM',
  brandName: 'AIO CRM',
  logoUrl: '/aio-button-192px.png',
  primaryColor: '#3b82f6',
  secondaryColor: '#1e40af',
  accentColor: '#8b5cf6',
  footerText: 'Generated by Cortex',
  disclaimer: 'Confidential - Internal Use Only',
  contactInfo: '',
  reportHeaderLabel: 'Cortex Intelligence Report',

  // Advanced admin surfaces (persisted under tenantSettings.branding; schema allows additional properties).
  javascriptHtml: '',
  conditionalJavascript: '',
  language: 'English',
  country: 'United States',
  currency: 'USD',
  planCancelUrl: '',
});

const buildDefaultMobileItems = () => ([
  { id: 1, title: 'Terms of Service', url: 'https://policy.omcoxed.co/terms-of-service', icon: 'FileText' },
  { id: 2, title: 'Privacy Policy', url: 'https://policy.omcoxed.co/privacy-policy', icon: 'Lock' },
  { id: 3, title: 'Acceptable Use Policy', url: 'https://policy.omcoxed.co/acceptable-use-policy', icon: 'Shield' },
]);

const useWhiteLabelControlPlane = ({ menuStructure, onMenuUpdate, handlersRef }) => {
  const { tenant, refreshSession } = useAuth();
  const { setBrandConfig } = useBrand();
  const tenantSettings = tenant?.tenantSettings || tenant?.settings || {};
  const persistedMenuStructure = Array.isArray(tenantSettings?.navigation?.menuStructure)
    ? tenantSettings.navigation.menuStructure
    : Array.isArray(tenantSettings?.menuStructure)
      ? tenantSettings.menuStructure
      : null;
  const persistedMobileItems = Array.isArray(tenantSettings?.navigation?.mobileItems)
    ? tenantSettings.navigation.mobileItems
    : null;
  const draftMenuStructure = Array.isArray(menuStructure) && menuStructure.length > 0
    ? menuStructure
    : Array.isArray(persistedMenuStructure)
      ? persistedMenuStructure
      : [];

  const [menuItems, setMenuItems] = useState([]);
  const [menuDraftDirty, setMenuDraftDirty] = useState(false);
  const [mobileItems, setMobileItems] = useState(() => (
    Array.isArray(persistedMobileItems) ? persistedMobileItems : buildDefaultMobileItems()
  ));
  const [brandingData, setBrandingData] = useState(() => ({
    ...buildDefaultBrandingData(),
    ...(tenantSettings?.branding || {})
  }));
  const [showMenuModal, setShowMenuModal] = useState({ open: false, editIdx: null, catIdx: null });
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [modalFormData, setModalFormData] = useState({
    title: '',
    link: '',
    icon: 'Box',
    iconColor: 'var(--color-text-tertiary)',
    backgroundColor: 'var(--color-bg-secondary)',
    enableIframe: false
  });

  useEffect(() => {
    setMenuItems(cloneMenuStructure(draftMenuStructure));
    setMenuDraftDirty(false);
  }, [tenant?.id, persistedMenuStructure, menuStructure]);

  useEffect(() => {
    setMobileItems(Array.isArray(persistedMobileItems) ? persistedMobileItems : buildDefaultMobileItems());
  }, [tenant?.id, persistedMobileItems]);

  useEffect(() => {
    setBrandingData({
      ...buildDefaultBrandingData(),
      ...(tenantSettings?.branding || {}),
    });
  }, [tenant?.id, tenantSettings]);

  const persistWhiteLabel = async (nextBranding = brandingData, nextMenu = menuItems, nextMobileItems = mobileItems) => {
    if (!tenant?.id) {
      return;
    }
    const nextMenuToPersist = menuDraftDirty ? nextMenu : persistedMenuStructure;
    const updatedTenantSettings = await updateCanonicalTenantSettingsApi({
      branding: nextBranding,
      navigation: {
        ...(tenantSettings?.navigation || {}),
        menuStructure: nextMenuToPersist,
        mobileItems: Array.isArray(nextMobileItems) ? nextMobileItems : [],
      },
    });
    let refreshedTenantSettings = null;
    try {
      const refreshed = await refreshSession?.();
      refreshedTenantSettings = refreshed?.tenant?.tenantSettings || null;
    } catch (error) {
      console.warn('Failed to refresh session after white-label save; using canonical save response.', error);
    }
    const resolvedTenantSettings = refreshedTenantSettings || updatedTenantSettings || {};
    const refreshedBranding = resolvedTenantSettings?.branding || nextBranding;
    const refreshedMenu = resolvedTenantSettings?.navigation?.menuStructure;
    setBrandConfig(refreshedBranding);
    if (Array.isArray(refreshedMenu) && refreshedMenu.length > 0) {
      onMenuUpdate?.(refreshedMenu);
    }
    setMenuDraftDirty(false);
  };

  const handleResetWhiteLabel = async () => {
    const nextBranding = buildDefaultBrandingData();
    setBrandingData(nextBranding);
    setMenuItems(cloneMenuStructure(draftMenuStructure));
    setMenuDraftDirty(false);
    const nextMobile = Array.isArray(persistedMobileItems) ? persistedMobileItems : buildDefaultMobileItems();
    setMobileItems(nextMobile);
    await persistWhiteLabel(nextBranding, persistedMenuStructure, nextMobile);
  };

  const handleSaveWhiteLabel = async () => {
    await persistWhiteLabel(brandingData, menuItems, mobileItems);
  };

  useEffect(() => {
    if (handlersRef) {
      handlersRef.reset = handleResetWhiteLabel;
      handlersRef.save = handleSaveWhiteLabel;
    }
  });

  const toggleItemVisibility = async (categoryIdx, itemIdx) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items[itemIdx].visible = !updated[categoryIdx].items[itemIdx].visible;
    setMenuItems(updated);
    setMenuDraftDirty(true);
    // Autosave for Navigation persistence
    await persistWhiteLabel(brandingData, updated, mobileItems);
  };

  const updateBrandingColor = (colorType, value) => {
    setBrandingData((current) => ({ ...current, [colorType]: value }));
  };

  const updateBrandingTheme = (newTheme) => {
    setBrandingData((current) => ({ ...current, theme: newTheme }));
  };

  const updateBrandingLayout = (layout) => {
    setBrandingData((current) => ({ ...current, layout }));
  };

  const openMenuModal = (catIdx = null, itemIdx = null) => {
    if (itemIdx !== null && catIdx !== null) {
      const item = menuItems[catIdx]?.items?.[itemIdx];
      setModalFormData({
        title: item?.label || '',
        link: item?.url || '',
        icon: item?.icon || 'Box',
        iconColor: item?.iconColor || 'var(--color-text-tertiary)',
        backgroundColor: item?.backgroundColor || 'var(--color-bg-secondary)',
        enableIframe: item?.type === 'iframe'
      });
    } else {
      setModalFormData({
        title: '',
        link: '',
        icon: 'Box',
        iconColor: 'var(--color-text-tertiary)',
        backgroundColor: 'var(--color-bg-secondary)',
        enableIframe: false
      });
    }
    setShowMenuModal({ open: true, editIdx: itemIdx, catIdx });
    setIconSearch('');
    setShowIconPicker(false);
  };

  const closeMenuModal = () => {
    setShowMenuModal({ open: false, editIdx: null, catIdx: null });
    setModalFormData({
      title: '',
      link: '',
      icon: 'Box',
      iconColor: 'var(--color-text-tertiary)',
      backgroundColor: 'var(--color-bg-secondary)',
      enableIframe: false
    });
    setShowIconPicker(false);
    setIconSearch('');
  };

  const saveMenuItemChanges = async () => {
    const updated = cloneMenuStructure(menuItems);
    const nextItem = {
      label: modalFormData.title,
      url: modalFormData.link,
      icon: modalFormData.icon,
      iconColor: modalFormData.iconColor,
      backgroundColor: modalFormData.backgroundColor,
      visible: true,
      type: modalFormData.enableIframe ? 'iframe' : 'internal'
    };

    if (showMenuModal.editIdx !== null && showMenuModal.catIdx !== null) {
      const existingItem = updated[showMenuModal.catIdx]?.items?.[showMenuModal.editIdx] || {};
      updated[showMenuModal.catIdx].items[showMenuModal.editIdx] = {
        ...existingItem,
        ...nextItem
      };
    } else {
      const firstCategoryIndex = updated.findIndex((category) => Array.isArray(category?.items));
      if (firstCategoryIndex >= 0) {
        updated[firstCategoryIndex].items.push({
          id: `custom-${Date.now()}`,
          ...nextItem
        });
      }
    }

    setMenuItems(updated);
    setMenuDraftDirty(true);
    closeMenuModal();
    // Autosave for Navigation persistence
    await persistWhiteLabel(brandingData, updated, mobileItems);
  };

  const filteredIcons = WHITE_LABEL_AVAILABLE_ICONS.filter((icon) =>
    icon.toLowerCase().includes(iconSearch.toLowerCase())
  );

  const isIframeBlocked = (url) => {
    const blockedDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'linkedin.com'];
    try {
      const urlObj = new URL(url);
      return blockedDomains.some((domain) => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  };

  const replaceMobileItems = (nextItems) => {
    setMobileItems(Array.isArray(nextItems) ? nextItems : []);
  };

  return {
    brandingData,
    setBrandingData,
    menuItems,
    setMenuItems,
    mobileItems,
    setMobileItems: replaceMobileItems,
    menuDraftDirty,
    updateBrandingColor,
    updateBrandingTheme,
    updateBrandingLayout,
    handleResetWhiteLabel,
    handleSaveWhiteLabel,
    toggleItemVisibility,
    openMenuModal,
    closeMenuModal,
    saveMenuItemChanges,
    showMenuModal,
    showIconPicker,
    setShowIconPicker,
    iconSearch,
    setIconSearch,
    modalFormData,
    setModalFormData,
    filteredIcons,
    isIframeBlocked,
  };
};

const WhiteLabelMenuItemModal = ({
  showMenuModal,
  closeMenuModal,
  modalFormData,
  setModalFormData,
  showIconPicker,
  setShowIconPicker,
  iconSearch,
  setIconSearch,
  filteredIcons,
  isIframeBlocked,
  saveMenuItemChanges,
}) => {
  if (!showMenuModal.open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={closeMenuModal}
      />

      <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl z-50 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Add Navigation Icon</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">Customize menu item appearance and behavior</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-2 relative">
              <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon</div>
              <button
                type="button"
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-center hover:border-[var(--color-primary)] transition shadow-inner"
              >
                <LucideIcon name={modalFormData.icon} size={28} color={modalFormData.iconColor} />
              </button>

              {showIconPicker && (
                <div className="absolute top-20 left-0 right-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 z-50 w-80 max-h-64 flex flex-col">
                  <input
                    type="text"
                    placeholder="Search icons..."
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-[var(--color-text-primary)] mb-2 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="overflow-y-auto grid grid-cols-4 gap-2 no-scrollbar">
                    {filteredIcons.map((iconName) => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => {
                          setModalFormData({ ...modalFormData, icon: iconName });
                          setShowIconPicker(false);
                        }}
                        className={`p-2 rounded-xl flex items-center justify-center transition border ${modalFormData.icon === iconName
                          ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)]'
                          : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]'
                          }`}
                        title={iconName}
                      >
                        <LucideIcon name={iconName} size={20} color={modalFormData.icon === iconName ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon Color</div>
              <input
                type="color"
                value={modalFormData.iconColor}
                onChange={(e) => setModalFormData({ ...modalFormData, iconColor: e.target.value })}
                className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Background Color</div>
              <input
                type="color"
                value={modalFormData.backgroundColor}
                onChange={(e) => setModalFormData({ ...modalFormData, backgroundColor: e.target.value })}
                className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Title</label>
            <input
              type="text"
              placeholder="AIO H.I.D.E."
              value={modalFormData.title}
              onChange={(e) => setModalFormData({ ...modalFormData, title: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Link</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={modalFormData.link}
              onChange={(e) => setModalFormData({ ...modalFormData, link: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enableIframe"
                checked={modalFormData.enableIframe}
                onChange={(e) => setModalFormData({ ...modalFormData, enableIframe: e.target.checked })}
                className="w-4 h-4 rounded cursor-pointer accent-blue-600"
              />
              <label htmlFor="enableIframe" className="text-sm text-[var(--color-text-primary)] cursor-pointer">
                When clicked open link embedded in the application
              </label>
            </div>

            {modalFormData.enableIframe && modalFormData.link && isIframeBlocked(modalFormData.link) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded p-3 flex gap-2">
                <div className="text-red-500 text-lg">⚠️</div>
                <div>
                  <p className="text-xs font-medium text-red-500">Embedding Blocked</p>
                  <p className="text-xs text-red-400 mt-1">This website has restrictions that prevent embedding into menu items. Please use a direct link instead.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-6 flex gap-3 justify-end">
          <button
            onClick={closeMenuModal}
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition"
          >
            Cancel
          </button>
          <button
            onClick={saveMenuItemChanges}
            disabled={!modalFormData.title || !modalFormData.link}
            className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-[var(--color-text-primary)] hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
};

// ============ WHITE LABEL SETTINGS ============
const WhiteLabelSettings = ({ menuStructure, onMenuUpdate, handlersRef }) => {
  const [activeTab, setActiveTab] = useState('branding');
  const [expandedCategory, setExpandedCategory] = useState('Main');
  const {
    brandingData,
    setBrandingData,
    menuItems,
    updateBrandingColor,
    updateBrandingTheme,
    updateBrandingLayout,
    toggleItemVisibility,
    openMenuModal,
    closeMenuModal,
    saveMenuItemChanges,
    showMenuModal,
    showIconPicker,
    setShowIconPicker,
    iconSearch,
    setIconSearch,
    modalFormData,
    setModalFormData,
    filteredIcons,
    isIframeBlocked,
  } = useWhiteLabelControlPlane({ menuStructure, onMenuUpdate, handlersRef });

  // Custom Menu Items State
  const [customMenuItems, setCustomMenuItems] = useState([
    { id: 1, title: 'Terms of Service', url: 'https://policy.omcoxed.co/terms-of-service', icon: '📋' },
    { id: 2, title: 'Privacy Policy', url: 'https://policy.omcoxed.co/privacy-policy', icon: '🔐' },
    { id: 3, title: 'Acceptable Use Policy', url: 'https://policy.omcoxed.co/acceptable-use-policy', icon: '📍' }
  ]);

  const [newCustomItem, setNewCustomItem] = useState({ title: '', url: '' });

  // Advanced Settings State
  const [advancedData, setAdvancedData] = useState({
    javascriptHtml: '',
    conditionalJavascript: '',
    language: 'English',
    country: 'United States',
    currency: 'USD',
    planCancelUrl: ''
  });

  const addCustomMenuItem = () => {
    if (newCustomItem.title && newCustomItem.url) {
      setCustomMenuItems([
        ...customMenuItems,
        { id: Date.now(), title: newCustomItem.title, url: newCustomItem.url, icon: '🔗' }
      ]);
      setNewCustomItem({ title: '', url: '' });
    }
  };

  const deleteCustomMenuItem = (id) => {
    setCustomMenuItems(customMenuItems.filter(item => item.id !== id));
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <div className="flex overflow-x-auto">
          {[
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'advanced', label: 'Advanced', icon: Cog },
            { id: 'mobile', label: 'Mobile App', icon: Smartphone },
            { id: 'ui', label: 'UI', icon: Layers },
            { id: 'styles', label: 'Styles', icon: PenTool },
            { id: 'package', label: 'Package', icon: Package },
            { id: 'emails', label: 'System Emails', icon: Inbox },
            { id: 'blueprints', label: 'Blueprints', icon: FileCode }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap flex items-center gap-2 ${activeTab === tab.id
                  ? 'text-[var(--color-text-primary)] border-blue-500'
                  : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'
                  }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {/* BRANDING TAB */}
        {activeTab === 'branding' && (
          <div className="space-y-6">
            {/* Theme selection removed for forced dark mode */}

            {/* Color Settings */}
            <div className="grid grid-cols-2 gap-4">
              {/* Menu Background Color */}
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Menu Background Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.menuBackgroundColor}
                    onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.menuBackgroundColor}
                    onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)}
                    className="flex-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
                <div
                  className="mt-4 h-16 rounded border border-[var(--color-border)]"
                  style={{ backgroundColor: brandingData.menuBackgroundColor }}
                />
              </div>

              {/* Menu Text Color */}
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Menu Text Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.menuTextColor}
                    onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.menuTextColor}
                    onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)}
                    className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
                <div
                  className="mt-4 h-16 rounded border border-[var(--color-border)] flex items-center justify-center text-sm font-medium"
                  style={{ backgroundColor: brandingData.menuBackgroundColor, color: brandingData.menuTextColor }}
                >
                  Sample Text
                </div>
              </div>
            </div>

            {/* Layout Selection */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Layout</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateBrandingLayout('sidebar-left')}
                  className={`p-3 rounded text-xs font-medium transition border text-left ${brandingData.layout === 'sidebar-left'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Left</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Classic layout</div>
                </button>
                <button
                  onClick={() => updateBrandingLayout('sidebar-right')}
                  className={`p-3 rounded text-xs font-medium transition border text-left ${brandingData.layout === 'sidebar-right'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Right</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Mirrored layout</div>
                </button>
              </div>
            </div>

            {/* Report Branding */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Report Branding</h3>

              {/* Brand Name */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Brand Name</label>
                <input
                  type="text"
                  value={brandingData.brandName || 'AIO CRM'}
                  onChange={(e) => {
                    const updated = { ...brandingData, brandName: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Your Brand Name"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Logo URL</label>
                <input
                  type="text"
                  value={brandingData.logoUrl || '/aio-button-192px.png'}
                  onChange={(e) => {
                    const updated = { ...brandingData, logoUrl: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="/aio-button-192px.png"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.primaryColor || '#3b82f6'}
                    onChange={(e) => {
                      const updated = { ...brandingData, primaryColor: e.target.value };
                      setBrandingData(updated);
                    }}
                    className="w-12 h-10 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.primaryColor || '#3b82f6'}
                    onChange={(e) => {
                      const updated = { ...brandingData, primaryColor: e.target.value };
                      setBrandingData(updated);
                    }}
                    className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
              </div>

              {/* Report Header Label */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Report Header Label</label>
                <input
                  type="text"
                  value={brandingData.reportHeaderLabel || 'Cortex Intelligence Report'}
                  onChange={(e) => {
                    const updated = { ...brandingData, reportHeaderLabel: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Cortex Intelligence Report"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Footer Text */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Footer Text</label>
                <input
                  type="text"
                  value={brandingData.footerText || 'Generated by Cortex'}
                  onChange={(e) => {
                    const updated = { ...brandingData, footerText: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Generated by Cortex"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Disclaimer */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Disclaimer</label>
                <input
                  type="text"
                  value={brandingData.disclaimer || 'Confidential - Internal Use Only'}
                  onChange={(e) => {
                    const updated = { ...brandingData, disclaimer: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Confidential - Internal Use Only"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Contact Info */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Contact Info</label>
                <input
                  type="text"
                  value={brandingData.contactInfo || ''}
                  onChange={(e) => {
                    const updated = { ...brandingData, contactInfo: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="contact@yourcompany.com"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ADVANCED TAB - Custom Code & Localization */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {/* Warning Alert */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <p className="text-sm font-medium text-yellow-600">Attention!</p>
                <p className="text-xs text-yellow-600 mt-1">These settings apply only to YOUR customers and NOT your account. Custom code from your parent account will show on your account</p>
              </div>
            </div>

            {/* JavaScript/HTML Code Blocks */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">JavaScript/HTML (Pixels, Analytics, Chat)</label>
                <textarea
                  value={advancedData.javascriptHtml}
                  onChange={(e) => setAdvancedData({ ...advancedData, javascriptHtml: e.target.value })}
                  placeholder="Enter JavaScript or HTML code..."
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono min-h-[120px] focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Conditional JavaScript/HTML (only when customer enabled Support Access)</label>
                <textarea
                  value={advancedData.conditionalJavascript}
                  onChange={(e) => setAdvancedData({ ...advancedData, conditionalJavascript: e.target.value })}
                  placeholder="Enter conditional JavaScript or HTML code..."
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono min-h-[120px] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Localization Settings */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Localization</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Language</label>
                  <select
                    value={advancedData.language}
                    onChange={(e) => setAdvancedData({ ...advancedData, language: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Italian</option>
                    <option>Portuguese</option>
                    <option>Chinese</option>
                    <option>Japanese</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Country</label>
                  <select
                    value={advancedData.country}
                    onChange={(e) => setAdvancedData({ ...advancedData, country: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>United States</option>
                    <option>Canada</option>
                    <option>United Kingdom</option>
                    <option>Australia</option>
                    <option>Germany</option>
                    <option>France</option>
                    <option>Spain</option>
                    <option>Mexico</option>
                    <option>Brazil</option>
                    <option>India</option>
                    <option>Japan</option>
                    <option>China</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Currency</label>
                  <select
                    value={advancedData.currency}
                    onChange={(e) => setAdvancedData({ ...advancedData, currency: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                    <option>CAD</option>
                    <option>AUD</option>
                    <option>JPY</option>
                    <option>CNY</option>
                    <option>INR</option>
                    <option>MXN</option>
                    <option>BRL</option>
                  </select>
                </div>
              </div>

              {/* Plan Cancel URL */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Plan Cancel URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/cancel"
                  value={advancedData.planCancelUrl}
                  onChange={(e) => setAdvancedData({ ...advancedData, planCancelUrl: e.target.value })}
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM MENU NAVIGATION ITEMS */}
        {activeTab === 'mobile' && (
          <div className="space-y-6">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Custom Menu Navigation Items</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Show on mobile app Footer</p>
                </div>
                <button className="text-xl hover:scale-110 transition">➕</button>
              </div>

              {/* Add New Custom Item */}
              <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Title"
                    value={newCustomItem.title}
                    onChange={(e) => setNewCustomItem({ ...newCustomItem, title: e.target.value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={newCustomItem.url}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, url: e.target.value })}
                      className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={addCustomMenuItem}
                      className="bg-blue-600 hover:bg-blue-700 text-[var(--color-text-primary)] px-4 py-2 rounded text-sm font-medium transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Items List */}
              <div className="divide-y divide-[var(--color-border)]">
                {customMenuItems.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-[var(--color-bg-primary)] transition">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{item.icon}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</div>
                        <div className="text-xs text-blue-400 underline cursor-pointer">{item.url}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">✏️</button>
                        <button
                          onClick={() => deleteCustomMenuItem(item.id)}
                          className="p-2 hover:bg-red-900/30 rounded transition text-[var(--color-text-secondary)] hover:text-red-400"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* UI TAB - System Menu Navigation Icons */}
        {activeTab === 'ui' && (
          <div className="space-y-6">
            {/* Icon Legend */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase mb-3">Icon Key</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👁️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Show/Hide</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚫</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Reset Icon</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Copy Link</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">☑️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Show in PDA</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">✏️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Edit</span>
                </div>
              </div>
            </div>

            {/* Menu Items List */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">System Menu Navigation Icons</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Show on left navigation menu</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModalFormData({
                        title: '',
                        link: '',
                        icon: 'Link',
                        iconColor: 'var(--color-text-tertiary)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        enableIframe: true
                      });
                      setShowMenuModal({ open: true, editIdx: null, catIdx: null });
                    }}
                    className="text-sm px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition border border-blue-500/30"
                    title="Add iframe link"
                  >
                    🔗 Add iframe Link
                  </button>
                  <button
                    onClick={() => setShowMenuModal({ open: true, editIdx: null, catIdx: null })}
                    className="text-2xl hover:scale-110 transition"
                    title="Add new menu item"
                  >
                    ➕
                  </button>
                </div>
              </div>

              {/* Items Container */}
              <div className="divide-y divide-[var(--color-border)] p-4 space-y-4">
                {menuItems.map((category, catIdx) =>
                  category.items.map((item, itemIdx) => (
                    <div
                      key={`${catIdx}-${itemIdx}`}
                      className="p-3 hover:bg-[var(--color-bg-primary)] transition rounded flex items-center gap-4 group cursor-move"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('itemData', JSON.stringify({ catIdx, itemIdx }));
                      }}
                    >
                      {/* Icon Circle */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl"
                        style={{ backgroundColor: item.backgroundColor || 'var(--color-border)', color: item.iconColor || 'var(--color-text-tertiary)' }}
                      >
                        {item.icon === 'Bot' ? '🤖' : item.icon === 'LayoutDashboard' ? '📊' : item.icon === 'Settings' ? '⚙️' : item.icon === 'Link' ? '🔗' : item.icon === 'Activity' ? '📈' : item.icon === 'Zap' ? '⚡' : item.icon === 'Workflow' ? '🔄' : item.icon === 'CalendarIcon' ? '📅' : item.icon === 'MessageSquare' ? '💬' : item.icon === 'PenTool' ? '🎨' : item.icon === 'GitMerge' ? '🔀' : item.icon === 'FileText' ? '📋' : '📌'}
                      </div>

                      {/* Label and Type */}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[var(--color-text-primary)]">{item.label}</div>
                        {item.url && <div className="text-xs text-blue-400">{item.url}</div>}
                        <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {item.type === 'iframe' ? 'iframe menu item' : 'internal menu item'}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-1 flex-shrink-0">
                        {/* Furthest Left: Show in PDA */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          title="Show in PDA"
                        >
                          ☐
                        </button>

                        {/* Left: Show/Hide */}
                        <button
                          onClick={() => toggleItemVisibility(catIdx, itemIdx)}
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-blue-400"
                          title={item.visible ? 'Hide item' : 'Show item'}
                        >
                          {item.visible ? '👁️' : '🚫'}
                        </button>

                        {/* Center: Reset Icon */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-red-400"
                          title="Reset icon to default"
                        >
                          🚫
                        </button>

                        {/* Left-Center: Edit */}
                        <button
                          onClick={() => setShowMenuModal({ open: true, editIdx: itemIdx, catIdx: catIdx })}
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          title="Edit menu item"
                        >
                          ✏️
                        </button>

                        {/* Furthest Right: Copy Link */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-blue-400"
                          title="Copy link"
                        >
                          🔗
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emails' && <SystemEmailsSettings />}

        {/* OTHER TABS - Placeholder */}
        {['styles', 'package', 'blueprints'].includes(activeTab) && (
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-8 text-center">
            <p className="text-[var(--color-text-secondary)] text-sm">This section is under development</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">Check back soon for more customization options</p>
          </div>
        )}
      </div>

      {/* MENU ITEM EDIT MODAL */}
      {showMenuModal.open && (
        <>
          {/* Modal Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeMenuModal}
          />

          {/* Modal Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl z-50 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Add Navigation Icon</h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">Customize menu item appearance and behavior</p>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Icon and Color Pickers Section */}
              <div className="grid grid-cols-3 gap-4">
                {/* Icon Picker */}
                <div className="flex flex-col items-center gap-2 relative">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon</div>
                  <button
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-center text-2xl hover:border-blue-500 transition"
                  >
                    {modalFormData.icon === 'Bot' ? '🤖' : modalFormData.icon === 'LayoutDashboard' ? '📊' : modalFormData.icon === 'Settings' ? '⚙️' : '📦'}
                  </button>

                  {/* Icon Picker Dropdown */}
                  {showIconPicker && (
                    <div className="absolute top-20 left-0 right-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 z-50 w-80 max-h-64 flex flex-col">
                      <input
                        type="text"
                        placeholder="Search icons..."
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-[var(--color-text-primary)] mb-2 focus:border-blue-500 focus:outline-none"
                      />
                      <div className="overflow-y-auto grid grid-cols-4 gap-2">
                        {filteredIcons.map(icon => (
                          <button
                            key={icon}
                            onClick={() => {
                              setModalFormData({ ...modalFormData, icon });
                              setShowIconPicker(false);
                            }}
                            className={`p-2 rounded text-center text-xs font-medium transition ${modalFormData.icon === icon
                              ? 'bg-blue-600/30 border border-blue-500 text-blue-400'
                              : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-gray-500'
                              }`}
                            title={icon}
                          >
                            {icon.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Icon Color */}
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon Color</div>
                  <input
                    type="color"
                    value={modalFormData.iconColor}
                    onChange={(e) => setModalFormData({ ...modalFormData, iconColor: e.target.value })}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
                  />
                </div>

                {/* Background Color */}
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Background Color</div>
                  <input
                    type="color"
                    value={modalFormData.backgroundColor}
                    onChange={(e) => setModalFormData({ ...modalFormData, backgroundColor: e.target.value })}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
                  />
                </div>
              </div>

              {/* Title Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Title</label>
                <input
                  type="text"
                  placeholder="AIO H.I.D.E.™"
                  value={modalFormData.title}
                  onChange={(e) => setModalFormData({ ...modalFormData, title: e.target.value })}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Link Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Link</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={modalFormData.link}
                  onChange={(e) => setModalFormData({ ...modalFormData, link: e.target.value })}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Iframe Toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="enableIframe"
                    checked={modalFormData.enableIframe}
                    onChange={(e) => setModalFormData({ ...modalFormData, enableIframe: e.target.checked })}
                    className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="enableIframe" className="text-sm text-[var(--color-text-primary)] cursor-pointer">
                    When clicked open link embedded in the application
                  </label>
                </div>

                {/* Iframe Warning */}
                {modalFormData.enableIframe && modalFormData.link && isIframeBlocked(modalFormData.link) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3 flex gap-2">
                    <div className="text-red-500 text-lg">⚠️</div>
                    <div>
                      <p className="text-xs font-medium text-red-500">Embedding Blocked</p>
                      <p className="text-xs text-red-400 mt-1">This website has restrictions that prevent embedding into menu items. Please use a direct link instead.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-6 flex gap-3 justify-end">
              <button
                onClick={closeMenuModal}
                className="px-4 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={saveMenuItemChanges}
                disabled={!modalFormData.title || !modalFormData.link}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-[var(--color-text-primary)] hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SystemEmailsSettings = ({ search = '', onSearchChange }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: '', sendTo: '', enabled: true, bodyText: '' });
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  const loadTemplates = async (nextSearch = search) => {
    setLoading(true);
    setError('');
    try {
      const tenantSettings = await loadCanonicalTenantSettings();
      setTemplates(mapCanonicalSystemEmailTemplates(tenantSettings, nextSearch));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load system email templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates('');
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadTemplates(search);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const handleToggle = async (template) => {
    // Disabled in current phase - Coming Soon
    return;
  };

  const openEditor = (template) => {
    setEditing(template);
    setDraft({
      subject: template.subject || '',
      sendTo: template.sendTo || '',
      enabled: !!template.enabled,
      bodyText: template.bodyText || ''
    });
  };

  const handleSaveTemplate = async () => {
    if (!editing) {
      return;
    }
    setError('');
    setStatus('');
    try {
      const updated = await updateSystemEmailTemplateApi(editing.id, draft);
      await loadTemplates(search);
      setEditing(null);
      setStatus(`${updated.emailType} saved.`);
      triggerSavedAction('save-template');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save system email template.');
    }
  };

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{status}</div>}
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
            <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search templates" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">Tenant-scoped system notices and workflow emails.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] uppercase text-xs tracking-wide">
              <tr>
                <th className="text-left px-5 py-4 w-[180px]">Email Type</th>
                <th className="text-left px-5 py-4 w-[240px]">Subject</th>
                <th className="text-left px-5 py-4 w-[140px]">Send To</th>
                <th className="text-left px-5 py-4 w-[120px]">Edited By</th>
                <th className="text-left px-5 py-4 w-[120px]">Edited At</th>
                <th className="text-left px-5 py-4 w-[80px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && templates.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-[var(--color-text-secondary)]">Loading templates...</td>
                </tr>
              )}
              {templates.map(template => (
                <tr key={template.id} className="bg-[var(--color-bg-secondary)]">
                  <td className="px-5 py-4 text-[var(--color-text-primary)] font-medium truncate">{template.emailType}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)] truncate">{template.subject}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)] truncate">{template.sendTo}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)] truncate">{template.editedByName || 'AIO Flow\u2122'}</td>
                  <td className="px-5 py-4 text-[var(--color-text-secondary)] truncate">{template.editedAt || template.updatedAt}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => openEditor(template)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)]">
                      <Edit2 size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && templates.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-[var(--color-text-secondary)]">No system emails matched that search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setEditing(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-[520px] bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl z-50 flex flex-col">
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <div className="flex items-center gap-3">
                <Inbox size={18} className="text-[var(--color-primary)]" />
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{editing.emailType}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">Edit recipient target, subject, and default message copy.</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Subject</label>
                <input value={draft.subject} onChange={(event) => setDraft(current => ({ ...current, subject: event.target.value }))} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Send To</label>
                <input value={draft.sendTo} onChange={(event) => setDraft(current => ({ ...current, sendTo: event.target.value }))} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Default Message Copy</label>
                <textarea value={draft.bodyText} onChange={(event) => setDraft(current => ({ ...current, bodyText: event.target.value }))} className="w-full min-h-[220px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Close</button>
              <button onClick={handleSaveTemplate} className={saveButtonClassName("px-4 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-primary)] font-medium", savedAction === 'save-template')}>{savedAction === 'save-template' ? 'Saved' : 'Save Template'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============ PROFILE SETTINGS (Personal + Security merged) ============
const ProfileSettings = () => {
  const { user, refreshSession } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    locale: 'en-US',
    timezone: 'America/New_York',
    emailSignature: ''
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [hasLocalPassword, setHasLocalPassword] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const profile = await getProfileApi();
        setForm({
          displayName: profile?.name || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          locale: profile?.locale || 'en-US',
          timezone: profile?.timezone || 'America/New_York',
          emailSignature: profile?.emailSignature || ''
        });
        setAvatarUrl(profile?.avatarUrl || '');
        setHasLocalPassword(profile?.provider !== 'google-oauth' && profile?.provider !== 'github-oauth' && profile?.provider !== 'microsoft-oauth');
      } catch (loadError) {
        setError(loadError?.message || loadError?.detail || String(loadError) || 'Unable to load your profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const data = await getAuthSessionsApi();
        setSessions(data || []);
      } catch { }
      setLoadingSessions(false);
    };
    loadSessions();
  }, []);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB.');
      return;
    }
    setAvatarUploading(true);
    setError('');
    try {
      const result = await uploadAvatarApi(file);
      setAvatarUrl(result.data?.avatarUrl || '');
      await refreshSession?.();
      setStatus('Avatar updated.');
    } catch (err) {
      setError(err?.message || err?.detail || String(err) || 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setAvatarUploading(true);
    setError('');
    try {
      await deleteAvatarApi();
      setAvatarUrl('');
      await refreshSession?.();
      setStatus('Avatar removed.');
    } catch (err) {
      setError(err?.message || err?.detail || String(err) || 'Failed to remove avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      await updateProfileApi({
        displayName: form.displayName,
        phone: form.phone,
        locale: form.locale,
        timezone: form.timezone,
        emailSignature: form.emailSignature
      });
      await refreshSession?.();
      setStatus('Profile updated.');
      triggerSavedAction('save-profile');
    } catch (saveError) {
      setError(saveError?.message || saveError?.detail || String(saveError) || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setStatus('');
    try {
      await changePasswordApi(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setStatus('Password updated.');
      triggerSavedAction('update-password');
    } catch (passwordError) {
      setError(passwordError?.message || passwordError?.detail || String(passwordError) || 'Unable to update password.');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    setError('');
    setStatus('');
    try {
      await revokeAuthSessionApi(sessionId);
      setSessions(current => current.filter(item => item.id !== sessionId));
      setStatus('Session revoked.');
    } catch (revokeError) {
      setError(revokeError?.message || revokeError?.detail || String(revokeError) || 'Unable to revoke session.');
    }
  };

  const handleLogoutOthers = async () => {
    setError('');
    setStatus('');
    try {
      await logoutOtherSessionsApi();
      const loadSessions = async () => {
        setLoadingSessions(true);
        try {
          const data = await getAuthSessionsApi();
          setSessions(data || []);
        } catch { }
        setLoadingSessions(false);
      };
      await loadSessions();
      setStatus('All other sessions were logged out.');
    } catch (logoutError) {
      setError(logoutError?.message || logoutError?.detail || String(logoutError) || 'Unable to log out other sessions.');
    }
  };

  const handleExportData = async () => {
    setError('');
    setStatus('Requesting data archive...');
    try {
      const resp = await exportUserDataApi();
      setStatus(resp.message || 'Data bundle preparation started. You will receive an email shortly.');
    } catch (err) {
      setError(err?.message || 'Verification of privacy service failed.');
    }
  };

  const handleDeleteAccountExecution = async () => {
    setDeletingAccount(true);
    setError('');
    try {
      await deleteUserAccountApi();
      clearStoredSessionToken();
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Failed to delete account.');
      setDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };

  const initials = (form.displayName || user?.name || 'A').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'A';

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">{error}</div>}
        {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 mb-4">{status}</div>}

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN - Personal */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Personal</h3>

            {/* Profile Card */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="grid grid-cols-[auto_1fr] gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-[var(--color-border)]" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-cyan-500 flex items-center justify-center text-2xl font-bold text-[var(--color-text-primary)] border-2 border-[var(--color-border)]">
                        {initials}
                      </div>
                    )}
                    {avatarUploading && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarChange} className="hidden" id="avatar-upload" />
                  <label htmlFor="avatar-upload" className="cursor-pointer text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                    {avatarUploading ? 'Uploading...' : 'Upload Photo'}
                  </label>
                  {avatarUrl && (
                    <button onClick={handleDeleteAvatar} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Display Name</label>
                      <input autoComplete="off" value={form.displayName} onChange={(e) => setForm(c => ({ ...c, displayName: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Email</label>
                      <input autoComplete="off" type="email" value={form.email} disabled className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] opacity-80" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Phone</label>
                    <input
                      id="aio-personal-tel"
                      name="aio-tel"
                      type="tel"
                      value={form.phone || ''}
                      onChange={(e) => setForm(c => ({ ...c, phone: e.target.value }))}
                      autoComplete="one-time-code"
                      inputMode="tel"
                      pattern="[0-9+ \-\(\)]*"
                      className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Language</label>
                      <select value={form.locale} onChange={(e) => setForm(c => ({ ...c, locale: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                        <option value="en-US">English (US)</option>
                        <option value="en-GB">English (UK)</option>
                        <option value="es-ES">Espanol</option>
                        <option value="es-MX">Espanol MX</option>
                        <option value="fr-FR">Francais</option>
                        <option value="de-DE">Deutsch</option>
                        <option value="pt-BR">Portugues</option>
                        <option value="it-IT">Italiano</option>
                        <option value="ja-JP">日本語</option>
                        <option value="zh-CN">中文</option>
                        <option value="ko-KR">한국어</option>
                        <option value="ar-SA">العربية</option>
                        <option value="hi-IN">हिन्दी</option>
                        <option value="nl-NL">Nederlands</option>
                        <option value="pl-PL">Polski</option>
                        <option value="ru-RU">Русский</option>
                        <option value="tr-TR">Türkçe</option>
                        <option value="vi-VN">Tiếng Việt</option>
                        <option value="th-TH">ไทย</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Timezone</label>
                      <select value={form.timezone} onChange={(e) => setForm(c => ({ ...c, timezone: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                        <option value="America/New_York">America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="America/Anchorage">America/Anchorage</option>
                        <option value="Pacific/Honolulu">Pacific/Honolulu</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                        <option value="Europe/Berlin">Europe/Berlin</option>
                        <option value="Europe/Madrid">Europe/Madrid</option>
                        <option value="Europe/Rome">Europe/Rome</option>
                        <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                        <option value="Europe/Moscow">Europe/Moscow</option>
                        <option value="Asia/Dubai">Asia/Dubai</option>
                        <option value="Asia/Kolkata">Asia/Kolkata</option>
                        <option value="Asia/Bangkok">Asia/Bangkok</option>
                        <option value="Asia/Singapore">Asia/Singapore</option>
                        <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                        <option value="Asia/Shanghai">Asia/Shanghai</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                        <option value="Asia/Seoul">Asia/Seoul</option>
                        <option value="Australia/Sydney">Australia/Sydney</option>
                        <option value="Pacific/Auckland">Pacific/Auckland</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleSave} disabled={saving || loading} className={saveButtonClassName("bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60 text-[var(--color-text-primary)] px-4 py-1.5 rounded-lg text-xs font-bold", savedAction === 'save-profile')}>
                  {saving ? 'Saving...' : savedAction === 'save-profile' ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Change Password</h4>
              {hasLocalPassword ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Current Password</label>
                      <input id="current-pw" name="current-password-field" type="password" autoComplete="off" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(c => ({ ...c, currentPassword: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">New Password</label>
                      <input id="new-pw" name="new-password-field" type="password" autoComplete="off" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(c => ({ ...c, newPassword: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleChangePassword} className={saveButtonClassName("bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-primary)] px-4 py-1.5 rounded-lg text-xs font-bold", savedAction === 'update-password')}>
                      {savedAction === 'update-password' ? 'Saved' : 'Update Password'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[var(--color-text-secondary)] py-2">
                  Password managed via OAuth provider. Set a local password to enable email/password login.
                </div>
              )}
            </div>

            {/* Email Signature */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Email Signature</h4>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3">
                <textarea
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-[var(--color-text-primary)] min-h-[80px] focus:outline-none focus:border-[var(--color-primary)]"
                  value={form.emailSignature}
                  onChange={(e) => setForm(c => ({ ...c, emailSignature: e.target.value }))}
                  placeholder={`Best regards,\n\n${form.displayName || user?.name || 'AIO CRM'}`}
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Security */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Security</h3>

            {/* Active Sessions */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="p-3 border-b border-[var(--color-border)]">
                <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Active Sessions ({sessions.length})</h4>
              </div>
              <div className="divide-y divide-[var(--color-border)] max-h-[420px] overflow-y-auto">
                {loadingSessions && <div className="p-3 text-xs text-[var(--color-text-secondary)]">Loading...</div>}
                {!loadingSessions && sessions.slice(0, 7).map(session => (
                  <div key={session.id} className="p-3 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--color-text-primary)] font-medium flex items-center gap-2">
                        <Monitor size={11} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                        <span className="truncate">{session.label}</span>
                        {session.isCurrent && <span className="text-[9px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded-full flex-shrink-0">Current</span>}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-secondary)]">Last: {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : 'Unknown'}</div>
                    </div>
                    {!session.isCurrent && <button onClick={() => handleRevokeSession(session.id)} className="text-[10px] text-red-400 hover:text-red-300 flex-shrink-0 ml-2">Revoke</button>}
                  </div>
                ))}
              </div>
              {sessions.length > 1 && (
                <div className="p-2 border-t border-[var(--color-border)]">
                  <button onClick={handleLogoutOthers} className="w-full px-3 py-1.5 rounded-lg font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition text-[10px]">
                    Logout All Others
                  </button>
                </div>
              )}
            </div>

            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Data & Privacy</div>
              <div className="flex gap-2">
                <button 
                  onClick={handleExportData}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-blue-500/50 text-blue-400 text-[10px] font-medium transition"
                >
                  Download
                </button>
                <button 
                  onClick={() => setShowDeleteAccountConfirm(true)}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-red-500/50 text-red-400 text-[10px] font-medium transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <SystemConfirmModal
          isOpen={showDeleteAccountConfirm}
          onClose={() => setShowDeleteAccountConfirm(false)}
          onConfirm={handleDeleteAccountExecution}
          title="Delete Account"
          message="Are you sure you want to delete your account? This will revoke all active sessions, remove you from all workspaces, and permanently delete your user profile. This action cannot be undone."
          confirmText={deletingAccount ? "Deleting..." : "Permanently Delete"}
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </div>
  );
};



const OmegaSettings = () => {
  const { tenant, user, hasCapability } = useAuth();
  const currentRole = (tenant?.role || user?.role || 'viewer').toLowerCase();
  const isOwner = hasCapability('system.omega');
  const [protocol, setProtocol] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [armCode, setArmCode] = useState('');
  const [cancelCode, setCancelCode] = useState('');
  const [executeCode, setExecuteCode] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const loadOmega = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOmegaStatusApi();
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Omega status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOmega();
  }, [isOwner, tenant?.id]);

  useEffect(() => {
    if ((protocol?.status || 'idle') !== 'armed') {
      return undefined;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [protocol?.status, protocol?.execute_at]);

  const handleArm = async () => {
    setError('');
    setStatus('');
    try {
      const data = await armOmegaApi({
        confirmationCode: armCode,
        cancelCode: cancelCode
      });
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setStatus('Omega armed. Five-minute countdown started.');
      setExecuteCode(armCode);
      setArmCode('');
      setCancelCode('');
      setNowTick(Date.now());
    } catch (armError) {
      setError(armError.message || 'Unable to arm Omega.');
    }
  };

  const handleCancel = async () => {
    setError('');
    setStatus('');
    try {
      const data = await cancelOmegaApi({ cancelCode });
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setStatus('Omega sequence cancelled.');
      setCancelCode('');
      setExecuteCode('');
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel Omega.');
    }
  };

  const handleExecute = async () => {
    setError('');
    setStatus('');
    try {
      await executeOmegaApi({ confirmationCode: executeCode });
      clearStoredSessionToken();
      setStatus('Omega executed. Local app data was purged. Reloading...');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (executeError) {
      setError(executeError.message || 'Unable to execute Omega.');
    }
  };

  if (!isOwner) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-6">
        <div className="rounded-[var(--radius-panel)] border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          Omega governance is owner-only and does not appear for non-owner workspace roles.
        </div>
      </div>
    );
  }

  const omegaStatus = protocol?.status || 'idle';
  const readyToExecute = omegaStatus === 'armed' && protocol?.execute_at && new Date(protocol.execute_at).getTime() <= nowTick;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="space-y-6">
          <div className="rounded-[var(--radius-panel)] border border-red-500/30 bg-red-500/10 p-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Emergency Governance</div>
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">OMEGA Kill Switch</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              This surface only affects local app data and credentials/config within AIO CRM. It does not delete remote provider data.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{omegaStatus}</div>
              </div>
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Countdown</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{formatOmegaCountdown(protocol?.execute_at, nowTick)}</div>
              </div>
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Scope</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">Local app data only</div>
              </div>
            </div>
          </div>

          {(error || status) && (
            <div className={`rounded-[var(--radius-panel)] border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {error || status}
            </div>
          )}

          <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Arm Sequence</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Two separate codes are required. Arming starts a fixed 5-minute countdown.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Confirmation Code</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={armCode}
                  onChange={(event) => setArmCode(event.target.value)}
                  placeholder="Enter arm code"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-red-400 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Cancel Code</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={cancelCode}
                  onChange={(event) => setCancelCode(event.target.value)}
                  placeholder="Enter separate cancel code"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleArm}
                disabled={loading || omegaStatus === 'armed'}
                className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/15 text-red-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Arm Omega
              </button>
              <button
                onClick={handleCancel}
                disabled={loading || omegaStatus !== 'armed' || !cancelCode.trim()}
                className="px-4 py-2 rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel Omega
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Execute Purge</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Execution only unlocks after the countdown completes. This clears local app data and forces a clean bootstrap state.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                type="password"
                value={executeCode}
                onChange={(event) => setExecuteCode(event.target.value)}
                placeholder="Re-enter confirmation code"
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-red-400 focus:outline-none"
              />
              <button
                onClick={handleExecute}
                disabled={!readyToExecute || !executeCode.trim()}
                className="px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/20 text-red-100 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Execute Omega
              </button>
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {readyToExecute ? 'Countdown complete. Execution is armed and awaiting the confirmation code.' : 'Execution stays locked until the countdown completes.'}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Protocol Notes</div>
            <div className="text-sm text-[var(--color-text-primary)]">`OMEGA` is hidden from normal agent routing and only lives in this owner-level control plane.</div>
            <div className="text-xs text-[var(--color-text-secondary)]">Remote mailbox, calendar, and third-party systems are not touched by v1 execution.</div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">Omega Activity</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Owner-only arming and cancellation events.</div>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {loading && <div className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">Loading...</div>}
              {!loading && events.map((event) => (
                <div key={event.id} className="px-5 py-4 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{event.eventType}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{new Date(event.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-sm text-[var(--color-text-primary)]">{event.detail || 'No detail recorded.'}</div>
                </div>
              ))}
              {!loading && events.length === 0 && (
                <div className="px-5 py-6 text-sm text-[var(--color-text-secondary)]">No Omega activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkspaceSettings = ({ view = 'all' }) => {
  const { tenant, tenants = [], switchTenant, refreshSession, user, hasCapability } = useAuth();
  const tenantSettings = tenant?.tenantSettings || tenant?.settings || {};
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(tenant?.id || '');
  const [memberships, setMemberships] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(tenant?.name || '');
  const [transcriptionProvider, setTranscriptionProvider] = useState(() => normalizeTranscriptionProviderSetting(tenantSettings?.media?.transcriptionProvider));
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('staff');
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingWorkspace, setArchivingWorkspace] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();
  const { roleBundle, setRoleBundle, loadingRoles, rolesError, reloadRoles } = useWorkspaceRoleAuthority(
    selectedWorkspaceId,
    Boolean(selectedWorkspaceId && ['owner', 'admin'].includes(String(tenant?.role || user?.role || 'viewer').toLowerCase()))
  );

  useEffect(() => {
    setSelectedWorkspaceId(tenant?.id || '');
    setWorkspaceName(tenant?.name || '');
    setTranscriptionProvider(normalizeTranscriptionProviderSetting(tenantSettings?.media?.transcriptionProvider));
    setShowArchiveConfirm(false);
  }, [tenant?.id, tenant?.name, tenantSettings?.media?.transcriptionProvider]);

  useEffect(() => {
    const loadMemberships = async () => {
      if (!selectedWorkspaceId) {
        setMemberships([]);
        return;
      }
      setLoadingMembers(true);
      setError('');
      try {
        const rows = await getWorkspaceMembershipsApi(selectedWorkspaceId);
        setMemberships(rows);
      } catch (loadError) {
        setError(loadError.message || 'Unable to load workspace members.');
      } finally {
        setLoadingMembers(false);
      }
    };

    loadMemberships();
  }, [selectedWorkspaceId]);

  const selectedWorkspace = tenants.find(item => item.id === selectedWorkspaceId) || tenant;
  const currentMembership = memberships.find(item => (item.userEmail || item.user_email) === user?.email);
  const currentRole = (currentMembership?.role || selectedWorkspace?.role || tenant?.role || 'viewer').toLowerCase();
  const canManageWorkspace = hasCapability('system.admin');
  const canCreateWorkspace = hasCapability('system.admin');
  const canArchiveWorkspace = hasCapability('system.omega');
  const alternateWorkspace = (tenants || []).find((workspace) => workspace.id !== selectedWorkspaceId) || null;
  const showPreferences = view !== 'members';
  const showMembers = view !== 'preferences';
  const archiveBlockedReason = !canArchiveWorkspace
    ? 'Only workspace owners can archive a workspace.'
    : !alternateWorkspace
      ? 'You cannot archive your only remaining accessible workspace.'
      : '';
  const availableRoleOptions = hasCapability('system.omega')
    ? ['owner', 'admin', 'staff', 'viewer']
    : ['admin', 'staff', 'viewer'];
  const roleIndex = buildEntityRoleIndex(roleBundle).index;
  const authorityRoles = roleBundle?.roles || [];

  const handleWorkspaceSelect = async (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    if (workspaceId && workspaceId !== tenant?.id && switchTenant) {
      await switchTenant(workspaceId);
    }
  };

  const handleRenameWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    setError('');
    setStatusMessage('');
    try {
      await updateWorkspaceApi(selectedWorkspaceId, { name: workspaceName.trim() });
      await refreshSession?.();
      setStatusMessage('Workspace updated.');
      triggerSavedAction('save-workspace-name');
    } catch (renameError) {
      setError(renameError.message || 'Unable to update workspace.');
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setError('');
    setStatusMessage('');
    try {
      await createWorkspaceApi({ name: newWorkspaceName.trim() });
      const session = await refreshSession?.();
      const nextWorkspaceId = session?.tenant?.id;
      setNewWorkspaceName('');
      if (nextWorkspaceId) {
        setSelectedWorkspaceId(nextWorkspaceId);
      }
      setStatusMessage('Workspace created and selected.');
      triggerSavedAction('create-workspace');
    } catch (createError) {
      setError(createError.message || 'Unable to create workspace.');
    }
  };

  const handleTranscriptionProviderChange = async (nextProvider) => {
    const normalized = normalizeTranscriptionProviderSetting(nextProvider);
    if (!canManageWorkspace || normalized === transcriptionProvider) {
      return;
    }
    setError('');
    setStatusMessage('');
    try {
      await updateCanonicalTenantSettingsApi({
        media: {
          ...(tenantSettings?.media || {}),
          transcriptionProvider: normalized,
        },
      });
      await refreshSession?.();
      setTranscriptionProvider(normalized);
      setStatusMessage('Transcription provider updated.');
      triggerSavedAction('save-transcription-provider');
    } catch (providerError) {
      setError(providerError.message || 'Unable to update transcription provider.');
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!selectedWorkspaceId || archiveBlockedReason) {
      return;
    }
    setArchivingWorkspace(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await deleteWorkspaceApi(selectedWorkspaceId);
      const refreshed = await refreshSession?.();
      const nextWorkspaceId = refreshed?.tenant?.id || response?.fallback_workspace_id || alternateWorkspace?.id || '';
      setSelectedWorkspaceId(nextWorkspaceId);
      setWorkspaceName(refreshed?.tenant?.name || '');
      setShowArchiveConfirm(false);
      setStatusMessage(`Workspace '${response?.workspace?.name || selectedWorkspace?.name || 'Workspace'}' archived.`);
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive workspace.');
    } finally {
      setArchivingWorkspace(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedWorkspaceId || !newMemberEmail.trim()) return;
    setError('');
    setStatusMessage('');
    try {
      const response = await addWorkspaceMemberApi(selectedWorkspaceId, {
        email: newMemberEmail.trim(),
        role: newMemberRole
      });
      setMemberships(response.memberships || []);
      await reloadRoles();
      setNewMemberEmail('');
      setNewMemberRole('staff');
      setStatusMessage('Workspace member saved.');
      triggerSavedAction('add-member');
    } catch (memberError) {
      setError(memberError.message || 'Unable to add workspace member.');
    }
  };

  const handleRoleChange = async (membershipId, role) => {
    if (!selectedWorkspaceId) return;
    setError('');
    try {
      const response = await updateWorkspaceMemberApi(selectedWorkspaceId, membershipId, { role });
      setMemberships(response.memberships || []);
      await reloadRoles();
      setStatusMessage('Member role updated.');
    } catch (memberError) {
      setError(memberError.message || 'Unable to update member role.');
    }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!selectedWorkspaceId) return;
    setError('');
    try {
      const response = await removeWorkspaceMemberApi(selectedWorkspaceId, membershipId);
      setMemberships(response.memberships || []);
      await reloadRoles();
      setStatusMessage('Member removed.');
      await refreshSession?.();
    } catch (memberError) {
      setError(memberError.message || 'Unable to remove member.');
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-6">
      {showPreferences && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Workspace Control</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">Manage the workspace shown in the top-right switcher and keep ownership clean as Phase 9 hardens.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Current Workspace</label>
                  <select
                    value={selectedWorkspaceId}
                    onChange={(event) => handleWorkspaceSelect(event.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {(tenants || []).map(workspace => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name} ({workspace.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Your Role</label>
                  <div className="px-3 py-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-sm text-[var(--color-text-primary)]">
                    {selectedWorkspace?.role || 'viewer'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <button
                  onClick={handleRenameWorkspace}
                  disabled={!canManageWorkspace}
                  className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-text-primary)] text-sm font-medium transition", savedAction === 'save-workspace-name')}
                >
                  {savedAction === 'save-workspace-name' ? 'Saved' : 'Save Name'}
                </button>
              </div>
            </div>

            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Create Workspace</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">Spin up a new workspace and move into it immediately. This is the first real admin surface for multi-tenant operation.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  placeholder="New workspace name"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <button
                  onClick={handleCreateWorkspace}
                  disabled={!canCreateWorkspace}
                  className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed", savedAction === 'create-workspace')}
                >
                  {savedAction === 'create-workspace' ? 'Created' : 'Create Workspace'}
                </button>
              </div>
              {!canCreateWorkspace && (
                <div className="text-xs text-[var(--color-text-secondary)]">
                  Workspace creation is limited to owners and admins.
                </div>
              )}
            </div>

            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Transcription Provider</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">Locks transcription to one provider. No fallback.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'ffmpeg_transcribe', label: 'FFMPEG' },
                  { value: 'elevenlabs_scribe', label: 'ELEVENLABS' },
                  { value: 'disabled', label: 'DISABLED' },
                ].map((option) => {
                  const active = transcriptionProvider === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleTranscriptionProviderChange(option.value)}
                      disabled={!canManageWorkspace}
                      className={`px-4 py-2 rounded-[var(--radius-card)] border text-xs font-semibold tracking-[0.16em] transition disabled:opacity-50 disabled:cursor-not-allowed ${active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30'
                        }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {!canManageWorkspace && (
                <div className="text-xs text-[var(--color-text-secondary)]">
                  Workspace admins control the locked transcription provider.
                </div>
              )}
              {savedAction === 'save-transcription-provider' && (
                <div className="text-xs text-emerald-300">Provider lock saved.</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {(statusMessage || error) && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                {error || statusMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {showMembers && (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Workspace Members</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Add existing app users, keep the legacy workspace role bridge explicit, and attach real role bundles to each member.</p>
            </div>
            <div className="flex items-center gap-3">
              {loadingMembers && <div className="text-xs text-[var(--color-text-secondary)]">Members loading…</div>}
              {loadingRoles && <div className="text-xs text-[var(--color-text-secondary)]">Roles loading…</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
            <input
              value={newMemberEmail}
              onChange={(event) => setNewMemberEmail(event.target.value)}
              placeholder="existing.user@example.com"
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            <select
              value={newMemberRole}
              onChange={(event) => setNewMemberRole(event.target.value)}
              disabled={!canManageWorkspace}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              {availableRoleOptions.filter(role => role !== 'owner').map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              onClick={handleAddMember}
              disabled={!canManageWorkspace}
              className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-text-primary)] text-sm font-medium transition", savedAction === 'add-member')}
            >
              {savedAction === 'add-member' ? 'Added' : 'Add Member'}
            </button>
          </div>

          <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden">
            {(memberships || []).map(member => (
              <div key={member.id} className="space-y-3 px-4 py-4 bg-[var(--color-bg-secondary)]">
                <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_180px_auto] gap-3 items-center">
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{member.user_name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{member.user_email}</div>
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)]">{member.provider}</div>
                  <select
                    value={member.role}
                    disabled={!canManageWorkspace}
                    onChange={(event) => handleRoleChange(member.id, event.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
                  >
                    {availableRoleOptions.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={!canManageWorkspace || member.user_email === user?.email}
                    className="px-3 py-2 rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 text-red-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>

                <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Attached Roles</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">
                      Effective capabilities: {(roleIndex[`user:${member.userId}`]?.effectiveCapabilities || []).length}
                    </div>
                  </div>
                  <RoleAssignmentEditor
                    workspaceId={selectedWorkspaceId}
                    entityType="user"
                    entityId={member.userId}
                    availableRoles={authorityRoles}
                    assignedRoles={authorityRoles.filter((role) => (roleIndex[`user:${member.userId}`]?.roleIds || []).includes(role.id))}
                    onRoleBundleUpdate={setRoleBundle}
                    canManage={canManageWorkspace}
                    compact
                  />
                </div>
              </div>
            ))}
            {memberships.length === 0 && !loadingMembers && (
              <div className="px-4 py-6 text-sm text-[var(--color-text-secondary)]">No members found for this workspace yet.</div>
            )}
          </div>

          {rolesError && (
            <div className="rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {rolesError}
            </div>
          )}

          {canArchiveWorkspace && (
            <div className="rounded-[var(--radius-panel)] border border-red-500/25 bg-red-500/8 p-6 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-red-300">Danger Zone</div>
                <div className="mt-1 text-sm text-[var(--color-text-primary)]">Archive workspace '{selectedWorkspace?.name || 'Workspace'}'?</div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">This removes the workspace from normal access and selection, but does not permanently delete its data.</div>
              </div>
              {showArchiveConfirm ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleArchiveWorkspace}
                    disabled={Boolean(archiveBlockedReason) || archivingWorkspace}
                    className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/15 text-red-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {archivingWorkspace ? 'Archiving...' : 'Confirm Archive'}
                  </button>
                  <button
                    onClick={() => setShowArchiveConfirm(false)}
                    disabled={archivingWorkspace}
                    className="px-4 py-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowArchiveConfirm(true)}
                  disabled={Boolean(archiveBlockedReason)}
                  className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/35 bg-red-500/10 text-red-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Archive Workspace
                </button>
              )}
              {archiveBlockedReason && (
                <div className="text-xs text-[var(--color-text-secondary)]">{archiveBlockedReason}</div>
              )}
              {!archiveBlockedReason && alternateWorkspace && (
                <div className="text-xs text-[var(--color-text-secondary)]">After archive, the session will switch to '{alternateWorkspace.name}'.</div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
};

// ============ MAIN SETTINGS MODULE ============
const SETTINGS_TAB_KEY = 'aio-settings-active-tab';

const SettingsModule = ({ menuStructure, onMenuUpdate, activeSettingsTab }) => {
  const { tenant, user } = useAuth();
  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const [activeTab, setActiveTab] = useState(() => {
    if (activeSettingsTab) return activeSettingsTab;
    try {
      const saved = localStorage.getItem(SETTINGS_TAB_KEY);
      if (saved && ['account', 'billing', 'workspace', 'whitelabel', 'variables', 'omega'].includes(saved)) {
        return saved;
      }
    } catch { }
    return 'account';
  });
  const isOwner = hasCapability('system.omega');
  const wlHandlers = useRef({ reset: null, save: null });

  useEffect(() => {
    if (activeSettingsTab) {
      setActiveTab(activeSettingsTab);
    }
  }, [activeSettingsTab]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, tabId);
    } catch { }
  };

  const mainTabs = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'variables', label: 'Variables', icon: Key },
    { id: 'whitelabel', label: 'White Label', icon: Globe },
    { id: 'workspace', label: 'Workspace', icon: Layers },
  ];
  const tabs = isOwner ? [...mainTabs, { id: 'omega', label: 'Omega', icon: Lock }] : mainTabs;

  const tabMeta = {
    account: { description: 'Identity, preferences, password, and active sessions.', status: 'Live' },
    workspace: { description: 'Switch, rename, and manage members.', status: 'Live' },
    whitelabel: { description: 'Brand, menu, and presentation controls.' },
    variables: { description: 'Global variables and tokens for builders and workflows.', status: 'Legacy' },
    omega: { eyebrow: 'Governance', description: 'Owner-only emergency protocol for app-local purge control.', status: 'Restricted' }
  };

  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const ActiveIcon = activeTabData?.icon;
  const activeMeta = tabMeta[activeTab] || {};
  const isWhiteLabel = activeTab === 'whitelabel';

  const renderContent = () => {
    switch (activeTab) {
      case 'account': return <ProfileSettings />;
      case 'workspace': return <WorkspaceSettings />;
      case 'whitelabel': return <WhiteLabelSettings menuStructure={menuStructure} onMenuUpdate={onMenuUpdate} handlersRef={wlHandlers.current} />;
      case 'variables': return <GlobalVarsManager />;
      case 'omega': return <OmegaSettings />;
      default: return <ProfileSettings />;
    }
  };

  return (
    <div className="module-root-standard">
      {/* Toolbar */}
      <div className="module-toolbar">
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {ActiveIcon && <ActiveIcon size={14} className="text-[var(--color-primary)] flex-shrink-0" />}
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">{activeTabData?.label || 'Settings'}</span>
        </div>

        {/* Left: Tab Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {mainTabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-2.5 py-1 flex items-center gap-1 text-[10px] font-medium rounded-md border transition whitespace-nowrap ${activeTab === tab.id
                  ? 'text-[var(--color-text-primary)] border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10'
                  : 'text-[var(--color-text-secondary)] border-transparent bg-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                  }`}
              >
                <TabIcon size={11} />
                {tab.label}
              </button>
            );
          })}
          {isOwner && (
            <>
              <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
              <button
                onClick={() => handleTabChange('omega')}
                className={`px-2.5 py-1 flex items-center gap-1 text-[10px] font-medium rounded-md border transition whitespace-nowrap ${activeTab === 'omega'
                  ? 'text-red-300 border-red-500/40 bg-red-500/10'
                  : 'text-red-300/60 border-transparent bg-transparent hover:text-red-300 hover:bg-red-500/10'
                  }`}
              >
                <Lock size={11} />
                Omega
              </button>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => wlHandlers.current.reset?.()} className="text-[10px] py-1 px-2 h-6 flex items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30 transition whitespace-nowrap">Reset</button>
            <button onClick={() => wlHandlers.current.save?.()} className="text-[10px] py-1 px-2 h-6 flex items-center justify-center rounded border border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/20 transition font-medium whitespace-nowrap">Save</button>
          </div>
          <div className="module-toolbar-utility">
            <button onClick={() => toggleAIAssist({ mode: 'brain' })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"><BrainIcon size={14} /></button>
            <button onClick={() => toggleAIAssist({ mode: 'help', context: { module: 'settings', tab: activeTab } })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"><Crosshair size={14} /></button>
            <button onClick={() => openGlobalOverlay()} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"><CommandSurfaceIcon size={14} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="module-content-stage module-surface-shell">
        <div className="flex-1 min-h-0 overflow-hidden p-2">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// ============ INTERNAL SECTIONS (Extracted for decomposition) ============
// These receive props from WhiteLabelSettings - centralized state/handlers

const BrandingSection = ({ brandingData, setBrandingData, updateBrandingColor, updateBrandingTheme, updateBrandingLayout }) => (
  <div className="h-full min-h-0 overflow-y-auto p-6 space-y-6">
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Appearance</div>
        <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Branding</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Theme, layout, and report-facing identity controls.</p>
      </div>
      {/* Theme selection removed for forced dark mode */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Menu Background</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brandingData.menuBackgroundColor} onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)} className="h-11 w-12 rounded border border-[var(--color-border)] bg-transparent" />
            <input value={brandingData.menuBackgroundColor} onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)} className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Menu Text</label>
          <div className="flex items-center gap-3">
            <input type="color" value={brandingData.menuTextColor} onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)} className="h-11 w-12 rounded border border-[var(--color-border)] bg-transparent" />
            <input value={brandingData.menuTextColor} onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)} className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono" />
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { id: 'sidebar-left', label: 'Sidebar Left', note: 'Classic workspace navigation.' },
          { id: 'sidebar-right', label: 'Sidebar Right', note: 'Mirrored workspace navigation.' },
        ].map((layout) => (
          <button
            key={layout.id}
            onClick={() => updateBrandingLayout?.(layout.id)}
            className={`rounded-[var(--radius-card)] border px-4 py-3 text-left transition ${brandingData.layout === layout.id
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
          >
            <div className="text-sm font-semibold">{layout.label}</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{layout.note}</div>
          </button>
        ))}
      </div>
    </div>
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">Report Identity</h4>
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['brandName', 'Brand Name', 'AIO CRM'],
          ['logoUrl', 'Logo URL', '/aio-button-192px.png'],
          ['reportHeaderLabel', 'Report Header Label', 'Cortex Intelligence Report'],
          ['footerText', 'Footer Text', 'Generated by Cortex'],
          ['contactInfo', 'Contact Info', 'contact@yourcompany.com'],
          ['primaryColor', 'Primary Color', '#3b82f6'],
        ].map(([key, label, placeholder]) => (
          <div key={key} className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">{label}</label>
            <input
              value={brandingData[key] || ''}
              onChange={(event) => setBrandingData?.((current) => ({ ...current, [key]: event.target.value }))}
              placeholder={placeholder}
              className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const NavigationSection = ({ menuItems, openMenuModal, toggleItemVisibility }) => (
  <div className="space-y-4 h-full flex flex-col min-h-0">
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-island-sm">
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-tertiary)]">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Navigation Menu</h3>
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">Customize the order and appearance of sidebar modules.</p>
        </div>
        <button
          onClick={() => openMenuModal()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:opacity-90 transition shadow-lg"
        >
          <Plus size={12} />
          Add Item
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {menuItems?.map((cat, catIdx) => (
          <div key={cat.category || cat.id} className="border border-[var(--color-border)] rounded-2xl overflow-hidden mb-4 bg-[var(--color-bg-primary)] shadow-sm">
            <div className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]">{cat.category}</div>
            <div className="divide-y divide-[var(--color-border)]">
              {cat.items?.map((item, itemIdx) => (
                <div key={itemIdx} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-tertiary)] transition-colors group">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-sm">
                    <LucideIcon name={item.icon} size={14} color={item.iconColor || 'var(--color-text-primary)'} />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{item.label}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] font-medium font-mono opacity-50">{item.id}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => toggleItemVisibility(catIdx, itemIdx)}
                      className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-all shadow-sm"
                      title={item.visible ? 'Hide Item' : 'Show Item'}
                    >
                      {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMenuModal(catIdx, itemIdx)}
                      className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-all shadow-sm"
                      title="Edit Item"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const AgentCard = ({ agent, styles, onSave, loadingList }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(agent.name || agent.label || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!localName.trim()) return;
    setSaving(true);
    try {
      await updateAiAgentApi(agent.registryKey, { name: localName.trim() });
      setIsEditing(false);
      if (loadingList) await loadingList();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4 shadow-sm group hover:border-[var(--color-primary)]/50 transition-all">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${styles.border} ${styles.bg} ${styles.text} shadow-inner`}>
          {agent.avatarUrl ? (
            <img src={agent.avatarUrl} className="h-8 w-8 rounded-lg object-cover" alt={agent.name} />
          ) : (
            <Lucide.Bot size={22} className="group-hover:scale-110 transition-transform" />
          )}
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-bold text-[var(--color-text-primary)]">
            {isEditing ? localName : (agent.name || agent.label || 'Unknown Agent')}
          </div>
          <div className="text-[10px] font-mono font-medium text-[var(--color-text-tertiary)] tracking-wider uppercase">{agent.registryKey}</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] opacity-60">Display Name</div>
          {isEditing ? (
            <div className="flex gap-2">
               <button onClick={() => { setIsEditing(false); setLocalName(agent.name || agent.label || ''); }} className="text-[9px] font-bold text-red-400 uppercase hover:underline">Cancel</button>
               <button 
                onClick={handleSave} 
                disabled={saving}
                className="text-[9px] font-bold text-emerald-400 uppercase hover:underline disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)} className="text-[9px] font-bold text-[var(--color-primary)] uppercase hover:underline">Edit Name</button>
          )}
        </div>
        {isEditing ? (
          <input
            autoFocus
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setIsEditing(false); setLocalName(agent.name || agent.label || ''); }
            }}
            className="w-full rounded-xl border border-[var(--color-primary)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none ring-1 ring-[var(--color-primary)]/30"
            placeholder="Agent Name"
          />
        ) : (
          <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/30 px-3 py-2 text-sm text-[var(--color-text-primary)] opacity-80">
            {agent.name || agent.label || ''}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1 text-[var(--color-text-tertiary)] opacity-40">
        <div className="flex-1 h-[1px] bg-current" />
        <span className="text-[8px] font-black uppercase tracking-[0.3em]">System Subordinate</span>
        <div className="flex-1 h-[1px] bg-current" />
      </div>
    </div>
  );
};

const AgentsSection = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAgentsList = async () => {
    setLoading(true);
    try {
      const data = await getAiAgentsApi(true);
      const normalized = Array.isArray(data) ? data.map(a => ({
        ...a,
        registryKey: a.registryKey || a.registry_key || a.agent_id || a.agentId,
        avatarUrl: a.avatarUrl || a.avatar_url
      })) : [];
      setAgents(normalized);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgentsList();
  }, []);

  const getAgentStyles = (key) => {
    const k = String(key || '').toUpperCase();
    const map = {
      ALPHA: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
      CHARLIE: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
      ECHO: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
      STRIKER: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
      OMEGA: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    };
    return map[k] || { bg: 'bg-[var(--color-bg-tertiary)]', border: 'border-[var(--color-border)]', text: 'text-[var(--color-primary)]' };
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-5">
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Packaging Scope</div>
          <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Agents</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Manage identity and display settings for workspace subordinates.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : agents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {agents.map((agent) => (
              <AgentCard 
                key={agent.registryKey} 
                agent={agent} 
                styles={getAgentStyles(agent.registryKey)} 
                loadingList={loadAgentsList}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed border-[var(--color-border)] rounded-2xl bg-[var(--color-bg-primary)]">
            <Lucide.Bot size={32} className="text-[var(--color-text-tertiary)] opacity-20 mb-3" />
            <div className="text-sm text-[var(--color-text-secondary)] font-medium">No agents found in directory.</div>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 py-4 text-[10px] text-[var(--color-text-secondary)] flex items-center gap-3">
          <Lucide.Shield size={14} className="text-[var(--color-primary)]" />
          <span>Agent avatars are currently managed by system theme. Cross-tenant identity overrides are fully persistent to the backend.</span>
        </div>
      </div>
    </div>
  );
};

const InjectionSection = ({ brandingData, setBrandingData }) => (
  <div className="h-full min-h-0 overflow-y-auto p-6 space-y-5">
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Appearance</div>
        <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Injection</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Custom JavaScript/HTML injection surfaces for pixels, analytics, and chat code.</p>
      </div>
      <div className="grid gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">JavaScript / HTML</label>
          <textarea
            value={brandingData.javascriptHtml || ''}
            onChange={(event) => setBrandingData?.((current) => ({ ...current, javascriptHtml: event.target.value }))}
            placeholder="<script>/* Pixels / Analytics / Chat */</script>"
            className="w-full min-h-[160px] resize-y rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[12px] font-mono text-[var(--color-text-primary)]"
          />
          <div className="text-xs text-[var(--color-text-tertiary)]">No rendering occurs in Settings. This stores tenant-scoped injection payload for downstream shells to consume.</div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Conditional JavaScript</label>
          <textarea
            value={brandingData.conditionalJavascript || ''}
            onChange={(event) => setBrandingData?.((current) => ({ ...current, conditionalJavascript: event.target.value }))}
            placeholder="/* conditional injection */"
            className="w-full min-h-[140px] resize-y rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[12px] font-mono text-[var(--color-text-primary)]"
          />
        </div>
      </div>
    </div>
  </div>
);

const LocalizationSection = ({ brandingData, setBrandingData }) => (
  <div className="h-full min-h-0 overflow-y-auto p-6 space-y-5">
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Appearance</div>
        <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Localization</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Tenant defaults for language, country, and currency formatting.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Language</label>
          <select
            value={brandingData.language || 'English'}
            onChange={(event) => setBrandingData?.((current) => ({ ...current, language: event.target.value }))}
            className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
            <option>German</option>
            <option>Portuguese</option>
            <option>Hindi</option>
            <option>Japanese</option>
            <option>Chinese</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Country</label>
          <select
            value={brandingData.country || 'United States'}
            onChange={(event) => setBrandingData?.((current) => ({ ...current, country: event.target.value }))}
            className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option>United States</option>
            <option>Canada</option>
            <option>United Kingdom</option>
            <option>Australia</option>
            <option>Germany</option>
            <option>France</option>
            <option>Spain</option>
            <option>Mexico</option>
            <option>Brazil</option>
            <option>India</option>
            <option>Japan</option>
            <option>China</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Currency</label>
          <select
            value={brandingData.currency || 'USD'}
            onChange={(event) => setBrandingData?.((current) => ({ ...current, currency: event.target.value }))}
            className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option>CAD</option>
            <option>AUD</option>
            <option>JPY</option>
            <option>CNY</option>
            <option>INR</option>
            <option>MXN</option>
            <option>BRL</option>
          </select>
        </div>
      </div>
    </div>
  </div>
);


const SystemEmailsSection = ({ search = '', onSearchChange = () => { } }) => (
  <div className="h-full min-h-0 overflow-y-auto p-6">
    <SystemEmailsSettings search={search} onSearchChange={onSearchChange} />
  </div>
);


const SETTINGS_SELECTION_KEY = 'aio-settings-selection-v2';

function buildSettingsSelectionFromLegacy(activeSettingsTab) {
  switch (activeSettingsTab) {
    case 'profile':
    case 'account':
      return { categoryId: 'workspace', itemId: 'account' };
    case 'billing':
      return { categoryId: 'workspace', itemId: 'billing' };
    case 'whitelabel':
      return { categoryId: 'appearance', itemId: 'branding' };
    case 'variables':
      return { categoryId: 'system', itemId: 'variables' };
    case 'omega':
      return { categoryId: 'system', itemId: 'omega' };
    case 'workspace':
      return { categoryId: 'workspace', itemId: 'members' };
    default:
      return { categoryId: null, itemId: null };
  }
}

const SettingsPlaceholderSurface = ({ icon: Icon, title, description, detail }) => (
  <div className="h-full min-h-0 overflow-y-auto p-6">
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-primary)]">
          <Icon size={20} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Reserved Surface</div>
          <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-sm text-[var(--color-text-secondary)]">
        {detail}
      </div>
    </div>
  </div>
);

const SettingsAgentsSurface = () => (
  <div className="h-full min-h-0 overflow-y-auto p-6 space-y-5">
    <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Packaging Scope</div>
        <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">Agents</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Display-only customization surface. No execution or routing changes are introduced here.</p>
      </div>
      {[
        { id: 'salesAgent', label: 'Sales Agent' },
        { id: 'supportAgent', label: 'Support Agent' }
      ].map((agent) => (
        <div key={agent.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-primary)]">
              <Bot size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{agent.label}</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Canonical ID: {agent.id}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <input readOnly value={agent.label} className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)]" />
            <button disabled className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] opacity-70">Avatar / Icon</button>
          </div>
        </div>
      ))}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-4 text-sm text-[var(--color-text-secondary)]">
        Avatar and icon picker normalization is deferred for follow-up work.
      </div>
    </div>
  </div>
);


const buildSettingsCategories = (isAdmin) => {
  const adminCategories = [
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      description: 'Branding, navigation, agents, system emails, and admin presentation surfaces.',
      items: [
        { id: 'branding', label: 'Branding', description: 'Theme, layout, and report identity.' },
        { id: 'navigation', label: 'Navigation', description: 'Sidebar menu visibility and links.' },
        { id: 'agents', label: 'Agents', description: 'Packaging-scope presentation controls.' },
        { id: 'injection', label: 'Injection', description: 'JavaScript/HTML for pixels, analytics, and chat embeds.' },
        { id: 'localization', label: 'Localization', description: 'Language, country, and currency defaults.' },
        { id: 'systemEmails', label: 'System Emails', description: 'Tenant-scoped system notice templates.' },
      ],
    },
    {
      id: 'roles',
      label: 'Roles',
      icon: Shield,
      description: 'Roles, permissions, and access rules.',
      items: [
        { id: 'roles', label: 'Roles', description: 'Role model status and ownership scaffolding.' },
        { id: 'permissions', label: 'Permissions', description: 'Permission matrix placeholder.' },
        { id: 'accessRules', label: 'Access Rules', description: 'Access policy placeholder.' },
      ],
    },
    {
      id: 'system',
      label: 'System',
      icon: Cog,
      description: 'Omega, variables, and admin-level system controls.',
      items: [
        { id: 'omega', label: 'Omega', description: 'Owner-only emergency protocol surface.' },
        { id: 'variables', label: 'Variables', description: 'Global variables and tokens.' },
      ],
    },
  ];

  return [
    ...(isAdmin ? adminCategories : []),
    {
      id: 'workspace',
      label: 'Workspace',
      icon: Layers,
      description: 'Workspace members and workspace preferences.',
      items: [
        { id: 'account', label: 'Account', description: 'Profile, preferences, and sessions.' },
        { id: 'members', label: 'Members', description: 'Manage workspace memberships.' },
        { id: 'preferences', label: 'Preferences', description: 'Workspace-level configuration and locks.' },
      ],
    }
  ];
};

const getSettingsCategoryTone = (categoryId) => {
  switch (categoryId) {
    case 'appearance':
      return { colorVar: 'var(--node-action)', icon: Palette };
    case 'roles':
      return { colorVar: 'var(--node-logic)', icon: Shield };
    case 'system':
      return { colorVar: 'var(--node-webhook)', icon: Cog };
    case 'workspace':
      return { colorVar: 'var(--node-trigger)', icon: Layers };
    default:
      return { colorVar: 'var(--node-action)', icon: Settings };
  }
};

const SettingsSelectorPanel = ({
  categories,
  openCategory,
  activeCategoryId,
  activeItemId,
  onToggleCategory,
  onSelectItem,
}) => (
  <div className="flex flex-col">
    <h3 className="m-0 mb-3 text-[11px] font-semibold text-[var(--color-text-primary)] uppercase tracking-[0.18em]">Select Settings Type</h3>
    <div className="flex flex-col gap-1.5">
      {categories.map((category) => {
        const isOpen = openCategory === category.id;
        return (
          <div key={category.id} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <button
              className={`flex w-full items-center justify-between px-3 py-2 transition-all cursor-pointer font-medium text-[12px] ${isOpen
                ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/70'
                }`}
              onClick={() => onToggleCategory(category.id)}
            >
              <span className="flex-1 text-left">{category.label}</span>
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${activeCategoryId === category.id
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-text-primary)]'
                  : 'bg-[var(--color-hover)] text-[var(--color-text-secondary)]'
                  }`}>{category.items.length}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            </button>
            <div
              className="overflow-hidden transition-all duration-200 ease-out"
              style={{
                maxHeight: isOpen ? `${Math.max(category.items.length * 96, 120)}px` : '0',
                opacity: isOpen ? 1 : 0,
              }}
            >
              <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/30 px-2 py-2">
                <div className="flex flex-col gap-1.5">
                  {category.items.map((item) => (
                    <button
                      key={item.id}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-all text-left ${activeCategoryId === category.id && activeItemId === item.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-bg-tertiary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-tertiary)]'
                        }`}
                      onClick={() => onSelectItem(category.id, item.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="m-0 mb-0.5 text-[12px] font-semibold leading-tight text-[var(--color-text-primary)]">{item.label}</p>
                        <p className="m-0 text-[11px] text-[var(--color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">{item.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const SettingsShellModule = ({ menuStructure, onMenuUpdate, activeSettingsTab }) => {
  const { tenant, user } = useAuth();
  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const role = String(tenant?.role || user?.role || 'viewer').toLowerCase();
  const { hasCapability } = useAuth();
  const isAdmin = hasCapability('system.admin');
  const isOwner = hasCapability('system.omega');
  const categories = buildSettingsCategories(isAdmin);
  const { roleBundle } = useWorkspaceRoleAuthority(tenant?.id || '', true);
  const wlHandlers = useRef({ reset: null, save: null });
  const whiteLabel = useWhiteLabelControlPlane({ menuStructure, onMenuUpdate, handlersRef: wlHandlers.current });
  const [emailSearch, setEmailSearch] = useState('');
  const [selection, setSelection] = useState(() => buildSettingsSelectionFromLegacy(activeSettingsTab));
  const [openCategory, setOpenCategory] = useState(selection.categoryId || null);

  useEffect(() => {
    if (activeSettingsTab) {
      setSelection(buildSettingsSelectionFromLegacy(activeSettingsTab));
    } else {
      setSelection({ categoryId: null, itemId: null });
    }
  }, [activeSettingsTab]);

  useEffect(() => {
    if (!selection.categoryId) {
      return;
    }
    setOpenCategory(selection.categoryId);
  }, [selection.categoryId]);

  const activeCategory = categories.find((category) => category.id === selection.categoryId) || null;
  const activeItem = activeCategory?.items?.find((item) => item.id === selection.itemId) || null;
  const showLanding = !selection.itemId;
  const showWhiteLabelActions = selection.categoryId === 'appearance'
    && ['branding', 'injection', 'localization'].includes(selection.itemId);
  useEffect(() => {
    if (selection.categoryId && !activeCategory) {
      setSelection({ categoryId: null, itemId: null });
      return;
    }
    if (selection.itemId && activeCategory && !activeItem) {
      setSelection({ categoryId: activeCategory.id, itemId: null });
    }
  }, [selection.categoryId, selection.itemId, activeCategory, activeItem]);

  const renderControlPlane = () => {
    switch (`${selection.categoryId}:${selection.itemId}`) {
      case 'appearance:branding':
        return (
          <BrandingSection
            brandingData={whiteLabel.brandingData}
            setBrandingData={whiteLabel.setBrandingData}
            updateBrandingColor={whiteLabel.updateBrandingColor}
            updateBrandingTheme={whiteLabel.updateBrandingTheme}
            updateBrandingLayout={whiteLabel.updateBrandingLayout}
          />
        );
      case 'appearance:navigation':
        return (
          <>
            <NavigationSection
              menuItems={whiteLabel.menuItems}
              openMenuModal={whiteLabel.openMenuModal}
              toggleItemVisibility={whiteLabel.toggleItemVisibility}
            />
            <WhiteLabelMenuItemModal
              showMenuModal={whiteLabel.showMenuModal}
              closeMenuModal={whiteLabel.closeMenuModal}
              modalFormData={whiteLabel.modalFormData}
              setModalFormData={whiteLabel.setModalFormData}
              showIconPicker={whiteLabel.showIconPicker}
              setShowIconPicker={whiteLabel.setShowIconPicker}
              iconSearch={whiteLabel.iconSearch}
              setIconSearch={whiteLabel.setIconSearch}
              filteredIcons={whiteLabel.filteredIcons}
              isIframeBlocked={whiteLabel.isIframeBlocked}
              saveMenuItemChanges={whiteLabel.saveMenuItemChanges}
            />
          </>
        );
      case 'appearance:agents':
        return <AgentsSection agents={roleBundle?.directory?.bots || []} />;
      case 'appearance:injection':
        return <InjectionSection brandingData={whiteLabel.brandingData} setBrandingData={whiteLabel.setBrandingData} />;
      case 'appearance:localization':
        return <LocalizationSection brandingData={whiteLabel.brandingData} setBrandingData={whiteLabel.setBrandingData} />;
      case 'appearance:systemEmails':
        return <SystemEmailsSection search={emailSearch} onSearchChange={setEmailSearch} />;
      case 'roles:roles':
        return <RolesAuthoritySurface focus="roles" />;
      case 'roles:permissions':
        return <RolesAuthoritySurface focus="permissions" />;
      case 'roles:accessRules':
        return <RolesAuthoritySurface focus="accessRules" />;
      case 'system:variables':
        return <GlobalVarsManager />;
      case 'system:omega':
        return isOwner
          ? <OmegaSettings />
          : <SettingsPlaceholderSurface icon={Lock} title="Omega" description="Omega remains owner-only." detail="The system category is admin-only, and Omega itself remains restricted to owners." />;
      case 'workspace:account':
        return <ProfileSettings />;
      case 'workspace:members':
        return <WorkspaceSettings view="members" />;
      case 'workspace:preferences':
        return <WorkspaceSettings view="preferences" />;
      default:
        return (
          <div className="flex h-full items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-sm text-[var(--color-text-secondary)]">
            Select a settings surface from the left panel to load its control plane.
          </div>
        );
    }
  };

  const toggleCategory = (categoryId) => {
    setOpenCategory(openCategory === categoryId ? null : categoryId);
  };

  const selectItem = (categoryId, itemId) => {
    setSelection({ categoryId, itemId });
    setOpenCategory(categoryId);
  };

  const selectCategoryFromSplash = (categoryId) => {
    setSelection({ categoryId, itemId: null });
    setOpenCategory(categoryId);
  };

  return (
    <div className="module-root-standard">
      <ModuleHeader
        title="Settings"
        showTitle={false}
        leftActions={showWhiteLabelActions ? [
          { label: 'Reset', onClick: () => wlHandlers.current.reset?.(), variant: 'secondary' },
          { label: 'Save', onClick: () => wlHandlers.current.save?.(), variant: 'primary' },
        ] : []}
        toolbarCenterSlot={(
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-text-primary)]">{categories.length}</span>
            <span>Categories</span>
            {activeItem && (
              <>
                <span className="opacity-35">|</span>
                <span className="text-[var(--color-text-primary)]">{activeItem.label}</span>
              </>
            )}
          </div>
        )}
        onModuleAi={() => toggleAIAssist?.({ mode: 'help', context: { module: 'settings', category: selection.categoryId, item: selection.itemId } })}
      />

      <div className="module-content-stage px-2 pb-2">
        <div className="h-full flex-1 overflow-y-auto">
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-[var(--color-border)] px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Settings</div>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">Select a category, then choose a settings surface to load its control plane.</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
                  <SettingsSelectorPanel
                    categories={categories}
                    openCategory={openCategory}
                    activeCategoryId={selection.categoryId}
                    activeItemId={selection.itemId}
                    onToggleCategory={toggleCategory}
                    onSelectItem={selectItem}
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-hidden relative">
              {renderControlPlane()}
              {showLanding && (
                <div className="absolute inset-0 bg-[var(--color-bg-secondary)]/95 backdrop-blur-md rounded-[var(--radius-outer)] border border-[var(--color-border)] flex items-center justify-center overflow-y-auto">
                  <div className="max-w-5xl w-full text-center space-y-8 px-8 py-10">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-white/10">
                      <Settings size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h2>
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        Configure workspace presentation, access scaffolding, system controls, and workspace administration from one unified control plane.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left p-1">
                      {categories.map((category) => {
                        const tone = getSettingsCategoryTone(category.id);
                        const IconComp = tone.icon;
                        return (
                          <button
                            key={category.id}
                            onClick={() => selectCategoryFromSplash(category.id)}
                            className="text-left w-full h-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-strong)] transition-all p-2.5 space-y-1.5 cursor-pointer shadow-sm shadow-black/5 group min-w-0 flex flex-col min-h-[90px]"
                          >
                            <div className="flex items-start gap-2" style={{ color: tone.colorVar }}>
                              <IconComp size={15} className="mt-0.5 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_currentColor] transition-all flex-shrink-0" />
                              <span className="text-[13px] font-extrabold text-[var(--color-text-primary)] leading-tight">{category.label}</span>
                            </div>
                            <p className="m-0 text-[10px] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)] leading-[1.2] flex-1 overflow-hidden">{category.description}</p>
                            <div className="flex items-center justify-between pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[8px] uppercase tracking-wider font-bold text-[var(--color-text-tertiary)]">Configure</span>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="text-[var(--color-text-tertiary)]"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="pt-2">
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Select a settings category from the left panel, then choose a surface from its dropdown to configure.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Legacy tabs with reduced content (DEPRECATED - but kept for backward compatibility)
const AdvancedSection = () => (
  <div className="p-6 text-center text-sm text-slate-400">Advanced settings placeholder</div>
);
const MobileSection = () => (
  <div className="p-6 text-center text-sm text-slate-400">Mobile app settings placeholder</div>
);
const UISection = () => (
  <div className="p-6 text-center text-sm text-slate-400">UI settings placeholder</div>
);
const StylesSection = () => (
  <div className="p-6 text-center text-sm text-slate-400">Styles settings placeholder</div>
);
const PackageSection = () => (
  <div className="p-6 text-center text-sm text-slate-400">Package settings placeholder</div>
);

export { GlobalVarsManager, WhiteLabelSettings, ProfileSettings, WorkspaceSettings, OmegaSettings, BrandingSection, NavigationSection, AgentsSection, SystemEmailsSection };
export default SettingsShellModule;

