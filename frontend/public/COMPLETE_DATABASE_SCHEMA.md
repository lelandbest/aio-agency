# AIO Agency CRM - Complete Database Schema

## Overview
This document defines the complete database schema for all modules in the AIO Agency CRM application.

---

## CORE SYSTEM TABLES

### 1. **users**
User accounts and authentication
```sql
id: uuid (primary key)
email: string (unique)
password_hash: string
first_name: string
last_name: string
phone: string (nullable)
avatar_url: string (nullable)
role: enum ('admin', 'manager', 'user', 'client')
status: enum ('active', 'inactive', 'suspended')
timezone: string (default 'UTC')
locale: string (default 'en')
is_email_verified: boolean (default false)
last_login_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp (nullable, for soft delete)
```

### 2. **organizations** (for multi-tenant support)
```sql
id: uuid (primary key)
name: string
slug: string (unique, for public URLs)
owner_id: uuid (foreign key to users)
logo_url: string (nullable)
website: string (nullable)
industry: string (nullable)
size: enum ('1-10', '11-50', '51-200', '201-500', '500+')
status: enum ('active', 'trial', 'suspended', 'cancelled')
created_at: timestamp
updated_at: timestamp
```

### 3. **organization_members**
Map users to organizations with roles
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
user_id: uuid (foreign key to users)
role: enum ('owner', 'admin', 'member', 'viewer')
permissions: jsonb (specific permissions array)
joined_at: timestamp
created_at: timestamp
```

---

## CRM MODULE TABLES

### 4. **contacts**
Customer/Lead contacts
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
first_name: string
last_name: string
email: string (unique within org)
phone: string (nullable)
company: string (nullable)
title: string (nullable, job title)
department: string (nullable)
website: string (nullable)
address: jsonb ({street, city, state, zip, country})
dob: date (nullable)
owner_id: uuid (foreign key to users, assigned rep)
source: string (nullable, lead source)
status: enum ('lead', 'contact', 'customer', 'inactive')
lead_score: integer (nullable, 0-100)
quality: enum ('hot', 'warm', 'cold', 'unqualified') (nullable)
engagement: enum ('high', 'medium', 'low') (nullable)
tags: jsonb (array of strings)
custom_fields: jsonb (extensible key-value pairs)
opt_in_email: boolean (default true)
opt_in_sms: boolean (default true)
opt_in_calls: boolean (default true)
opt_in_automations: boolean (default true)
last_contacted_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp (nullable)
```

### 5. **companies**
Business/organization entities (separate from contacts)
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
domain: string (nullable)
industry: string (nullable)
size: string (nullable)
annual_revenue: decimal (nullable)
phone: string (nullable)
website: string (nullable)
address: jsonb
owner_id: uuid (foreign key to users)
tags: jsonb
custom_fields: jsonb
created_at: timestamp
updated_at: timestamp
```

### 6. **contact_activities**
Activity log for contacts
```sql
id: uuid (primary key)
contact_id: uuid (foreign key to contacts)
user_id: uuid (foreign key to users, who performed action)
activity_type: enum ('note', 'email', 'call', 'meeting', 'sms', 'form', 'automation')
title: string
description: text (nullable)
metadata: jsonb (extra data like email subject, call duration, etc)
created_at: timestamp
```

### 7. **contact_notes**
Notes/comments on contacts
```sql
id: uuid (primary key)
contact_id: uuid (foreign key to contacts)
user_id: uuid (foreign key to users)
content: text
is_pinned: boolean (default false)
created_at: timestamp
updated_at: timestamp
```

---

## CALENDAR MODULE TABLES

### 8. **calendars**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
name: string
color: string (hex color)
is_default: boolean
is_visible: boolean
google_calendar_id: string (nullable)
sync_enabled: boolean
created_at: timestamp
updated_at: timestamp
```

### 9. **events** (appointments/bookings)
```sql
id: uuid (primary key)
calendar_id: uuid (foreign key to calendars)
user_id: uuid (owner)
contact_id: uuid (nullable, foreign key to contacts)
booking_type_id: uuid (nullable, foreign key to booking_types)
title: string
description: text (nullable)
start_time: timestamp
end_time: timestamp
all_day: boolean
location: string (nullable)
meeting_url: string (nullable - Zoom, Google Meet, etc)
attendees: jsonb (array of {email, name, status})
status: enum ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')
google_event_id: string (nullable)
guest_email: string (nullable)
guest_name: string (nullable)
guest_phone: string (nullable)
notes: text (nullable)
reminder_sent: boolean (default false)
created_at: timestamp
updated_at: timestamp
```

