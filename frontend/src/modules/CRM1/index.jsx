import React, { useMemo, useState } from 'react';
import { ArrowLeft, Download, Filter, Import, Plus, Search, Shield, Tag, Trash2 } from 'lucide-react';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import CRM1List from './CRM1List';
import CRM1Detail from './CRM1Detail';

const snapshotContacts = [
  {
    id: 'crm1-contact-1',
    firstName: 'Jenna',
    lastName: 'Marrow',
    displayName: 'Jenna Marrow',
    email: 'jenna@northstarhvac.com',
    phone: '+1 (555) 210-8844',
    company: 'Northstar HVAC',
    title: 'Operations Director',
    owner: 'Adam B.',
    status: 'Active',
    validationStatus: 'Verified',
    leadScore: 94,
    pipelineStage: 'Discovery',
    source: 'Referral',
    externalReferenceId: 'CRM1-NSH-204',
    sourceCode: 'referral_partner',
    clickId: 'clk_ns_20411',
    subId1: 'HVAC',
    subId2: 'Q2',
    subId3: 'Ops',
    subId4: 'Expansion',
    subId5: 'HighValue',
    tags: ['VIP', 'Customer', 'Onboarding'],
    doNotEmail: false,
    doNotSms: false,
    optedIntoMarketing: true,
    optedIntoSms: true,
    createdAt: '2026-02-18T14:20:00Z',
    updatedAt: '2026-04-02T10:15:00Z',
    lastContactedAt: '2026-04-07T16:30:00Z',
    timeline: [
      { id: 'a1', type: 'note', title: 'Operator note', description: 'Prefers direct afternoon follow-up. Reviewing dispatch overflow package.', createdAt: '2026-04-07T16:30:00Z' },
      { id: 'a2', type: 'email', title: 'Proposal email', description: 'Proposal recap and staffing options sent.', senderName: 'Adam B.', subject: 'Northstar HVAC staffing proposal', createdAt: '2026-04-06T12:10:00Z' },
      { id: 'a3', type: 'meeting', title: 'Discovery call', description: 'Discussed routing pain points and after-hours coverage.', location: 'Google Meet', createdAt: '2026-04-04T18:00:00Z' },
    ],
    forms: [
      { id: 'f1', name: 'Operator Intake', submittedAt: '2026-04-03T17:41:00Z', status: 'Reviewed' },
      { id: 'f2', name: 'Staffing Assessment', submittedAt: '2026-04-05T09:12:00Z', status: 'Pending' },
    ],
    bookings: [
      { id: 'b1', title: 'Follow-up Review', time: 'Apr 11, 2:30 PM', status: 'Confirmed' },
      { id: 'b2', title: 'Owner Alignment', time: 'Apr 14, 11:00 AM', status: 'Pending' },
    ],
    orders: [{ id: '#NSH-4402', total: '$2,400.00', status: 'Paid', fulfillment: 'Queued' }],
    notes: 'Running owner-level evaluation. Interested in dispatch workflow hardening and after-hours routing.',
    userAccess: { state: 'Not provisioned', memberships: [] },
    billing: { customerStatus: 'Prospect', paymentProfile: 'Manual invoice', balance: '$0.00' },
  },
  {
    id: 'crm1-contact-2',
    firstName: 'Sarah',
    lastName: 'Vale',
    displayName: 'Sarah Vale',
    email: 'sarah@echelonmedical.io',
    phone: '+1 (555) 322-9011',
    company: 'Echelon Medical',
    title: 'Practice Administrator',
    owner: 'System',
    status: 'Nurture',
    validationStatus: 'Needs review',
    leadScore: 76,
    pipelineStage: 'Qualification',
    source: 'Organic',
    externalReferenceId: 'CRM1-ECH-118',
    sourceCode: 'organic_search',
    clickId: 'clk_ech_11890',
    subId1: 'Healthcare',
    subId2: 'Inbound',
    subId3: 'Clinic',
    subId4: 'Ops',
    subId5: '',
    tags: ['Lead', 'Follow-up'],
    doNotEmail: false,
    doNotSms: false,
    optedIntoMarketing: true,
    optedIntoSms: false,
    createdAt: '2026-01-28T09:00:00Z',
    updatedAt: '2026-04-01T13:24:00Z',
    lastContactedAt: '2026-04-05T10:05:00Z',
    timeline: [
      { id: 'b1', type: 'note', title: 'Discovery prep', description: 'Needs pricing comparison against current intake team.', createdAt: '2026-04-05T10:05:00Z' },
      { id: 'b2', type: 'email', title: 'Follow-up', description: 'Shared CRM intake screenshots and scheduling options.', senderName: 'System', subject: 'Operational CRM follow-up', createdAt: '2026-04-02T15:42:00Z' },
    ],
    forms: [{ id: 'f3', name: 'Consult Request', submittedAt: '2026-03-29T11:16:00Z', status: 'Qualified' }],
    bookings: [{ id: 'b3', title: 'Clinical Ops Review', time: 'Apr 16, 9:00 AM', status: 'Confirmed' }],
    orders: [],
    notes: 'Interested in intake workflows and patient-response visibility.',
    userAccess: { state: 'Provisioned', memberships: ['Portal access', 'Knowledge base'] },
    billing: { customerStatus: 'Lead', paymentProfile: 'Not set', balance: '$0.00' },
  },
  {
    id: 'crm1-contact-3',
    firstName: 'Miguel',
    lastName: 'Torres',
    displayName: 'Miguel Torres',
    email: 'miguel@alliedroofing.co',
    phone: '+1 (555) 488-2200',
    company: 'Allied Roofing Co.',
    title: 'Owner',
    owner: 'Jenna P.',
    status: 'Customer',
    validationStatus: 'Verified',
    leadScore: 88,
    pipelineStage: 'Closed Won',
    source: 'Referral',
    externalReferenceId: 'CRM1-ARC-551',
    sourceCode: 'partner_network',
    clickId: 'clk_arc_55122',
    subId1: 'Roofing',
    subId2: 'Multi-location',
    subId3: 'Owner',
    subId4: '',
    subId5: '',
    tags: ['Customer', 'Billing'],
    doNotEmail: false,
    doNotSms: false,
    optedIntoMarketing: false,
    optedIntoSms: true,
    createdAt: '2025-12-02T08:40:00Z',
    updatedAt: '2026-03-30T17:14:00Z',
    lastContactedAt: '2026-04-01T08:45:00Z',
    timeline: [{ id: 'c1', type: 'call', title: 'Renewal review', description: 'Discussed expansion into second service territory.', createdAt: '2026-04-01T08:45:00Z' }],
    forms: [],
    bookings: [{ id: 'b4', title: 'Q2 Planning', time: 'Apr 18, 1:00 PM', status: 'Confirmed' }],
    orders: [{ id: '#ARC-1182', total: '$7,900.00', status: 'Paid', fulfillment: 'Live' }],
    notes: 'Stable customer account. Prefers owner-only communication.',
    userAccess: { state: 'Provisioned', memberships: ['Portal access', 'Invoices'] },
    billing: { customerStatus: 'Active', paymentProfile: 'ACH', balance: '$0.00' },
  },
];

