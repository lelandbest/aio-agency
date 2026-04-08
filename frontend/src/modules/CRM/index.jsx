import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const normalizeCsvHeader = (header) => {
  return header
    .toLowerCase()
    .replace(/[-_\s]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
};

import {
  createEmailVerificationBulkTaskApi,
  createWorkspaceUserApi,
  createContactApi,
  draftAiApi,
  getEmailVerificationBulkTaskApi,
  getEmailVerifierConfigApi,
  getCompaniesApi,
  getContactActivitiesApi,
  createContactActivityApi,
  getContactFormSubmissionsApi,
  getContactsApi,
  getUserAccessApi,
  getTagsApi,
  openThreadForContactApi,
  updateContactApi,
  verifyEmailApi
} from '../../services/backendApi';
import ModuleHeader from '../../components/ModuleHeader';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import { 
  Users, Plus, Mail, Phone, Search, ChevronDown, Tag, 
  Trash2, X, Download, MessageCircle, Calendar, Zap,
  AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ArrowLeft,
  Edit, Clipboard, FileInput, User, Building2, KeyRound, Shield, ExternalLink
} from 'lucide-react';

const CRMModule = ({ initialContactId = null, onSelectContact = null }) => {
  const { tenant, tenants = [], switchTenant } = useAuth();
  const { openAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const importInputRef = useRef(null);
  // State Management
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [sortField, setSortField] = useState('firstName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalTab, setCreateModalTab] = useState('Contact');
  const [selectedContact, setSelectedContact] = useState(null);
  
  // Contact detail view states
  const [activities, setActivities] = useState([]);
  const [activityTab, setActivityTab] = useState('Activity');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [formsSubmitted, setFormsSubmitted] = useState([]);
  const [userAccess, setUserAccess] = useState(null);
  const [loadingUserAccess, setLoadingUserAccess] = useState(false);
  const [showUserAccessModal, setShowUserAccessModal] = useState(false);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editedContact, setEditedContact] = useState(null);
  const [detailPanels, setDetailPanels] = useState({
    forms: true,
    flows: true,
    bookings: true,
    pipelines: true,
    billing: true
  });
  const [billingModal, setBillingModal] = useState(null);
  const [bulkActionModal, setBulkActionModal] = useState({ open: false, action: '', value: '' });
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [bulkActionAssistLoading, setBulkActionAssistLoading] = useState(false);
  const [bulkActionError, setBulkActionError] = useState('');
  const [emailVerifierConfig, setEmailVerifierConfig] = useState(null);
  const [emailVerificationTask, setEmailVerificationTask] = useState(null);
  const [bulkVerificationSubmitting, setBulkVerificationSubmitting] = useState(false);
  const [verifyingContactIds, setVerifyingContactIds] = useState(new Set());
  const [emailVerificationNotice, setEmailVerificationNotice] = useState(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, ids: [], names: '' });
  
  // Resizing state
  const [leftPanelWidth, setLeftPanelWidth] = useState(640);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [activeResizeSide, setActiveResizeSide] = useState(null);
  const layoutRef = useRef(null);

  const currentWorkspace = tenant || tenants[0] || null;
  
  // Filter states
  const [filters, setFilters] = useState({
    department: { operator: 'is', value: '', active: false },
    owner: { operator: 'is', value: '', active: false },
    company: { operator: 'is', value: '', active: false },
    tags: { operator: 'has', value: '', active: false },
    systemTags: { operator: 'has', value: '', active: false },
    flow: { operator: 'is', value: '', active: false },
    input: { operator: 'is', value: '', active: false },
    createdDate: { operator: 'is', value: '', active: false },
    updatedDate: { operator: 'is', value: '', active: false },
    lastContacted: { operator: 'is', value: '', active: false },
    smsEmailActivity: { operator: 'is', value: '', active: false },
    leadScore: { operator: 'is', value: '', active: false },
    address: { operator: 'is', value: '', active: false },
    extraDetails: { operator: 'is', value: '', active: false },
    pipeline: { operator: 'is', value: '', active: false },
    pipelineColumn: { operator: 'is', value: '', active: false },
    name: { operator: 'is', value: '', active: false },
    formSubmitted: { operator: 'has', value: '', active: false },
    formSubmissionDate: { operator: 'is', value: '', active: false }
  });

  // Filter Options (tags populated dynamically from API)
  const filterOperators = ['is', 'is not', 'is in', 'is not in', 'is defined', 'is not defined', 'has', 'has not'];
  
  const availableTags = tags.map(t => t.name).filter(Boolean).sort();
  
  const filterOptions = {
    department: ['Sales', 'Marketing', 'Support', 'Engineering', 'Operations', 'Product', 'Design', 'Analytics', 'Consulting', 'Creative', 'Administration'],
    owner: ['AIO Flow', 'System'],
    company: companies.map(c => c.name).filter(Boolean).sort(),
    tags: availableTags,
    systemTags: ['Automated', 'Manual', 'Imported', 'API Created', 'Form Submission'],
    flow: ['Active', 'Paused', 'Inactive', 'Completed'],
    input: ['Email', 'Phone', 'Form', 'API', 'Manual'],
    createdDate: ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year', 'Custom'],
    updatedDate: ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year', 'Custom'],
    lastContacted: ['Today', 'This week', 'This month', 'Last 30 days', 'Last 90 days'],
    smsEmailActivity: ['Active', 'Inactive', 'High Engagement', 'Low Engagement'],
    leadScore: ['90-100', '70-89', '50-69', '30-49', 'Below 30'],
    address: ['US', 'International', 'CA', 'TX', 'NY', 'FL'],
    extraDetails: ['Verified', 'Unverified', 'Complete', 'Incomplete'],
    pipeline: ['New', 'Qualified', 'Discovery', 'Closed Won', 'Closed Lost', 'Negotiating'],
    pipelineColumn: ['Planning', 'Active', 'Completed', 'On Hold'],
    name: ['A-M', 'N-Z'],
    formSubmitted: ['Contact Form', 'Demo Request', 'Newsletter Signup', 'Any Form'],
    formSubmissionDate: ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year']
  };

  const shellPanelClass = 'island-panel rounded-[var(--radius-outer)]';
  const innerPanelClass = 'rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm';
  const softActionClass = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/45 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]';
  const destructiveActionClass = 'rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-500/20';
  const primaryActionClass = 'btn-primary-skeuo !px-3 !py-2 !text-xs !font-medium !rounded-[var(--radius-card)]';

  useEffect(() => {
    if (!initialContactId || !contacts.length) return;
    const contact = contacts.find((entry) => entry.id === initialContactId);
    if (contact) {
      setSelectedContact(contact);
      if (onSelectContact) onSelectContact(contact.id);
    }
  }, [initialContactId, contacts, onSelectContact]);

  useEffect(() => {
    if (selectedContact && typeof window !== 'undefined') {
      const w = window.innerWidth - 64; 
      setLeftPanelWidth(Math.floor(w * 0.4)); 
      setRightPanelWidth(Math.floor(w * 0.2));
    }
  }, [selectedContact]);

  useEffect(() => {
    if (!activeResizeSide) return undefined;

    const handleMouseMove = (event) => {
      const bounds = layoutRef.current?.getBoundingClientRect();
      if (!bounds) return;

      if (activeResizeSide === 'left') {
        const nextWidth = Math.min(Math.max(event.clientX - bounds.left, 280), 1200);
        setLeftPanelWidth(nextWidth);
        return;
      }

      const nextWidth = Math.min(Math.max(bounds.right - event.clientX, 320), 800);
      setRightPanelWidth(nextWidth);
    };

    const handleMouseUp = () => setActiveResizeSide(null);
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResizeSide]);

  const selectContact = useCallback((contact) => {
    setSelectedContact(contact);
    if (onSelectContact) {
      onSelectContact(contact ? contact.id : null);
    }
  }, [onSelectContact]);

  useEffect(() => {
    if (onSelectContact) {
      onSelectContact(selectedContact ? selectedContact.id : null);
    }
  }, [selectedContact, onSelectContact]);

  // Load data from database
  useEffect(() => {
    loadData();
  }, []);
  // Load contact activities when a contact is selected
  useEffect(() => {
    if (selectedContact) {
      loadActivitiesAndForms();
    }
  }, [selectedContact]);

  const toggleDetailPanel = (panel) => {
    setDetailPanels((current) => ({ ...current, [panel]: !current[panel] }));
  };

  const loadActivitiesAndForms = async () => {
    if (!selectedContact) return;

    try {
      setLoadingUserAccess(true);
      const [activitiesData, submissionsData, accessData] = await Promise.all([
        getContactActivitiesApi(selectedContact.id),
        getContactFormSubmissionsApi(selectedContact.id),
        getUserAccessApi(selectedContact.email)
      ]);
      setActivities(activitiesData || []);
      setFormsSubmitted(submissionsData || []);
      setUserAccess(accessData || null);
    } catch (error) {
      console.error('Error loading activities:', error);
      setUserAccess(null);
    } finally {
      setLoadingUserAccess(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [contactsData, companiesData, tagsData, verifierConfig] = await Promise.all([
        getContactsApi(),
        getCompaniesApi(),
        getTagsApi(),
        getEmailVerifierConfigApi().catch(() => null)
      ]);
      setContacts(contactsData || []);
      setCompanies(companiesData || []);
      setTags(tagsData || []);
      setEmailVerifierConfig(verifierConfig || null);
      setSelectedContact((current) => {
        if (!current) return current;
        return (contactsData || []).find((entry) => entry.id === current.id) || current;
      });
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const canUseEmailVerification = Boolean(emailVerifierConfig?.enabled && emailVerifierConfig?.hasApiKey);

  const setVerificationNotice = (tone, message) => {
    if (!message) {
      setEmailVerificationNotice(null);
      return;
    }
    setEmailVerificationNotice({ tone, message });
  };

  const updateContactInState = (updatedContact) => {
    if (!updatedContact?.id) return;
    setContacts((current) => current.map((contact) => (contact.id === updatedContact.id ? updatedContact : contact)));
    setSelectedContact((current) => (current?.id === updatedContact.id ? updatedContact : current));
    setEditedContact((current) => (current?.id === updatedContact.id ? updatedContact : current));
  };

  const getEmailVerificationMeta = (contact) => {
    const status = normalizeText(contact?.emailVerificationStatus);
    if (!contact?.email) {
      return { label: 'No email', className: 'border-[var(--color-border)] text-[var(--color-text-tertiary)] bg-[var(--color-bg-secondary)]' };
    }
    if (status === 'valid') {
      return { label: 'Valid', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' };
    }
    if (status === 'risky') {
      return { label: 'Risky', className: 'border-amber-500/30 bg-amber-500/15 text-amber-300' };
    }
    if (status === 'invalid') {
      return { label: 'Invalid', className: 'border-rose-500/30 bg-rose-500/15 text-rose-300' };
    }
    if (status === 'unknown') {
      return { label: 'Unknown', className: 'border-slate-500/30 bg-slate-500/15 text-slate-300' };
    }
    return { label: 'Unverified', className: 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]' };
  };

  const handleVerifyContact = async (contact, mode = 'quick') => {
    if (!contact?.id || !contact?.email) {
      setVerificationNotice('warning', 'This contact does not have an email address to verify.');
      return;
    }
    if (!canUseEmailVerification) {
      setVerificationNotice('warning', 'Email verification is not configured for this workspace yet.');
      return;
    }
    setVerificationNotice(null, '');
    setVerifyingContactIds((current) => new Set(current).add(contact.id));
    try {
      const result = await verifyEmailApi({ contactId: contact.id, email: contact.email, mode });
      if (result?.contact) {
        updateContactInState(result.contact);
        setVerificationNotice('success', `${contact.firstName || contact.email} verified as ${result.status || 'unknown'}.`);
      } else {
        await loadData();
        setVerificationNotice('success', `${contact.firstName || contact.email} verification completed.`);
      }
    } catch (error) {
      setVerificationNotice('error', error.message || 'Unable to verify this email right now.');
    } finally {
      setVerifyingContactIds((current) => {
        const next = new Set(current);
        next.delete(contact.id);
        return next;
      });
    }
  };

  const startBulkEmailVerification = async (scope = 'selected') => {
    const sourceContacts = scope === 'filtered' ? filteredAndSortedContacts : contacts.filter((contact) => selectedContacts.has(contact.id));
    const contactIds = sourceContacts.filter((contact) => contact.email).map((contact) => contact.id);
    if (!canUseEmailVerification) {
      setVerificationNotice('warning', 'Email verification is not configured for this workspace yet.');
      return;
    }
    if (!contactIds.length) {
      setVerificationNotice('warning', `No ${scope} contacts with email addresses are available for verification.`);
      return;
    }
    setVerificationNotice(null, '');
    setBulkVerificationSubmitting(true);
    try {
      const task = await createEmailVerificationBulkTaskApi({ contactIds: contactIds, mode: 'power' });
      setEmailVerificationTask(task);
      setVerificationNotice('info', `Bulk verification queued for ${task?.submittedCount || contactIds.length} contact${(task?.submittedCount || contactIds.length) === 1 ? '' : 's'}.`);
    } catch (error) {
      setVerificationNotice('error', error.message || 'Unable to start bulk email verification.');
    } finally {
      setBulkVerificationSubmitting(false);
    }
  };

  useEffect(() => {
    if (!emailVerificationTask?.id || !['queued', 'running'].includes(emailVerificationTask.status)) {
      return undefined;
    }

    let cancelled = false;
    const pollTask = async () => {
      try {
        const nextTask = await getEmailVerificationBulkTaskApi(emailVerificationTask.id);
        if (cancelled || !nextTask) return;
        setEmailVerificationTask(nextTask);
        if (['completed', 'failed'].includes(nextTask.status)) {
          if (nextTask.status === 'completed') {
            setVerificationNotice(
              'success',
              `Bulk verification completed: ${nextTask.validCount || 0} valid, ${nextTask.riskyCount || 0} risky, ${nextTask.invalidCount || 0} invalid, ${nextTask.unknownCount || 0} unknown.`
            );
          } else {
            setVerificationNotice('error', nextTask.lastError || 'Bulk email verification failed.');
          }
          await loadData();
        }
      } catch (error) {
        if (!cancelled) {
          setEmailVerificationTask((current) => current ? { ...current, status: 'failed', lastError: error.message || 'Verification polling failed.' } : current);
          setVerificationNotice('error', error.message || 'Verification polling failed.');
        }
      }
    };

    pollTask();
    const intervalId = window.setInterval(pollTask, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [emailVerificationTask?.id, emailVerificationTask?.status]);

  const decodeHtmlEntities = (value) => {
    if (typeof window === 'undefined') return value;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  };

  const looksLikeMarkup = (value) => /<!doctype|<html|<body|<meta|<style|<div|<\/[a-z]+>|xmlns=|mso-|office:office/i.test(value || '');

  const normalizeAiText = (value, fallback = '') => {
    let source = `${value || ''}`.trim();
    if (!source) return fallback;
    
    // Truncate email noise (headers, forwards, signatures)
    const cleanupMarkers = [
      'From:', 'Sent:', 'To:', 'Subject:', 'Reply-To:',
      '---------- Forwarded message ----------',
      '________________________________',
      'On ', '> On ', '---', '-- '
    ];
    
    for (const marker of cleanupMarkers) {
      const index = source.indexOf(marker);
      if (index !== -1 && index > 30) { 
        source = source.substring(0, index).trim();
      }
    }

    if (!looksLikeMarkup(source)) return source;

    // Clean HTML if present
    const cleaned = decodeHtmlEntities(source)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || fallback;
  };

  const normalizeText = (value) => String(value || '').trim().toLowerCase();

  const getSystemTagsForContact = (contact) => {
    const tags = new Set(contact.systemTags || []);
    if (contact.source === 'CSV Import') tags.add('Imported');
    if (contact.source === 'Manual Entry') tags.add('Manual');
    if (contact.source === 'API Created') tags.add('API Created');
    if (contact.source === 'Form Submission') tags.add('Form Submission');
    return Array.from(tags);
  };

  const getAssignedFlows = (contact) => {
    const flows = contact.customFields?.assignedFlows;
    return Array.isArray(flows) ? flows : [];
  };

  const getInputTypeForContact = (contact) => {
    const source = normalizeText(contact.source);
    if (source.includes('form')) return 'Form';
    if (source.includes('api')) return 'API';
    if (source.includes('manual')) return 'Manual';
    if (source.includes('email')) return 'Email';
    if (source.includes('phone')) return 'Phone';
    return contact.inputType || '';
  };

  const matchesSelectOperator = (operator, actualValue, expectedValue) => {
    const actual = normalizeText(actualValue);
    const expected = normalizeText(expectedValue);
    if (operator === 'is') return actual === expected;
    if (operator === 'is not') return actual !== expected;
    if (operator === 'is in') return expected.split(',').map((item) => item.trim()).includes(actual);
    if (operator === 'is not in') return !expected.split(',').map((item) => item.trim()).includes(actual);
    if (operator === 'is defined') return Boolean(actual);
    if (operator === 'is not defined') return !actual;
    return true;
  };

  const matchesArrayOperator = (operator, values, expectedValue) => {
    const normalized = (values || []).map((value) => normalizeText(value));
    const expected = normalizeText(expectedValue);
    if (operator === 'has') return normalized.includes(expected);
    if (operator === 'has not') return !normalized.includes(expected);
    if (operator === 'is defined') return normalized.length > 0;
    if (operator === 'is not defined') return normalized.length === 0;
    return true;
  };

  const matchesDatePreset = (dateValue, preset, operator = 'is') => {
    if (!dateValue) {
      return operator === 'is not defined';
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const daysByPreset = {
      'last 7 days': 7,
      'last 30 days': 30,
      'last 90 days': 90
    };
    const presetKey = normalizeText(preset);
    let matches = false;
    if (daysByPreset[presetKey]) {
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - daysByPreset[presetKey]);
      matches = date >= threshold;
    } else if (presetKey === 'this year') {
      matches = date.getFullYear() === now.getFullYear();
    } else if (presetKey === 'today') {
      matches = date.toDateString() === now.toDateString();
    } else if (presetKey === 'this week') {
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 7);
      matches = date >= threshold;
    } else if (presetKey === 'this month') {
      matches = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    } else {
      matches = normalizeText(dateValue).includes(presetKey);
    }
    return operator === 'is not' ? !matches : matches;
  };

  const patchContacts = async (contactIds, buildPayload) => {
    for (const id of contactIds) {
      const contact = contacts.find((entry) => entry.id === id);
      if (!contact) continue;
      const payload = buildPayload(contact);
      if (payload) {
        await updateContactApi(id, payload);
      }
    }
    await loadData();
  };

  // Filter and sort contacts
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts.filter(contact => !contact.deletedAt);
    
    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(contact => 
        `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.company?.toLowerCase().includes(search) ||
        contact.phone?.includes(search)
      );
    }
    
    // Apply active filters
    Object.entries(filters).forEach(([key, filter]) => {
      if (!filter.active || !filter.value) return;

      switch (key) {
        case 'department':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, c.department, filter.value));
          break;
        case 'owner':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, c.owner, filter.value));
          break;
        case 'company':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, c.company, filter.value));
          break;
        case 'tags':
          filtered = filtered.filter((c) => matchesArrayOperator(filter.operator, c.tags, filter.value));
          break;
        case 'systemTags':
          filtered = filtered.filter((c) => matchesArrayOperator(filter.operator, getSystemTagsForContact(c), filter.value));
          break;
        case 'flow':
          filtered = filtered.filter((c) => matchesArrayOperator(filter.operator, getAssignedFlows(c), filter.value));
          break;
        case 'input':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, getInputTypeForContact(c), filter.value));
          break;
        case 'createdDate':
          filtered = filtered.filter((c) => matchesDatePreset(c.createdAt, filter.value, filter.operator));
          break;
        case 'updatedDate':
          filtered = filtered.filter((c) => matchesDatePreset(c.updatedAt, filter.value, filter.operator));
          break;
        case 'lastContacted':
          filtered = filtered.filter((c) => matchesDatePreset(c.lastContactedAt, filter.value, filter.operator));
          break;
        case 'smsEmailActivity':
          filtered = filtered.filter((c) => {
            const engagement = normalizeText(c.engagement);
            const hasRecent = Boolean(c.lastContactedAt);
            let actual = 'Inactive';
            if (engagement === 'high') actual = 'High Engagement';
            else if (engagement === 'low') actual = 'Low Engagement';
            else if (hasRecent) actual = 'Active';
            return matchesSelectOperator(filter.operator, actual, filter.value);
          });
          break;
        case 'leadScore':
          filtered = filtered.filter((c) => {
            const score = c.leadScore || 0;
            if (filter.value === '90-100') return score >= 90 && score <= 100;
            if (filter.value === '70-89') return score >= 70 && score < 90;
            if (filter.value === '50-69') return score >= 50 && score < 70;
            if (filter.value === '30-49') return score >= 30 && score < 50;
            if (filter.value === 'Below 30') return score < 30;
            return true;
          });
          break;
        case 'address':
          filtered = filtered.filter((c) => {
            const address = typeof c.address === 'object'
              ? [c.address.street, c.address.city, c.address.state, c.address.zip, c.address.country].join(' ')
              : c.address || '';
            return matchesSelectOperator(filter.operator, address, filter.value);
          });
          break;
        case 'extraDetails':
          filtered = filtered.filter((c) => {
            const completeness = c.email && c.phone && c.company ? 'Complete' : 'Incomplete';
            const status = c.validationStatus || completeness;
            return matchesSelectOperator(filter.operator, status, filter.value);
          });
          break;
        case 'pipeline':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, c.pipelineStage, filter.value));
          break;
        case 'pipelineColumn':
          filtered = filtered.filter((c) => matchesSelectOperator(filter.operator, c.customFields?.pipelineColumn || c.status, filter.value));
          break;
        case 'name':
          filtered = filtered.filter((c) => {
            const letter = normalizeText(c.firstName || c.lastName).charAt(0);
            const inFirstHalf = letter >= 'a' && letter <= 'm';
            const matches = filter.value === 'A-M' ? inFirstHalf : !inFirstHalf;
            return filter.operator === 'is not' ? !matches : matches;
          });
          break;
        case 'formSubmitted':
          filtered = filtered.filter((c) => {
            const forms = Array.isArray(c.customFields?.submittedForms) ? c.customFields.submittedForms : [];
            if (filter.value === 'Any Form') {
              return forms.length > 0 || normalizeText(c.source).includes('form');
            }
            return matchesArrayOperator(filter.operator, forms, filter.value) || normalizeText(c.source) === normalizeText(filter.value);
          });
          break;
        case 'formSubmissionDate':
          filtered = filtered.filter((c) => matchesDatePreset(c.customFields?.lastFormSubmissionAt || c.updatedAt, filter.value, filter.operator));
          break;
      }
    });
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      if (sortField === 'name') {
        aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
        bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
      } else if (sortField === 'firstName') {
        aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
        bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    return filtered;
  }, [contacts, searchTerm, filters, sortField, sortDirection]);

  const crmStats = useMemo(() => {
    const activeContacts = contacts.filter((contact) => !contact.deletedAt);
    return {
      total: activeContacts.length,
      highSignal: activeContacts.filter((contact) => (contact.leadScore || 0) >= 80).length,
      needsOwner: activeContacts.filter((contact) => !contact.owner).length,
      formDriven: activeContacts.filter((contact) => normalizeText(contact.source).includes('form')).length
    };
  }, [contacts]);

  const emailVerificationStatusBadge = useMemo(() => {
    if (!emailVerificationTask) {
      return null;
    }
    if (emailVerificationTask.status === 'completed') {
      return {
        label: `Verify ${emailVerificationTask.completedCount || 0}/${emailVerificationTask.submittedCount || 0}`,
        color: 'success'
      };
    }
    if (emailVerificationTask.status === 'failed') {
      return {
        label: 'Verify failed',
        color: 'error'
      };
    }
    return {
      label: `Verifying ${emailVerificationTask.completedCount || 0}/${emailVerificationTask.submittedCount || 0}`,
      color: 'warning'
    };
  }, [emailVerificationTask]);

  const emailVerificationNoticeClass = useMemo(() => {
    if (!emailVerificationNotice?.tone) {
      return '';
    }
    if (emailVerificationNotice.tone === 'success') {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    }
    if (emailVerificationNotice.tone === 'warning') {
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    }
    if (emailVerificationNotice.tone === 'error') {
      return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    }
    return 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]';
  }, [emailVerificationNotice]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedContacts.size === filteredAndSortedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredAndSortedContacts.map(c => c.id)));
    }
  };

  const toggleSelectContact = (id) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  // Sorting handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const navigateToCommsThread = (thread, channelType = 'email') => {
    if (!thread) return;
    window.dispatchEvent(new CustomEvent('aio:navigate', {
      detail: {
        module: channelType === 'sms' ? 'sms_voip' : 'chat',
        threadId: thread.id
      }
    }));
  };

  const openContactThread = async (contact, channelType = 'email', options = {}) => {
    if (!contact?.id) return;
    const thread = await openThreadForContactApi({
      contactId: contact.id,
      channelType: channelType,
      subject: options.subject,
      body: options.body || ''
    });
    navigateToCommsThread(thread, channelType);
  };

  const openSelectedThreads = async (contactIds, channelType = 'email') => {
    const selected = contacts.filter(contact => contactIds.includes(contact.id));
    if (!selected.length) return;
    const threads = [];
    for (const contact of selected) {
      threads.push(await openThreadForContactApi({
        contactId: contact.id,
        channelType: channelType,
        subject: channelType.toUpperCase() + ' follow-up for ' + contact.firstName + ' ' + contact.lastName
      }));
    }
    navigateToCommsThread(threads[0], channelType);
    showNotice({ type: 'success', message: `Opened ${threads.length} ${channelType.toUpperCase()} thread(s) in Dispatch` });
  };

  // Bulk actions
  const handleBulkAction = async (action, targetIds = null) => {
    const selectedIds = targetIds || Array.from(selectedContacts);
    
    if (selectedIds.length === 0) {
      showNotice({ type: 'warning', message: 'Please select contacts first' });
      return;
    }

    switch (action) {
      case 'delete':
        setDeleteConfirmModal({ 
          open: true, 
          ids: selectedIds, 
          names: selectedIds.length === 1 
            ? `${contacts.find(c => c.id === selectedIds[0])?.firstName} ${contacts.find(c => c.id === selectedIds[0])?.lastName}`
            : `${selectedIds.length} contact(s)`
        });
        break;
      
      case 'addTag':
        setBulkActionError('');
        setBulkActionModal({ open: true, action, value: '' });
        break;
      
      case 'removeTag':
        setBulkActionError('');
        setBulkActionModal({ open: true, action, value: '' });
        break;
      
      case 'setOwner':
        setBulkActionError('');
        setBulkActionModal({ open: true, action, value: '' });
        break;

      case 'setDepartment':
      case 'assignAi':
      case 'addFlow':
      case 'removeFlow':
        setBulkActionError('');
        setBulkActionModal({ open: true, action, value: '' });
        break;
      
      case 'sendEmail':
        openSelectedThreads(selectedIds, 'email');
        break;

      case 'sendSms':
        openSelectedThreads(selectedIds, 'sms');
        break;

      case 'export':
        // Export selected contacts as CSV
        const csvData = filteredAndSortedContacts
          .filter(c => selectedIds.includes(c.id))
          .map(c => `${c.firstName},${c.lastName},${c.email},${c.phone},${c.company},${c.leadScore}`)
          .join('\n');
        const blob = new Blob([`First Name,Last Name,Email,Phone,Company,Score\n${csvData}`], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contacts.csv';
        a.click();
        break;

      case 'sendApi': {
        const payload = filteredAndSortedContacts
          .filter((contact) => selectedIds.includes(contact.id))
          .map((contact) => ({
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            owner: contact.owner,
            department: contact.department,
            tags: contact.tags || [],
            customFields: contact.customFields || {}
          }));
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contacts-api-payload.json';
        a.click();
        window.URL.revokeObjectURL(url);
        break;
      }
      
      default:
        showNotice({ type: 'info', message: `${action} - Coming soon!` });
    }
  };

  // Create contact handler
  const handleCreateContact = async (formData) => {
    try {
      const newContact = {
        contactId: `CNT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organizationId: 'org-1',
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
        title: formData.title || '',
        department: formData.department || '',
        website: formData.website || '',
        address: {
          street: formData.street || '',
          apartment: formData.apartment || '',
          city: formData.city || '',
          state: formData.state || '',
          zip: formData.zip || '',
          country: formData.country || 'United States'
        },
        dob: formData.dob || null,
        ownerId: 'user-1',
        owner: 'AIO FlowΓäó',
        source: 'Manual Entry',
        status: 'contact',
        leadScore: 50,
        quality: 'warm',
        engagement: 'medium',
        tags: [],
        customFields: {},
        optInEmail: true,
        optInSms: true,
        optInCalls: true,
        optInFlows: true,
        lastContactedAt: null,
        pipelineStage: 'New',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };

      await createContactApi(newContact);
      await loadData();
      setShowCreateModal(false);
      showNotice({ type: 'success', message: 'Contact created successfully!' });
    } catch (error) {
      console.error('Error creating contact:', error);
      showNotice({ type: 'error', message: 'Error creating contact' });
    }
  };

  const buildUserFormData = (contact = null) => ({
    site: currentWorkspace?.name || 'Current Site',
    username: contact?.email ? contact.email.split('@')[0] : '',
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    email: contact?.email || '',
    dob: contact?.dob || '',
    password: '',
    confirmPassword: '',
    system: 'Create New System',
    systemName: contact?.company || `${[contact?.firstName, contact?.lastName].filter(Boolean).join(' ')} Workspace`.trim(),
    billing: 'complimentary',
    package: '',
    street: contact?.address?.street || '',
    apartment: contact?.address?.apartment || '',
    city: contact?.address?.city || '',
    state: contact?.address?.state || '',
    zip: contact?.address?.zip || '',
    country: contact?.address?.country || 'United States',
    phone: contact?.phone || ''
  });

  const requestCrmAiAssist = async ({ surface, field, currentValue = '', context = {}, intent = 'draft' }) => {
    const response = await draftAiApi({
      module: 'crm',
      surface,
      field,
      intent,
      currentValue: currentValue || '',
      context: {
        workspaceName: currentWorkspace?.name || '',
        selectedContactId: selectedContact?.id || '',
        selectedContactEmail: selectedContact?.email || '',
        ...context
      }
    });
    return response?.suggestion || '';
  };

  const openCreateUserModal = (contact = null) => {
    if (contact) {
      selectContact(contact);
    }
    setCreateModalTab('Create User');
    setShowCreateModal(true);
  };

  const closeBulkActionModal = () => {
    setBulkActionModal({ open: false, action: '', value: '' });
    setBulkActionError('');
    setBulkActionSubmitting(false);
    setBulkActionAssistLoading(false);
  };

  const applyBulkActionAssist = async () => {
    setBulkActionError('');
    setBulkActionAssistLoading(true);
    try {
      const suggestion = await requestCrmAiAssist({
        surface: 'bulk-action',
        field: 'value',
        currentValue: bulkActionModal.value,
        context: {
          action: bulkActionModal.action,
          selectedCount: selectedContacts.size
        }
      });
      if (suggestion) {
        setBulkActionModal((current) => ({ ...current, value: suggestion }));
      }
    } catch (error) {
      setBulkActionError(error.message || 'Unable to draft a bulk action value.');
    } finally {
      setBulkActionAssistLoading(false);
    }
  };

  const applyBulkAction = async () => {
    const action = bulkActionModal.action;
    const value = (bulkActionModal.value || '').trim();
    const selectedIds = Array.from(selectedContacts);
    if (!selectedIds.length) {
      closeBulkActionModal();
      return;
    }
    if (!value) {
      setBulkActionError('A value is required.');
      return;
    }

    setBulkActionSubmitting(true);
    setBulkActionError('');
    try {
      switch (action) {
        case 'addTag':
          await patchContacts(selectedIds, (contact) => ({ tags: Array.from(new Set([...(contact.tags || []), value])) }));
          break;
        case 'removeTag':
          await patchContacts(selectedIds, (contact) => ({ tags: (contact.tags || []).filter((tag) => tag !== value) }));
          break;
        case 'setOwner':
          await patchContacts(selectedIds, () => ({ owner: value }));
          break;
        case 'setDepartment':
          await patchContacts(selectedIds, () => ({ department: value }));
          break;
        case 'assignAi':
          await patchContacts(selectedIds, (contact) => ({
            aiEmployee: value,
            customFields: { ...(contact.customFields || {}), assignedAi: value }
          }));
          break;
        case 'addFlow':
          await patchContacts(selectedIds, (contact) => {
            const flows = Array.isArray(contact.customFields?.assignedFlows) ? contact.customFields.assignedFlows : [];
            return { customFields: { ...(contact.customFields || {}), assignedFlows: Array.from(new Set([...flows, value])) } };
          });
          break;
        case 'removeFlow':
          await patchContacts(selectedIds, (contact) => {
            const flows = Array.isArray(contact.customFields?.assignedFlows) ? contact.customFields.assignedFlows : [];
            return { customFields: { ...(contact.customFields || {}), assignedFlows: flows.filter((flow) => flow !== value) } };
          });
          break;
        default:
          break;
      }
      closeBulkActionModal();
    } catch (error) {
      setBulkActionError(error.message || 'Unable to apply bulk action.');
      setBulkActionSubmitting(false);
    }
  };

  const handleImportContacts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const [headerLine, ...rows] = text.split(/\r?\n/).filter(Boolean);
      const headers = (headerLine || '').split(',').map((value) => normalizeCsvHeader(value.trim()));
      const normalizedRows = rows.map((row) => row.split(','));
      for (const values of normalizedRows) {
        const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
        if (!record.email && !record.firstName && !record.lastName) continue;
        await createContactApi({
          contactId: `CNT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          organizationId: 'org-1',
          firstName: record.firstName || '',
          lastName: record.lastName || '',
          email: record.email || '',
          phone: record.phone || '',
          company: record.company || '',
          title: record.title || '',
          department: record.department || '',
          website: record.website || '',
          address: {
            street: record.street || '',
            apartment: record.apartment || '',
            city: record.city || '',
            state: record.state || '',
            zip: record.zip || '',
            country: record.country || 'United States'
          },
          owner: record.owner || 'AIO Flow\u2122',
          source: 'CSV Import',
          status: 'contact',
          leadScore: Number(record.leadScore || 50),
          tags: record.tags ? record.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
          customFields: {}
        });
      }
      await loadData();
      showNotice({ type: 'success', message: 'Contacts imported successfully.' });
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to import contacts.' });
    } finally {
      event.target.value = '';
    }
  };

  const runCrmAssist = async () => {
    if (selectedContact) {
      await openContactThread(selectedContact, 'internal', {
        subject: `CRM assist for ${selectedContact.firstName} ${selectedContact.lastName}`.trim(),
        body: 'Review this contact and suggest the next best action.'
      });
      return;
    }
    if (selectedContacts.size === 1) {
      const contact = contacts.find((entry) => entry.id === Array.from(selectedContacts)[0]);
      if (contact) {
        await openContactThread(contact, 'internal', {
          subject: `CRM assist for ${contact.firstName} ${contact.lastName}`.trim(),
          body: 'Review this contact and suggest the next best action.'
        });
        return;
      }
    }
    showNotice({ type: 'warning', message: 'Select a contact first to launch CRM assist.' });
  };

  const openUserAccessModal = () => {
    setShowUserAccessModal(true);
  };

  const handleAdminWorkspaceSwitch = async (workspaceId) => {
    if (!workspaceId || !switchTenant) {
      return;
    }
    try {
      await switchTenant(workspaceId);
      window.dispatchEvent(new CustomEvent('aio:navigate', {
        detail: {
          module: 'crm'
        }
      }));
      setShowUserAccessModal(false);
    } catch (error) {
      showNotice({ type: 'error', message: error.message || 'Unable to switch workspace.' });
    }
  };

  // Filter update handler
  const updateFilter = (filterKey, field, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: {
        ...prev[filterKey],
        [field]: value,
        active: field === 'value' ? true : prev[filterKey].active
      }
    }));
  };

  const clearFilter = (filterKey) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: { operator: 'is', value: '', active: false }
    }));
  };

  // Render sort icon
  const renderSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-[var(--color-text-tertiary)]" />;
    return sortDirection === 'asc' ? 
      <ArrowUp size={14} className="text-[var(--color-primary)]" /> : 
      <ArrowDown size={14} className="text-[var(--color-primary)]" />;
  };

  // CONTACTS TAB
  const renderContactsTab = () => {
    if (selectedContact) {
      return renderContactDetailView();
    }

    return (
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Contact Table - 75% */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Contact Table */}
          <div className="flex-1 overflow-hidden px-4 pb-4 pt-0">
            {loading ? (
              <div className={shellPanelClass + ' flex h-full items-center justify-center'}>
                <div className="text-[var(--color-text-secondary)]">Loading contacts...</div>
              </div>
            ) : (
              filteredAndSortedContacts.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--color-bg-primary)]/95 backdrop-blur border-b border-[var(--color-border)] z-10">
                      <tr>
                        <th className="px-4 py-3 text-left w-12">
                          <input 
                            type="checkbox" 
                            checked={selectedContacts.size === filteredAndSortedContacts.length && filteredAndSortedContacts.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4" 
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase cursor-pointer hover:text-[var(--color-text-primary)] transition-colors" onClick={() => handleSort('firstName')}>
                          <div className="flex items-center gap-2">
                            NAME {renderSortIcon('firstName')}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase cursor-pointer hover:text-[var(--color-text-primary)] transition-colors" onClick={() => handleSort('company')}>
                          <div className="flex items-center gap-2">
                            COMPANY {renderSortIcon('company')}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase cursor-pointer hover:text-[var(--color-text-primary)] transition-colors" onClick={() => handleSort('leadScore')}>
                          <div className="flex items-center gap-2">
                            SCORE {renderSortIcon('leadScore')}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase">
                          TAGS
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase cursor-pointer hover:text-[var(--color-text-primary)] transition-colors" onClick={() => handleSort('createdAt')}>
                          <div className="flex items-center gap-2">
                            CREATED {renderSortIcon('createdAt')}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-black tracking-[0.2em] text-[var(--color-text-secondary)] uppercase cursor-pointer hover:text-[var(--color-text-primary)] transition-colors" onClick={() => handleSort('updatedAt')}>
                          <div className="flex items-center gap-2">
                            UPDATED {renderSortIcon('updatedAt')}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedContacts.map(contact => (
                        <tr 
                          key={contact.id} 
                          className="border-b border-[var(--color-border)]/80 transition hover:bg-[var(--color-hover)]/70 cursor-pointer group relative"
                        >
                          <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleSelectContact(contact.id); }}>
                            <input 
                              type="checkbox" 
                              checked={selectedContacts.has(contact.id)}
                              onChange={() => {}}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-4 py-3" onClick={() => selectContact(contact)}>
                            <div className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                              {contact.firstName} {contact.lastName}
                            </div>
                            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{contact.email || 'No email on file'}</div>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getEmailVerificationMeta(contact).className}`}>
                                {getEmailVerificationMeta(contact).label}
                              </span>
                              {contact.email ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleVerifyContact(contact, 'quick');
                                  }}
                                  disabled={!canUseEmailVerification || verifyingContactIds.has(contact.id)}
                                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)] disabled:opacity-40"
                                >
                                  {verifyingContactIds.has(contact.id) ? 'Verifying' : 'Verify'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-text-secondary)]">{contact.company || '--'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-primary)]">
                              {contact.leadScore || '--'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {contact.tags?.map((tag, idx) => (
                                <span key={idx} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-text-secondary)] text-xs">
                            {new Date(contact.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-text-secondary)] text-xs">
                            {new Date(contact.updatedAt).toLocaleDateString()}
                          </td>
                          {/* Row Delete Button */}
                          <td className="w-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmModal({ 
                                  open: true, 
                                  ids: [contact.id], 
                                  names: `${contact.firstName} ${contact.lastName}` 
                                });
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-text-tertiary)] hover:text-red-500 rounded hover:bg-[var(--color-hover)] transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <EmptyState 
                      title={searchTerm || Object.values(filters).some(f => f.active) ? "No matching modules" : "Your Dossier is Empty"}
                      description={searchTerm || Object.values(filters).some(f => f.active) 
                        ? "We couldn't find any contacts matching your current search or filter parameters." 
                        : "You haven't established any relationship dossiers yet. Start building your network to see intel here."}
                      actions={[
                        { label: 'Create First Contact', type: 'navigate', payload: { route: '/crm' }, icon: 'Plus' },
                        { label: 'Import CSV Data', type: 'navigate', payload: { route: '/crm' }, icon: 'Play' },
                        { label: 'CRM Mastery Guide', type: 'navigate', payload: { route: '/help' }, icon: 'Sparkles' }
                      ]}
                    />
                  </div>
                )
            )}
          </div>
        </div>

        {/* RIGHT: Filters - 25% */}
        <div className="w-72 border-l border-[var(--color-border)] flex flex-col overflow-hidden">
          {/* Section Label */}
          <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Refine Records - Filters</div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 crm-scroll-hidden">
            {Object.entries(filterOptions).sort(([a], [b]) => a.localeCompare(b)).map(([filterKey, options]) => (
              <div key={filterKey} className={innerPanelClass + ' p-2.5'}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold tracking-[0.15em] text-[var(--color-text-tertiary)] uppercase">
                    {filterKey.replace('_', ' ')}
                  </label>
                  {filters[filterKey].active && (
                    <button onClick={() => clearFilter(filterKey)} className="text-[10px] text-red-300 hover:text-red-200">
                      Clear
                    </button>
                  )}
                </div>
                
                <select
                  value={filters[filterKey].operator}
                  onChange={(e) => updateFilter(filterKey, 'operator', e.target.value)}
                  className="w-full mb-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {filterOperators.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                
                {!['is defined', 'is not defined'].includes(filters[filterKey].operator) && (
                  <select
                    value={filters[filterKey].value}
                    onChange={(e) => updateFilter(filterKey, 'value', e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const hiddenScrollbarStyle = {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  };

  // CONTACT DETAIL VIEW
  const renderContactDetailView = () => {
    const safeActivities = activities || [];
    const meetingActivities = safeActivities.filter((activity) => activity?.activityType === 'meeting');
    const workflowActivities = safeActivities.filter((activity) => activity?.activityType === 'workflow');
    const upcomingMeeting = [...meetingActivities]
      .filter((activity) => new Date(activity.createdAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
    const getActivityIcon = (type) => {
      switch(type) {
        case 'form': return '≡ƒôï';
        case 'email': return '≡ƒôº';
        case 'call': return '≡ƒô₧';
        case 'sms': return '≡ƒÆ¼';
        case 'note': return 'Γ£à';
        case 'meeting': return '≡ƒñ¥';
        case 'flow':
        case 'automation': return '≡ƒñû';
        default: return '≡ƒôî';
      }
    };

    const getActivityTone = (activity) => {
      const type = activity.activityType;
      if (type === 'meeting') return 'border-emerald-500/20 bg-emerald-500/10';
      if (type === 'workflow') return 'border-sky-500/20 bg-sky-500/10';
      if (type === 'note') return 'border-amber-500/20 bg-amber-500/10';
      return 'border-transparent bg-[color:var(--color-border)/0.3]';
    };

    const renderActivityMetadata = (activity) => {
      const metadata = activity.metadata || {};
      const type = activity.activityType;
      if (type === 'email') {
        return (
          <div className="mt-2 space-y-1 text-[11px] text-[var(--color-text-tertiary)] border-l-2 border-[var(--color-primary)]/30 pl-3 py-1 bg-[var(--color-bg-primary)]/40 rounded-r-lg">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider opacity-60">From</span>
              <span className="text-[var(--color-text-secondary)]">{metadata.senderName || metadata.senderEmail || 'Unknown Sender'}</span>
            </div>
            {metadata.subject && (
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider opacity-60">Subject</span>
                <span className="text-[var(--color-text-primary)] font-medium">{metadata.subject}</span>
              </div>
            )}
            {metadata.status && (
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider opacity-60">Status</span>
                <span className={`px-1.5 py-0.5 rounded-full border border-[var(--color-border)] ${metadata.status === 'sent' ? 'text-emerald-400 border-emerald-500/30' : ''}`}>{metadata.status}</span>
              </div>
            )}
          </div>
        );
      }
      const chips = [];
      if (metadata.status) chips.push(`Status ${String(metadata.status).replace(/_/g, ' ')}`);
      if (metadata.subject) chips.push(metadata.subject);
      if (metadata.location) chips.push(metadata.location);
      return (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-tertiary)]">
          {chips.slice(0, 3).map((chip) => (
            <span key={chip} className="px-2 py-1 rounded-full border border-[var(--color-border)]">{chip}</span>
          ))}
          {metadata.meetingUrl ? (
            <a
              href={metadata.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded-full border border-[var(--color-border)] text-sky-300 hover:text-sky-200"
            >
              Open meeting
            </a>
          ) : null}
        </div>
      );
    };

    const filteredActivities = activityTab === 'Activity' 
      ? safeActivities 
      : safeActivities.filter(a => {
          if (activityTab === 'Forms') return a?.activityType === 'form';
          if (activityTab === 'Notes') return a?.activityType === 'note';
          if (activityTab === 'Flow Emails') return a?.activityType === 'email' || a?.activityType === 'automation' || a?.activityType === 'flow';
          if (activityTab === 'Flow SMS') return a?.activityType === 'sms';
          if (activityTab === 'Flow Activity') return a?.activityType === 'workflow' || a?.activityType === 'automation' || a?.activityType === 'flow' || a?.activityType === 'meeting';
          return false;
        });

    const flowEmailActivities = safeActivities.filter((activity) => ['email', 'automation', 'flow'].includes(activity?.activityType));
    const bookingActivities = meetingActivities;
    const billingItems = [];

    const renderTimelineIcon = (type) => {
      switch (type) {
        case 'form': return <FileInput size={18} className="text-cyan-300" />;
        case 'email': return <Mail size={18} className="text-sky-300" />;
        case 'call': return <Phone size={18} className="text-emerald-300" />;
        case 'sms': return <MessageCircle size={18} className="text-amber-300" />;
        case 'note': return <Clipboard size={18} className="text-violet-300" />;
        case 'meeting': return <Calendar size={18} className="text-emerald-300" />;
        case 'flow':
        case 'automation':
        case 'workflow': return <Zap size={18} className="text-sky-300" />;
        default: return <AlertCircle size={18} className="text-[var(--color-text-secondary)]" />;
      }
    };

    const renderSideSection = (panelId, title, content, badge = null) => (
      <div className={shellPanelClass + ' p-3'}>
        <button
          onClick={() => toggleDetailPanel(panelId)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</span>
          <div className="flex items-center gap-2">
            {badge}
            <ChevronDown size={14} className={`text-[var(--color-text-tertiary)] transition-transform ${detailPanels[panelId] ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {detailPanels[panelId] ? <div className="mt-3">{content}</div> : null}
      </div>
    );

    const handleEditContact = () => {
      setEditedContact({...selectedContact});
      setIsEditingContact(true);
    };

    const handleSaveContact = async () => {
      const updated = await updateContactApi(selectedContact.id, editedContact);
      setSelectedContact(updated);
      setIsEditingContact(false);
      setIsEditingContact(false);
      await loadData();
    };

    const handleCancelEdit = () => {
      setEditedContact(null);
      setIsEditingContact(false);
    };

    const handleFieldChange = (field, value) => {
      setEditedContact(prev => ({...prev, [field]: value}));
    };

    const handleDeleteContact = () => {
      const contactToDelete = selectedContact;
      if (!contactToDelete) return;
      setDeleteConfirmModal({ 
        open: true, 
        ids: [contactToDelete.id], 
        names: `${contactToDelete.firstName} ${contactToDelete.lastName}` 
      });
    };

    const handleAddTag = async (tag) => {
      if (!selectedContact || !tag) return;
      const currentTags = selectedContact.tags || [];
      if (currentTags.includes(tag)) return;
      await updateContactApi(selectedContact.id, { tags: [...currentTags, tag] });
      await loadData();
    };

    const handleRemoveTag = async (tag) => {
      if (!selectedContact || !tag) return;
      const currentTags = selectedContact.tags || [];
      await updateContactApi(selectedContact.id, { tags: currentTags.filter(t => t !== tag) });
      await loadData();
    };

    const handleAddNote = async () => {
      if (!newNote.trim() || !selectedContact) return;
      setAddingNote(true);
      setNoteError('');
      try {
        await createContactActivityApi(selectedContact.id, {
          activityType: 'note',
          title: 'Note',
          description: newNote.trim()
        });
        const refreshedActivities = await getContactActivitiesApi(selectedContact.id);
        setActivities(refreshedActivities || []);
        setNewNote('');
      } catch (error) {
        setNoteError(error.message || 'Failed to add note.');
      } finally {
        setAddingNote(false);
      }
    };

    const handleQuickAction = async (label) => {
      switch (label) {
        case 'Note':
          await openContactThread(currentContact, 'internal', {
            subject: `Internal note for ${currentContact.firstName} ${currentContact.lastName}`.trim(),
            body: 'Capture an internal note for this contact.'
          });
          break;
        case 'Email':
          await openContactThread(currentContact, 'email');
          break;
        case 'SMS':
          await openContactThread(currentContact, 'sms');
          break;
        case 'Meet':
          await openContactThread(currentContact, 'email', {
            subject: `Schedule meeting with ${currentContact.firstName} ${currentContact.lastName}`.trim(),
            body: 'Share availability and confirm the next meeting.'
          });
          break;
        case 'Form':
          window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'forms' } }));
          break;
        default:
          break;
      }
    };

    const currentContact = isEditingContact ? editedContact : selectedContact;

    return (
      <div className="flex-1 flex flex-col bg-[var(--color-bg-secondary)] overflow-hidden">
        <style>{`
          .crm-scroll-hidden::-webkit-scrollbar{display:none;width:0;height:0;}
        `}</style>
        <div ref={layoutRef} className="flex flex-1 min-h-0 overflow-visible relative p-4 gap-3">
        {/* LEFT PANEL: Detailed Contact Info */}
        <div
          style={{ width: leftPanelWidth }}
          className="flex-none flex flex-col gap-2 overflow-auto min-h-0 transition-all duration-75"
        >
          {/* Detail Card */}
          <div className={shellPanelClass + ' p-3 space-y-3'}>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Relationship Dossier</div>
                <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{currentContact.firstName} {currentContact.lastName}</h2>
                <button onClick={handleDeleteContact} className="mt-1 text-xs text-red-300 transition hover:text-red-200">Delete Contact</button>
              </div>
              {!isEditingContact ? (
                <button onClick={handleEditContact} className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/45 hover:text-[var(--color-text-primary)]">
                  <Edit size={12} /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveContact} className={primaryActionClass}>Save</button>
                  <button onClick={handleCancelEdit} className={softActionClass}>Cancel</button>
                </div>
              )}
            </div>

            {/* Editable Key Fields */}
            {['quality', 'engagement', 'owner', 'company', 'dob', 'department', 'title', 'aiEmployee'].map(field => (
              <div key={field}>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{field.replace('_', ' ')}</label>
                {isEditingContact ? (
                  <input
                    type="text"
                    value={currentContact[field] || ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  />
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-text-primary)]">{currentContact[field] || '--'}</p>
                )}
              </div>
            ))}

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-5 gap-2 border-t border-[var(--color-border)] pt-3">
              {[
                { icon: Clipboard, label: 'Note' },
                { icon: Mail, label: 'Email' },
                { icon: MessageCircle, label: 'SMS' },
                { icon: Calendar, label: 'Meet' },
                { icon: FileInput, label: 'Form' }
              ].map((action, idx) => (
                <button key={idx} onClick={() => handleQuickAction(action.label)} className="flex flex-col items-center gap-1 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1 py-1.5 text-[10px] text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/45 hover:text-[var(--color-text-primary)]">
                  <action.icon size={14} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>

            {/* Tags Section */}
            <div className="border-t border-[var(--color-border)] pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Tags</label>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {currentContact.tags?.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-secondary)]">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[var(--color-text-tertiary)] hover:text-red-400 transition"
                    >
                      <X size={8} />
                    </button>
                  </span>
                ))}
                {(!currentContact.tags || currentContact.tags.length === 0) && (
                  <span className="text-[9px] text-[var(--color-text-tertiary)]">No tags</span>
                )}
              </div>
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => e.target.value && handleAddTag(e.target.value)}
                  className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-[9px] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">+ Add tag...</option>
                  {availableTags.filter(tag => !currentContact.tags?.includes(tag)).map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                  {availableTags.filter(tag => !currentContact.tags?.includes(tag)).length === 0 && (
                    <option value="" disabled>All tags assigned</option>
                  )}
                </select>
                <p className="mt-0.5 text-[8px] text-[var(--color-text-tertiary)]">Separate by commas to manually enter</p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Email</label>
                {isEditingContact ? (
                  <input
                    type="email"
                    value={currentContact.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                      className="mt-1 w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  />
                ) : (
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <p className="flex items-center gap-1 text-sm text-[var(--color-primary)]">
                      <Mail size={14} /> {currentContact.email || '--'}
                    </p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${getEmailVerificationMeta(currentContact).className}`}>
                      {getEmailVerificationMeta(currentContact).label}
                    </span>
                    {currentContact.email ? (
                      <button
                        type="button"
                        onClick={() => handleVerifyContact(currentContact, 'quick')}
                        disabled={!canUseEmailVerification || verifyingContactIds.has(currentContact.id)}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)] disabled:opacity-40"
                      >
                        {verifyingContactIds.has(currentContact.id) ? 'Verifying' : 'Verify'}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Phone</label>
                {isEditingContact ? (
                  <input
                    type="tel"
                    value={currentContact.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  />
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-text-primary)]">{currentContact.phone || '--'}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Website</label>
                {isEditingContact ? (
                  <input
                    type="url"
                    value={currentContact.website || ''}
                    onChange={(e) => handleFieldChange('website', e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  />
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-text-primary)]">{currentContact.website || '--'}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Address</label>
                {isEditingContact ? (
                  <textarea
                    value={typeof currentContact.address === 'object' ? JSON.stringify(currentContact.address) : (currentContact.address || '')}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    rows="2"
                  />
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                    {currentContact.address ? 
                      (typeof currentContact.address === 'object' ? 
                        `${currentContact.address.street || ''}, ${currentContact.address.city || ''}, ${currentContact.address.state || ''} ${currentContact.address.zip || ''}` 
                        : currentContact.address) 
                      : '--'}
                  </p>
                )}
              </div>
              </div>

              {/* Client Brand Profile */}
              <div className="border-t border-[var(--color-border)] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Client Brand Profile</label>
                  {isEditingContact && (
                    <button
                      onClick={() => handleFieldChange('brandProfile', currentContact.brandProfile ? null : { enabled: true, brandName: currentContact.company || '', brandVoice: '', valueProp: '', differentiation: '', idealCustomer: '', painPoints: '', marketingStrategy: '', toneDirectives: '', notes: '' })}
                      className="text-[9px] font-bold text-[var(--color-primary)] hover:underline"
                    >
                      {currentContact.brandProfile ? 'Remove' : 'Add Profile'}
                    </button>
                  )}
                </div>
                {currentContact.brandProfile ? (
                  <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                    {isEditingContact ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-[var(--color-text-tertiary)] uppercase">Enabled</span>
                          <button
                            onClick={() => handleFieldChange('brandProfile', { ...currentContact.brandProfile, enabled: !currentContact.brandProfile.enabled })}
                            className={`w-8 h-4 rounded-full transition-all ${currentContact.brandProfile.enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-white transition-all mt-0.5 ${currentContact.brandProfile.enabled ? 'ml-4' : 'ml-0.5'}`} />
                          </button>
                        </div>
                        {['brandName', 'brandVoice', 'valueProp', 'differentiation', 'idealCustomer', 'painPoints', 'marketingStrategy', 'toneDirectives', 'notes'].map(field => (
                          <div key={field}>
                            <label className="text-[8px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{field.replace(/([A-Z])/g, ' $1').trim()}</label>
                            <textarea
                              value={currentContact.brandProfile[field] || ''}
                              onChange={(e) => handleFieldChange('brandProfile', { ...currentContact.brandProfile, [field]: e.target.value })}
                              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none resize-none"
                              rows={field === 'brandVoice' ? 3 : 1}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${currentContact.brandProfile.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                          <span className="text-xs font-semibold text-[var(--color-text-primary)]">{currentContact.brandProfile.brandName || 'Unnamed Brand'}</span>
                          <span className="text-[9px] text-[var(--color-text-tertiary)]">({currentContact.brandProfile.enabled ? 'Active' : 'Disabled'})</span>
                        </div>
                        {currentContact.brandProfile.brandVoice && (
                          <p className="text-[10px] text-[var(--color-text-secondary)] italic line-clamp-2">"{currentContact.brandProfile.brandVoice.slice(0, 120)}..."</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--color-text-tertiary)] italic">No brand profile configured. Enable to set client-specific brand voice.</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-[var(--color-border)] pt-3">
              <div className={innerPanelClass + ' p-3'}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Meetings</div>
                <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{meetingActivities.length}</div>
                <div className="text-[11px] text-[var(--color-text-secondary)]">{upcomingMeeting ? `Next ${new Date(upcomingMeeting.createdAt).toLocaleDateString()}` : 'No upcoming'}</div>
              </div>
              <div className={innerPanelClass + ' p-3'}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Workflows</div>
                <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{workflowActivities.length}</div>
                <div className="text-[11px] text-[var(--color-text-secondary)]">{workflowActivities[0] ? 'Recently touched' : 'No actions yet'}</div>
              </div>
              <div className={innerPanelClass + ' p-3'}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Forms</div>
                <div className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{formsSubmitted.length}</div>
                <div className="text-[11px] text-[var(--color-text-secondary)]">{formsSubmitted[0] ? 'Captured' : 'No submissions'}</div>
              </div>
            </div>

            {/* Additional Details Dropdown */}
            <button 
              onClick={() => setShowAdditionalDetails(!showAdditionalDetails)}
              className="w-full flex justify-between items-center rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)]/45"
            >
              <span>Additional Details</span>
              <ChevronDown size={16} className={showAdditionalDetails ? 'rotate-180' : ''} />
            </button>

            {showAdditionalDetails && (
              <div className={innerPanelClass + ' p-3 space-y-2 text-sm'}>
                {[
                  { label: 'External Reference ID', value: selectedContact.externalReferenceId },
                  { label: 'Validation Status', value: selectedContact.validationStatus },
                  { label: 'Click Id', value: selectedContact.clickId },
                  { label: 'Source Code', value: selectedContact.sourceCode },
                  { label: 'Sub Id 1', value: selectedContact.subId1 },
                  { label: 'Sub Id 2', value: selectedContact.subId2 },
                  { label: 'Sub Id 3', value: selectedContact.subId3 },
                  { label: 'Sub Id 4', value: selectedContact.subId4 },
                  { label: 'Sub Id 5', value: selectedContact.subId5 }
                ].map(field => (
                  <div key={field.label}>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase">{field.label}</p>
                    <p className="text-[var(--color-text-primary)]">{field.value || '--'}</p>
                  </div>
                ))}

                {/* Opt-In Toggles */}
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  {[
                    { label: 'Opt-In Emails', field: 'optInEmail' },
                    { label: 'Opt-In SMS', field: 'optInSms' },
                    { label: 'Opt-In Calls', field: 'optInCalls' },
                    { label: 'Opt-In Flows', field: 'optInFlows' }
                  ].map(toggle => (
                    <div key={toggle.label} className="flex justify-between items-center">
                      <span className="text-xs">{toggle.label}</span>
                      <input 
                        type="checkbox" 
                        checked={selectedContact[toggle.field] || false}
                        readOnly
                        className="w-4 h-4" 
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t border-[var(--color-border)] pt-3">
                  <p className="text-xs text-[var(--color-text-secondary)] uppercase">Created Date</p>
                  <p className="text-[var(--color-text-primary)]">{selectedContact.createdAt ? new Date(selectedContact.createdAt).toLocaleDateString() : '--'}</p>
                </div>
                
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)] uppercase">Updated Date</p>
                  <p className="text-[var(--color-text-primary)]">{selectedContact.updatedAt ? new Date(selectedContact.updatedAt).toLocaleDateString() : '--'}</p>
                </div>
                
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)] uppercase">Last Contacted</p>
                  <p className="text-[var(--color-text-primary)]">{selectedContact.lastContactedAt ? new Date(selectedContact.lastContactedAt).toLocaleDateString() : '--'}</p>
                </div>
              </div>
            )}

            {/* User Access */}
            <div className={innerPanelClass + ' p-4 space-y-3'}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">User Access</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                    {loadingUserAccess ? 'Loading access...' : (userAccess?.user?.name || 'No login created')}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-panel)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                  <KeyRound size={18} />
                </div>
              </div>

              {userAccess ? (
                <>
                  <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 space-y-1 text-sm">
                    <div className="text-[var(--color-text-secondary)]">Role: <span className="font-medium text-[var(--color-text-primary)]">{userAccess.memberships?.[0]?.role || userAccess.user.role || '--'}</span></div>
                    <div className="text-[var(--color-text-secondary)]">System: <span className="font-medium text-[var(--color-text-primary)]">{userAccess.memberships?.[0]?.workspaceName || '--'}</span></div>
                    <div className="text-[var(--color-text-secondary)]">Site: <span className="font-medium text-[var(--color-text-primary)]">{window.location.origin}</span></div>
                  </div>
                  <div className="grid gap-2">
                    <button
                      onClick={openUserAccessModal}
                      className="w-full btn-primary-skeuo px-3 py-2 text-sm font-medium rounded-[var(--radius-panel)]"
                    >
                      User Account Details
                    </button>
                    <button
                      onClick={() => {
                        const preferredMembership = (userAccess.memberships || []).find((membership) => membership.can_switch_as_admin) || userAccess.memberships?.[0];
                        if (preferredMembership?.tenantId) {
                          handleAdminWorkspaceSwitch(preferredMembership.tenantId);
                        }
                      }}
                      className="w-full rounded-[var(--radius-panel)] border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Login As Admin
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    This contact does not have an app login yet.
                  </p>
                  <button
                    onClick={() => openCreateUserModal(selectedContact)}
                    className="w-full rounded-[var(--radius-panel)] border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                  >
                    Create User Login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resizer LEFT */}
        <div 
          onMouseDown={() => setActiveResizeSide('left')}
          className={`w-1.5 h-full cursor-col-resize hover:bg-[var(--color-primary)]/20 transition-colors ${activeResizeSide === 'left' ? 'bg-[var(--color-primary)]/40' : ''}`}
        />

        {/* CENTER: Activity Timeline */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className={shellPanelClass + ' flex flex-col flex-1 min-h-0 overflow-hidden'}>
            {/* Activity Tabs */}
            <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
              <div className="flex gap-2 overflow-x-auto crm-scroll-hidden">
              {['Activity', 'Notes', 'Forms', 'Emails', 'SMS', 'Calls', 'Flows'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActivityTab(tab === 'Emails' ? 'Flow Emails' : tab === 'SMS' ? 'Flow SMS' : tab === 'Calls' ? 'Call Logs' : tab === 'Flows' ? 'Flow Activity' : tab)}
                  className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition ${
                    (activityTab === tab || (tab === 'Emails' && activityTab === 'Flow Emails') || (tab === 'SMS' && activityTab === 'Flow SMS') || (tab === 'Calls' && activityTab === 'Call Logs') || (tab === 'Flows' && activityTab === 'Flow Activity'))
                      ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]' 
                      : 'border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {tab}
                </button>
              ))}
              </div>
            </div>

            {/* Timeline */}
            <div 
              className="flex-1 overflow-auto p-3 space-y-2"
            >
              {/* Note Input - Only show on Notes tab */}
              {activityTab === 'Notes' && (
                <div className="sticky top-0 z-10 bg-[var(--color-bg-primary)] pb-2 border-b border-[var(--color-border)] mb-2">
                  <div className="flex gap-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note... (website links, account info, preferences, etc.)"
                      className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none focus:border-[var(--color-primary)]"
                      rows={2}
                      disabled={addingNote}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || addingNote}
                      className="px-4 py-2 rounded-[var(--radius-panel)] bg-[var(--color-primary)] text-[var(--color-text-on-primary)] text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      {addingNote ? 'Adding...' : 'Add Note'}
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Press Enter to add the note. Use Shift+Enter for a new line.</p>
                  {noteError ? <p className="text-[10px] text-red-400 mt-1">{noteError}</p> : null}
                </div>
              )}
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[var(--color-text-tertiary)]">{activityTab === 'Notes' ? 'No notes yet. Add one above!' : 'No activities yet'}</p>
                </div>
              ) : (
                filteredActivities.map(activity => (
                  <div key={activity.id} className={`flex gap-3 p-3 rounded-[var(--radius-panel)] border hover:bg-[color:var(--color-border)/0.5] transition ${getActivityTone(activity)}`}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                      {renderTimelineIcon(activity.activityType)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-[var(--color-text-primary)] font-medium text-sm">{activity.title}</h4>
                        <span className="px-2 py-1 rounded-full border border-[var(--color-border)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                          {activity.activityType}
                        </span>
                      </div>
                      <div className="text-[var(--color-text-secondary)] text-xs mt-1 leading-relaxed">
                        {activity.activityType === 'email' 
                          ? normalizeAiText(activity.description, 'No message body') 
                          : activity.description}
                      </div>
                      {activity.metadata ? renderActivityMetadata(activity) : null}
                      <p className="text-[var(--color-text-tertiary)] text-xs mt-2">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Resizer RIGHT */}
        <div 
          onMouseDown={() => setActiveResizeSide('right')}
          className={`w-1.5 h-full cursor-col-resize hover:bg-[var(--color-primary)]/20 transition-colors ${activeResizeSide === 'right' ? 'bg-[var(--color-primary)]/40' : ''}`}
        />

        {/* RIGHT: Relationship Assets */}
        <div 
          style={{ width: rightPanelWidth }}
          className="flex-none overflow-auto transition-all duration-75"
        >
          <div className={shellPanelClass + ' p-4 space-y-4'}>
            {/* Forms Submitted */}
            <div className="bg-[var(--color-bg-secondary)] rounded p-3">
              <button onClick={() => toggleDetailPanel('forms')} className="w-full text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex justify-between items-center">
                <span>Forms Submitted ({formsSubmitted.length})</span>
                <ChevronDown size={14} className={detailPanels.forms ? 'rotate-180' : ''} />
              </button>
              {detailPanels.forms ? <div className="space-y-2">
                {formsSubmitted.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-tertiary)]">No form submissions</p>
                ) : (
                  formsSubmitted.map(submission => (
                    <div key={submission.id} className="p-2 bg-[var(--color-bg-primary)] rounded text-xs">
                      <p className="text-white font-medium">Form Submission</p>
                      <p className="text-[var(--color-text-secondary)] text-[10px] mt-1">
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div> : null}
          </div>

          {/* Flows */}
          <div className="bg-[var(--color-bg-secondary)] rounded p-3">
            <button onClick={() => toggleDetailPanel('flows')} className="w-full text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex justify-between items-center">
              <span>Flows</span>
              <ChevronDown size={14} className={detailPanels.flows ? 'rotate-180' : ''} />
            </button>
            {detailPanels.flows ? (
              flowEmailActivities.length === 0 && workflowActivities.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">No active flow or automation activity</p>
              ) : (
                <div className="space-y-2">
                  {[...workflowActivities, ...flowEmailActivities].slice(0, 6).map((activity) => (
                    <div key={activity.id} className="p-2 bg-[var(--color-bg-primary)] rounded text-xs border border-[var(--color-border)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[var(--color-text-primary)] font-medium">{activity.title}</p>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">{activity.activityType}</span>
                      </div>
                      <p className="text-[var(--color-text-secondary)] mt-1">{activity.description}</p>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>

          {/* Booking */}
          <div className="bg-[var(--color-bg-primary)] rounded p-3">
            <button onClick={() => toggleDetailPanel('bookings')} className="w-full text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex justify-between items-center">
              <span>Bookings</span>
              <ChevronDown size={14} className={detailPanels.bookings ? 'rotate-180' : ''} />
            </button>
            {detailPanels.bookings ? (
              meetingActivities.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">No bookings or meetings yet</p>
              ) : (
                <div className="space-y-2">
                  {meetingActivities.slice(0, 6).map((activity) => (
                    <div key={activity.id} className="p-2 bg-[var(--color-bg-secondary)] rounded text-xs border border-[var(--color-border)]">
                      <p className="text-[var(--color-text-primary)] font-medium">{activity.title}</p>
                      <p className="text-[var(--color-text-secondary)] mt-1">{activity.description}</p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">{new Date(activity.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>

          {/* Pipelines */}
          <div className="bg-[var(--color-bg-primary)] rounded p-3">
            <button onClick={() => toggleDetailPanel('pipelines')} className="w-full text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex justify-between items-center">
              <span>Pipelines</span>
              <ChevronDown size={14} className={detailPanels.pipelines ? 'rotate-180' : ''} />
            </button>
            {detailPanels.pipelines ? <div className="p-2 bg-[var(--color-primary)]/12 rounded text-xs">
              <p className="text-[var(--color-primary)] font-medium">{selectedContact.pipelineStage || 'New'}</p>
            </div> : null}
          </div>

          {/* Billing */}
          <div className="bg-[var(--color-bg-primary)] rounded p-3">
            <button onClick={() => toggleDetailPanel('billing')} className="w-full text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex justify-between items-center">
              <span>Billing</span>
              <ChevronDown size={14} className={detailPanels.billing ? 'rotate-180' : ''} />
            </button>
            {detailPanels.billing ? <div className="space-y-2 text-xs">
              {billingItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBillingModal(item)}
                  className="w-full flex items-center justify-between rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-left text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  <span>{item.label}</span>
                  <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px]">{item.count}</span>
                </button>
              ))}
            </div> : null}
          </div>
          </div>
        </div>

        </div>

        {billingModal ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50 px-5 py-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Billing Detail</div>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{billingModal.label}</h3>
                </div>
                <button onClick={() => setBillingModal(null)} className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] backdrop-blur-sm">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-4 py-3 text-[var(--color-text-secondary)] backdrop-blur-sm">
                  {billingModal.emptyMessage}
                </div>
                <div className="space-y-2">
                  {billingModal.lines.map((line) => (
                    <div key={line} className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-3 py-2 text-[var(--color-text-primary)] backdrop-blur-sm">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };


  // CREATE CONTACT MODAL
  const CreateContactModal = () => {
    const [formData, setFormData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      company: '',
      title: '',
      department: '',
      street: '',
      apartment: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      dob: '',
      website: ''
    });
    
    const [userFormData, setUserFormData] = useState(buildUserFormData(selectedContact));
    const [userSubmitting, setUserSubmitting] = useState(false);
    const [userError, setUserError] = useState('');

    useEffect(() => {
      if (createModalTab === 'Create User') {
        setUserFormData(buildUserFormData(selectedContact));
        setUserError('');
      }
    }, [createModalTab, selectedContact]);

    const createFieldLabel = (label) => (
      <div className="mb-1">
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">{label}</label>
      </div>
    );

    const modalInputClass = "w-full rounded-[var(--radius-panel)] border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] backdrop-blur-sm";
    const modalSelectClass = "w-full rounded-[var(--radius-panel)] border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] backdrop-blur-sm";

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (createModalTab === 'Contact') {
        handleCreateContact(formData);
      } else {
        await handleCreateUser(userFormData);
      }
    };
    
    const handleCreateUser = async (data) => {
      if (!currentWorkspace?.id) {
        setUserError('No active workspace is selected.');
        return;
      }
      if (!data.firstName.trim() || !data.lastName.trim()) {
        setUserError('First name and last name are required.');
        return;
      }
      if (!data.username.trim()) {
        setUserError('Username is required.');
        return;
      }
      if (!data.email.trim()) {
        setUserError('Email is required.');
        return;
      }
      if (!data.password || data.password.length < 8) {
        setUserError('Password must be at least 8 characters.');
        return;
      }
      if (data.password !== data.confirmPassword) {
        setUserError('Passwords do not match.');
        return;
      }
      if (data.system === 'Create New System' && !(data.systemName || '').trim()) {
        setUserError('System name is required when creating a new system.');
        return;
      }

      setUserSubmitting(true);
      setUserError('');
      try {
        const response = await createWorkspaceUserApi(currentWorkspace.id, {
          username: data.username.trim(),
          email: data.email.trim(),
          password: data.password,
          name: `${data.firstName.trim()} ${data.lastName.trim()}`.trim(),
          role: data.system === 'Create New System' ? 'owner' : 'staff',
          createWorkspace: data.system === 'Create New System',
          workspaceName: data.system === 'Create New System' ? data.systemName.trim() : null
        });
        const refreshedAccess = await getUserAccessApi(data.email.trim());
        setUserAccess(refreshedAccess || null);
        setShowCreateModal(false);
        const workspaceName = response?.workspace?.name || currentWorkspace.name || 'Current System';
        showNotice({ type: 'success', message: `User created successfully. Login: ${data.email.trim()}, Workspace: ${workspaceName}` });
      } catch (error) {
        setUserError(error.message || 'Unable to create user login.');
      } finally {
        setUserSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
        <div className="flex max-h-[90vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl shadow-2xl">
          {/* Modal Header with Tabs */}
          <div className="flex border-b border-[var(--color-border)]/50">
            <button
              onClick={() => setCreateModalTab('Contact')}
              className={`flex-1 border-b-2 px-4 py-2.5 font-medium text-sm ${
                createModalTab === 'Contact'
                  ? 'text-[var(--color-text-primary)] border-[var(--color-primary)]'
                  : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)]'
              }`}
            >
              Contact
            </button>
            <button
              onClick={() => setCreateModalTab('Create User')}
              className={`flex-1 border-b-2 px-4 py-2.5 font-medium text-sm ${
                createModalTab === 'Create User'
                  ? 'text-[var(--color-text-primary)] border-[var(--color-primary)]'
                  : 'text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-primary)]'
              }`}
            >
              Create User
            </button>
            <button onClick={() => setShowCreateModal(false)} className="px-4 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 space-y-2.5 crm-scroll-hidden">
            {createModalTab === 'Contact' ? (
              // CONTACT FORM
              <>
                <div className="grid grid-cols-2 gap-3">
              <div>
                {createFieldLabel('First Name *')}
                <input 
                  type="text" 
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Last Name *')}
                <input 
                  type="text" 
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                {createFieldLabel('Email *')}
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Phone')}
                <input 
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Website')}
                <input 
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({...formData, website: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                {createFieldLabel('Company')}
                <input 
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({...formData, company: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Title')}
                <input 
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Department')}
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                  className={modalSelectClass}
                >
                  <option value="">Select...</option>
                  {filterOptions.department.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div>
              {createFieldLabel('Street Address')}
              <input 
                type="text"
                value={formData.street}
                onChange={(e) => setFormData({...formData, street: e.target.value})}
                className={modalInputClass} 
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                {createFieldLabel('City')}
                <input 
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('State')}
                <input 
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({...formData, state: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('ZIP')}
                <input 
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({...formData, zip: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                {createFieldLabel('Date of Birth')}
                <input 
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData({...formData, dob: e.target.value})}
                  className={modalInputClass} 
                />
              </div>
              <div>
                {createFieldLabel('Country')}
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  className={modalSelectClass}
                >
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="Mexico">Mexico</option>
                </select>
              </div>
            </div>
            </>
          ) : (
            // CREATE USER FORM (Multi-tenant)
            <>
              {userError ? (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {userError}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  {createFieldLabel('Which Site Will This User Login On?')}
                  <select
                    value={userFormData.site}
                    onChange={(e) => setUserFormData({...userFormData, site: e.target.value})}
                    className={modalSelectClass}
                  >
                    <option>{currentWorkspace?.name || 'Current Site'}</option>
                  </select>
                </div>

                <div>
                  {createFieldLabel('Username *')}
                  <input 
                    type="text"
                    required
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({...userFormData, username: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>
              </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    {createFieldLabel('First Name *')}
                  <input 
                    type="text"
                    required
                    value={userFormData.firstName}
                    onChange={(e) => setUserFormData({...userFormData, firstName: e.target.value})}
                      className={modalInputClass} 
                  />
                </div>
                <div>
                    {createFieldLabel('Last Name *')}
                  <input 
                    type="text"
                    required
                    value={userFormData.lastName}
                    onChange={(e) => setUserFormData({...userFormData, lastName: e.target.value})}
                      className={modalInputClass} 
                  />
                </div>
              </div>

                <div className="grid grid-cols-3 gap-3">
                <div>
                  {createFieldLabel('Email *')}
                  <input 
                    type="email"
                    required
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>
                <div>
                  {createFieldLabel('DOB')}
                  <input 
                    type="date"
                    value={userFormData.dob}
                    onChange={(e) => setUserFormData({...userFormData, dob: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>
                <div>
                  {createFieldLabel('Phone')}
                  <input 
                    type="tel"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({...userFormData, phone: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  {createFieldLabel('Password *')}
                  <input 
                    type="password"
                    required
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({...userFormData, password: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>

                <div>
                  {createFieldLabel('Confirm Password *')}
                  <input 
                    type="password"
                    required
                    value={userFormData.confirmPassword}
                    onChange={(e) => setUserFormData({...userFormData, confirmPassword: e.target.value})}
                    className={modalInputClass} 
                  />
                </div>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-xs text-[var(--color-text-secondary)]">
                <p className="mb-1 font-bold text-[var(--color-text-primary)]">What is a New System?</p>
                <p>
                  New Systems act like isolated sub-accounts. Use one when a client or customer should have their own
                  workspace without seeing the rest of your CRM data.
                </p>
              </div>

              <div className={`grid gap-3 ${userFormData.system === 'Create New System' ? 'grid-cols-[1.1fr_0.9fr]' : 'grid-cols-1'}`}>
                <div>
                  {createFieldLabel('Which System Can This User Access?')}
                  <select
                    value={userFormData.system}
                    onChange={(e) => setUserFormData({...userFormData, system: e.target.value})}
                    className={modalSelectClass}
                  >
                    <option>Create New System</option>
                    <option>Current System</option>
                  </select>
                </div>

                {userFormData.system === 'Create New System' ? (
                  <div>
                    {createFieldLabel('New System Name *')}
                    <input
                      type="text"
                      required
                      value={userFormData.systemName || ''}
                      onChange={(e) => setUserFormData({...userFormData, systemName: e.target.value})}
                      className={modalInputClass}
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    id="complimentary" 
                    name="billing"
                    checked={userFormData.billing === 'complimentary'}
                    onChange={() => setUserFormData({...userFormData, billing: 'complimentary'})}
                    className="w-4 h-4" 
                  />
                  <label htmlFor="complimentary" className="text-sm font-medium text-[var(--color-text-secondary)]">Complimentary</label>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    id="setup" 
                    name="billing"
                    checked={userFormData.billing === 'setup'}
                    onChange={() => setUserFormData({...userFormData, billing: 'setup'})}
                    className="w-4 h-4" 
                  />
                  <label htmlFor="setup" className="text-sm font-medium text-[var(--color-text-secondary)]">Setup Billing For New User</label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">Package</label>
                <select
                  value={userFormData.package}
                  onChange={(e) => setUserFormData({...userFormData, package: e.target.value})}
                  className={modalSelectClass}
                >
                  <option value="">Select Package</option>
                  <option>Starter</option>
                  <option>Professional</option>
                  <option>Enterprise</option>
                </select>
              </div>

              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded p-3 text-xs text-[var(--color-text-secondary)]">
                <p>ΓÜá∩╕Å User will not be billed for this package as no credit card has been added to this user. If you wish to bill this user for this package please select the option "Setup Billing For New User" above</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">Address</label>
                <input 
                  type="text"
                  value={userFormData.street}
                  onChange={(e) => setUserFormData({...userFormData, street: e.target.value})}
                  className={modalInputClass} 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">Apartment, suite, etc. (optional)</label>
                <input 
                  type="text"
                  value={userFormData.apartment}
                  onChange={(e) => setUserFormData({...userFormData, apartment: e.target.value})}
                  className={modalInputClass} 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">City</label>
                <input 
                  type="text"
                  value={userFormData.city}
                  onChange={(e) => setUserFormData({...userFormData, city: e.target.value})}
                  className={modalInputClass} 
                />
              </div>

                <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">Country/Region</label>
                  <select
                    value={userFormData.country}
                    onChange={(e) => setUserFormData({...userFormData, country: e.target.value})}
                    className={modalSelectClass}
                  >
                    <option>United States</option>
                    <option>Canada</option>
                    <option>Mexico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">State</label>
                  <input 
                    type="text"
                    value={userFormData.state}
                    onChange={(e) => setUserFormData({...userFormData, state: e.target.value})}
                      className={modalInputClass} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">ZIP code</label>
                  <input 
                    type="text"
                    value={userFormData.zip}
                    onChange={(e) => setUserFormData({...userFormData, zip: e.target.value})}
                      className={modalInputClass} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-2">Phone</label>
                <div className="flex gap-2">
                    <select className={modalSelectClass}>
                    <option>≡ƒç║≡ƒç╕ +1</option>
                  </select>
                  <input 
                    type="tel"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({...userFormData, phone: e.target.value})}
                    className={`flex-1 ${modalInputClass}`} 
                  />
                </div>
              </div>
            </>
          )}
          </form>

          <div className="flex justify-end gap-3 border-t bg-[var(--color-bg-tertiary)] p-4">
            <button 
              type="button"
              onClick={() => setShowCreateModal(false)} 
              className="px-6 py-2 border border-[var(--color-border)] rounded text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={createModalTab === 'Create User' && userSubmitting}
              className="px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] rounded text-sm font-medium"
            >
              {createModalTab === 'Contact' ? 'Create Contact' : (userSubmitting ? 'Creating User...' : 'Create User')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const UserAccessModal = () => {
    const accessMemberships = userAccess?.memberships || [];

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
        <div className="w-full max-w-2xl rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 px-6 py-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">User Access</div>
              <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                {userAccess?.user?.name || selectedContact?.firstName || 'Contact'}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{userAccess?.user?.email || selectedContact?.email || '--'}</p>
            </div>
            <button onClick={() => setShowUserAccessModal(false)} className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] backdrop-blur-sm">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4 p-6">
            {!userAccess ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-5 text-sm text-[var(--color-text-secondary)] backdrop-blur-sm">
                No CRM-linked user login exists for this contact yet.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-4 backdrop-blur-sm">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Username</div>
                    <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">{userAccess.user.username || '--'}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-4 backdrop-blur-sm">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Provider</div>
                    <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">{userAccess.user.provider || 'local-password'}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">Access Points</div>
                    <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">{accessMemberships.length}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {accessMemberships.map((membership) => (
                    <div key={membership.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Shield size={15} className="text-[var(--color-primary)]" />
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{membership.workspaceName}</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="text-[var(--color-text-secondary)]">Role: <span className="font-medium text-[var(--color-text-primary)]">{membership.role}</span></div>
                            <div className="text-[var(--color-text-secondary)]">System: <span className="font-medium text-[var(--color-text-primary)]">{membership.workspaceName}</span></div>
                            <div className="text-[var(--color-text-secondary)]">Site: <span className="font-medium text-[var(--color-text-primary)]">{window.location.origin}</span></div>
                          </div>
                        </div>
                        {membership.can_switch_as_admin ? (
                          <button
                            onClick={() => handleAdminWorkspaceSwitch(membership.tenantId)}
                            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)]"
                          >
                            Login As Admin
                          </button>
                        ) : (
                          <div className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                            Admin does not have access
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const BulkActionModal = () => {
    const titles = {
      addTag: 'Add Tag',
      removeTag: 'Remove Tag',
      setOwner: 'Set Owner',
      setDepartment: 'Set Department',
      assignAi: 'Assign AI',
      addFlow: 'Add Flow',
      removeFlow: 'Remove Flow'
    };
    const placeholders = {
      addTag: 'VIP',
      removeTag: 'Prospect',
      setOwner: 'Adam B.',
      setDepartment: 'Sales',
      assignAi: 'STRIKER',
      addFlow: 'Discovery Sequence',
      removeFlow: 'Discovery Sequence'
    };
    const optionsMap = {
      setDepartment: filterOptions.department,
      assignAi: ['ALPHA', 'GHOST', 'ARCHER', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FORGE', 'RANGER', 'SCOUT', 'STRIKER', 'VECTOR']
    };
    const options = optionsMap[bulkActionModal.action] || null;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 px-5 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{titles[bulkActionModal.action] || 'Bulk Action'}</h3>
            <button onClick={closeBulkActionModal} className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] backdrop-blur-sm">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Apply this action to {selectedContacts.size} selected contact{selectedContacts.size === 1 ? '' : 's'}.
            </p>
            {bulkActionError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm text-red-200 backdrop-blur-sm">
                {bulkActionError}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                Value
              </div>
              <AIAssistButton
                variant="inline"
                onAssist={applyBulkActionAssist}
                loading={bulkActionAssistLoading}
                tooltip="Draft bulk action value"
                iconType="crosshair"
              />
            </div>
            {options ? (
              <select
                value={bulkActionModal.value}
                onChange={(e) => setBulkActionModal((current) => ({ ...current, value: e.target.value }))}
                className="w-full rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] backdrop-blur-sm"
              >
                <option value="">Select...</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={bulkActionModal.value}
                onChange={(e) => setBulkActionModal((current) => ({ ...current, value: e.target.value }))}
                placeholder={placeholders[bulkActionModal.action] || ''}
                className="w-full rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)] backdrop-blur-sm"
              />
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/50 px-5 py-4 backdrop-blur-sm">
            <button onClick={closeBulkActionModal} className="rounded-[var(--radius-panel)] border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/50 px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] backdrop-blur-sm">
              Cancel
            </button>
            <button
              onClick={applyBulkAction}
              disabled={bulkActionSubmitting}
              className="btn-primary-skeuo !px-4 !py-2 !text-sm !font-medium !rounded-[var(--radius-panel)] disabled:opacity-60"
            >
              {bulkActionSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const DeleteConfirmModal = () => {
    const { open, ids, names } = deleteConfirmModal;
    if (!open) return null;

    const closeDeleteModal = () => setDeleteConfirmModal({ open: false, ids: [], names: '' });

    const handleDelete = async () => {
      try {
        const deletedIds = [...ids];
        for (const id of ids) {
          await updateContactApi(id, { deletedAt: new Date().toISOString() });
        }
        await loadData();
        setSelectedContacts(new Set());
        setIsEditingContact(false);
        if (selectedContact && ids.includes(selectedContact.id)) {
          selectContact(null);
        }
        closeDeleteModal();
        showNotice({
          type: 'warning',
          message: `Contact(s) soft-deleted.`,
          persistent: true,
          dismissible: true,
          action: {
            label: 'Undo',
            onClick: async () => {
              for (const id of deletedIds) {
                await restoreContactApi(id);
              }
              await loadData();
              showNotice({ type: 'success', message: 'Contact(s) restored.' });
            },
            dismissAfter: false
          }
        });
      } catch (error) {
        showNotice({ type: 'error', message: 'Failed to delete records' });
      }
    };

    useEffect(() => {
      const handleEsc = (e) => {
        if (e.key === 'Escape') closeDeleteModal();
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Scrim */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" 
          onClick={closeDeleteModal}
        />
        
        {/* Modal Surface */}
        <div className="relative w-full max-w-sm rounded-[var(--radius-panel)] border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/80 backdrop-blur-2xl shadow-2xl animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/30 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
                <Trash2 size={18} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)] uppercase tracking-tight">Confirm Deletion</h3>
            </div>
            <button 
              onClick={closeDeleteModal}
              className="p-1.5 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] opacity-60 hover:opacity-100 transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed font-medium">
              Are you sure you want to delete <span className="font-semibold text-red-300">{names}</span>? This will soft-delete the record and can be restored from the deleted contacts view.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end items-center gap-3 bg-[var(--color-bg-tertiary)]/30 px-5 py-4 border-t border-[var(--color-border)]/30 backdrop-blur-sm">
            <button
              onClick={closeDeleteModal}
              className="px-5 py-2.5 rounded-[var(--radius-panel)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-all uppercase tracking-widest border border-transparent hover:border-[var(--color-border)]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-6 py-2.5 rounded-[var(--radius-panel)] text-xs font-black uppercase tracking-widest transition-all shadow-lg bg-red-500 hover:bg-red-600 border border-red-400 text-white shadow-red-500/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  // MAIN RENDER
  return (
    <div className="h-full flex flex-col gap-1.5 overflow-hidden relative">
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportContacts}
        className="hidden"
      />
      {/* Header with Actions - 48px Island Toolbar */}
      {/* Toolbar */}
      <div className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 border border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/90 backdrop-blur-md rounded-xl shadow-island-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {selectedContact ? (
            <button
              onClick={() => setSelectedContact(null)}
              className="btn-toolbar-lead shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={12} />
              <span className="font-bold uppercase tracking-[0.14em]">Back to List</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-toolbar-lead shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
              >
                <Plus size={12} />
                <span className="font-bold uppercase tracking-[0.14em]">Add Contact</span>
              </button>
              <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] opacity-30 xl:block" />
              <button
                onClick={() => importInputRef.current?.click()}
                className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
              >
                <FileInput size={12} />
                <span className="font-bold uppercase tracking-[0.14em]">Import</span>
              </button>
              <button
                onClick={() => handleBulkAction('export')}
                className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
              >
                <Download size={12} />
                <span className="font-bold uppercase tracking-[0.14em]">Export</span>
              </button>
            </>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3 flex-shrink-0 h-full">
          <div className="flex items-center gap-2">
            {selectedContacts.size > 0 && (
              <button
                onClick={() => handleBulkAction('delete')}
                className="flex items-center gap-2 px-3 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded border border-red-500/30 transition shadow-sm mr-2"
              >
                <Trash2 size={12} />
                <span>DELETE ({selectedContacts.size})</span>
              </button>
            )}
            {/* Verify Dropdown */}
            <div className="relative group">
              <button className="btn-secondary text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                <Shield size={12} /> Verify
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl p-1 min-w-[140px]">
                  <button onClick={() => startBulkEmailVerification('selected')} disabled={!canUseEmailVerification || bulkVerificationSubmitting} className="w-full text-left px-3 py-2 text-xs text-sky-300 hover:bg-sky-500/20 rounded disabled:opacity-40">Verify Selected ({selectedContacts.size})</button>
                  <button onClick={() => startBulkEmailVerification('filtered')} disabled={!canUseEmailVerification || bulkVerificationSubmitting} className="w-full text-left px-3 py-2 text-xs text-sky-300 hover:bg-sky-500/20 rounded disabled:opacity-40">Verify All Filtered</button>
                </div>
              </div>
            </div>
            {/* Tag Dropdown */}
            <div className="relative group">
              <button className="btn-secondary text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">
                <Tag size={12} /> Tag
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl p-1 min-w-[120px]">
                  <button onClick={() => handleBulkAction('addTag')} className="w-full text-left px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 rounded">+ Add Tag</button>
                  <button onClick={() => handleBulkAction('removeTag')} className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 rounded">- Remove Tag</button>
                </div>
              </div>
            </div>
            {/* Flow Dropdown */}
            <div className="relative group">
              <button className="btn-secondary text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                <Zap size={12} /> Flow
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl p-1 min-w-[120px]">
                  <button onClick={() => handleBulkAction('addFlow')} className="w-full text-left px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 rounded">+ Add Flow</button>
                  <button onClick={() => handleBulkAction('removeFlow')} className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 rounded">- Remove Flow</button>
                </div>
              </div>
            </div>
            {/* Owner Dropdown */}
            <div className="relative group">
              <button className="btn-secondary text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 border-violet-500/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25">
                <User size={12} /> Owner
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl p-1 min-w-[120px]">
                  <button onClick={() => handleBulkAction('setOwner')} className="w-full text-left px-3 py-2 text-xs text-violet-300 hover:bg-violet-500/20 rounded">Set Owner</button>
                  <button onClick={() => handleBulkAction('setDepartment')} className="w-full text-left px-3 py-2 text-xs text-violet-300 hover:bg-violet-500/20 rounded">Set Dept</button>
                </div>
              </div>
            </div>
            {/* Actions Mapping */}
            <button
              onClick={() => handleBulkAction('sendApi')}
              className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
            >
              <Zap size={12} />
              <span className="font-bold uppercase tracking-[0.14em]">JSON</span>
            </button>
            <button
              onClick={() => handleBulkAction('sendEmail')}
              className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2 border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
            >
              <Mail size={12} />
              <span className="font-bold uppercase tracking-[0.14em]">Send Email</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-lg border border-white/10">
            <button
              onClick={() => openAIAssist()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
              title="Brain (Global KB)"
            >
              <BrainIcon size={14} />
            </button>
            <button
              onClick={() => openAIAssist({ context: { module: 'crm', selectedCount: selectedContacts.size, selectedContactId: selectedContact?.id } })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
              title="Crosshair (Module AI)"
            >
              <Crosshair size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Island */}
      <div className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {/* Alert Pills */}
        {!canUseEmailVerification ? (
          <div className="px-4 py-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
              Email verification is unavailable until Reoon is configured for this workspace.
            </div>
          </div>
        ) : null}

        {emailVerificationNotice?.message ? (
          <div className="px-4 py-2">
            <div className={`rounded-lg border px-3 py-2 text-sm ${emailVerificationNoticeClass}`}>
              {emailVerificationNotice.message}
            </div>
          </div>
        ) : null}

        {/* Content */}
        {renderContactsTab()}
      </div>

      {/* Create Contact Modal */}
      {showCreateModal && <CreateContactModal />}
      {showUserAccessModal && <UserAccessModal />}
      {bulkActionModal.open && <BulkActionModal />}
      {deleteConfirmModal.open && <DeleteConfirmModal />}
    </div>
  );
};

export default CRMModule;






