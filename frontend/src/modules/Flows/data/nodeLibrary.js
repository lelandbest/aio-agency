/**
 * Phase 1 Curated Node Library
 * Organized by category with token-driven rendering
 * AI Agent nodes loaded from registry (data-driven, not hardcoded)
 */

import React from 'react';
import {
  Plus, X, GripVertical, Trash2, ExternalLink, Save, Edit2,
  User, Users, Mail, MessageSquare, Phone, FileText, Box,
  Briefcase, Type, AlignLeft, CheckSquare, Hash, Lock, AtSign,
  ChevronDown, ChevronRight, ChevronUp, Radio, EyeOff, MousePointer,
  Link, Calendar, DollarSign, UploadCloud, ShoppingCart, Image,
  MapPin, PenTool, ListChecks, Code, Columns, Layers, Table,
  GripVertical as Grip, Settings, Bold, Italic, Underline,
  AlignCenter, AlignRight, GitMerge, Database, Download, Search,
  Filter, Edit2 as Edit, Folder, FolderOpen, Eye, TrendingUp,
  Zap, Activity, Clock, BarChart3, Play, Square, Grid3X3,
  Bot, Building2, Headphones, CheckSquare as CheckSquareAlt,
  Pen, Send, Webhook, Globe, Workflow, SlidersHorizontal, PenLine, Shield
} from 'lucide-react';
import { toolNodeTemplates } from './toolTemplates';

const iconRegistry = {
  'Plus': Plus,
  'X': X,
  'GripVertical': Grip,
  'Trash2': Trash2,
  'ExternalLink': ExternalLink,
  'Save': Save,
  'Edit2': Edit2,
  'User': User,
  'Users': Users,
  'Mail': Mail,
  'MessageSquare': MessageSquare,
  'Phone': Phone,
  'FileText': FileText,
  'Box': Box,
  'Briefcase': Briefcase,
  'Type': Type,
  'AlignLeft': AlignLeft,
  'CheckSquare': CheckSquare,
  'Hash': Hash,
  'Lock': Lock,
  'AtSign': AtSign,
  'ChevronDown': ChevronDown,
  'ChevronRight': ChevronRight,
  'ChevronUp': ChevronUp,
  'Radio': Radio,
  'EyeOff': EyeOff,
  'MousePointer': MousePointer,
  'Link': Link,
  'Calendar': Calendar,
  'DollarSign': DollarSign,
  'UploadCloud': UploadCloud,
  'ShoppingCart': ShoppingCart,
  'Image': Image,
  'MapPin': MapPin,
  'PenTool': PenTool,
  'ListChecks': ListChecks,
  'Code': Code,
  'Columns': Columns,
  'Layers': Layers,
  'Table': Table,
  'GripVertical': Grip,
  'Settings': Settings,
  'Bold': Bold,
  'Italic': Italic,
  'Underline': Underline,
  'AlignCenter': AlignCenter,
  'AlignRight': AlignRight,
  'GitMerge': GitMerge,
  'Database': Database,
  'Download': Download,
  'Search': Search,
  'Filter': Filter,
  'Edit2': Edit,
  'Folder': Folder,
  'FolderOpen': FolderOpen,
  'Eye': Eye,
  'TrendingUp': TrendingUp,
  'Zap': Zap,
  'Activity': Activity,
  'Clock': Clock,
  'BarChart3': BarChart3,
  'Play': Play,
  'Square': Square,
  'Grid3x3': Grid3X3,
  'Bot': Bot,
  'Building2': Building2,
  'Headphones': Headphones,
  'CheckSquare': CheckSquareAlt,
  'Pen': Pen,
  'Send': Send,
  'Webhook': Webhook,
  'Globe': Globe,
  'Workflow': Workflow,
  'SlidersHorizontal': SlidersHorizontal,
  'PenLine': PenLine,
  'FormInput': PenLine,
  'Shield': Shield,
};

export const getIconComponent = (iconName) => {
  return iconRegistry[iconName] || null;
};

/**
 * Core Node Types
 * Triggers: entry points for flows
 */