const snapshotStats = [
  { label: 'Active Contacts', value: '312', hint: 'visual snapshot only' },
  { label: 'Qualified', value: '87', hint: 'static reference' },
  { label: 'Bookings Pending', value: '16', hint: 'static reference' },
  { label: 'At-Risk Accounts', value: '9', hint: 'static reference' },
];

export default function CRM1Module() {
  const [selectedContactId, setSelectedContactId] = useState(snapshotContacts[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('All Contacts');
  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return snapshotContacts.find((contact) => contact.id === selectedContactId) || null;
  }, [selectedContactId]);
  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return snapshotContacts;
    return snapshotContacts.filter((contact) => [contact.displayName, contact.email, contact.phone, contact.company, contact.owner, contact.pipelineStage, ...(contact.tags || [])].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [searchTerm]);

  return (
    <div className="module-root-standard relative !bg-[#050505]">
      <div className="module-toolbar !bg-transparent !border-b-0 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <button type="button" className="btn-primary-skeuo !px-3 !py-1.5 !h-8 !text-[10px] !tracking-[0.14em] flex items-center gap-2 shrink-0"><Plus size={12} />Create</button>
          <div className="relative min-w-[240px] max-w-[340px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search legacy CRM snapshot..." className="h-8 w-full rounded border border-slate-800 bg-[#0a0a0a] pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 shadow-inner" />
          </div>
          <button type="button" onClick={() => setViewMode('All Contacts')} className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8">All Contacts</button>
          <button type="button" onClick={() => setViewMode('Needs Review')} className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8">Needs Review</button>
        </div>
        <div className="flex min-w-0 items-center gap-2 flex-shrink-0 h-full">
          <button type="button" className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8 flex items-center gap-2"><Filter size={12} />Filter</button>
          <button type="button" className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8 flex items-center gap-2"><Shield size={12} />Verify</button>
          <button type="button" className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8 flex items-center gap-2"><Tag size={12} />Tag</button>
          <button type="button" className="btn-secondary !bg-[#111] !border-slate-800 text-[10px] py-1.5 px-3 h-8 flex items-center gap-2"><Trash2 size={12} />Delete</button>
          <button type="button" className="p-1.5 rounded-lg text-slate-600 hover:text-cyan-400 transition-all" title="Brain"><BrainIcon size={14} /></button>
          <button type="button" className="p-1.5 rounded-lg text-slate-600 hover:text-blue-400 transition-all" title="Crosshair"><Crosshair size={14} /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
        <div className="mb-1.5 grid gap-1.5 md:grid-cols-4">
          {snapshotStats.map((item) => (
            <div key={item.label} className="rounded border border-slate-800/60 bg-[#0d0d0d] px-2.5 py-1.5 shadow-lg">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-60">{item.label}</div>
              <div className="mt-0.5 text-lg font-black text-slate-100 leading-none">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[520px_minmax(0,1fr)]">
          <CRM1List contacts={filteredContacts} selectedContactId={selectedContactId} onSelectContact={setSelectedContactId} viewMode={viewMode} />
          <CRM1Detail contact={selectedContact} />
        </div>
      </div>
    </div>
  );
}
