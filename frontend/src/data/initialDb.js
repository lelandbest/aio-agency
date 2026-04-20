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

export const INITIAL_MENU_STRUCTURE = [
  {
    category: "Main",
    items: [
      { id: "aio-brain", label: "Cortex", icon: "Brain", type: "internal", visible: true, iconColor: "#9ca3af", searchPlaceholder: "Search Cortex..." },
      { id: "signals", label: "Signals", icon: "AlertTriangle", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "aio-agents", label: "Agents", icon: "Bot", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "forge", label: "Forge", icon: "Anvil", type: "internal", visible: true, iconColor: "#06b6d4", description: "Forge workspace // Digital Asset Workstation" }
    ]
  },
  {
    category: "Systems",
    items: [
      { id: "aio-academy", label: "Academy", icon: "GraduationCap", type: "iframe", url: "https://aiocrm.org/academy", visible: true, iconColor: "#9ca3af" },
      { id: "aio-bots", label: "Bots", icon: "Bot", type: "iframe", url: "https://go.aiobots.us", visible: true, iconColor: "#9ca3af" },
      { id: "aio-livebots", label: "LiveBots", icon: "Radio", type: "iframe", url: "https://go.aiolivebots.com", visible: true, iconColor: "#9ca3af" },
      { id: "aio-hide", label: "H.I.D.E.", icon: "EyeOff", type: "iframe", url: "https://data.maverickcrm.net", visible: true, iconColor: "#9ca3af" },
      { id: "aio-sniper", label: "Sniper", icon: "Crosshair", type: "iframe", url: "https://sniper.aioflow.com", visible: true, iconColor: "#9ca3af" },
      { id: "postly-ai", label: "Postly", icon: "FileText", type: "iframe", url: "https://postly.ai", visible: true, iconColor: "#9ca3af" }
    ]
  },
  {
    category: "Operations",
    items: [
      { id: "calendar", label: "Calendar", icon: "CalendarIcon", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "comms", label: "Comms", icon: "RadioTower", type: "internal", visible: true, iconColor: "#9ca3af" },
      { id: "sms_voip", label: "SMS-VoIP", icon: "Phone", type: "internal", visible: true, iconColor: "#9ca3af" },
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