export const triggerNodes = [
  {
    id: 'manual-trigger',
    type: 'trigger',
    label: 'Manual Trigger',
    description: 'Start flow manually',
    iconName: 'Play',
    nodeColor: 'trigger',
    status: 'live',
  },
  {
    id: 'scheduled-trigger',
    type: 'trigger',
    label: 'Scheduled Time',
    description: 'Start at specific time (not yet implemented)',
    iconName: 'Clock',
    nodeColor: 'trigger',
    status: 'not_implemented',
  },
  {
    id: 'form-submitted-trigger',
    type: 'trigger',
    label: 'Form Submitted',
    description: 'Start on form submission',
    iconName: 'FileText',
    nodeColor: 'trigger',
    status: 'live',
    event: 'form_submitted',
  },
  {
    id: 'contact-created-trigger',
    type: 'trigger',
    label: 'Contact Created',
    description: 'Start when a contact is created (not yet implemented)',
    iconName: 'User',
    nodeColor: 'trigger',
    status: 'not_implemented',
  },
  {
    id: 'deal-updated-trigger',
    type: 'trigger',
    label: 'Deal Updated',
    description: 'Start when a deal changes (not yet implemented)',
    iconName: 'Workflow',
    nodeColor: 'trigger',
    status: 'not_implemented',
  },
  {
    id: 'booking-created-trigger',
    type: 'trigger',
    label: 'Booking Created',
    description: 'Start when a booking is created',
    iconName: 'Calendar',
    nodeColor: 'trigger',
    status: 'live',
    event: 'booking_created',
  },
  {
    id: 'booking-updated-trigger',
    type: 'trigger',
    label: 'Booking Updated',
    description: 'Start when a booking changes',
    iconName: 'Calendar',
    nodeColor: 'trigger',
    status: 'live',
    event: 'booking_updated',
  },
  {
    id: 'booking-cancelled-trigger',
    type: 'trigger',
    label: 'Booking Cancelled',
    description: 'Start when a booking is cancelled',
    iconName: 'Calendar',
    nodeColor: 'trigger',
    event: 'booking_cancelled',
  },
];

/**
 * Logic/Condition Nodes
 * Control flow with branching and delays
 */
export const logicNodes = [
  {
    id: 'if-then',
    type: 'logic',
    label: 'If/Then Condition',
    description: 'Branch based on conditions',
    iconName: 'GitBranch',
    nodeColor: 'logic',
  },
  {
    id: 'time-delay',
    type: 'logic',
    label: 'Wait/Delay',
    description: 'Pause flow for duration',
    iconName: 'Clock',
    nodeColor: 'logic',
  },
  {
    id: 'filter',
    type: 'logic',
    label: 'Filter',
    description: 'Filter data by criteria',
    iconName: 'Filter',
    nodeColor: 'logic',
  },
  {
    id: 'switch',
    type: 'logic',
    label: 'Switch',
    description: 'Route by matching rules',
    iconName: 'SlidersHorizontal',
    nodeColor: 'logic',
  },
  {
    id: 'wait-for-verification',
    type: 'logic',
    label: 'Wait for Verification',
    description: 'Poll a bulk verification task until it resolves',
    iconName: 'Clock',
    nodeColor: 'logic',
    config: {
      logicType: 'wait_for_verification',
      timeoutSeconds: 60,
      pollInterval: 5,
    },
  },
  {
    id: 'verification-branch',
    type: 'logic',
    label: 'Verification Branch',
    description: 'Route by valid, risky, invalid, or unknown result',
    iconName: 'Shield',
    nodeColor: 'logic',
    config: {
      logicType: 'verification_branch',
      source: 'previous',
    },
  },
];

/**
 * Webhook/API Nodes
 * External integrations and HTTP requests
 */
export const webhookNodes = [
  {
    id: 'http-request',
    type: 'webhook',
    label: 'HTTP Request',
    description: 'Make API call',
    iconName: 'Globe',
    nodeColor: 'webhook',
  },
  {
    id: 'webhook',
    type: 'webhook',
    label: 'Webhook',
    description: 'Receive webhook data',
    iconName: 'Webhook',
    nodeColor: 'webhook',
  },
];

/**
 * Messaging Nodes
 * Communication actions
 */
export const messagingNodes = [
  {
    id: 'send-email',
    type: 'action',
    label: 'Send Email',
    description: 'Send email to contacts',
    iconName: 'Mail',
    nodeColor: 'action',
  },
  {
    id: 'send-sms',
    type: 'action',
    label: 'Send SMS',
    description: 'Send SMS message',
    iconName: 'MessageSquare',
    nodeColor: 'action',
  },
];

/**
 * Utilities/Data Nodes
 * Data manipulation and storage
 */
