import {
  LayoutDashboard, Users, Bot, Workflow, Radio, RadioTower, Calendar as CalendarIcon, GraduationCap,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, ChevronDown, ChevronRight, Search, Plus, Video,
  CreditCard, Zap, Shield, Tag, Layout, EyeOff, Activity,
  CheckSquare, Save, ExternalLink, Box, Edit2, X, List, Grid,
  UserPlus, Mail, MessageCircle, Trash2, MoreHorizontal, LogOut, Key, Lock,
  Briefcase, FileInput, Columns, Filter, ArrowRight, Link, Webhook, Power,
  Download, Package, Clock, Copy, Calendar, Server, Chrome,
  PhoneCall, Paperclip, CheckCircle, AlertCircle, Play, StopCircle, UploadCloud,
  Anvil,
  User, Bell, Smartphone, MapPin, Receipt, CreditCard as CardIcon, Cpu, ShieldCheck, Terminal, MessageSquareCode, Layers,
  AlertOctagon, Bookmark, Flag, TrendingUp, DollarSign, GripVertical, Type, AlignLeft, ListChecks, CalendarDays,
  Activity as ActivityIcon, Hash, AtSign, MousePointer, Image, Table, Code, AlignCenter, AlignRight, Bold, Italic, Underline,
  AlertTriangle
} from 'lucide-react';
import { BrainIcon, TargetIcon, Crosshair } from '../components/ui/icons';

export const ICON_LIBRARY = {
  LayoutDashboard, Users, Bot, Workflow, Radio, RadioTower, CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, Video, CreditCard, Zap, Shield, Tag, Layout,
  EyeOff, Activity, Crosshair, Bullseye: TargetIcon, Box, CheckSquare, Key, Lock,
  Briefcase, FileInput, Webhook, Link, Power, Download, Package, Clock, Copy,
  Server, Chrome, PhoneCall, Paperclip, CheckCircle, AlertCircle, Play, StopCircle, UploadCloud,
  User, Bell, Smartphone, MapPin, Receipt, CardIcon, Cpu, Target: TargetIcon, ShieldCheck, Terminal, MessageSquareCode, Layers,
  AlertOctagon, Bookmark, Flag, TrendingUp, DollarSign, GripVertical, Type, AlignLeft, ListChecks, CalendarDays, GraduationCap,
  Brain: BrainIcon, AlertTriangle, Anvil
};

const TM = '\u2122';

