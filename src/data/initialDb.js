import { 
  LayoutDashboard, Users, Bot, Workflow, Radio, Calendar as CalendarIcon, 
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe, 
  Phone, Settings, ChevronDown, ChevronRight, Search, Plus, Video, 
  CreditCard, Zap, Shield, Tag, Layout, EyeOff, Activity, Crosshair, 
  CheckSquare, Save, ExternalLink, Box, Edit2, X, List, Grid, 
  UserPlus, Mail, MessageCircle, Trash2, MoreHorizontal, LogOut, Key, Lock,
  Briefcase, FileInput, Columns, Filter, ArrowRight, Link, Webhook, Power,
  Download, Package, Clock, Copy, Calendar, Server, Chrome, 
  PhoneCall, Paperclip, CheckCircle, AlertCircle, Play, StopCircle, UploadCloud,
  User, Bell, Smartphone, MapPin, Receipt, CreditCard as CardIcon, Cpu, Target, ShieldCheck, Terminal, MessageSquareCode, Layers,
  AlertOctagon, Bookmark, Flag, TrendingUp, DollarSign, GripVertical, Type, AlignLeft, ListChecks, CalendarDays,
  Activity as ActivityIcon, Hash, AtSign, MousePointer, Image, Table, Code, AlignCenter, AlignRight, Bold, Italic, Underline
} from 'lucide-react';

export const ICON_LIBRARY = {
  LayoutDashboard, Users, Bot, Workflow, Radio, CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, Video, CreditCard, Zap, Shield, Tag, Layout,
  EyeOff, Activity, Crosshair, Box, CheckSquare, Key, Lock,
  Briefcase, FileInput, Webhook, Link, Power, Download, Package, Clock, Copy,
  Server, Chrome, PhoneCall, Paperclip, CheckCircle, AlertCircle, Play, StopCircle, UploadCloud,
  User, Bell, Smartphone, MapPin, Receipt, CardIcon, Cpu, Target, ShieldCheck, Terminal, MessageSquareCode, Layers,
  AlertOctagon, Bookmark, Flag, TrendingUp, DollarSign, GripVertical, Type, AlignLeft, ListChecks, CalendarDays
};