export const utilityNodes = [
  {
    id: 'store-data',
    type: 'action',
    label: 'Store Data',
    description: 'Save data to storage',
    iconName: 'Database',
    nodeColor: 'action',
  },
  {
    id: 'set-variable',
    type: 'action',
    label: 'Set Variable',
    description: 'Write or update variable',
    iconName: 'Settings',
    nodeColor: 'action',
  },
  {
    id: 'user-input',
    type: 'input',
    label: 'User Input',
    description: 'Collect form input at runtime',
    iconName: 'FormInput',
    nodeColor: 'input',
  },
  {
    id: 'ai-form-builder',
    type: 'input',
    label: 'AI Form Builder',
    description: 'Generate form with AI',
    iconName: 'Bot',
    nodeColor: 'input',
  },
  {
    id: 'create-booking',
    type: 'action',
    label: 'Create Booking',
    description: 'Create a calendar booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'create_booking',
  },
  {
    id: 'update-booking',
    type: 'action',
    label: 'Update Booking',
    description: 'Update an existing booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'update_booking',
  },
  {
    id: 'cancel-booking',
    type: 'action',
    label: 'Cancel Booking',
    description: 'Cancel an existing booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'cancel_booking',
  },
  {
    id: 'get-booking',
    type: 'action',
    label: 'Get Booking',
    description: 'Fetch booking details',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'get_booking',
  },
  {
    id: 'verify-email',
    type: 'action',
    label: 'Verify Email',
    description: 'Verify a single email or contact email',
    iconName: 'Shield',
    nodeColor: 'action',
    actionType: 'verify_email',
    config: {
      actionType: 'verify_email',
      mode: 'quick',
      writeback: true,
    },
  },
  {
    id: 'verify-email-bulk',
    type: 'action',
    label: 'Verify Email Bulk',
    description: 'Submit async bulk email verification',
    iconName: 'Shield',
    nodeColor: 'action',
    actionType: 'verify_email_bulk',
    config: {
      actionType: 'verify_email_bulk',
      mode: 'power',
      writeback: true,
    },
  },
  {
    id: 'generate-script',
    type: 'action',
    label: 'Generate Script',
    description: 'Create a script job and structured script artifact',
    iconName: 'FileText',
    nodeColor: 'action',
    actionType: 'generate_script',
    config: {
      actionType: 'generate_script',
      topic: '',
      tone: 'clear',
      duration: '10 minutes',
      provider: 'stub-script',
    },
  },
  {
    id: 'generate-run-of-show',
    type: 'action',
    label: 'Generate Run of Show',
    description: 'Create a structured show plan artifact',
    iconName: 'ListChecks',
    nodeColor: 'action',
    actionType: 'generate_run_of_show',
    config: {
      actionType: 'generate_run_of_show',
      topic: '',
      duration: '30 minutes',
      provider: 'stub-run-of-show',
    },
  },
  {
    id: 'generate-voice',
    type: 'action',
    label: 'Generate Voice',
    description: 'Render audio from script or text input',
    iconName: 'Headphones',
    nodeColor: 'action',
    actionType: 'generate_voice',
    config: {
      actionType: 'generate_voice',
      text: '',
      voice: 'Rachel',
      provider: 'elevenlabs_tts',
    },
  },
  {
    id: 'text-to-speech',
    type: 'action',
    label: 'Text to Speech',
    description: 'Render audio from script or text input',
    iconName: 'Headphones',
    nodeColor: 'action',
    actionType: 'text_to_speech',
    config: {
      actionType: 'text_to_speech',
      text: '',
      voice: 'Rachel',
      provider: 'elevenlabs_tts',
    },
  },
  {
    id: 'generate-thumbnail',
    type: 'action',
    label: 'Generate Thumbnail',
    description: 'Create an image asset through the media engine',
    iconName: 'Image',
    nodeColor: 'action',
    actionType: 'generate_thumbnail',
    config: {
      actionType: 'generate_thumbnail',
      title: '',
      subtitle: '',
      provider: 'stub-render',
    },
  },
  {
    id: 'generate-video',
    type: 'action',
    label: 'Generate Video',
    description: 'Create a render job through the media engine',
    iconName: 'Image',
    nodeColor: 'action',
    actionType: 'generate_video',
    config: {
      actionType: 'generate_video',
      templateId: '',
      outputTarget: '',
      provider: 'stub-render',
    },
  },
  {
    id: 'transcribe-media',
    type: 'action',
    label: 'Transcribe Media',
    description: 'Create a transcript job for media or transcript input',
    iconName: 'Headphones',
    nodeColor: 'action',
    actionType: 'transcribe_media',
    config: {
      actionType: 'transcribe_media',
      sourceType: 'asset',
      sourceRef: '{{previous.assetId}}',
      provider: 'elevenlabs_scribe',
      diarization: true,
      timestamps: true,
    },
  },
  {
    id: 'ingest-meeting-artifacts',
    type: 'action',
    label: 'Ingest Meeting',
    description: 'Normalize meeting artifacts into the media engine',
    iconName: 'UploadCloud',
    nodeColor: 'action',
    actionType: 'ingest_meeting_artifacts',
    config: {
      actionType: 'ingest_meeting_artifacts',
      meetingProvider: 'zoom',
      meetingRef: '',
      attachTarget: '',
    },
  },
  {
    id: 'publish-asset',
    type: 'action',
    label: 'Publish Asset',
    description: 'Track publication of the latest media asset or artifact',
    iconName: 'Send',
    nodeColor: 'action',
    actionType: 'publish_asset',
    config: {
      actionType: 'publish_asset',
      publishTarget: 'internal.media',
      assetRef: '',
    },
  },
];

