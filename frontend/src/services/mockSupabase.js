/**
 * Mock Supabase Service
 * Provides Supabase-compatible API using mock data
 * Ready to swap to real Supabase with minimal changes
 * 
 * To migrate to real Supabase:
 * 1. Import real supabase client from lib/supabase.js
 * 2. Replace this implementation with actual client
 * All calling code will remain unchanged due to identical API signatures
 */

import { initialDb } from '../data/initialDb';
import { ulid, generateContactId, generateCompanyId, generateSubmissionId, generateActivityId, generateCmsId, generateFormId } from '../lib/ulid';

class MockSupabaseClient {
  constructor() {
    // Deep copy the initial database
    this.db = JSON.parse(JSON.stringify(initialDb));
    this.authSession = null;
    this.authCallbacks = [];
    
    // Add calendar tables if they don't exist
    if (!this.db.calendars) {
      this.db.calendars = [
        { id: '1', user_id: '1', name: 'Personal', color: '#3b82f6', is_default: true, is_visible: true },
        { id: '2', user_id: '1', name: 'Work', color: '#10b981', is_default: false, is_visible: true },
        { id: '3', user_id: '1', name: 'AIO Booking', color: '#a855f7', is_default: false, is_visible: true }
      ];
    }
    if (!this.db.events) {
      this.db.events = [
        {
          id: '1',
          calendar_id: '1',
          title: 'Team Meeting',
          description: 'Weekly sync',
          start_time: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
          end_time: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(),
          all_day: false,
          status: 'scheduled',
          location_type: 'zoom',
          location: 'Zoom Meeting',
          meeting_url: 'https://zoom.us/j/123456789?pwd=abc123',
          meeting_id: '123456789',
          meeting_password: 'abc123'
        }
      ];
    }
    if (!this.db.booking_types) {
      this.db.booking_types = [
        {
          id: '1',
          user_id: '1',
          name: '30 Minute Meeting',
          slug: '30-min-meeting',
          description: 'Quick 30 minute consultation',
          duration_minutes: 30,
          color: '#3b82f6',
          is_active: true,
          location: 'Google Meet',
          buffer_before_minutes: 0,
          buffer_after_minutes: 0
        },
        {
          id: '2',
          user_id: '1',
          name: '1 Hour Consultation',
          slug: '1-hour-consultation',
          description: 'In-depth 1 hour consultation session',
          duration_minutes: 60,
          color: '#10b981',
          is_active: true,
          location: 'Zoom',
          buffer_before_minutes: 5,
          buffer_after_minutes: 5
        }
      ];
    }
    if (!this.db.availability_rules) {
      this.db.availability_rules = [
        // Monday - Friday, 9 AM - 5 PM
        { id: '1', user_id: '1', day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '2', user_id: '1', day_of_week: 2, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '3', user_id: '1', day_of_week: 3, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '4', user_id: '1', day_of_week: 4, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '5', user_id: '1', day_of_week: 5, start_time: '09:00', end_time: '17:00', is_available: true }
      ];
    }
    
    // Add CRM tables
    this.initializeCRMTables();
  }