// --- 1. MOCK DATABASE (STATEFUL) ---
export const initialDb = {
  global_variables: [
    { id: 1, key: 'WEBHOOK_LATENODE', value: 'https://webhook.latenode.com/123', is_secret: true, description: 'Main workflow trigger' },
    { id: 2, key: '{{userGreeting}}', value: 'Hello there!', is_secret: false, description: 'Email greeting template' },
    { id: 3, key: 'SMTP_HOST', value: 'smtp.sendgrid.net', is_secret: false, description: 'Email Server Host' }
  ],
  contacts: [
    { id: 1, name: "Aaron Riggs", email: "aaron@aioflow.com", phone: "+1 (555) 123-4567", company: "AIO Flow", title: "Owner", lead_score: 95, tags: ["VIP", "Customer"], owner: "System", last_contacted_at: "2026-01-07T10:00:00Z", pipeline_stage: "Closed Won", source: "Referral" },
    { id: 2, name: "Daniel Salinas", email: "daniel.salinas@hvac.com", phone: "+1 (555) 987-6543", company: "Salinas HVAC", title: "Manager", lead_score: 42, tags: ["Nurture"], owner: "Adam B.", last_contacted_at: "2026-01-06T14:30:00Z", pipeline_stage: "Discovery", source: "LinkedIn" },
  ],
  aio_agents: [
    { id: 1, name: "ALPHA", registryKey: "ALPHA", rank: "Commander", role: "HQ", status: "Active", model: "GPT-4o", subordinates: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], specialization: "Commander-in-Chief", visibility: "visible", capabilityTier: "tier-1" },
    { id: 2, name: "BRAVO", registryKey: "BRAVO", rank: "AI Agent", role: "Strategy", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Business Strategy", visibility: "visible", capabilityTier: "tier-2" },
    { id: 3, name: "CHARLIE", registryKey: "CHARLIE", rank: "AI Agent", role: "Support", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Customer Support", visibility: "visible", capabilityTier: "tier-1" },
    { id: 4, name: "DELTA", registryKey: "DELTA", rank: "AI Agent", role: "Coordination", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Visual/Project Coordination", visibility: "visible", capabilityTier: "tier-2" },
    { id: 5, name: "ECHO", registryKey: "ECHO", rank: "AI Agent", role: "Comms", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Email/Comms/Socials", visibility: "visible", capabilityTier: "tier-1" },
    { id: 6, name: "FORGE", registryKey: "FORGE", rank: "AI Agent", role: "Copy", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Content/Copywriting", visibility: "visible", capabilityTier: "tier-2" },
    { id: 7, name: "GHOST", registryKey: "GHOST", rank: "AI Agent", role: "Engineering", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Systems Engineering", visibility: "visible", capabilityTier: "tier-1" },
    { id: 8, name: "ARCHER", registryKey: "ARCHER", rank: "AI Agent", role: "Analytics", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Analytics/Financial", visibility: "visible", capabilityTier: "tier-1" },
    { id: 9, name: "RANGER", registryKey: "RANGER", rank: "AI Agent", role: "SEO", status: "Active", model: "GPT-4o", subordinates: [], specialization: "SEO/Content Optimization", visibility: "visible", capabilityTier: "tier-2" },
    { id: 10, name: "SCOUT", registryKey: "SCOUT", rank: "AI Agent", role: "Recruitment", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Hiring/Recruitment", visibility: "visible", capabilityTier: "tier-2" },
    { id: 11, name: "STRIKER", registryKey: "STRIKER", rank: "AI Agent", role: "Sales", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Sales/Negotiation", visibility: "visible", capabilityTier: "tier-1" },
    { id: 12, name: "VECTOR", registryKey: "VECTOR", rank: "AI Agent", role: "Design", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Graphics/Design", visibility: "visible", capabilityTier: "tier-2" },
    { id: 13, name: "ATLAS", registryKey: "ATLAS", rank: "AI Agent", role: "Logistics", status: "Active", model: "GPT-4o", subordinates: [], specialization: "Logistics/Systems Mapping", visibility: "visible", capabilityTier: "tier-1" }
  ],
  companies: [
    { id: 1, name: "All IT Solution", industry: "IT Services", size: "50-100", website: "allitsolutions.com", owner: "System" },
    { id: 2, name: "Salinas HVAC", industry: "Construction", size: "10-50", website: "salinashvac.com", owner: "Adam B." }
  ],
  form_folders: [
    { id: 1, name: 'My Forms', user_id: 1, created_at: '2024-01-01', expanded: true }
  ],
  forms: [
    {
      id: 1,
      name: "Website Forms",
      folder_id: 1,
      responses_count: 12,
      last_active: "2 days ago",
      last_modified_by: "AIO Flow™",
      last_modified_at: "2024-09-12T12:36:00Z",
      creator: "AIO Flow™",
      triggers: null,
      automation: null,
      status: "Active",
      is_active: true,
      schema: [
        { id: "f1", type: "text", label: "Full Name", placeholder: "John Doe", required: true },
        { id: "f2", type: "email", label: "Email Address", placeholder: "john@example.com", required: true },
        { id: "f3", type: "select", label: "Service Type", options: ["Consulting", "Development", "Design"], required: false }
      ]
    },
    {
      id: 2,
      name: "Chatbot Forms",
      folder_id: 1,
      responses_count: 45,
      last_active: "5 hours ago",
      last_modified_by: "AIO Flow™",
      last_modified_at: "2024-09-11T04:30:00Z",
      creator: "AIO Flow™",
      triggers: null,
      automation: null,
      status: "Active",
      is_active: true,
      schema: [
        { id: "f1", type: "text", label: "Guest Name", placeholder: "", required: true },
        { id: "f2", type: "date", label: "Recording Date", required: true },
        { id: "f3", type: "checkbox", label: "I agree to the terms and conditions", required: true }
      ]
    }
  ],
  orders: [
    { id: '#JOCOG3', contact: 'Adam Bronson', payment_status: 'Paid', fulfillment_status: 'Not Fulfilled', items: '1 item', total: '$49.00', date: 'Oct 24, 2025' },
    { id: '#CF1RNR', contact: 'John Pizzi', payment_status: 'Paid', fulfillment_status: 'Not Fulfilled', items: '1 item', total: '$120.00', date: 'Oct 23, 2025' },
  ],
  bookers: [
    { id: 1, name: "Meet with AIO", type: "Single User", link: "https://beamcal.com/aio_lbq2jf", duration: "30 min", active: true },
    { id: 2, name: "Discovery Call", type: "Round Robin", link: "https://beamcal.com/aio_discovery", duration: "15 min", active: true }
  ],
  bookings: [
    { id: 1, title: "Discovery Call with Sarah", time: "Jan 12, 10:00 AM", status: "Confirmed", guest: "Sarah Connor" },
    { id: 2, title: "Strategy Session", time: "Jan 14, 2:00 PM", status: "Pending", guest: "John Doe" }
  ]
};

// --- MENU STRUCTURE ---
export const INITIAL_MENU_STRUCTURE = [
  {
    category: "Main",
    items: [
      { id: "aio-brain", label: "Cortex", icon: "Brain", type: "internal", visible: true, iconColor: "#9ca3af", searchPlaceholder: "Search Cortex..." },
      { id: "dashboard", label: "Signals", icon: "AlertTriangle", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "aio-agents", label: "Agents", icon: "Bot", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "hammer", label: "Hammer", icon: "Anvil", type: "internal", visible: true, iconColor: "#06b6d4", description: "Digital Asset Workstation // Cognitive Assembler" }
    ]
  },
  {    category: "Systems",
    items: [
      { id: "aio-academy", label: "Academy", icon: "GraduationCap", type: "iframe", url: "https://aiocrm.org/academy", visible: true, iconColor: "#9ca3af" },
      { id: "aio-bots", label: "Bots", icon: "Bot", type: "iframe", url: "https://go.aiobots.us", visible: true, iconColor: "#9ca3af" },
      { id: "aio-livebots", label: "LiveBots", icon: "Radio", type: "iframe", url: "https://go.aiolivebots.com", visible: true, iconColor: "#9ca3af" },
      { id: "aio-hide", label: "H.I.D.E.", icon: "EyeOff", type: "iframe", url: "https://data.maverickcrm.net/", visible: true, iconColor: "#9ca3af" },
      { id: "aio-sniper", label: "Sniper", icon: "Crosshair", type: "iframe", url: "https://sniper.aioflow.com", visible: true, iconColor: "#9ca3af" },
      { id: "postly-ai", label: "Postly", icon: "FileText", type: "iframe", url: "https://postly.ai", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Operations",
    items: [
      { id: "calendar", label: "Calendar", icon: "CalendarIcon", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "chat", label: "Dispatch", icon: "RadioTower", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "sms_voip", label: "SMS/VoIP", icon: "Phone", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "crm", label: "CRM", icon: "Users", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "design", label: "Design", icon: "PenTool", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "studio", label: "Studio", icon: "Video", type: "internal", visible: true, iconColor: "#9ca3af", description: "Create scripts, voice, renders, transcripts, and ingest workflows from one workspace." },
      { id: "flows", label: "Flows", icon: "Workflow", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "forms", label: "Forms", icon: "FileText", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "orders", label: "Orders", icon: "ShoppingCart", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "pipelines", label: "Pipelines", icon: "GitBranch", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "aio-help", label: "Help Desk", icon: "GraduationCap", type: "internal", visible: false, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Growth",
    items: [
      { id: "marketplace", label: "MarketPlace", icon: "Globe", type: "internal", visible: false, iconColor: "#9ca3af" },
      { id: "aio-systems", label: "Systems", icon: "Layers", type: "internal", visible: true, iconColor: "#9ca3af", description: "Browse the full system stack and launch each workspace inside the embedded app frame." }
]
  },
  {
    category: "Admin",
    items: [
      { id: "integrations", label: "Integrations", icon: "Link", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "settings", label: "Settings", icon: "Settings", type: "internal", visible: true, iconColor: "#9ca3af" }
    ]
  }
];

// --- MOCK PIPELINE DATA ---
export const INITIAL_PIPELINE = {
  planning: [
    { id: 'PROJ-101', title: 'Ep 144: Future of AI', type: 'Story', priority: 'High', client: 'TechDaily', date: 'Oct 24', tags: ['Research', 'Guest'], assignees: ['AR'] },
    { id: 'PROJ-102', title: 'Ep 145: Automation Tools', type: 'Task', priority: 'Medium', client: 'TechDaily', date: 'Oct 31', tags: ['Scripting'], assignees: [] },
  ],
  booking: [
    { id: 'PROJ-103', title: 'Ep 143: Robotics', type: 'Task', priority: 'Low', client: 'TechDaily', date: 'Oct 17', tags: ['Waiting'], assignees: ['AC'] },
  ],
  production: [
    { id: 'PROJ-104', title: 'Ep 142: The AI Revolution', type: 'Bug', priority: 'High', client: 'TechDaily', date: 'Today', tags: ['Recording'], assignees: ['MS', 'JS'] },
  ],
  post: [
    { id: 'PROJ-105', title: 'Ep 141: Cyber Security', type: 'Story', priority: 'Medium', client: 'TechDaily', date: 'Oct 03', tags: ['Editing', 'Urgent'], assignees: [] },
  ]
};

// Already exported as named exports above - no need to re-export

