import React, { useState, useEffect } from 'react';
import { mockSupabase } from '../../services/mockSupabase';
import { Users, Plus, Mail, Phone, Globe, Trash2, Search } from 'lucide-react';

const CRMModule = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    const { data } = await mockSupabase.from('contacts').select();
    if (data) setContacts(data);
    setLoading(false);
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden relative">
      <div className="p-6 border-b border-[#27272A] bg-[#050505] flex justify-between items-center">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Users size={20} className="text-purple-500" />
          CRM - Contacts
        </h1>
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> New Contact
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Search Bar */}
        <div className="p-6 border-b border-[#27272A] bg-[#050505] sticky top-0 z-10">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-600" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Contacts Table */}
        <div className="p-6">
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#27272A] bg-[#0A0A0A]">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase">Company</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="border-b border-[#27272A] hover:bg-[#27272A]/20 transition cursor-pointer" onClick={() => setSelectedContact(contact)}>
                    <td className="px-6 py-4 text-white font-medium">{contact.name}</td>
                    <td className="px-6 py-4 text-gray-400 flex items-center gap-2">
                      <Mail size={14} />
                      {contact.email}
                    </td>
                    <td className="px-6 py-4 text-gray-400">{contact.company || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded text-xs font-bold bg-purple-900/20 text-purple-400">
                        {contact.pipeline_stage || 'New'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-gray-500 hover:text-red-500 transition">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredContacts.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                <p>No contacts found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Contact Info Sidebar */}
      {selectedContact && (
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-[#18181B] border-l border-[#27272A] shadow-lg flex flex-col overflow-hidden z-50">
          <div className="p-6 border-b border-[#27272A] flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Contact Details</h2>
            <button onClick={() => setSelectedContact(null)} className="text-gray-500 hover:text-white">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Name</h3>
              <p className="text-white font-medium">{selectedContact.name}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Email</h3>
              <p className="text-gray-400 flex items-center gap-2">
                <Mail size={14} />
                {selectedContact.email}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Phone</h3>
              <p className="text-gray-400 flex items-center gap-2">
                <Phone size={14} />
                {selectedContact.phone || '-'}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Company</h3>
              <p className="text-gray-400">{selectedContact.company || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Title</h3>
              <p className="text-gray-400">{selectedContact.title || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h3>
              <p className="text-gray-400">{selectedContact.lead_score || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Pipeline Stage</h3>
              <p className="text-gray-400">{selectedContact.pipeline_stage || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Source</h3>
              <p className="text-gray-400">{selectedContact.source || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Owner</h3>
              <p className="text-gray-400">{selectedContact.owner || '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Last Contacted</h3>
              <p className="text-gray-400">{selectedContact.last_contacted_at ? new Date(selectedContact.last_contacted_at).toLocaleDateString() : '-'}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {selectedContact.tags?.map((tag, idx) => (
                  <span key={idx} className="px-2 py-1 rounded text-xs bg-purple-900/20 text-purple-400">
                    {tag}
                  </span>
                )) || <p className="text-gray-500">-</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMModule;