// --- 1. MOCK DATABASE (STATEFUL) ---
export const initialDb = {
  global_variables: [
    { id: 1, key: 'WEBHOOK_LATENODE', value: 'https://webhook.latenode.com/123', is_secret: true, description: 'Main workflow trigger' },
    { id: 2, key: '{{userGreeting}}', value: 'Hello there!', is_secret: false, description: 'Email greeting template' },
    { id: 3, key: 'SMTP_HOST', value: 'smtp.sendgrid.net', is_secret: false, description: 'Email Server Host' },
    { id: 4, key: 'GOOGLE_CLIENT_ID', value: '12345...apps.googleusercontent.com', is_secret: true, description: 'Google Calendar Sync' }
  ],
  contacts: [
    { id: 1, name: "Aaron Riggs", email: "aaron@aioflow.com", phone: "+1 (555) 123-4567", company: "AIO Flow", title: "Owner", lead_score: 95, tags: ["VIP", "Customer"], owner: "System", last_contacted_at: "2026-01-07T10:00:00Z", pipeline_stage: "Closed Won", source: "Referral" },
    { id: 2, name: "Daniel Salinas", email: "daniel.salinas@hvac.com", phone: "+1 (555) 987-6543", company: "Salinas HVAC", title: "Manager", lead_score: 42, tags: ["Nurture"], owner: "Adam B.", last_contacted_at: "2026-01-06T14:30:00Z", pipeline_stage: "Discovery", source: "LinkedIn" },
  ],
  aio_agents: [
    { id: 1, name: "Lead Scout", rank: "SpecOps", role: "Researcher", status: "Deployed", model: "GPT-4o", subordinates: [], specialization: "Data Mining" },
    { id: 2, name: "Content Sniper", rank: "Marksman", role: "Writer", status: "Idle", model: "Claude 3.5 Sonnet", subordinates: [], specialization: "Copywriting" },
    { id: 3, name: "Ops Commander", rank: "General", role: "Manager", status: "Active", model: "GPT-4o", subordinates: [1, 2], specialization: "Workflow Orchestration" }
  ],
  companies: [
    { id: 1, name: "All IT Solution", industry: "IT Services", size: "50-100", website: "allitsolutions.com", owner: "System" },
    { id: 2, name: "Salinas HVAC", industry: "Construction", size: "10-50", website: "salinashvac.com", owner: "Adam B." }
  ],
  forms: [
    { 
      id: 1, 
      title: "Client Onboarding", 
      responses: 12, 
      last_active: "2 days ago", 
      status: "Active",
      schema: [
        { id: "f1", type: "text", label: "Full Name", placeholder: "John Doe", required: true },
        { id: "f2", type: "email", label: "Email Address", placeholder: "john@example.com", required: true },
        { id: "f3", type: "select", label: "Service Type", options: ["Consulting", "Development", "Design"], required: false }
      ]
    },
    { 
      id: 2, 
      title: "Guest Release Form", 
      responses: 45, 
      last_active: "5 hours ago", 
      status: "Active",
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
      { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard", type: "internal", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Systems",
    items: [
      { id: "aio-agents", label: "AIO Agents™", icon: "Bot", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "aio-bots", label: "AIO Bots™", icon: "Bot", type: "iframe", url: "https://aiobots.us", visible: true, iconColor: "#9ca3af" },
      { id: "aio-flows", label: "AIO Flows™", icon: "Workflow", type: "iframe", url: "https://work.aioflows.com", visible: true, iconColor: "#9ca3af" },
      { id: "aio-hide", label: "AIO H.I.D.E.", icon: "EyeOff", type: "iframe", url: "https://data.maverickcrm.net/", visible: true, iconColor: "#9ca3af" },
      { id: "aio-livebots", label: "AIO LiveBots™", icon: "Radio", type: "iframe", url: "https://go.aiolivebots.com", visible: true, iconColor: "#9ca3af" },
      { id: "aio-sniper", label: "AIO Sniper™", icon: "Crosshair", type: "iframe", url: "https://sniper.aioflow.com", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Operations",
    items: [
      { id: "calendar", label: "Calendar", icon: "CalendarIcon", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "chat", label: "Chat", icon: "MessageSquare", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "crm", label: "CRM", icon: "Users", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "design", label: "Design", icon: "PenTool", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "pipelines", label: "Pipelines", icon: "GitMerge", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "orders", label: "Orders", icon: "ShoppingCart", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "forms", label: "Forms", icon: "FileText", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "flows", label: "Flows", icon: "Zap", type: "internal", visible: true, iconColor: "#9ca3af" },
    ]
  },
  {
    category: "Growth",
    items: [
      { id: "marketplace", label: "MarketPlace", icon: "Globe", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "postly-ai", label: "Postly AI", icon: "FileText", type: "iframe", url: "https://postly.ai", visible: true, iconColor: "#9ca3af" },
      { id: "sms-voip", label: "SMS/VoIP", icon: "Phone", type: "internal", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Automations",
    items: [
      { 
        id: "platforms", 
        label: "Platforms", 
        icon: "Zap", 
        type: "group",
        visible: true,
        iconColor: "#9ca3af",
        children: [
          { id: "aio-boost", label: "AIO Boost", type: "external", url: "https://aio.boost.space" },
          { id: "latenode", label: "Latenode", type: "external", url: "https://app.latenode.com" },
          { id: "make", label: "Make.com", type: "external", url: "https://www.make.com" },
          { id: "n8n", label: "n8n", type: "external", url: "https://n8n1.aioflows.com" },
          { id: "n8n-cloud", label: "n8n Cloud", type: "external", url: "https://n8n.io" }
        ]
      },
      { id: "integrations", label: "Integrations", icon: "Link", type: "internal", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Admin",
    items: [
      { 
        id: "settings", 
        label: "Settings", 
        icon: "Settings", 
        type: "group",
        visible: true,
        iconColor: "#9ca3af",
        children: [
          { id: "set-personal", label: "Personal" },
          { id: "set-billing", label: "Billing" },
          { id: "set-whitelabel", label: "White Label" },
          { id: "set-security", label: "Security" },
          { id: "set-vars", label: "Global Variables" }
        ]
      }
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