/**
 * Socket Nodes (Third-party Platform Bridges)
 * Distinct from core nodes
 */
export const socketNodes = [
  {
    id: 'n8n-socket',
    type: 'socket',
    label: 'n8n Socket',
    description: 'Execute n8n workflow',
    iconName: 'PlugZap',
    nodeColor: 'socket',
    isSocket: true,
  },
  {
    id: 'aio-boost-socket',
    type: 'socket',
    label: 'AIO Boost™ Socket',
    description: 'Execute AIO Boost™ workflow',
    iconName: 'PlugZap',
    nodeColor: 'socket',
    isSocket: true,
  },
  {
    id: 'latenode-socket',
    type: 'socket',
    label: 'Latenode Socket',
    description: 'Execute Latenode workflow',
    iconName: 'PlugZap',
    nodeColor: 'socket',
    isSocket: true,
  },
];

/**
 * Complete Node Library
 * Organized by category
 */
export const nodeLibrary = {
  Triggers: triggerNodes,
  'Logic/Condition': logicNodes,
  'Webhook/API': webhookNodes,
  Messaging: messagingNodes,
  Media: utilityNodes.filter((node) => ['generate_script', 'generate_run_of_show', 'generate_voice', 'text_to_speech', 'generate_thumbnail', 'generate_video', 'transcribe_media', 'ingest_meeting_artifacts', 'publish_asset'].includes(node.actionType)),
  'Utilities/Data': utilityNodes,
  'AI Agents': toolNodeTemplates.map((tool) => ({
    ...tool,
    id: `tool-${tool.id}`,
    type: 'action',
  })),
  Sockets: socketNodes,
};

/**
 * Flatten library for search/filter
 */
export const getAllNodes = () => {
  return Object.values(nodeLibrary).flat();
};

/**
 * Node factory
 * Creates node instances with unique IDs
 */
export const createNode = (nodeTemplate, position) => {
  const timestamp = Date.now();
  const nodeId = `${nodeTemplate.id}-${timestamp}`;
  const typeLabelMap = {
    trigger: 'Trigger',
    action: 'Action',
    logic: 'Logic',
    webhook: 'Webhook',
    socket: 'Socket',
  };

  return {
    id: nodeId,
    type: nodeTemplate.type,
    position,
    sourcePosition: 'right',
    targetPosition: 'left',
    data: {
      templateId: nodeTemplate.id,
      label: nodeTemplate.label,
      description: nodeTemplate.description,
      typeLabel: typeLabelMap[nodeTemplate.type] || 'Node',
      nodeColor: nodeTemplate.nodeColor || 'action',
      iconName: nodeTemplate.iconName || 'Play',
      isSocket: nodeTemplate.isSocket || false,
      config: {
        ...(nodeTemplate.event ? { event: nodeTemplate.event } : {}),
        ...(nodeTemplate.actionType ? { actionType: nodeTemplate.actionType } : {}),
        ...((nodeTemplate.config && typeof nodeTemplate.config === 'object') ? nodeTemplate.config : {}),
      },
    },
  };
};