### 10. **booking_types** (meeting types)
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
name: string
slug: string (unique, for public URLs)
description: text
duration_minutes: integer
buffer_before_minutes: integer (default 0)
buffer_after_minutes: integer (default 0)
color: string (hex color)
is_active: boolean
price: decimal (nullable)
location: string (nullable)
questions: jsonb (custom form fields)
created_at: timestamp
updated_at: timestamp
```

### 11. **availability_rules**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
booking_type_id: uuid (nullable)
day_of_week: integer (0-6)
start_time: time
end_time: time
is_available: boolean
created_at: timestamp
updated_at: timestamp
```

### 12. **availability_exceptions**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
date: date
start_time: time (nullable)
end_time: time (nullable)
is_available: boolean
reason: string (nullable)
created_at: timestamp
updated_at: timestamp
```

### 13. **booking_settings**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
booking_page_title: string
booking_page_subtitle: string (nullable)
logo_url: string (nullable)
background_url: string (nullable)
background_color: string
primary_color: string
text_color: string
timezone: string
confirmation_redirect_url: string (nullable)
custom_css: text (nullable)
created_at: timestamp
updated_at: timestamp
```

### 14. **google_calendar_tokens**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
access_token: text (encrypted)
refresh_token: text (encrypted)
token_expiry: timestamp
scope: text
created_at: timestamp
updated_at: timestamp
```

### 15. **sync_logs**
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
calendar_id: uuid (nullable)
sync_type: enum ('push', 'pull', 'full')
status: enum ('success', 'failed', 'partial')
events_synced: integer
error_message: text (nullable)
created_at: timestamp
```

---

## FORMS MODULE TABLES

### 16. **forms**
Form definitions
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
user_id: uuid (foreign key to users, creator)
name: string
description: text (nullable)
slug: string (unique, for public URLs)
fields: jsonb (array of field definitions)
settings: jsonb (submission rules, notifications, etc)
is_active: boolean
is_public: boolean
redirect_url: string (nullable)
thank_you_message: text (nullable)
created_at: timestamp
updated_at: timestamp
```

### 17. **form_submissions**
Form submission data
```sql
id: uuid (primary key)
form_id: uuid (foreign key to forms)
contact_id: uuid (nullable, foreign key to contacts if matched)
data: jsonb (submitted field values)
ip_address: string (nullable)
user_agent: string (nullable)
referrer: string (nullable)
utm_source: string (nullable)
utm_medium: string (nullable)
utm_campaign: string (nullable)
created_at: timestamp
```

---

## PIPELINE MODULE TABLES

### 18. **pipelines**
Pipeline definitions (sales, projects, etc)
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
description: text (nullable)
type: enum ('sales', 'project', 'hiring', 'custom')
is_active: boolean
created_at: timestamp
updated_at: timestamp
```

### 19. **pipeline_stages**
Stages/columns in a pipeline
```sql
id: uuid (primary key)
pipeline_id: uuid (foreign key to pipelines)
name: string
position: integer (for ordering)
color: string (nullable)
is_final: boolean (marking completion)
created_at: timestamp
updated_at: timestamp
```

### 20. **pipeline_cards**
Items in the pipeline (deals, projects, tasks)
```sql
id: uuid (primary key)
pipeline_id: uuid (foreign key to pipelines)
stage_id: uuid (foreign key to pipeline_stages)
contact_id: uuid (nullable, foreign key to contacts)
company_id: uuid (nullable, foreign key to companies)
owner_id: uuid (foreign key to users)
title: string
description: text (nullable)
value: decimal (nullable, deal value)
priority: enum ('high', 'medium', 'low')
due_date: date (nullable)
tags: jsonb
assignees: jsonb (array of user IDs)
custom_fields: jsonb
position: integer (for ordering within stage)
created_at: timestamp
updated_at: timestamp
```

---

## ORDERS MODULE TABLES

