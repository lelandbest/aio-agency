# Calendar Module - Complete Database Schema

## Tables Required

### 1. **calendars**
Stores individual calendar instances (personal, work, etc.)

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

### 2. **events** (appointments/bookings)
Core event/appointment data

```sql
id: uuid (primary key)
calendar_id: uuid (foreign key to calendars)
user_id: uuid (owner)
title: string
description: text (nullable)
start_time: timestamp
end_time: timestamp
all_day: boolean
location: string (nullable)
attendees: jsonb (array of email/name objects)
status: enum ('scheduled', 'confirmed', 'cancelled', 'completed')
google_event_id: string (nullable)
booking_type_id: uuid (nullable, foreign key to booking_types)
guest_email: string (nullable)
guest_name: string (nullable)
guest_phone: string (nullable)
notes: text (nullable)
created_at: timestamp
updated_at: timestamp
```

### 3. **booking_types** (meeting types/bookers)
Predefined appointment types users can create

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
price: decimal (nullable, for paid bookings)
location: string (nullable - physical address or "zoom", "phone", etc)
questions: jsonb (custom form fields)
created_at: timestamp
updated_at: timestamp
```

### 4. **availability_rules**
Define when providers are available for bookings

```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
booking_type_id: uuid (nullable, specific to booking type or general)
day_of_week: integer (0-6, Sunday=0)
start_time: time
end_time: time
is_available: boolean (true = available, false = blocked)
created_at: timestamp
updated_at: timestamp
```

### 5. **availability_exceptions**
Override availability for specific dates (holidays, special hours)

```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
date: date
start_time: time (nullable, null = all day)
end_time: time (nullable)
is_available: boolean
reason: string (nullable - "Holiday", "Vacation", etc)
created_at: timestamp
updated_at: timestamp
```

### 6. **booking_settings**
User/organization booking page customization

```sql
id: uuid (primary key)
user_id: uuid (foreign key to users)
booking_page_title: string
booking_page_subtitle: string (nullable)
logo_url: string (nullable)
background_url: string (nullable)
background_color: string (hex color)
primary_color: string (hex color)
text_color: string (hex color)
timezone: string (default user timezone)
confirmation_redirect_url: string (nullable)
custom_css: text (nullable)
created_at: timestamp
updated_at: timestamp
```

### 7. **google_calendar_tokens**
Store Google OAuth tokens for calendar sync

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

### 8. **sync_logs**
Track synchronization events for debugging

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

## Indexes Needed

```sql
-- Events
CREATE INDEX idx_events_calendar_id ON events(calendar_id);
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_booking_type_id ON events(booking_type_id);

-- Calendars
CREATE INDEX idx_calendars_user_id ON calendars(user_id);

-- Booking Types
CREATE INDEX idx_booking_types_user_id ON booking_types(user_id);
CREATE INDEX idx_booking_types_slug ON booking_types(slug);

-- Availability Rules
CREATE INDEX idx_availability_rules_user_id ON availability_rules(user_id);
CREATE INDEX idx_availability_rules_day ON availability_rules(day_of_week);

-- Availability Exceptions
CREATE INDEX idx_availability_exceptions_user_id ON availability_exceptions(user_id);
CREATE INDEX idx_availability_exceptions_date ON availability_exceptions(date);
```

---

## Relations Summary

- **users** → **calendars** (1:many)
- **users** → **booking_types** (1:many)
- **users** → **events** (1:many)
- **users** → **availability_rules** (1:many)
- **users** → **booking_settings** (1:1)
- **calendars** → **events** (1:many)
- **booking_types** → **events** (1:many)

---

## Mock Data Structure (for mockSupabase.js)

Initial seed data will include:
- 3 default calendars per user: Personal, Work, AIO Bookings
- 2-3 sample booking types: "30min Meeting", "1hr Consultation", "Quick Call"
- Sample availability rules: Mon-Fri 9am-5pm
- 5-10 sample events spread across current month
- Default booking settings with purple theme

---

## Notes

1. **Encryption**: `access_token` and `refresh_token` should be encrypted at rest
2. **Timezone**: All times stored in UTC, converted for display
3. **JSONB Fields**: 
   - `events.attendees`: `[{email: string, name: string, status: string}]`
   - `booking_types.questions`: `[{type: string, label: string, required: boolean}]`
4. **UUID**: All IDs use UUID v4 for security
5. **Soft Delete**: Consider adding `deleted_at` timestamp for soft deletes

---

## Migration Order

1. calendars
2. booking_types
3. booking_settings
4. availability_rules
5. availability_exceptions
6. events
7. google_calendar_tokens
8. sync_logs