  // ============ CRM TABLES INITIALIZATION ============
  initializeCRMTables() {
    // Helper to generate UUID
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    // TAGS TABLE
    if (!this.db.tags) {
      this.db.tags = [
        { id: generateUUID(), name: 'VIP', color: '#8b5cf6', type: 'contact', usage_count: 5, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Hot Lead', color: '#ef4444', type: 'contact', usage_count: 8, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Customer', color: '#10b981', type: 'contact', usage_count: 12, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Nurture', color: '#f59e0b', type: 'contact', usage_count: 6, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Partner', color: '#3b82f6', type: 'contact', usage_count: 3, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Enterprise', color: '#6366f1', type: 'company', usage_count: 4, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'SMB', color: '#06b6d4', type: 'company', usage_count: 7, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Prospect', color: '#ec4899', type: 'contact', usage_count: 15, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Inactive', color: '#6b7280', type: 'contact', usage_count: 4, created_at: new Date().toISOString() },
        { id: generateUUID(), name: 'Trial', color: '#14b8a6', type: 'contact', usage_count: 9, created_at: new Date().toISOString() }
      ];
    }

    // COMPANIES TABLE
    if (!this.db.companies) {
      this.db.companies = [
        {
          id: generateUUID(),
          contact_id: generateCompanyId(),
          name: 'TechCorp Solutions',
          domain: 'techcorp.com',
          industry: 'Technology',
          size: '51-200',
          phone: '+1 (555) 100-0001',
          website: 'https://techcorp.com',
          address: { street: '100 Tech Plaza', city: 'San Francisco', state: 'CA', zip: '94102', country: 'USA' },
          owner_id: 'user-1',
          tags: ['Enterprise', 'Customer'],
          lead_score: 92,
          created_at: '2025-01-15T08:00:00Z',
          updated_at: '2026-01-10T15:00:00Z'
        },
        {
          id: generateUUID(),
          contact_id: generateCompanyId(),
          name: 'GrowthMark Agency',
          domain: 'growthmark.io',
          industry: 'Marketing',
          size: '11-50',
          phone: '+1 (555) 200-0002',
          website: 'https://growthmark.io',
          address: { street: '45 Market Street', city: 'Austin', state: 'TX', zip: '78701', country: 'USA' },
          owner_id: 'user-2',
          tags: ['SMB', 'Hot Lead'],
          lead_score: 78,
          created_at: '2025-06-20T10:30:00Z',
          updated_at: '2026-01-08T12:00:00Z'
        },
        {
          id: generateUUID(),
          contact_id: generateCompanyId(),
          name: 'FinServe Inc',
          domain: 'finserve.com',
          industry: 'Finance',
          size: '201-500',
          phone: '+1 (555) 300-0003',
          website: 'https://finserve.com',
          address: { street: '789 Wall Street', city: 'New York', state: 'NY', zip: '10005', country: 'USA' },
          owner_id: 'user-1',
          tags: ['Enterprise', 'VIP'],
          lead_score: 95,
          created_at: '2024-11-10T09:00:00Z',
          updated_at: '2026-01-12T14:30:00Z'
        },
        {
          id: generateUUID(),
          contact_id: generateCompanyId(),
          name: 'HealthPlus Clinic',
          domain: 'healthplus.care',
          industry: 'Healthcare',
          size: '11-50',
          phone: '+1 (555) 400-0004',
          website: 'https://healthplus.care',
          address: { street: '250 Medical Drive', city: 'Boston', state: 'MA', zip: '02101', country: 'USA' },
          owner_id: 'user-3',
          tags: ['SMB', 'Customer'],
          lead_score: 84,
          created_at: '2025-08-05T11:00:00Z',
          updated_at: '2026-01-09T10:00:00Z'
        },
        {
          id: generateUUID(),
          contact_id: generateCompanyId(),
          name: 'EduLearn Platform',
          domain: 'edulearn.com',
          industry: 'Education',
          size: '51-200',
          phone: '+1 (555) 500-0005',
          website: 'https://edulearn.com',
          address: { street: '88 Campus Road', city: 'Seattle', state: 'WA', zip: '98101', country: 'USA' },
          owner_id: 'user-2',
          tags: ['Enterprise', 'Trial'],
          lead_score: 71,
          created_at: '2025-12-01T13:00:00Z',
          updated_at: '2026-01-11T16:00:00Z'
        }
      ];
    }

    // CONTACTS TABLE (UUID-based with contact_id)
    if (!this.db.crm_contacts) {
      this.db.crm_contacts = [
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Jenna',
          last_name: 'Best',
          email: 'jennalarinbest@gmail.com',
          phone: '+1 (555) 123-4567',
          company: 'TechCorp Solutions',
          company_id: this.db.companies?.[0]?.id || null,
          title: 'Marketing Director',
          department: 'Marketing',
          website: 'https://linkedin.com/in/jennabest',
          address: { street: '123 Main St', city: 'San Francisco', state: 'CA', zip: '94102', country: 'USA' },
          dob: '1988-05-15',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'Website Form',
          status: 'customer',
          lead_score: 92,
          quality: 'hot',
          engagement: 'high',
          tags: ['VIP', 'Customer'],
          custom_fields: { industry_focus: 'B2B SaaS', preferred_contact_time: 'Mornings' },
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-10T15:08:00Z',
          pipeline_stage: 'Closed Won',
          created_at: '2026-01-10T15:08:00Z',
          updated_at: '2026-01-10T15:08:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Daniel',
          last_name: 'Salinas',
          email: 'hvac.danielsalinas@gmail.com',
          phone: '+1 (555) 987-6543',
          company: 'GrowthMark Agency',
          company_id: this.db.companies?.[1]?.id || null,
          title: 'Business Development Manager',
          department: 'Sales',
          website: '',
          address: { street: '456 Oak Avenue', city: 'Austin', state: 'TX', zip: '78701', country: 'USA' },
          dob: '1992-08-22',
          owner_id: 'user-2',
          owner: 'Adam B.',
          source: 'LinkedIn',
          status: 'lead',
          lead_score: 68,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Hot Lead', 'Nurture'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2025-07-01T08:03:00Z',
          pipeline_stage: 'Discovery',
          created_at: '2025-07-01T08:03:00Z',
          updated_at: '2025-06-26T08:28:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Jordan',
          last_name: 'Gilbert',
          email: 'jordan@webdesignnovainc.com',
          phone: '+1 (555) 456-7890',
          company: 'WebDesign Nova Inc',
          company_id: null,
          title: 'Creative Director',
          department: 'Design',
          website: 'https://webdesignnova.com',
          address: { street: '789 Design Lane', city: 'Portland', state: 'OR', zip: '97201', country: 'USA' },
          dob: '1990-03-10',
          owner_id: 'user-3',
          owner: 'System',
          source: 'Referral',
          status: 'contact',
          lead_score: 55,
          quality: 'cold',
          engagement: 'low',
          tags: ['Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: false,
          opt_in_automations: true,
          last_contacted_at: '2025-06-26T08:28:00Z',
          pipeline_stage: 'New',
          created_at: '2025-06-26T08:28:00Z',
          updated_at: '2025-06-26T08:28:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Sarah',
          last_name: 'Chen',
          email: 'sarah.chen@finserve.com',
          phone: '+1 (555) 111-2222',
          company: 'FinServe Inc',
          company_id: this.db.companies?.[2]?.id || null,
          title: 'VP of Operations',
          department: 'Operations',
          website: '',
          address: { street: '321 Broadway', city: 'New York', state: 'NY', zip: '10005', country: 'USA' },
          dob: '1985-11-30',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'Conference',
          status: 'customer',
          lead_score: 95,
          quality: 'hot',
          engagement: 'high',
          tags: ['VIP', 'Enterprise', 'Customer'],
          custom_fields: { deal_size: '$500K+', decision_maker: 'Yes' },
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-12T10:00:00Z',
          pipeline_stage: 'Closed Won',
          created_at: '2024-11-15T09:00:00Z',
          updated_at: '2026-01-12T14:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Michael',
          last_name: 'Rodriguez',
          email: 'mrodriguez@healthplus.care',
          phone: '+1 (555) 222-3333',
          company: 'HealthPlus Clinic',
          company_id: this.db.companies?.[3]?.id || null,
          title: 'Healthcare Administrator',
          department: 'Administration',
          website: '',
          address: { street: '555 Medical Plaza', city: 'Boston', state: 'MA', zip: '02101', country: 'USA' },
          dob: '1987-07-18',
          owner_id: 'user-3',
          owner: 'System',
          source: 'Cold Call',
          status: 'lead',
          lead_score: 72,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Nurture', 'Trial'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: false,
          last_contacted_at: '2026-01-05T14:30:00Z',
          pipeline_stage: 'Qualified',
          created_at: '2025-08-10T11:00:00Z',
          updated_at: '2026-01-09T09:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Emily',
          last_name: 'Watson',
          email: 'emily.watson@edulearn.com',
          phone: '+1 (555) 333-4444',
          company: 'EduLearn Platform',
          company_id: this.db.companies?.[4]?.id || null,
          title: 'Product Manager',
          department: 'Product',
          website: 'https://linkedin.com/in/emilywatson',
          address: { street: '777 Innovation Blvd', city: 'Seattle', state: 'WA', zip: '98101', country: 'USA' },
          dob: '1991-02-25',
          owner_id: 'user-2',
          owner: 'Adam B.',
          source: 'Website Form',
          status: 'lead',
          lead_score: 64,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Trial', 'Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-08T16:00:00Z',
          pipeline_stage: 'Discovery',
          created_at: '2025-12-05T13:00:00Z',
          updated_at: '2026-01-11T15:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'David',
          last_name: 'Thompson',
          email: 'david.t@retailpros.com',
          phone: '+1 (555) 444-5555',
          company: 'RetailPros Group',
          company_id: null,
          title: 'Regional Manager',
          department: 'Operations',
          website: '',
          address: { street: '200 Commerce St', city: 'Chicago', state: 'IL', zip: '60601', country: 'USA' },
          dob: '1984-09-12',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'Email Campaign',
          status: 'contact',
          lead_score: 48,
          quality: 'cold',
          engagement: 'low',
          tags: ['Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: false,
          opt_in_automations: true,
          last_contacted_at: '2025-11-20T10:00:00Z',
          pipeline_stage: 'New',
          created_at: '2025-11-15T12:00:00Z',
          updated_at: '2025-12-01T08:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Lisa',
          last_name: 'Martinez',
          email: 'lmartinez@constructco.com',
          phone: '+1 (555) 555-6666',
          company: 'ConstructCo Builders',
          company_id: null,
          title: 'Project Coordinator',
          department: 'Operations',
          website: '',
          address: { street: '888 Builder Ave', city: 'Denver', state: 'CO', zip: '80201', country: 'USA' },
          dob: '1989-04-08',
          owner_id: 'user-2',
          owner: 'Adam B.',
          source: 'Trade Show',
          status: 'lead',
          lead_score: 58,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Nurture'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-07T11:30:00Z',
          pipeline_stage: 'Qualified',
          created_at: '2025-10-20T14:00:00Z',
          updated_at: '2026-01-09T12:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Kevin',
          last_name: 'Lee',
          email: 'kevin.lee@innovatech.io',
          phone: '+1 (555) 666-7777',
          company: 'InnovaTech Labs',
          company_id: null,
          title: 'CTO',
          department: 'Engineering',
          website: 'https://innovatech.io',
          address: { street: '999 Tech Park', city: 'San Jose', state: 'CA', zip: '95101', country: 'USA' },
          dob: '1983-12-05',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'Partner Referral',
          status: 'customer',
          lead_score: 88,
          quality: 'hot',
          engagement: 'high',
          tags: ['VIP', 'Partner', 'Customer'],
          custom_fields: { tech_stack: 'React, Node.js', integration_ready: 'Yes' },
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-11T09:00:00Z',
          pipeline_stage: 'Closed Won',
          created_at: '2025-09-01T08:00:00Z',
          updated_at: '2026-01-12T10:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Amanda',
          last_name: 'Foster',
          email: 'afoster@greenleafconsulting.com',
          phone: '+1 (555) 777-8888',
          company: 'GreenLeaf Consulting',
          company_id: null,
          title: 'Senior Consultant',
          department: 'Consulting',
          website: '',
          address: { street: '111 Eco Drive', city: 'Portland', state: 'OR', zip: '97202', country: 'USA' },
          dob: '1986-06-14',
          owner_id: 'user-3',
          owner: 'System',
          source: 'Website Form',
          status: 'lead',
          lead_score: 61,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Prospect', 'Nurture'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-06T13:00:00Z',
          pipeline_stage: 'Discovery',
          created_at: '2025-11-28T10:00:00Z',
          updated_at: '2026-01-08T14:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Robert',
          last_name: 'Kim',
          email: 'rkim@mediaco.net',
          phone: '+1 (555) 888-9999',
          company: 'MediaCo Productions',
          company_id: null,
          title: 'Creative Lead',
          department: 'Creative',
          website: 'https://mediaco.net',
          address: { street: '222 Studio Lane', city: 'Los Angeles', state: 'CA', zip: '90001', country: 'USA' },
          dob: '1990-01-22',
          owner_id: 'user-2',
          owner: 'Adam B.',
          source: 'Cold Email',
          status: 'contact',
          lead_score: 43,
          quality: 'cold',
          engagement: 'low',
          tags: ['Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: false,
          opt_in_automations: false,
          last_contacted_at: '2025-12-18T15:00:00Z',
          pipeline_stage: 'New',
          created_at: '2025-12-15T11:00:00Z',
          updated_at: '2025-12-20T09:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Jessica',
          last_name: 'Brown',
          email: 'jbrown@retailhub.com',
          phone: '+1 (555) 999-0000',
          company: 'RetailHub Analytics',
          company_id: null,
          title: 'Data Analyst',
          department: 'Analytics',
          website: '',
          address: { street: '333 Data Dr', city: 'Miami', state: 'FL', zip: '33101', country: 'USA' },
          dob: '1993-10-30',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'LinkedIn',
          status: 'lead',
          lead_score: 76,
          quality: 'warm',
          engagement: 'high',
          tags: ['Hot Lead', 'Trial'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-09T12:00:00Z',
          pipeline_stage: 'Qualified',
          created_at: '2025-12-10T14:00:00Z',
          updated_at: '2026-01-10T10:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Christopher',
          last_name: 'Davis',
          email: 'cdavis@insurepro.com',
          phone: '+1 (555) 000-1111',
          company: 'InsurePro Services',
          company_id: null,
          title: 'Insurance Broker',
          department: 'Sales',
          website: '',
          address: { street: '444 Policy St', city: 'Atlanta', state: 'GA', zip: '30301', country: 'USA' },
          dob: '1982-08-16',
          owner_id: 'user-3',
          owner: 'System',
          source: 'Referral',
          status: 'contact',
          lead_score: 52,
          quality: 'cold',
          engagement: 'low',
          tags: ['Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: false,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2025-12-28T10:30:00Z',
          pipeline_stage: 'New',
          created_at: '2025-12-22T13:00:00Z',
          updated_at: '2025-12-30T11:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Nicole',
          last_name: 'Anderson',
          email: 'nanderson@logisticspro.com',
          phone: '+1 (555) 111-2233',
          company: 'LogisticsPro Inc',
          company_id: null,
          title: 'Supply Chain Manager',
          department: 'Operations',
          website: '',
          address: { street: '555 Warehouse Blvd', city: 'Dallas', state: 'TX', zip: '75201', country: 'USA' },
          dob: '1988-03-27',
          owner_id: 'user-2',
          owner: 'Adam B.',
          source: 'Website Form',
          status: 'lead',
          lead_score: 69,
          quality: 'warm',
          engagement: 'medium',
          tags: ['Nurture', 'Prospect'],
          custom_fields: {},
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-08T14:00:00Z',
          pipeline_stage: 'Discovery',
          created_at: '2025-11-05T09:00:00Z',
          updated_at: '2026-01-10T11:00:00Z',
          deleted_at: null
        },
        {
          id: generateUUID(),
          contact_id: generateContactId(),
          organization_id: 'org-1',
          first_name: 'Brandon',
          last_name: 'White',
          email: 'bwhite@cloudservices.io',
          phone: '+1 (555) 222-3344',
          company: 'CloudServices Global',
          company_id: null,
          title: 'Solutions Architect',
          department: 'Engineering',
          website: 'https://cloudservices.io',
          address: { street: '666 Cloud Tower', city: 'Seattle', state: 'WA', zip: '98102', country: 'USA' },
          dob: '1985-11-11',
          owner_id: 'user-1',
          owner: 'AIO Flow™',
          source: 'Conference',
          status: 'customer',
          lead_score: 91,
          quality: 'hot',
          engagement: 'high',
          tags: ['VIP', 'Enterprise', 'Customer'],
          custom_fields: { cloud_platform: 'AWS', spend_potential: '$250K+' },
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          last_contacted_at: '2026-01-12T15:00:00Z',
          pipeline_stage: 'Closed Won',
          created_at: '2025-10-10T10:00:00Z',
          updated_at: '2026-01-12T16:00:00Z',
          deleted_at: null
        }
      ];
    }

    // CONTACT ACTIVITIES TABLE
    if (!this.db.contact_activities) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      this.db.contact_activities = [
        { id: generateUUID(), contact_id: contactIds[0], user_id: 'user-1', activity_type: 'email', title: 'Sent welcome email', description: 'Sent personalized welcome email with onboarding resources', metadata: { subject: 'Welcome to AIO!', status: 'delivered' }, created_at: '2026-01-10T15:10:00Z' },
        { id: generateUUID(), contact_id: contactIds[0], user_id: 'user-1', activity_type: 'form', title: 'Submitted contact form', description: 'Contact created from form "BLS Contact Form 2026"', metadata: { form_id: 'form-123', source: 'website' }, created_at: '2026-01-10T15:08:00Z' },
        { id: generateUUID(), contact_id: contactIds[0], user_id: 'user-1', activity_type: 'automation', title: 'Enrolled in automation', description: 'Added to "Nurses Day 2025 Emails" automation', metadata: { automation_id: 'auto-456' }, created_at: '2026-01-10T15:12:00Z' },
        { id: generateUUID(), contact_id: contactIds[1], user_id: 'user-2', activity_type: 'call', title: 'Discovery call completed', description: 'Discussed pain points and product fit', metadata: { duration: '45 minutes', outcome: 'positive' }, created_at: '2025-07-01T10:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[1], user_id: 'user-2', activity_type: 'note', title: 'Follow-up note added', description: 'Interested in enterprise plan, needs approval from CFO', metadata: {}, created_at: '2025-07-01T11:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[2], user_id: 'user-3', activity_type: 'email', title: 'Cold outreach email', description: 'Sent initial outreach email', metadata: { subject: 'Partnership opportunity', status: 'opened' }, created_at: '2025-06-26T09:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[3], user_id: 'user-1', activity_type: 'meeting', title: 'Contract signing meeting', description: 'Finalized terms and signed contract', metadata: { deal_value: '$500,000', duration: '90 minutes' }, created_at: '2026-01-12T14:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[3], user_id: 'user-1', activity_type: 'email', title: 'Contract sent', description: 'Sent final contract for signature', metadata: { subject: 'Contract for review', status: 'delivered' }, created_at: '2026-01-11T10:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[4], user_id: 'user-3', activity_type: 'call', title: 'Initial outreach call', description: 'Discussed healthcare automation needs', metadata: { duration: '30 minutes', outcome: 'interested' }, created_at: '2026-01-05T15:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[5], user_id: 'user-2', activity_type: 'sms', title: 'Trial reminder SMS', description: 'Reminded about trial expiring in 3 days', metadata: { message: 'Your trial expires soon!', status: 'delivered' }, created_at: '2026-01-08T17:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[6], user_id: 'user-1', activity_type: 'email', title: 'Campaign email sent', description: 'Included in "Holiday Promotion 2025" campaign', metadata: { campaign_id: 'camp-789', status: 'delivered' }, created_at: '2025-12-01T09:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[7], user_id: 'user-2', activity_type: 'note', title: 'Trade show follow-up', description: 'Met at ConstructExpo 2025, interested in project management tools', metadata: {}, created_at: '2025-10-21T10:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[8], user_id: 'user-1', activity_type: 'meeting', title: 'Technical integration call', description: 'Discussed API integration and data migration', metadata: { duration: '60 minutes', next_steps: 'POC development' }, created_at: '2026-01-11T11:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[9], user_id: 'user-3', activity_type: 'form', title: 'Downloaded whitepaper', description: 'Downloaded "Sustainability in Business" whitepaper', metadata: { resource_id: 'wp-456' }, created_at: '2026-01-06T14:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[10], user_id: 'user-2', activity_type: 'email', title: 'Cold outreach', description: 'Initial contact email sent', metadata: { subject: 'Media production automation', status: 'opened' }, created_at: '2025-12-18T16:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[11], user_id: 'user-1', activity_type: 'call', title: 'Qualification call', description: 'Qualified as good fit for analytics platform', metadata: { duration: '25 minutes', score: 'high' }, created_at: '2026-01-09T13:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[12], user_id: 'user-3', activity_type: 'note', title: 'Partner referral note', description: 'Referred by InsureNet Partners, priority follow-up', metadata: {}, created_at: '2025-12-22T14:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[13], user_id: 'user-2', activity_type: 'email', title: 'Demo follow-up', description: 'Sent follow-up after product demo', metadata: { subject: 'Thanks for attending demo', status: 'delivered' }, created_at: '2026-01-08T15:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[14], user_id: 'user-1', activity_type: 'meeting', title: 'Quarterly business review', description: 'Reviewed Q4 performance and Q1 goals', metadata: { duration: '90 minutes', satisfaction: 'high' }, created_at: '2026-01-12T17:00:00Z' }
      ];
    }

    // CONTACT NOTES TABLE
    if (!this.db.contact_notes) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      this.db.contact_notes = [
        { id: generateUUID(), contact_id: contactIds[0], user_id: 'user-1', content: 'Very responsive and engaged. Great fit for VIP program.', is_pinned: true, created_at: '2026-01-10T16:00:00Z', updated_at: '2026-01-10T16:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[1], user_id: 'user-2', content: 'Needs CFO approval for budget. Follow up in 2 weeks.', is_pinned: false, created_at: '2025-07-01T12:00:00Z', updated_at: '2025-07-01T12:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[2], user_id: 'user-3', content: 'Cold lead. May need warmer intro.', is_pinned: false, created_at: '2025-06-27T08:00:00Z', updated_at: '2025-06-27T08:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[3], user_id: 'user-1', content: 'Key decision maker. Very impressed with platform capabilities.', is_pinned: true, created_at: '2026-01-12T15:00:00Z', updated_at: '2026-01-12T15:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[4], user_id: 'user-3', content: 'Interested in healthcare compliance features. Schedule demo.', is_pinned: false, created_at: '2026-01-06T09:00:00Z', updated_at: '2026-01-06T09:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[5], user_id: 'user-2', content: 'Trial user. Very active, good conversion potential.', is_pinned: false, created_at: '2026-01-09T10:00:00Z', updated_at: '2026-01-09T10:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[8], user_id: 'user-1', content: 'Technical expert. Requires detailed API documentation.', is_pinned: true, created_at: '2026-01-11T12:00:00Z', updated_at: '2026-01-11T12:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[11], user_id: 'user-1', content: 'Strong analytics background. Could become power user.', is_pinned: false, created_at: '2026-01-09T14:00:00Z', updated_at: '2026-01-09T14:00:00Z' }
      ];
    }

    // FORMS TABLE
    if (!this.db.forms) {
      const form1Id = generateUUID();
      const form2Id = generateUUID();
      const form3Id = generateUUID();
      
      this.db.forms = [
        {
          id: form1Id,
          name: 'Contact Form',
          slug: 'contact_form',
          description: 'Get in touch with us for any questions or inquiries',
          schema: [
            { id: 'f1', name: 'full_name', label: 'Full Name', type: 'text', required: true, placeholder: 'John Doe', map_to_contact: 'first_name', is_identifier: false },
            { id: 'f2', name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'john@example.com', map_to_contact: 'email', is_identifier: true },
            { id: 'f3', name: 'phone', label: 'Phone Number', type: 'phone', required: false, placeholder: '+1 (555) 000-0000', map_to_contact: 'phone', is_identifier: false },
            { id: 'f4', name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'How can we help you?', map_to_contact: null, is_identifier: false }
          ],
          settings: {
            create_contact: true,
            update_contact: true,
            webhook_url: '',
            notification_email: 'contact@aioagency.com',
            redirect_url: '',
            thank_you_message: 'Thank you for contacting us! We\'ll get back to you within 24 hours.'
          },
          is_active: true,
          responses_count: 28,
          last_response_at: '2026-01-12T10:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-01-12T10:00:00Z'
        },
        {
          id: form2Id,
          name: 'Demo Request',
          slug: 'demo_request',
          description: 'Request a personalized demo of our platform',
          schema: [
            { id: 'd1', name: 'full_name', label: 'Full Name', type: 'text', required: true, placeholder: 'Jane Smith', map_to_contact: 'first_name', is_identifier: false },
            { id: 'd2', name: 'email', label: 'Work Email', type: 'email', required: true, placeholder: 'jane@company.com', map_to_contact: 'email', is_identifier: true },
            { id: 'd3', name: 'company', label: 'Company Name', type: 'text', required: true, placeholder: 'Acme Corp', map_to_contact: 'company', is_identifier: false },
            { id: 'd4', name: 'company_size', label: 'Company Size', type: 'select', required: true, options: ['1-10', '11-50', '51-200', '201-1000', '1000+'], map_to_contact: null, is_identifier: false },
            { id: 'd5', name: 'inquiry', label: 'What are you interested in?', type: 'textarea', required: true, placeholder: 'Tell us about your needs', map_to_contact: null, is_identifier: false }
          ],
          settings: {
            create_contact: true,
            update_contact: true,
            webhook_url: 'https://hooks.slack.com/demo-requests',
            notification_email: 'sales@aioagency.com',
            redirect_url: '/thank-you',
            thank_you_message: 'Thanks for your interest! Our team will reach out within 1 business day to schedule your demo.'
          },
          is_active: true,
          responses_count: 15,
          last_response_at: '2026-01-11T15:30:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-01-11T15:30:00Z'
        },
        {
          id: form3Id,
          name: 'Newsletter Signup',
          slug: 'newsletter_signup',
          description: 'Subscribe to our weekly newsletter',
          schema: [
            { id: 'n1', name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@example.com', map_to_contact: 'email', is_identifier: true },
            { id: 'n2', name: 'interests', label: 'Topics of Interest', type: 'select', required: false, options: ['Marketing', 'Sales', 'Technology', 'Business'], map_to_contact: null, is_identifier: false }
          ],
          settings: {
            create_contact: true,
            update_contact: false,
            webhook_url: '',
            notification_email: '',
            redirect_url: '',
            thank_you_message: 'You\'re subscribed! Check your inbox for a confirmation email.'
          },
          is_active: true,
          responses_count: 89,
          last_response_at: '2026-01-12T16:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-01-12T16:00:00Z'
        }
      ];
    }

    // FORM SUBMISSIONS TABLE
    if (!this.db.form_submissions) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      const forms = this.db.forms || [];
      
      this.db.form_submissions = [
        { id: generateUUID(), form_id: forms[0]?.id, contact_id: contactIds[0], submission_data: { full_name: 'Jenna Best', email: 'jennalarinbest@gmail.com', phone: '+1 (555) 123-4567', message: 'Interested in your services' }, created_contact: false, submitted_at: '2026-01-12T10:00:00Z' },
        { id: generateUUID(), form_id: forms[0]?.id, contact_id: contactIds[1], submission_data: { full_name: 'Daniel Salinas', email: 'hvac.danielsalinas@gmail.com', phone: '+1 (555) 987-6543', message: 'Need pricing info' }, created_contact: false, submitted_at: '2026-01-11T14:30:00Z' },
        { id: generateUUID(), form_id: forms[0]?.id, contact_id: contactIds[2], submission_data: { full_name: 'Jordan Gilbert', email: 'jordan@webdesignnovainc.com', phone: '+1 (555) 456-7890', message: 'Partnership opportunity' }, created_contact: false, submitted_at: '2026-01-10T09:15:00Z' },
        { id: generateUUID(), form_id: forms[1]?.id, contact_id: contactIds[3], submission_data: { full_name: 'Sarah Chen', email: 'sarah.chen@finserve.com', company: 'FinServe Inc', company_size: '201-1000', inquiry: 'Looking for enterprise solution' }, created_contact: false, submitted_at: '2026-01-11T15:30:00Z' },
        { id: generateUUID(), form_id: forms[1]?.id, contact_id: contactIds[4], submission_data: { full_name: 'Michael Rodriguez', email: 'mrodriguez@healthplus.care', company: 'HealthPlus Clinic', company_size: '51-200', inquiry: 'Healthcare compliance features' }, created_contact: false, submitted_at: '2026-01-10T11:00:00Z' },
        { id: generateUUID(), form_id: forms[2]?.id, contact_id: contactIds[5], submission_data: { email: 'emily.watson@edulearn.com', interests: 'Technology' }, created_contact: false, submitted_at: '2026-01-12T16:00:00Z' },
        { id: generateUUID(), form_id: forms[2]?.id, contact_id: contactIds[6], submission_data: { email: 'alex.kim@retailplus.co', interests: 'Sales' }, created_contact: false, submitted_at: '2026-01-12T08:00:00Z' }
      ];
    }

    // CMS TABLES (Form Data Storage)
    if (!this.db.cms_tables) {
      this.db.cms_tables = [
        { id: generateUUID(), name: 'Contact Form', slug: 'contact_form', description: 'Contact form submissions', record_count: 28, form_id: this.db.forms?.[0]?.id, last_submission: '2026-01-12T10:00:00Z', created_at: '2025-01-01T00:00:00Z' },
        { id: generateUUID(), name: 'Demo Request', slug: 'demo_request', description: 'Demo request submissions', record_count: 15, form_id: this.db.forms?.[1]?.id, last_submission: '2026-01-11T15:30:00Z', created_at: '2025-01-01T00:00:00Z' },
        { id: generateUUID(), name: 'Newsletter Signup', slug: 'newsletter_signup', description: 'Newsletter subscriptions', record_count: 89, form_id: this.db.forms?.[2]?.id, last_submission: '2026-01-12T16:00:00Z', created_at: '2025-01-01T00:00:00Z' }
      ];
    }

    // Sample CMS Data - Contact Form (cms_contact_form)
    if (!this.db.cms_contact_form) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      const submissions = this.db.form_submissions || [];
      this.db.cms_contact_form = [
        { id: generateUUID(), contact_id: contactIds[0], form_submission_id: submissions[0]?.id, full_name: 'Jenna Best', email: 'jennalarinbest@gmail.com', phone: '+1 (555) 123-4567', message: 'Interested in your services', submitted_at: '2026-01-12T10:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[1], form_submission_id: submissions[1]?.id, full_name: 'Daniel Salinas', email: 'hvac.danielsalinas@gmail.com', phone: '+1 (555) 987-6543', message: 'Need pricing info', submitted_at: '2026-01-11T14:30:00Z' },
        { id: generateUUID(), contact_id: contactIds[2], form_submission_id: submissions[2]?.id, full_name: 'Jordan Gilbert', email: 'jordan@webdesignnovainc.com', phone: '+1 (555) 456-7890', message: 'Partnership opportunity', submitted_at: '2026-01-10T09:15:00Z' }
      ];
    }

    // Sample CMS Data - Demo Request (cms_demo_request)
    if (!this.db.cms_demo_request) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      const submissions = this.db.form_submissions || [];
      this.db.cms_demo_request = [
        { id: generateUUID(), contact_id: contactIds[3], form_submission_id: submissions[3]?.id, full_name: 'Sarah Chen', email: 'sarah.chen@finserve.com', company: 'FinServe Inc', company_size: '201-1000', inquiry: 'Looking for enterprise solution', submitted_at: '2026-01-11T15:30:00Z' },
        { id: generateUUID(), contact_id: contactIds[4], form_submission_id: submissions[4]?.id, full_name: 'Michael Rodriguez', email: 'mrodriguez@healthplus.care', company: 'HealthPlus Clinic', company_size: '51-200', inquiry: 'Healthcare compliance features', submitted_at: '2026-01-10T11:00:00Z' }
      ];
    }

    // Sample CMS Data - Newsletter Signup (cms_newsletter_signup)
    if (!this.db.cms_newsletter_signup) {
      const contactIds = this.db.crm_contacts?.map(c => c.id) || [];
      const submissions = this.db.form_submissions || [];
      this.db.cms_newsletter_signup = [
        { id: generateUUID(), contact_id: contactIds[5], form_submission_id: submissions[5]?.id, email: 'emily.watson@edulearn.com', interests: 'Technology', submitted_at: '2026-01-12T16:00:00Z' },
        { id: generateUUID(), contact_id: contactIds[6], form_submission_id: submissions[6]?.id, email: 'alex.kim@retailplus.co', interests: 'Sales', submitted_at: '2026-01-12T08:00:00Z' }
      ];
    }
  }

  // ============ AUTH METHODS ============
  get auth() {
    return {
      signInWithPassword: async ({ email, password }) => {
        await new Promise(resolve => setTimeout(resolve, 800));
        if (email && password) {
          this.authSession = { user: { email }, token: 'mock-token' };
          this.notifyAuthChange('SIGNED_IN', this.authSession);
          return { data: { session: this.authSession }, error: null };
        }
        return { data: null, error: { message: "Please enter an email and password." } };
      },

      signInWithOAuth: async ({ provider }) => {
        console.log(`Redirecting to ${provider} OAuth...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.authSession = { user: { email: `${provider}-user@aio.com` }, token: 'mock-oauth-token' };
        this.notifyAuthChange('SIGNED_IN', this.authSession);
        return { data: { url: 'https://accounts.google.com/o/oauth2/auth...' }, error: null };
      },

      getSession: async () => {
        return { data: { session: this.authSession } };
      },

      onAuthStateChange: (callback) => {
        this.authCallbacks.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.authCallbacks = this.authCallbacks.filter(cb => cb !== callback);
              }
            }
          }
        };
      },

      signOut: async () => {
        this.authSession = null;
        this.notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      }
    };
  }

  // ============ PRIVATE HELPER ============
  notifyAuthChange(event, session) {
    this.authCallbacks.forEach(cb => cb(event, session));
  }

  // ============ TABLE QUERY BUILDER ============
  from(table) {
    return new QueryBuilder(this.db, table);
  }

  // ============ REALTIME CHANNELS ============
  channel() {
    return {
      on: () => ({
        subscribe: () => ({
          unsubscribe: () => {}
        })
      })
    };
  }
}

/**
 * Query Builder Class
 * Implements chainable query interface matching Supabase API
 */
class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.orderBy = null;
    this.limit = null;
  }

  // SELECT
  select() {
    return {
      eq: async (col, val) => {
        const data = this.db[this.table] || [];
        const filtered = data.filter(item => item[col] === val);
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: filtered, error: null };
      },
      order: (col, options = {}) => {
        return new Promise(async (resolve) => {
          await new Promise(r => setTimeout(r, 100));
          const data = this.db[this.table] || [];
          const sorted = [...data].sort((a, b) => {
            const aVal = a[col];
            const bVal = b[col];
            const ascending = options.ascending !== false;
            
            if (typeof aVal === 'string') {
              return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return ascending ? aVal - bVal : bVal - aVal;
          });
          resolve({ data: sorted, error: null });
        });
      },
      then: async (resolve) => {
        await new Promise(r => setTimeout(r, 100));
        resolve({ data: this.db[this.table] || [], error: null });
      }
    };
  }

  // INSERT
  insert(rows) {
    return new Promise(async (resolve) => {
      await new Promise(r => setTimeout(r, 300));
      if (!this.db[this.table]) this.db[this.table] = [];
      
      const newRows = rows.map(r => ({
        ...r,
        id: Math.floor(Math.random() * 10000) + 100,
        created_at: new Date().toISOString()
      }));
      
      this.db[this.table] = [...this.db[this.table], ...newRows];
      resolve({ data: newRows, error: null });
    });
  }

  // UPDATE
  update(updates) {
    return {
      eq: async (col, val) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (this.db[this.table]) {
          this.db[this.table] = this.db[this.table].map(item =>
            item[col] === val ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
          );
        }
        return { error: null };
      }
    };
  }

  // DELETE
  delete() {
    return {
      eq: async (col, val) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (this.db[this.table]) {
          this.db[this.table] = this.db[this.table].filter(item => item[col] !== val);
        }
        return { error: null };
      }
    };
  }
}

// Create and export singleton instance
export const mockSupabase = new MockSupabaseClient();

// Named export for flexibility
export const createMockSupabase = () => new MockSupabaseClient();

// Default export
export default mockSupabase;