### 21. **products**
Products/services for sale
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
description: text (nullable)
sku: string (nullable, unique)
price: decimal
type: enum ('physical', 'digital', 'service', 'subscription')
is_active: boolean
inventory_count: integer (nullable, for physical products)
images: jsonb (array of image URLs)
metadata: jsonb
created_at: timestamp
updated_at: timestamp
```

### 22. **orders**
Customer orders
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
contact_id: uuid (foreign key to contacts)
order_number: string (unique)
status: enum ('pending', 'processing', 'completed', 'cancelled', 'refunded')
subtotal: decimal
tax: decimal
shipping: decimal
discount: decimal
total: decimal
payment_status: enum ('unpaid', 'paid', 'partially_paid', 'refunded')
payment_method: string (nullable)
shipping_address: jsonb
billing_address: jsonb
notes: text (nullable)
created_at: timestamp
updated_at: timestamp
```

### 23. **order_items**
Line items in orders
```sql
id: uuid (primary key)
order_id: uuid (foreign key to orders)
product_id: uuid (foreign key to products)
quantity: integer
unit_price: decimal
discount: decimal (nullable)
total: decimal
created_at: timestamp
```

### 24. **transactions**
Payment transactions
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
order_id: uuid (nullable, foreign key to orders)
contact_id: uuid (foreign key to contacts)
transaction_type: enum ('payment', 'refund', 'credit')
amount: decimal
currency: string (default 'USD')
status: enum ('pending', 'completed', 'failed', 'cancelled')
payment_method: string
payment_gateway: string (nullable - stripe, paypal, etc)
gateway_transaction_id: string (nullable)
metadata: jsonb
created_at: timestamp
```

### 25. **invoices**
Invoices for orders/services
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
contact_id: uuid (foreign key to contacts)
order_id: uuid (nullable, foreign key to orders)
invoice_number: string (unique)
status: enum ('draft', 'sent', 'paid', 'overdue', 'cancelled')
issue_date: date
due_date: date
subtotal: decimal
tax: decimal
total: decimal
notes: text (nullable)
created_at: timestamp
updated_at: timestamp
```

---

## AGENTS MODULE TABLES

### 26. **ai_agents**
AI agent configurations
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
description: text (nullable)
type: enum ('chatbot', 'email_assistant', 'data_processor', 'custom')
model: string (e.g., 'gpt-4', 'claude-3')
prompt_template: text
configuration: jsonb (model settings, parameters)
is_active: boolean
created_at: timestamp
updated_at: timestamp
```

### 27. **ai_agent_conversations**
Conversation threads with AI agents
```sql
id: uuid (primary key)
agent_id: uuid (foreign key to ai_agents)
contact_id: uuid (nullable, foreign key to contacts)
user_id: uuid (nullable, foreign key to users)
status: enum ('active', 'completed', 'archived')
metadata: jsonb
created_at: timestamp
updated_at: timestamp
```

### 28. **ai_agent_messages**
Individual messages in conversations
```sql
id: uuid (primary key)
conversation_id: uuid (foreign key to ai_agent_conversations)
role: enum ('user', 'assistant', 'system')
content: text
tokens_used: integer (nullable)
cost: decimal (nullable)
created_at: timestamp
```

---

## DESIGN MODULE TABLES

### 29. **templates**
Email/landing page templates
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
type: enum ('email', 'landing_page', 'form', 'invoice')
html_content: text
css_content: text (nullable)
thumbnail_url: string (nullable)
is_public: boolean
created_by: uuid (foreign key to users)
created_at: timestamp
updated_at: timestamp
```

### 30. **assets**
Media files (images, videos, documents)
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
user_id: uuid (foreign key to users, uploader)
filename: string
original_filename: string
file_type: string (mime type)
file_size: integer (bytes)
url: string
folder: string (nullable, for organization)
tags: jsonb
created_at: timestamp
```

---

## INTEGRATIONS MODULE TABLES

### 31. **integrations**
Third-party integration configurations
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
provider: string (e.g., 'stripe', 'mailchimp', 'zapier')
status: enum ('active', 'inactive', 'error')
credentials: jsonb (encrypted API keys, tokens)
settings: jsonb (provider-specific config)
last_sync_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
```

### 32. **integration_logs**
Integration activity logs
```sql
id: uuid (primary key)
integration_id: uuid (foreign key to integrations)
action: string (e.g., 'sync_contacts', 'send_email')
status: enum ('success', 'failed', 'warning')
request_data: jsonb (nullable)
response_data: jsonb (nullable)
error_message: text (nullable)
created_at: timestamp
```

---

## AUTOMATION TABLES

### 33. **automations**
Workflow automations
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
description: text (nullable)
trigger_type: enum ('form_submit', 'contact_created', 'email_opened', 'schedule', 'webhook')
trigger_config: jsonb
actions: jsonb (array of action steps)
is_active: boolean
created_at: timestamp
updated_at: timestamp
```

### 34. **automation_runs**
Automation execution history
```sql
id: uuid (primary key)
automation_id: uuid (foreign key to automations)
contact_id: uuid (nullable, foreign key to contacts)
status: enum ('running', 'completed', 'failed', 'stopped')
started_at: timestamp
completed_at: timestamp (nullable)
error_message: text (nullable)
actions_completed: integer
created_at: timestamp
```

---

## COMMUNICATION TABLES

### 35. **email_campaigns**
Email marketing campaigns
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
subject: string
from_name: string
from_email: string
template_id: uuid (nullable, foreign key to templates)
html_content: text
status: enum ('draft', 'scheduled', 'sending', 'sent', 'paused')
scheduled_at: timestamp (nullable)
sent_at: timestamp (nullable)
recipient_count: integer
opened_count: integer
clicked_count: integer
created_at: timestamp
updated_at: timestamp
```

### 36. **sms_campaigns**
SMS marketing campaigns
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
message: text
status: enum ('draft', 'scheduled', 'sending', 'sent', 'paused')
scheduled_at: timestamp (nullable)
sent_at: timestamp (nullable)
recipient_count: integer
delivered_count: integer
created_at: timestamp
updated_at: timestamp
```

---

## TAGS & CATEGORIES

### 37. **tags**
Global tags for organization
```sql
id: uuid (primary key)
organization_id: uuid (foreign key to organizations)
name: string
color: string (nullable)
type: enum ('contact', 'company', 'general')
usage_count: integer (default 0)
created_at: timestamp
```

---

## AUDIT & SYSTEM

### 38. **audit_logs**
System audit trail
```sql
id: uuid (primary key)
organization_id: uuid (nullable)
user_id: uuid (nullable, foreign key to users)
action: string
entity_type: string
entity_id: uuid (nullable)
changes: jsonb (before/after values)
ip_address: string (nullable)
user_agent: string (nullable)
created_at: timestamp
```

### 39. **notifications**
In-app notifications
```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
title: string
message: text
type: enum ('info', 'success', 'warning', 'error')
link_url: string (nullable)
is_read: boolean (default false)
created_at: timestamp
read_at: timestamp (nullable)
```

---

## INDEXES

```sql
-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON organization_members(organization_id);

-- Contacts
CREATE INDEX idx_contacts_org ON contacts(organization_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_owner ON contacts(owner_id);
CREATE INDEX idx_contacts_status ON contacts(status);

-- Events
CREATE INDEX idx_events_calendar ON events(calendar_id);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_contact ON events(contact_id);

-- Forms
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX idx_form_submissions_contact ON form_submissions(contact_id);

-- Pipeline
CREATE INDEX idx_pipeline_cards_stage ON pipeline_cards(stage_id);
CREATE INDEX idx_pipeline_cards_contact ON pipeline_cards(contact_id);

-- Orders
CREATE INDEX idx_orders_contact ON orders(contact_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_transactions_order ON transactions(order_id);

-- Audit
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```

---

## NOTES

1. **All timestamps in UTC**
2. **UUIDs for all primary keys**
3. **JSONB for flexible/extensible data**
4. **Soft deletes** where appropriate (deleted_at)
5. **Encrypted** sensitive fields (passwords, tokens, credentials)
6. **Foreign key constraints** enforced
7. **Indexes** on frequently queried fields

---

## Migration Priority

1. Core (users, organizations)
2. CRM (contacts, companies)
3. Calendar (events, bookings)
4. Forms
5. Pipeline
6. Orders
7. Agents
8. Design
9. Integrations
10. Communication
11. Tags
12. Audit/Notifications
