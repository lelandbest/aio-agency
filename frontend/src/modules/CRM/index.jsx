import React, { useState, useEffect, useMemo } from 'react';
import { mockSupabase } from '../../services/mockSupabase';
import { 
  Users, Plus, Mail, Phone, Search, ChevronDown, Tag, 
  Trash2, X, Download, MessageCircle, Calendar, Zap,
  AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft,
  Edit, Clipboard, FileInput, User, Building2
} from 'lucide-react';

const CRMModule = () => {
  // State Management
  const [activeTab, setActiveTab] = useState('Contacts');
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [sortField, setSortField] = useState('first_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalTab, setCreateModalTab] = useState('Contact');
  const [selectedContact, setSelectedContact] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  
  // CMS Tab states (must be at top level, not inside render function)
  const [cmsTables, setCmsTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  
  // Filter states
  const [filters, setFilters] = useState({
    department: { operator: 'is', value: '', active: false },
    owner: { operator: 'is', value: '', active: false },
    tags: { operator: 'has', value: '', active: false },
    system_tags: { operator: 'has', value: '', active: false },
    automation: { operator: 'is', value: '', active: false },
    input: { operator: 'is', value: '', active: false },
    created_date: { operator: 'is', value: '', active: false },
    updated_date: { operator: 'is', value: '', active: false },
    last_contacted: { operator: 'is', value: '', active: false },
    sms_email_activity: { operator: 'is', value: '', active: false },
    lead_score: { operator: 'is', value: '', active: false },
    address: { operator: 'is', value: '', active: false },
    extra_details: { operator: 'is', value: '', active: false },
    pipeline: { operator: 'is', value: '', active: false },
    pipeline_column: { operator: 'is', value: '', active: false },
    name: { operator: 'is', value: '', active: false }
  });

  // Filter Options
  const filterOperators = ['is', 'is not', 'is in', 'is not in', 'is defined', 'is not defined', 'has', 'has not'];
  
  const filterOptions = {
    department: ['Sales', 'Marketing', 'Support', 'Engineering', 'Operations', 'Product', 'Design', 'Analytics', 'Consulting', 'Creative', 'Administration'],
    owner: ['AIO Flow™', 'Adam B.', 'System', 'User 1', 'User 2', 'User 3'],
    tags: ['VIP', 'Hot Lead', 'Customer', 'Nurture', 'Partner', 'Prospect', 'Inactive', 'Trial', 'Enterprise', 'SMB'],
    system_tags: ['Automated', 'Manual', 'Imported', 'API Created', 'Form Submission'],
    automation: ['Active', 'Paused', 'Inactive', 'Completed'],
    input: ['Email', 'Phone', 'Form', 'API', 'Manual'],
    created_date: ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year', 'Custom'],
    updated_date: ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year', 'Custom'],
    last_contacted: ['Today', 'This week', 'This month', 'Last 30 days', 'Last 90 days'],
    sms_email_activity: ['Active', 'Inactive', 'High Engagement', 'Low Engagement'],
    lead_score: ['90-100', '70-89', '50-69', '30-49', 'Below 30'],
    address: ['US', 'International', 'CA', 'TX', 'NY', 'FL'],
    extra_details: ['Verified', 'Unverified', 'Complete', 'Incomplete'],
    pipeline: ['New', 'Qualified', 'Discovery', 'Closed Won', 'Closed Lost', 'Negotiating'],
    pipeline_column: ['Planning', 'Active', 'Completed', 'On Hold'],
    name: ['A-M', 'N-Z']
  };

  // Load data from database
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: contactsData } = await mockSupabase.from('crm_contacts').select();
      const { data: companiesData } = await mockSupabase.from('companies').select();
      const { data: tagsData } = await mockSupabase.from('tags').select();
      
      setContacts(contactsData || []);
      setCompanies(companiesData || []);
      setTags(tagsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  // Filter and sort contacts
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts.filter(contact => !contact.deleted_at);
    
    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(contact => 
        `${contact.first_name} ${contact.last_name}`.toLowerCase().includes(search) ||
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
          filtered = filtered.filter(c => {
            if (filter.operator === 'is') return c.department === filter.value;
            if (filter.operator === 'is not') return c.department !== filter.value;
            if (filter.operator === 'is defined') return !!c.department;
            if (filter.operator === 'is not defined') return !c.department;
            return true;
          });
          break;
        case 'owner':
          filtered = filtered.filter(c => {
            if (filter.operator === 'is') return c.owner === filter.value;
            if (filter.operator === 'is not') return c.owner !== filter.value;
            if (filter.operator === 'is defined') return !!c.owner;
            if (filter.operator === 'is not defined') return !c.owner;
            return true;
          });
          break;
        case 'tags':
          filtered = filtered.filter(c => {
            if (filter.operator === 'has') return c.tags?.includes(filter.value);
            if (filter.operator === 'has not') return !c.tags?.includes(filter.value);
            return true;
          });
          break;
        case 'lead_score':
          filtered = filtered.filter(c => {
            const score = c.lead_score || 0;
            if (filter.value === '90-100') return score >= 90 && score <= 100;
            if (filter.value === '70-89') return score >= 70 && score < 90;
            if (filter.value === '50-69') return score >= 50 && score < 70;
            if (filter.value === '30-49') return score >= 30 && score < 50;
            if (filter.value === 'Below 30') return score < 30;
            return true;
          });
          break;
        case 'pipeline':
          filtered = filtered.filter(c => {
            if (filter.operator === 'is') return c.pipeline_stage === filter.value;
            if (filter.operator === 'is not') return c.pipeline_stage !== filter.value;
            return true;
          });
          break;
      }
    });
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      if (sortField === 'name') {
        aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
        bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
      } else if (sortField === 'first_name') {
        aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
        bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
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

  // Bulk actions
  const handleBulkAction = async (action) => {
    if (selectedContacts.size === 0) {
      alert('Please select contacts first');
      return;
    }

    const selectedIds = Array.from(selectedContacts);

    switch (action) {
      case 'delete':
        if (confirm(`Delete ${selectedIds.length} contact(s)?`)) {
          for (const id of selectedIds) {
            await mockSupabase.from('crm_contacts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
          }
          await loadData();
          setSelectedContacts(new Set());
          alert('Contacts deleted successfully');
        }
        break;
      
      case 'add_tag':
        const tagToAdd = prompt('Enter tag name:');
        if (tagToAdd) {
          for (const id of selectedIds) {
            const contact = contacts.find(c => c.id === id);
            const updatedTags = [...(contact.tags || []), tagToAdd];
            await mockSupabase.from('crm_contacts').update({ tags: updatedTags }).eq('id', id);
          }
          await loadData();
          alert('Tag added to selected contacts');
        }
        break;
      
      case 'remove_tag':
        const tagToRemove = prompt('Enter tag name to remove:');
        if (tagToRemove) {
          for (const id of selectedIds) {
            const contact = contacts.find(c => c.id === id);
            const updatedTags = (contact.tags || []).filter(t => t !== tagToRemove);
            await mockSupabase.from('crm_contacts').update({ tags: updatedTags }).eq('id', id);
          }
          await loadData();
          alert('Tag removed from selected contacts');
        }
        break;
      
      case 'set_owner':
        const newOwner = prompt('Enter owner name:');
        if (newOwner) {
          for (const id of selectedIds) {
            await mockSupabase.from('crm_contacts').update({ owner: newOwner }).eq('id', id);
          }
          await loadData();
          alert('Owner updated for selected contacts');
        }
        break;
      
      case 'export':
        // Export selected contacts as CSV
        const csvData = filteredAndSortedContacts
          .filter(c => selectedIds.includes(c.id))
          .map(c => `${c.first_name},${c.last_name},${c.email},${c.phone},${c.company},${c.lead_score}`)
          .join('\n');
        const blob = new Blob([`First Name,Last Name,Email,Phone,Company,Score\n${csvData}`], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contacts.csv';
        a.click();
        break;
      
      default:
        alert(`${action} - Coming soon!`);
    }
  };

  // Create contact handler
  const handleCreateContact = async (formData) => {
    try {
      const newContact = {
        contact_id: `CNT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        organization_id: 'org-1',
        first_name: formData.firstName,
        last_name: formData.lastName,
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
        owner_id: 'user-1',
        owner: 'AIO Flow™',
        source: 'Manual Entry',
        status: 'contact',
        lead_score: 50,
        quality: 'warm',
        engagement: 'medium',
        tags: [],
        custom_fields: {},
        opt_in_email: true,
        opt_in_sms: true,
        opt_in_calls: true,
        opt_in_automations: true,
        last_contacted_at: null,
        pipeline_stage: 'New',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      };

      await mockSupabase.from('crm_contacts').insert([newContact]);
      await loadData();
      setShowCreateModal(false);
      alert('Contact created successfully!');
    } catch (error) {
      console.error('Error creating contact:', error);
      alert('Error creating contact');
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
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-500" />;
    return sortDirection === 'asc' ? 
      <ArrowUp size={14} className="text-purple-500" /> : 
      <ArrowDown size={14} className="text-purple-500" />;
  };

  // Render tabs based on activeTab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Contacts':
        return renderContactsTab();
      case 'Companies':
        return renderCompaniesTab();
      case 'Forms':
        return renderFormsTab();
      case 'CMS':
        return renderCMSTab();
      default:
        return renderContactsTab();
    }
  };

  // CONTACTS TAB
  const renderContactsTab = () => {
    if (selectedContact) {
      return renderContactDetailView();
    }

    return (
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Contact Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-[#27272A] bg-[#050505]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-500" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="px-4 py-3 bg-[#050505] border-b border-[#27272A] flex gap-2 flex-wrap">
            <button onClick={() => handleBulkAction('add_tag')} className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white">
              Add Tag
            </button>
            <button onClick={() => handleBulkAction('remove_tag')} className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white">
              Remove Tag
            </button>
            <button onClick={() => handleBulkAction('add_automation')} className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white">
              Add To Automation
            </button>
            <button onClick={() => handleBulkAction('remove_flow')} className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white">
              Remove From Flow
            </button>
            <button onClick={() => handleBulkAction('export')} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white">
              <Download size={12} className="inline mr-1" /> Export
            </button>
            <button onClick={() => handleBulkAction('set_owner')} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white">
              Set Owner
            </button>
            <button onClick={() => handleBulkAction('delete')} className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white">
              <Trash2 size={12} className="inline mr-1" /> Delete
            </button>
            <button onClick={() => handleBulkAction('send_email')} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white">
              <Mail size={12} className="inline mr-1" /> Send Email
            </button>
            <button onClick={() => handleBulkAction('send_sms')} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white">
              <MessageCircle size={12} className="inline mr-1" /> Send SMS
            </button>
            <button onClick={() => handleBulkAction('send_api')} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white">
              Send API
            </button>
            <button onClick={() => handleBulkAction('assign_ai')} className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white">
              Assign to AI Employee
            </button>
            <button onClick={() => handleBulkAction('set_department')} className="px-3 py-1.5 rounded text-xs font-medium bg-yellow-600 hover:bg-yellow-700 text-black">
              Set Department
            </button>
          </div>

          {/* Selection Info */}
          <div className="px-4 py-2 bg-[#18181B] text-sm text-gray-400">
            {selectedContacts.size} of {filteredAndSortedContacts.length} contacts selected
          </div>

          {/* Contact Table */}
          <div className="flex-1 overflow-auto bg-[#18181B]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">Loading contacts...</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0A0A0A] border-b border-[#27272A]">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">
                      <input 
                        type="checkbox" 
                        checked={selectedContacts.size === filteredAndSortedContacts.length && filteredAndSortedContacts.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4" 
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase cursor-pointer hover:text-white" onClick={() => handleSort('first_name')}>
                      <div className="flex items-center gap-2">
                        NAME {renderSortIcon('first_name')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase cursor-pointer hover:text-white" onClick={() => handleSort('company')}>
                      <div className="flex items-center gap-2">
                        COMPANY {renderSortIcon('company')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase cursor-pointer hover:text-white" onClick={() => handleSort('lead_score')}>
                      <div className="flex items-center gap-2">
                        SCORE {renderSortIcon('lead_score')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">
                      TAGS
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase cursor-pointer hover:text-white" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-2">
                        CREATED AT {renderSortIcon('created_at')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase cursor-pointer hover:text-white" onClick={() => handleSort('updated_at')}>
                      <div className="flex items-center gap-2">
                        UPDATED AT {renderSortIcon('updated_at')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedContacts.map(contact => (
                    <tr 
                      key={contact.id} 
                      className="border-b border-[#27272A] hover:bg-[#27272A]/20 transition cursor-pointer"
                    >
                      <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleSelectContact(contact.id); }}>
                        <input 
                          type="checkbox" 
                          checked={selectedContacts.has(contact.id)}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-purple-400 font-medium hover:text-purple-300" onClick={() => setSelectedContact(contact)}>
                        {contact.first_name} {contact.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{contact.company || '--'}</td>
                      <td className="px-4 py-3 text-gray-400">{contact.lead_score || '--'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {contact.tags?.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(contact.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(contact.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT: Filters */}
        {showFilters && (
          <div className="w-80 border-l border-[#27272A] bg-[#18181B] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#27272A] flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {Object.entries(filterOptions).map(([filterKey, options]) => (
                <div key={filterKey} className="border-b border-[#27272A] pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-300 uppercase">
                      {filterKey.replace('_', ' ')}
                    </label>
                    {filters[filterKey].active && (
                      <button onClick={() => clearFilter(filterKey)} className="text-xs text-red-400 hover:text-red-300">
                        Clear
                      </button>
                    )}
                  </div>
                  
                  {/* Operator Selector */}
                  <select
                    value={filters[filterKey].operator}
                    onChange={(e) => updateFilter(filterKey, 'operator', e.target.value)}
                    className="w-full mb-2 px-3 py-2 bg-[#0A0A0A] border border-[#27272A] rounded text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    {filterOperators.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  
                  {/* Value Selector */}
                  {!['is defined', 'is not defined'].includes(filters[filterKey].operator) && (
                    <select
                      value={filters[filterKey].value}
                      onChange={(e) => updateFilter(filterKey, 'value', e.target.value)}
                      className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#27272A] rounded text-sm text-white focus:outline-none focus:border-purple-500"
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
        )}
      </div>
    );
  };

  // CONTACT DETAIL VIEW (Placeholder for Phase 4)
  const renderContactDetailView = () => {
    const [activities, setActivities] = useState([]);
    const [activityTab, setActivityTab] = useState('Activity');
    const [formsSubmitted, setFormsSubmitted] = useState([]);

    useEffect(() => {
      loadActivitiesAndForms();
    }, [selectedContact.id]);

    const loadActivitiesAndForms = async () => {
      // Load activities
      const { data: activitiesData } = await mockSupabase
        .from('contact_activities')
        .select()
        .eq('contact_id', selectedContact.id)
        .order('created_at', { ascending: false });
      
      setActivities(activitiesData || []);

      // Load form submissions
      const { data: submissionsData } = await mockSupabase
        .from('form_submissions')
        .select()
        .eq('contact_id', selectedContact.id);
      
      setFormsSubmitted(submissionsData || []);
    };

    const getActivityIcon = (type) => {
      switch(type) {
        case 'form': return '📋';
        case 'email': return '📧';
        case 'call': return '📞';
        case 'sms': return '💬';
        case 'note': return '✅';
        case 'meeting': return '🤝';
        case 'automation': return '🤖';
        default: return '📌';
      }
    };

    const filteredActivities = activityTab === 'Activity' 
      ? activities 
      : activities.filter(a => {
          if (activityTab === 'Forms') return a.activity_type === 'form';
          if (activityTab === 'Notes') return a.activity_type === 'note';
          return false;
        });

    return (
      <div className="flex-1 flex flex-col bg-[#0F0F11] p-6 overflow-hidden">
        <button 
          onClick={() => setSelectedContact(null)}
          className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ChevronLeft size={16} /> Back to Contacts
        </button>
        
        {/* 3-COLUMN LAYOUT */}
        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
          {/* LEFT: Contact Info (3 cols) */}
          <div className="col-span-3 bg-[#18181B] border border-[#27272A] rounded-lg p-4 overflow-auto">
            <div className="mb-4 pb-4 border-b border-[#27272A]">
              <h2 className="text-xl font-bold text-white mb-1">
                {selectedContact.first_name} {selectedContact.last_name}
              </h2>
              <p className="text-sm text-gray-400">{selectedContact.title || 'Contact'}</p>
            </div>
            
            <div className="space-y-4 text-sm">
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Email</label>
                <p className="text-white">{selectedContact.email}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Phone</label>
                <p className="text-white">{selectedContact.phone || '--'}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Company</label>
                <p className="text-white">{selectedContact.company || '--'}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Lead Score</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[#27272A] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 rounded-full" 
                      style={{ width: `${selectedContact.lead_score}%` }}
                    />
                  </div>
                  <span className="text-white font-bold">{selectedContact.lead_score}</span>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Pipeline</label>
                <p className="text-white">{selectedContact.pipeline_stage || '--'}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Owner</label>
                <p className="text-white">{selectedContact.owner || '--'}</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Tags</label>
                <div className="flex flex-wrap gap-1">
                  {selectedContact.tags?.map((tag, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded text-xs">
                      {tag}
                    </span>
                  )) || <span className="text-gray-500">No tags</span>}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase font-bold block mb-1">Opt-ins</label>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedContact.opt_in_email} readOnly className="w-3 h-3" />
                    <span className="text-gray-300">Email</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedContact.opt_in_sms} readOnly className="w-3 h-3" />
                    <span className="text-gray-300">SMS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedContact.opt_in_calls} readOnly className="w-3 h-3" />
                    <span className="text-gray-300">Calls</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER: Activity Timeline (6 cols) */}
          <div className="col-span-6 bg-[#18181B] border border-[#27272A] rounded-lg flex flex-col overflow-hidden">
            {/* Activity Tabs */}
            <div className="flex gap-2 p-3 border-b border-[#27272A] overflow-x-auto">
              {['Activity', 'Notes', 'Forms'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActivityTab(tab)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                    activityTab === tab 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-[#27272A] text-gray-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No activities yet</p>
                </div>
              ) : (
                filteredActivities.map(activity => (
                  <div key={activity.id} className="flex gap-3 p-3 bg-[#27272A]/30 rounded-lg hover:bg-[#27272A]/50 transition">
                    <div className="text-2xl">{getActivityIcon(activity.activity_type)}</div>
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-sm">{activity.title}</h4>
                      <p className="text-gray-400 text-xs mt-1">{activity.description}</p>
                      {activity.metadata && (
                        <div className="mt-2 text-xs text-gray-500">
                          {Object.entries(activity.metadata).slice(0, 3).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value).slice(0, 30) : value}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-gray-500 text-xs mt-2">
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: Related Items (3 cols) */}
          <div className="col-span-3 bg-[#18181B] border border-[#27272A] rounded-lg p-4 overflow-auto space-y-4">
            {/* Forms Submitted */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Forms Submitted ({formsSubmitted.length})</h3>
              <div className="space-y-2">
                {formsSubmitted.length === 0 ? (
                  <p className="text-xs text-gray-500">No form submissions</p>
                ) : (
                  formsSubmitted.map(submission => (
                    <div key={submission.id} className="p-2 bg-[#27272A]/30 rounded text-xs">
                      <p className="text-white font-medium">✓ Form Submission</p>
                      <p className="text-gray-400 text-[10px] mt-1">
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Automations */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Automations</h3>
              <p className="text-xs text-gray-500">No active automations</p>
            </div>

            {/* Pipelines */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Pipelines</h3>
              <div className="p-2 bg-purple-900/20 rounded text-xs">
                <p className="text-purple-400 font-medium">{selectedContact.pipeline_stage || 'New'}</p>
              </div>
            </div>

            {/* Booking */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Booking</h3>
              <p className="text-xs text-gray-500">No bookings</p>
            </div>

            {/* Orders */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Orders</h3>
              <p className="text-xs text-gray-500">No orders</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // COMPANIES TAB
  const renderCompaniesTab = () => {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[#27272A] bg-[#050505]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder="Search companies..."
              className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#18181B]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0A0A0A] border-b border-[#27272A]">
              <tr>
                <th className="px-4 py-3 text-left w-12">
                  <input type="checkbox" className="w-4 h-4" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">INDUSTRY</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">SCORE</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">TAGS</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">CREATED AT</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">UPDATED AT</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <tr key={company.id} className="border-b border-[#27272A] hover:bg-[#27272A]/20 transition">
                  <td className="px-4 py-3">
                    <input type="checkbox" className="w-4 h-4" />
                  </td>
                  <td className="px-4 py-3 text-purple-400 font-medium">{company.name}</td>
                  <td className="px-4 py-3 text-gray-400">{company.industry || '--'}</td>
                  <td className="px-4 py-3 text-gray-400">{company.lead_score || '--'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {company.tags?.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(company.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(company.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // FORMS TAB
  const renderFormsTab = () => {
    const forms = [
      { id: 1, title: 'Contact Form', responses: 45, last_active: '2 hours ago', status: 'Active' },
      { id: 2, title: 'Demo Request', responses: 67, last_active: '1 day ago', status: 'Active' },
      { id: 3, title: 'Newsletter Signup', responses: 234, last_active: '3 hours ago', status: 'Active' }
    ];

    return (
      <div className="flex-1 p-6 overflow-auto bg-[#0F0F11]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map(form => (
            <div key={form.id} className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 hover:border-purple-500 transition">
              <h3 className="text-white font-bold mb-2">{form.title}</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>Responses: {form.responses}</p>
                <p>Last Active: {form.last_active}</p>
                <p className="text-green-400">Status: {form.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // CMS TAB
  const renderCMSTab = () => {
    // Load CMS tables on mount
    useEffect(() => {
      const loadCMSTables = async () => {
        const { data } = await mockSupabase.from('cms_tables').select();
        setCmsTables(data || []);
      };
      if (activeTab === 'CMS') {
        loadCMSTables();
      }
    }, [activeTab]);

    const loadTableData = async (table) => {
      setSelectedTable(table);
      const { data } = await mockSupabase.from(`cms_${table.slug}`).select();
      setTableData(data || []);
    };

    if (selectedTable) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#27272A] bg-[#050505] flex items-center gap-4">
            <button onClick={() => setSelectedTable(null)} className="text-gray-400 hover:text-white">
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-white font-bold">{selectedTable.name}</h2>
            <span className="text-gray-400 text-sm">({tableData.length} records)</span>
          </div>
          
          <div className="flex-1 overflow-auto bg-[#18181B] p-4">
            <div className="bg-[#0A0A0A] border border-[#27272A] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#18181B] border-b border-[#27272A]">
                  <tr>
                    {tableData[0] && Object.keys(tableData[0]).map(key => (
                      <th key={key} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">
                        {key.replace('_', ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, idx) => (
                    <tr key={idx} className="border-b border-[#27272A] hover:bg-[#18181B]">
                      {Object.values(row).map((val, i) => (
                        <td key={i} className="px-4 py-3 text-gray-300">
                          {typeof val === 'object' ? JSON.stringify(val) : val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 p-6 overflow-auto bg-[#0F0F11]">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">CMS Tables</h2>
          <p className="text-gray-400 text-sm">{cmsTables.length} tables</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cmsTables.map(table => (
            <div 
              key={table.id} 
              onClick={() => loadTableData(table)}
              className="bg-[#18181B] border border-[#27272A] rounded-lg p-6 hover:border-purple-500 transition cursor-pointer"
            >
              <h3 className="text-white font-bold text-lg mb-2">{table.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{table.description}</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-purple-400">{table.record_count} records</span>
                <span className="text-gray-500">Open →</span>
              </div>
            </div>
          ))}
        </div>
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
    
    const [userFormData, setUserFormData] = useState({
      site: 'Current Site',
      username: '',
      firstName: '',
      lastName: '',
      email: '',
      dob: '',
      password: '',
      confirmPassword: '',
      system: 'Create New System',
      billing: 'complimentary',
      package: '',
      street: '',
      apartment: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      phone: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      if (createModalTab === 'Contact') {
        handleCreateContact(formData);
      } else {
        handleCreateUser(userFormData);
      }
    };
    
    const handleCreateUser = async (data) => {
      // Placeholder for user creation
      alert('Create User functionality - Coming soon!\nThis will create a multi-tenant user account with system access.');
      setShowCreateModal(false);
    };

    return (
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
            <button onClick={() => setShowCreateModal(false)} className="px-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {createModalTab === 'Contact' ? (
              // CONTACT FORM
              <>
                <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">First Name *</label>
                <input 
                  type="text" 
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Last Name *</label>
                <input 
                  type="text" 
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Email *</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Phone</label>
                <input 
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Company</label>
                <input 
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({...formData, company: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Title</label>
                <input 
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select...</option>
                  {filterOptions.department.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Street Address</label>
              <input 
                type="text"
                value={formData.street}
                onChange={(e) => setFormData({...formData, street: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">City</label>
                <input 
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">State</label>
                <input 
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({...formData, state: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">ZIP</label>
                <input 
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({...formData, zip: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Date of Birth</label>
              <input 
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({...formData, dob: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
              />
            </div>
            </>
          ) : (
            // CREATE USER FORM (Multi-tenant)
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Which Site Will This User Login On?</label>
                <select
                  value={userFormData.site}
                  onChange={(e) => setUserFormData({...userFormData, site: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500"
                >
                  <option>Current Site</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Username *</label>
                <input 
                  type="text"
                  required
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({...userFormData, username: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">First Name *</label>
                  <input 
                    type="text"
                    required
                    value={userFormData.firstName}
                    onChange={(e) => setUserFormData({...userFormData, firstName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Last Name *</label>
                  <input 
                    type="text"
                    required
                    value={userFormData.lastName}
                    onChange={(e) => setUserFormData({...userFormData, lastName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Email *</label>
                  <input 
                    type="email"
                    required
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">DOB</label>
                  <input 
                    type="date"
                    value={userFormData.dob}
                    onChange={(e) => setUserFormData({...userFormData, dob: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Password *</label>
                <input 
                  type="password"
                  required
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({...userFormData, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Confirm Password *</label>
                <input 
                  type="password"
                  required
                  value={userFormData.confirmPassword}
                  onChange={(e) => setUserFormData({...userFormData, confirmPassword: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900">
                <p className="font-bold mb-1">ℹ️ What is a New System? [Systems]</p>
                <p>(also known as [Sub-Accounts]) are isolated Systems that don't share any data. If you want to create an account for a Client or Customer and you don't want them to see any of your contacts or other data you would select "Create New System".</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Which System Can This User Access?</label>
                <select
                  value={userFormData.system}
                  onChange={(e) => setUserFormData({...userFormData, system: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500"
                >
                  <option>Create New System</option>
                  <option>Current System</option>
                </select>
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
                  <label htmlFor="complimentary" className="text-sm font-medium">Complimentary</label>
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
                  <label htmlFor="setup" className="text-sm font-medium">Setup Billing For New User</label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Package</label>
                <select
                  value={userFormData.package}
                  onChange={(e) => setUserFormData({...userFormData, package: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select Package</option>
                  <option>Starter</option>
                  <option>Professional</option>
                  <option>Enterprise</option>
                </select>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-900">
                <p>⚠️ User will not be billed for this package as no credit card has been added to this user. If you wish to bill this user for this package please select the option "Setup Billing For New User" above</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Address</label>
                <input 
                  type="text"
                  value={userFormData.street}
                  onChange={(e) => setUserFormData({...userFormData, street: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Apartment, suite, etc. (optional)</label>
                <input 
                  type="text"
                  value={userFormData.apartment}
                  onChange={(e) => setUserFormData({...userFormData, apartment: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">City</label>
                <input 
                  type="text"
                  value={userFormData.city}
                  onChange={(e) => setUserFormData({...userFormData, city: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">Country/Region</label>
                  <select
                    value={userFormData.country}
                    onChange={(e) => setUserFormData({...userFormData, country: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option>United States</option>
                    <option>Canada</option>
                    <option>Mexico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">State</label>
                  <input 
                    type="text"
                    value={userFormData.state}
                    onChange={(e) => setUserFormData({...userFormData, state: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">ZIP code</label>
                  <input 
                    type="text"
                    value={userFormData.zip}
                    onChange={(e) => setUserFormData({...userFormData, zip: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Phone</label>
                <div className="flex gap-2">
                  <select className="px-3 py-2 border border-gray-300 rounded text-sm">
                    <option>🇺🇸 +1</option>
                  </select>
                  <input 
                    type="tel"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({...userFormData, phone: e.target.value})}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-purple-500" 
                  />
                </div>
              </div>
            </>
          )}
          </form>

          <div className="border-t p-6 flex justify-end gap-3 bg-gray-50">
            <button 
              type="button"
              onClick={() => setShowCreateModal(false)} 
              className="px-6 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium"
            >
              {createModalTab === 'Contact' ? 'Create Contact' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // MAIN RENDER
  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
      {/* Tab Navigation (removed Setup) */}
      <div className="p-4 border-b border-[#27272A] bg-[#050505]">
        <div className="flex gap-6 text-sm font-medium">
          {['Contacts', 'Companies', 'Forms', 'CMS'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`pb-2 border-b-2 transition ${
                tab === activeTab 
                  ? 'text-white border-purple-500' 
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
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
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Create Contact
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Create Contact Modal */}
      {showCreateModal && <CreateContactModal />}
    </div>
  );
};

export default CRMModule;
