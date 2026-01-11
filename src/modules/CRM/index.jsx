import React, { useState, useMemo } from 'react';
import { mockSupabase } from '../../services/mockSupabase';
import { 
  Users, Plus, Mail, Phone, Globe, Trash2, Search, ChevronDown, Tag, 
  Activity, MessageSquare, FileText, Zap, CheckCircle,
  Send, MessageCircle, Calendar, FileInput, AlertCircle, X,
  ChevronLeft, ChevronRight, Edit, Eye, Download, MoreHorizontal, Clipboard
} from 'lucide-react';

const CRMModule = () => {
  const [contacts, setContacts] = useState([
    { 
      id: 1, name: "Jenna Best", email: "jennalarinbest@gmail.com", phone: "+1 (555) 123-4567", 
      company: "--", title: "--", lead_score: "--", tags: [], owner: "AIO Flow™", 
      last_contacted_at: "2026-01-10T15:08:00Z", pipeline_stage: "New", source: "--",
      quality: "--", engagement: "--", dob: "--", department: "--", job_title: "--",
      ai_employee: "--", address: "--", website: "--",
      created_at: "2026-01-10T15:08:00Z", updated_at: "2026-01-10T15:08:00Z"
    },
    { 
      id: 2, name: "Daniel Salinas", email: "hvac.danielsalinas@gmail.com", phone: "--",
      company: "--", title: "--", lead_score: "--", tags: ["LEAD"], owner: "--",
      last_contacted_at: "2025-07-01T08:03:00Z", pipeline_stage: "Lead", source: "--",
      quality: "--", engagement: "--", dob: "--", department: "--", job_title: "--",
      ai_employee: "--", address: "--", website: "--",
      created_at: "2025-07-01T08:03:00Z", updated_at: "2025-06-26T08:28:00Z"
    },
    { 
      id: 3, name: "Jordan Gilbert", email: "jordan@webdesignnovainc.com", phone: "--",
      company: "--", title: "--", lead_score: "--", tags: [], owner: "--",
      last_contacted_at: "2025-06-26T08:28:00Z", pipeline_stage: "New", source: "--",
      quality: "--", engagement: "--", dob: "--", department: "--", job_title: "--",
      ai_employee: "--", address: "--", website: "--",
      created_at: "2025-06-26T08:28:00Z", updated_at: "2025-06-26T08:28:00Z"
    },
    { 
      id: 4, name: "Logo Toks", email: "--", phone: "--",
      company: "--", title: "--", lead_score: "--", tags: [], owner: "--",
      last_contacted_at: "2025-12-10T16:14:00Z", pipeline_stage: "New", source: "--",
      quality: "--", engagement: "--", dob: "--", department: "--", job_title: "--",
      ai_employee: "--", address: "--", website: "--",
      created_at: "2025-12-10T16:14:00Z", updated_at: "2025-12-10T16:14:00Z"
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [activeTab, setActiveTab] = useState('Activity');
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalTab, setCreateModalTab] = useState('Contact');

  const tabs = ['Activity', 'Notes', 'Forms', 'Automation Emails', 'Automation SMS', 'Call Logs'];
  
  const filterOptions = {
    'Department': ['Sales', 'Marketing', 'Support', 'Engineering'],
    'Owners': ['AIO Flow™', 'System', 'Adam B.'],
    'Tags': ['VIP', 'Nurture', 'LEAD', 'Customer'],
    'System Tags': ['Automated', 'Manual', 'Imported'],
    'Automation': ['Active', 'Paused', 'Inactive'],
    'Input': ['Email', 'Phone', 'Form'],
    'Created Date': ['Last 7 days', 'Last 30 days', 'Last 90 days'],
    'Updated Date': ['Last 7 days', 'Last 30 days', 'Last 90 days'],
    'Last Contacted': ['Today', 'This week', 'This month'],
    'SMS/Email Activity': ['Active', 'Inactive'],
    'Lead Score': ['90+', '70-89', '50-69', 'Below 50'],
    'Address': ['US', 'International'],
    'Extra Details': ['Verified', 'Unverified'],
    'Pipeline': ['New', 'Qualified', 'Negotiating', 'Closed Won'],
    'Pipeline Column': ['Planning', 'Active', 'Completed'],
    'Name': ['A-M', 'N-Z']
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [contacts, searchTerm]);

  const toggleContactCheck = (id) => {
    const newChecked = new Set(checkedContacts);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedContacts(newChecked);
  };

  const activityTimeline = [
    { type: 'email', title: 'Nurses Day 2025 Emails', date: 'Jan 10, 2026 3:08 pm', icon: Mail },
    { type: 'form', title: 'Contact created from form "BLS Contact Form 2026"', date: 'Jan 10, 2026 3:08 pm', icon: FileText }
  ];

  const rightPanelSections = [
    { title: 'Related Track', items: [], icon: ChevronDown },
    { title: 'Automations(1)', items: ['Nurses Day 2025 Emails'], icon: ChevronDown, expanded: true },
    { title: 'Booking', items: [], icon: ChevronDown },
    { title: 'Pipelines (0)', items: [], icon: ChevronDown },
    { title: 'Billing', items: [], icon: ChevronDown, expanded: true },
    { title: 'Credit Cards (0)', items: [], icon: ChevronDown },
    { title: 'Orders(0)', items: [], icon: ChevronDown },
    { title: 'Purchases(0)', items: [], icon: ChevronDown },
    { title: 'Transactions (0)', items: [], icon: ChevronDown, expanded: true },
    { title: 'Invoices (0)', items: [], icon: ChevronDown }
  ];

  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
      {/* Top Menu Bar */}
      <div className="p-4 border-b border-[#27272A] bg-[#050505]">
        <div className="flex gap-6 text-sm font-medium">
          {['Setup', 'Contacts', 'Companies', 'Forms', 'CMS'].map(tab => (
            <button key={tab} className={`pb-2 border-b-2 ${tab === 'Contacts' ? 'text-white border-purple-500' : 'text-gray-400 border-transparent hover:text-white'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Header with Actions */}
      <div className="p-6 border-b border-[#27272A] bg-[#050505] flex justify-between items-center">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Users size={20} className="text-purple-500" />
          CRM
        </h1>
        <div className="flex gap-3">
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium">
            Import
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
            <Plus size={16} /> Create Contact/User
          </button>
        </div>
      </div>

      {/* Bulk Action Buttons */}
      <div className="px-6 py-3 bg-[#050505] border-b border-[#27272A] flex gap-2 flex-wrap">
        {['Add Tag', 'Remove Tag', 'Add To Automation', 'Remove From Flow', 'Export', 'Set Owner', 'Delete', 'Send Email', 'Send Sms', 'Send API', 'Assign to AI Employee', 'Set Department'].map((action, idx) => (
          <button key={idx} className={`px-3 py-1 rounded text-xs font-medium ${
            ['Add Tag', 'Add To Automation', 'Export', 'Assign to AI Employee'].includes(action)
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : ['Remove Tag', 'Remove From Flow', 'Delete'].includes(action)
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : action === 'Set Department'
              ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}>
            {action}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 p-4">
        {/* Left - Search & Filters */}
        <div className="w-80 flex flex-col gap-4 overflow-y-auto">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-600" />
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Filters</h3>
            {Object.entries(filterOptions).map(([filterName]) => (
              <div key={filterName} className="border-b border-[#27272A] pb-2">
                <button className="w-full flex justify-between items-center text-sm text-gray-300 hover:text-white py-1">
                  <span>{filterName}</span>
                  <ChevronDown size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center - Contact List & Detail */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Contact List */}
          <div className="flex flex-col overflow-hidden flex-1">
            <div className="flex justify-between items-center px-4 py-2 bg-[#18181B] rounded-lg mb-3 text-sm text-gray-400">
              <span>{checkedContacts.size} of {filteredContacts.length} Contacts are Selected</span>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-[#18181B] border border-[#27272A] rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0A0A0A] border-b border-[#27272A]">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input type="checkbox" className="w-4 h-4" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tags</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Created At</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Updated At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => (
                    <tr 
                      key={contact.id} 
                      className="border-b border-[#27272A] hover:bg-[#27272A]/20 transition cursor-pointer"
                      onClick={() => setSelectedContact(contact)}
                    >
                      <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleContactCheck(contact.id); }}>
                        <input 
                          type="checkbox" 
                          checked={checkedContacts.has(contact.id)}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-purple-400 font-medium">{contact.name}</td>
                      <td className="px-4 py-3 text-gray-400">{contact.lead_score}</td>
                      <td className="px-4 py-3 text-gray-400">{contact.company}</td>
                      <td className="px-4 py-3 text-gray-400">{contact.tags?.join(', ') || '-'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(contact.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(contact.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right - Detail Panel (when contact selected) */}
        {selectedContact && (
          <div className="w-80 flex flex-col gap-4 overflow-y-auto">
            {/* Detail Card */}
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 space-y-3">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedContact.name}</h2>
                <button className="text-red-500 text-xs mt-1 hover:text-red-400">Delete Contact</button>
              </div>

              {['quality', 'engagement', 'owner', 'company', 'dob', 'department', 'job_title', 'ai_employee'].map(field => (
                <div key={field}>
                  <label className="text-xs text-gray-400 font-bold uppercase">{field.replace('_', ' ')}</label>
                  <p className="text-gray-300">{selectedContact[field] || '--'}</p>
                </div>
              ))}

              {/* Quick Action Buttons */}
              <div className="flex gap-2 py-3 border-t border-[#27272A]">
                {[
                  { icon: Clipboard, label: 'Note' },
                  { icon: Mail, label: 'Email' },
                  { icon: MessageCircle, label: 'SMS' },
                  { icon: Calendar, label: 'Meet' },
                  { icon: FileInput, label: 'Form' }
                ].map((action, idx) => (
                  <button key={idx} className="flex-1 flex flex-col items-center gap-1 p-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs">
                    <action.icon size={16} />
                    <span className="text-xs">{action.label}</span>
                  </button>
                ))}
              </div>

              {/* Contact Info */}
              <div className="space-y-2 text-sm border-t border-[#27272A] pt-3">
                <div>
                  <label className="text-xs text-gray-400">Email</label>
                  <p className="text-purple-400 flex items-center gap-1">
                    <Mail size={14} /> {selectedContact.email}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Phone</label>
                  <p className="text-gray-300">{selectedContact.phone || '--'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Website</label>
                  <p className="text-gray-300">{selectedContact.website || '--'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Address</label>
                  <p className="text-gray-300">{selectedContact.address || '--'}</p>
                </div>
              </div>

              {/* Additional Details */}
              <button 
                onClick={() => setShowAdditionalDetails(!showAdditionalDetails)}
                className="w-full flex justify-between items-center p-3 bg-[#0A0A0A] rounded text-gray-300 hover:text-white text-sm"
              >
                <span>Additional Details</span>
                <ChevronDown size={16} className={showAdditionalDetails ? 'rotate-180' : ''} />
              </button>

              {showAdditionalDetails && (
                <div className="bg-[#0A0A0A] rounded p-3 space-y-2 text-sm">
                  {[
                    'External Reference ID',
                    'Validation Status (Set in Automation)',
                    'Click Id',
                    'Source Code',
                    'Sub Id 1',
                    'Sub Id 2',
                    'Sub Id 3',
                    'Sub Id 4',
                    'Sub Id 5'
                  ].map(field => (
                    <div key={field}>
                      <p className="text-xs text-gray-400 uppercase">{field}</p>
                      <p className="text-gray-300">--</p>
                    </div>
                  ))}

                  {/* Toggle Options */}
                  <div className="space-y-2 border-t border-[#27272A] pt-3">
                    {['Opt-In Emails', 'Opt-In SMS', 'Opt-In Calls', 'Opt-In Automations'].map(toggle => (
                      <div key={toggle} className="flex justify-between items-center">
                        <span className="text-xs">{toggle}</span>
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#27272A] pt-3">
                    <p className="text-xs text-gray-400 uppercase">Created Date</p>
                    <p className="text-gray-300">{new Date(selectedContact.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              )}

              {/* Account Buttons */}
              <div className="space-y-2">
                <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm font-medium">
                  User Account Details
                </button>
                <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm font-medium">
                  Create User Login
                </button>
              </div>
            </div>

            {/* Activity Tabs & Timeline */}
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden flex-1">
              <div className="flex gap-2 p-3 border-b border-[#27272A] overflow-x-auto text-xs">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 whitespace-nowrap rounded ${
                      activeTab === tab
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Activity Timeline */}
              <div className="p-3 space-y-3 overflow-y-auto">
                {activeTab === 'Activity' && activityTimeline.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <item.icon size={14} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-xs">{item.title}</p>
                      <p className="text-gray-400 text-xs">{item.date}</p>
                    </div>
                  </div>
                ))}
                {activeTab !== 'Activity' && (
                  <div className="text-center py-6 text-gray-500 text-xs">
                    <p>No {activeTab} available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Related Track */}
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-3">
              <h3 className="font-bold text-white mb-2 text-sm flex justify-between">
                <span>Related Track</span>
                <ChevronDown size={14} />
              </h3>

              {rightPanelSections.slice(0, 3).map((section, idx) => (
                <div key={idx} className="mb-2 bg-[#0A0A0A] rounded p-2 text-xs">
                  <button className="w-full flex justify-between items-center text-gray-300">
                    <span className="font-medium">{section.title}</span>
                    <section.icon size={12} />
                  </button>
                  {section.items.length > 0 && (
                    <ul className="mt-1 space-y-1 text-xs text-gray-400">
                      {section.items.map((item, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <CheckCircle size={12} className="text-green-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Contact/User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header with Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setCreateModalTab('Contact')}
                className={`flex-1 px-6 py-3 font-medium text-sm border-b-2 ${
                  createModalTab === 'Contact'
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                Contact
              </button>
              <button
                onClick={() => setCreateModalTab('Create User')}
                className={`flex-1 px-6 py-3 font-medium text-sm border-b-2 ${
                  createModalTab === 'Create User'
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                Create User
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {createModalTab === 'Contact' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">First name</label>
                      <input type="text" placeholder="First name" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Last name</label>
                      <input type="text" placeholder="Last name" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Email</label>
                    <input type="email" placeholder="Email" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Company (optional)</label>
                    <input type="text" placeholder="Company (optional)" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Address</label>
                    <input type="text" placeholder="Address" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Apartment, suite, etc. (optional)</label>
                    <input type="text" placeholder="Apartment, suite, etc. (optional)" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">City</label>
                    <input type="text" placeholder="City" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Country/Region</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                        <option>United States</option>
                        <option>Canada</option>
                        <option>Mexico</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">State</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                        <option>State</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">ZIP code</label>
                      <input type="text" placeholder="ZIP code" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Phone</label>
                    <div className="flex gap-2">
                      <select className="px-3 py-2 border border-gray-300 rounded text-sm">
                        <option>🇺🇸 +1</option>
                      </select>
                      <input type="tel" placeholder="+1" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">DOB</label>
                    <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
              )}

              {createModalTab === 'Create User' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Which Site Will This User Login On?</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                      <option>Current Site</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Username</label>
                    <input type="text" placeholder="Username" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">First Name</label>
                      <input type="text" placeholder="First Name" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Last Name</label>
                      <input type="text" placeholder="Last Name" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Email</label>
                      <input type="email" placeholder="Email" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">DOB</label>
                      <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Password</label>
                    <div className="relative">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                      <Eye size={16} className="absolute right-3 top-2.5 text-gray-400 cursor-pointer" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Confirm Password *</label>
                    <div className="relative">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                      <Eye size={16} className="absolute right-3 top-2.5 text-gray-400 cursor-pointer" />
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900">
                    <p className="font-bold mb-1">ℹ What is a New System? [Systems]</p>
                    <p>(also known as [Sub-Accounts]) are isolated Systems that don't share any data. If you want to create an account for a Client or Customer and you don't want them to see any of your contacts or other data you would select "Create New System".</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Which System Can This User Access?</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                      <option>Create New System</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="radio" id="complimentary" name="billing" defaultChecked className="w-4 h-4" />
                      <label htmlFor="complimentary" className="text-sm font-medium">Complimentary</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="radio" id="setup" name="billing" className="w-4 h-4" />
                      <label htmlFor="setup" className="text-sm font-medium">Setup Billing For New User</label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Package</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                      <option>Package</option>
                    </select>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-900">
                    <p>⚠ User will not be billed for this package as no credit card has been added to this user. If you wish to bill this user for this package please select the option "Setup Billing For New User" above</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Address</label>
                    <input type="text" placeholder="Address" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Apartment, suite, etc. (optional)</label>
                    <input type="text" placeholder="Apartment, suite, etc. (optional)" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">City</label>
                    <input type="text" placeholder="City" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Country/Region</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                        <option>United States</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">State</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500">
                        <option>State</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">ZIP code</label>
                      <input type="text" placeholder="ZIP code" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Phone</label>
                    <div className="flex gap-2">
                      <select className="px-3 py-2 border border-gray-300 rounded text-sm">
                        <option>🇺🇸 +1</option>
                      </select>
                      <input type="tel" placeholder="+1" className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t p-6 flex justify-end gap-3 bg-gray-50">
              <button onClick={() => setShowCreateModal(false)} className="px-6 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMModule;