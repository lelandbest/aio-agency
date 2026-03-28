import React, { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Clock, MapPin, Trash2, Edit, Eye, Copy, ExternalLink, Search } from 'lucide-react';
import {
  createBookingTypeApi,
  createCalendarEventApi,
  createCalendarSourceApi,
  deleteBookingTypeApi,
  deleteCalendarEventApi,
  getCalendarSourceAuthorizeUrl,
  getBookingTypesApi,
  getCalendarsApi,
  getCalendarEventsApi,
  getCalendarProvidersApi,
  getCalendarSourcesApi,
  importCalendarSourceApi,
  pushCalendarEventApi,
  reconcileCalendarEventApi,
  syncCalendarSourceApi,
  testCalendarSourceApi,
  updateBookingTypeApi,
  updateCalendarEventApi,
  updateCalendarSourceApi
} from '../../services/backendApi';
import { requestAiSuggestion } from '../../services/aiAssist';
import { generateZoomLink, generateGoogleMeetLink } from '../../services/videoCallService';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import { openOAuthPopup } from '../../utils/oauthPopup';

const COMMS_CALENDAR = {
  id: 'calendar-comms',
  user_id: 'system',
  name: 'Comms',
  color: '#f59e0b',
  is_default: false,
  is_visible: true,
  is_backend: true
};

const normalizeBackendEvent = (event) => ({
  ...event,
  calendar_id: event.calendar_id || COMMS_CALENDAR.id,
  location_type: event.location_type || 'other',
  all_day: Boolean(event.all_day),
  is_backend_artifact: Boolean(event.thread_id || event.source === 'comms' || event.source === 'external-import'),
  source_label: event.source === 'comms' ? 'Comms' : event.source === 'external-import' ? 'Imported' : 'Backend'
});

const getStatusTone = (status) => ({
  scheduled: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20',
  confirmed: 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20',
  cancelled: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20',
  completed: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
  no_show: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20'
}[status] || 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)]');

const DEFAULT_CALENDAR_PROVIDERS = [
  { id: 'local-stub', label: 'Local Stub', fields: [] },
  {
    id: 'google-calendar-oauth',
    label: 'Google Calendar',
    fields: [
      { key: 'email', label: 'Google Account' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'refresh_token', label: 'Refresh Token' },
      { key: 'calendar_id', label: 'Calendar ID' }
    ]
  },
  {
    id: 'microsoft365-calendar',
    label: 'Microsoft 365 Calendar',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'user_id', label: 'User ID' },
      { key: 'calendar_id', label: 'Calendar ID' }
    ]
  },
  {
    id: 'ics-url',
    label: 'ICS Feed',
    fields: [
      { key: 'feed_url', label: 'ICS Feed URL' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password' }
    ]
  }
];

const createCalendarSourceDraft = () => ({
  name: '',
  provider: 'local-stub',
  sync_direction: 'two-way',
  config: {
    authority_mode: 'local-first',
    import_policy: 'review'
  }
});

const sourceRuleLabels = {
  'local-first': 'Local First',
  mirror: 'Mirror',
  'external-first': 'External First',
  review: 'Review',
  'auto-merge': 'Auto Merge',
  hold: 'Hold'
};

const syncTone = (status) => ({
  synced: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  local: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  imported: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  conflict: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
}[status] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]');

const conflictTone = (state) => ({
  review: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  resolved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  mirrored: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  clear: 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
}[state] || 'border-[var(--color-border)] text-[var(--color-text-secondary)]');

const isCalendarOauthProvider = (providerId) => ['google-calendar-oauth', 'microsoft365-calendar'].includes(providerId);
const openCalendarAdmin = () => window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'integrations', integrationCategory: 'calendar' } }));

const CalendarModule = ({ clientMode = false }) => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [view, setView] = useState('month'); // 'month', 'week', 'day'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookingTypes, setBookingTypes] = useState([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showBookerModal, setShowBookerModal] = useState(false);
  const [showBookingPage, setShowBookingPage] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedBooker, setSelectedBooker] = useState(null);
  const [selectedBookingType, setSelectedBookingType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'card' for events/bookers
  const [showIntegrationLink, setShowIntegrationLink] = useState(false);
  const [calendarSources, setCalendarSources] = useState([]);
  const [calendarProviders, setCalendarProviders] = useState(DEFAULT_CALENDAR_PROVIDERS);
  const [selectedCalendarSourceId, setSelectedCalendarSourceId] = useState(null);
  const [showSourceComposer, setShowSourceComposer] = useState(false);
  const [sourceDraft, setSourceDraft] = useState(() => createCalendarSourceDraft());
  const [sourceForm, setSourceForm] = useState(() => createCalendarSourceDraft());
  const [calendarNotice, setCalendarNotice] = useState(null);
  const [showCalendarOps, setShowCalendarOps] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const visibleTabs = clientMode ? ['calendar', 'bookings'] : ['calendar', 'bookers', 'bookings'];

  const fetchData = async () => {
    setLoading(true);
    let sources = [];
    let providers = DEFAULT_CALENDAR_PROVIDERS;
    let backendEvents = [];
    let backendCalendars = [];
    let backendBookers = [];
    try {
      backendCalendars = await getCalendarsApi();
    } catch {
      backendCalendars = [];
    }
    try {
      backendEvents = (await getCalendarEventsApi()).map(normalizeBackendEvent);
    } catch {
      backendEvents = [];
    }
    if (!clientMode) {
      try {
        backendBookers = await getBookingTypesApi();
      } catch {
        backendBookers = [];
      }
      try {
        sources = await getCalendarSourcesApi();
      } catch {
        sources = [];
      }
      try {
        providers = await getCalendarProvidersApi();
      } catch {
        providers = DEFAULT_CALENDAR_PROVIDERS;
      }
    }
    const mergedCalendars = [...(backendCalendars || [])];
    if (backendEvents.length > 0 && !mergedCalendars.some((calendar) => calendar.id === COMMS_CALENDAR.id)) {
      mergedCalendars.push(COMMS_CALENDAR);
    }
    setCalendars(mergedCalendars);
    setEvents(backendEvents.length ? backendEvents : []);
    setBookingTypes(Array.isArray(backendBookers) ? backendBookers : []);
    setCalendarSources(sources || []);
    setCalendarProviders(providers?.length ? providers : DEFAULT_CALENDAR_PROVIDERS);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [clientMode]);

  useEffect(() => {
    if (!clientMode || visibleTabs.includes(activeTab)) {
      return;
    }
    setActiveTab('calendar');
  }, [activeTab, clientMode, visibleTabs]);

  useEffect(() => {
    if (!calendarSources.length) {
      setSelectedCalendarSourceId(null);
      return;
    }
    if (!calendarSources.some((source) => source.id === selectedCalendarSourceId)) {
      setSelectedCalendarSourceId(calendarSources[0].id);
    }
  }, [calendarSources, selectedCalendarSourceId]);

  const toggleCalendar = (calId) => {
    setCalendars(calendars.map(cal =>
      cal.id === calId ? { ...cal, is_visible: !cal.is_visible } : cal
    ));
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: prevMonthLastDay - i,
        isCurrentMonth: false,
        fullDate: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: i,
        isCurrentMonth: true,
        fullDate: new Date(year, month, i)
      });
    }
    // Next month days
    const remainingDays = 42 - days.length; // 6 weeks
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: i,
        isCurrentMonth: false,
        fullDate: new Date(year, month + 1, i)
      });
    }
    return days;
  };

  const getEventsForDay = (date) => {
    const visibleCalendarIds = calendars.filter(c => c.is_visible).map(c => c.id);
    return events.filter(evt => {
      if (!visibleCalendarIds.includes(evt.calendar_id)) return false;
      const evtDate = new Date(evt.start_time);
      return evtDate.toDateString() === date.toDateString();
    });
  };

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const handleCreateEvent = () => {
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEditEvent = (evt) => {
    setSelectedEvent(evt);
    setShowEventModal(true);
  };

  const handleSaveEvent = async (eventData) => {
    if (selectedEvent) {
      await updateCalendarEventApi(selectedEvent.id, eventData);
    } else {
      await createCalendarEventApi({
        ...eventData,
        calendar_id: calendars.find(c => c.is_default)?.id || calendars[0]?.id,
        status: 'scheduled',
        source: 'calendar-local'
      });
    }
    fetchData();
    setShowEventModal(false);
  };

  const handleDeleteEvent = async (eventId) => {
    const eventToDelete = events.find((evt) => evt.id === eventId) || selectedEvent;
    if (eventToDelete?.thread_id) {
      setShowEventModal(false);
      return;
    }
    await deleteCalendarEventApi(eventId);
    fetchData();
    setShowEventModal(false);
  };

  const handleSaveBooker = async (bookerData) => {
    if (selectedBooker) {
      await updateBookingTypeApi(selectedBooker.id, bookerData);
    } else {
      await createBookingTypeApi({
        ...bookerData,
        slug: bookerData.name.toLowerCase().replace(/\s+/g, '-'),
        is_active: true
      });
    }
    fetchData();
    setShowBookerModal(false);
  };

  const handleDeleteBooker = async (bookerId) => {
    await deleteBookingTypeApi(bookerId);
    fetchData();
    setShowBookerModal(false);
  };

  const handleGuestBooking = async (bookingData) => {
    await createCalendarEventApi({
      ...bookingData,
      calendar_id: calendars.find(c => c.name === 'AIO Booking')?.id || calendars[0]?.id,
      status: 'scheduled',
      source: 'booking'
    });
    fetchData();
    setShowBookingPage(false);
  };

  const handleStatusChange = async (eventId, newStatus) => {
    await updateCalendarEventApi(eventId, { status: newStatus });
    fetchData();
  };

  const selectedCalendarSource = calendarSources.find((source) => source.id === selectedCalendarSourceId) || calendarSources[0] || null;
  const selectedCalendarProvider = calendarProviders.find((provider) => provider.id === sourceDraft.provider) || DEFAULT_CALENDAR_PROVIDERS[0];
  const selectedCalendarSourceProvider = calendarProviders.find((provider) => provider.id === sourceForm.provider) || DEFAULT_CALENDAR_PROVIDERS[0];
  const calendarCanvasPrimary = activeTab === 'calendar';
  const normalizedModuleSearch = moduleSearch.trim().toLowerCase();
  const filteredBookingTypes = normalizedModuleSearch
    ? bookingTypes.filter((booker) =>
      [
        booker.name,
        booker.description,
        booker.location,
        booker.slug,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedModuleSearch))
    )
    : bookingTypes;
  const filteredEvents = normalizedModuleSearch
    ? events.filter((evt) =>
      [
        evt.title,
        evt.guest_name,
        evt.guest_email,
        evt.location,
        evt.status,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedModuleSearch))
    )
    : events;
  const selectedDayEvents = [...getEventsForDay(currentDate)].sort((left, right) => new Date(left.start_time) - new Date(right.start_time));
  const upcomingBookings = [...events]
    .filter((evt) => {
      const start = new Date(evt.start_time).getTime();
      return start >= Date.now() && String(evt.status || '').toLowerCase() !== 'cancelled';
    })
    .sort((left, right) => new Date(left.start_time) - new Date(right.start_time))
    .slice(0, 8);

  useEffect(() => {
    if (!selectedCalendarSource) {
      setSourceForm(createCalendarSourceDraft());
      return;
    }
    setSourceForm({
      name: selectedCalendarSource.name || '',
      provider: selectedCalendarSource.provider || 'local-stub',
      sync_direction: selectedCalendarSource.sync_direction || 'two-way',
      config: {
        authority_mode: selectedCalendarSource.authority_mode || selectedCalendarSource.config?.authority_mode || 'local-first',
        import_policy: selectedCalendarSource.import_policy || selectedCalendarSource.config?.import_policy || 'review',
        ...(selectedCalendarSource.config || {})
      }
    });
  }, [selectedCalendarSource]);

  const handleSaveCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, sourceForm);
      setCalendarNotice({ tone: 'success', message: 'Calendar source saved.' });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleTestCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, sourceForm);
      const response = await testCalendarSourceApi(selectedCalendarSource.id);
      setCalendarNotice({ tone: 'success', message: response?.result?.message || 'Calendar source tested.' });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleSyncCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      const response = await syncCalendarSourceApi(selectedCalendarSource.id);
      setCalendarNotice({ tone: 'success', message: response?.result?.message || 'Calendar source synced.' });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleImportCalendarSource = async () => {
    if (!selectedCalendarSource?.id) return;
    try {
      const response = await importCalendarSourceApi(selectedCalendarSource.id);
      const importedCount = response?.result?.imported_count || 0;
      const conflictedCount = response?.result?.conflicted_count || 0;
      setCalendarNotice({
        tone: conflictedCount ? 'error' : 'success',
        message: conflictedCount
          ? `${importedCount} events imported. ${conflictedCount} need reconciliation.`
          : response?.result?.message || 'Calendar feed imported.'
      });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleCreateCalendarSource = async () => {
    if (!sourceDraft.name.trim()) return;
    try {
      const source = await createCalendarSourceApi(sourceDraft);
      setCalendarNotice({ tone: 'success', message: 'Calendar source created.' });
      setShowSourceComposer(false);
      setSourceDraft(createCalendarSourceDraft());
      setSelectedCalendarSourceId(source?.data?.id || source?.id || null);
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleAuthorizeCalendarSource = async () => {
    if (!selectedCalendarSource?.id || !isCalendarOauthProvider(sourceForm.provider)) return;
    try {
      await updateCalendarSourceApi(selectedCalendarSource.id, sourceForm);
      const result = await openOAuthPopup(getCalendarSourceAuthorizeUrl(selectedCalendarSource.id), 'calendar');
      setCalendarNotice({
        tone: 'success',
        message: `${selectedCalendarSource.name} connected via ${result.provider || selectedCalendarSourceProvider.label}.`
      });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handlePushEvent = async (eventId) => {
    try {
      const response = await pushCalendarEventApi(eventId, selectedCalendarSource?.id || null);
      setCalendarNotice({ tone: 'success', message: response?.result?.message || 'Event pushed to calendar source.' });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const handleReconcileEvent = async (eventId, strategy) => {
    try {
      const response = await reconcileCalendarEventApi(eventId, strategy);
      setCalendarNotice({ tone: 'success', message: response?.result?.message || 'Calendar event reconciled.' });
      fetchData();
    } catch (error) {
      setCalendarNotice({ tone: 'error', message: error.message });
    }
  };

  const renderCalendarView = () => {
    if (view === 'month') {
      const days = getDaysInMonth(currentDate);
      return (
        <div className="grid grid-cols-7 gap-px bg-[var(--color-hover)] border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="bg-[var(--color-bg-primary)] p-2 text-center text-xs text-[var(--color-text-tertiary)] font-medium uppercase">
              {day}
            </div>
          ))}
          {days.map((day, i) => {
            const dayEvents = getEventsForDay(day.fullDate);
            const isToday = day.fullDate.toDateString() === new Date().toDateString();
            return (
              <div
                key={i}
                onClick={() => setCurrentDate(day.fullDate)}
                className={`calendar-cell calendar-cell-hover min-h-[120px] p-2 transition group relative ${!day.isCurrentMonth ? 'opacity-40' : ''
                  }`}
              >
                <div className={`text-xs mb-1 ${isToday ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)] w-6 h-6 rounded-full flex items-center justify-center font-bold' : 'text-[var(--color-text-tertiary)]'}`}>
                  {day.date}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(evt => {
                    const cal = calendars.find(c => c.id === evt.calendar_id);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => handleEditEvent(evt)}
                        className="text-xs p-1 rounded cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: cal?.color + '20', borderLeft: `3px solid ${cal?.color}` }}
                      >
                        <div className="text-[var(--color-text-primary)] font-medium truncate">{evt.title}</div>
                        <div className="text-[var(--color-text-secondary)] text-[10px]">
                          {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-[var(--color-text-tertiary)]">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (view === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        return day;
      });

      const hours = Array.from({ length: 24 }, (_, i) => i);

      return (
        <div className="overflow-x-auto no-scrollbar">
          <div className="min-w-[800px]">
            {/* Week header */}
            <div className="grid grid-cols-8 gap-px bg-[var(--color-hover)] border border-[var(--color-border)] rounded-t-[var(--radius-panel)] overflow-hidden">
              <div className="bg-[var(--color-bg-primary)] p-2"></div>
              {weekDays.map((day, i) => {
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`bg-[var(--color-bg-primary)] p-2 text-center ${isToday ? 'bg-[var(--color-primary)]/10' : ''}`}>
                    <div className="text-xs text-[var(--color-text-tertiary)]">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time slots */}
            <div className="border border-t-0 border-[var(--color-border)] rounded-b-[var(--radius-panel)] overflow-hidden">
              {hours.map(hour => (
                <div key={hour} className="grid grid-cols-8 gap-px bg-[var(--color-hover)]">
                  <div className="bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-tertiary)] text-right pr-3">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  {weekDays.map((day, i) => {
                    const dayEvents = getEventsForDay(day).filter(evt => {
                      const evtHour = new Date(evt.start_time).getHours();
                      return evtHour === hour;
                    });
                    return (
                      <div key={i} className="calendar-cell calendar-cell-hover p-1 min-h-[60px] transition relative">
                        {dayEvents.map(evt => {
                          const cal = calendars.find(c => c.id === evt.calendar_id);
                          return (
                            <div
                              key={evt.id}
                              onClick={() => handleEditEvent(evt)}
                              className="text-xs p-1 rounded cursor-pointer mb-1"
                              style={{ backgroundColor: cal?.color + '20', borderLeft: `3px solid ${cal?.color}` }}
                            >
                              <div className="text-[var(--color-text-primary)] font-medium truncate">{evt.title}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (view === 'day') {
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const dayEvents = getEventsForDay(currentDate);

      return (
        <div className="border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden">
          <div className="bg-[var(--color-bg-primary)] p-4 border-b border-[var(--color-border)] text-center">
            <div className="text-sm text-[var(--color-text-tertiary)]">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="text-2xl font-bold text-[var(--color-text-primary)]">
              {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div>
            {hours.map(hour => {
              const hourEvents = dayEvents.filter(evt => {
                const evtHour = new Date(evt.start_time).getHours();
                return evtHour === hour;
              });

              return (
                <div key={hour} className="flex border-b border-[var(--color-border)] calendar-cell-hover transition">
                  <div className="w-24 p-3 text-xs text-[var(--color-text-tertiary)] text-right border-r border-[var(--color-border)]">
                    {hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`}
                  </div>
                  <div className="flex-1 p-2 min-h-[80px]">
                    {hourEvents.map(evt => {
                      const cal = calendars.find(c => c.id === evt.calendar_id);
                      return (
                        <div
                          key={evt.id}
                          onClick={() => handleEditEvent(evt)}
                          className="p-3 rounded cursor-pointer mb-2"
                          style={{ backgroundColor: cal?.color + '20', borderLeft: `4px solid ${cal?.color}` }}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-[var(--color-text-primary)] font-medium">{evt.title}</div>
                            <div className="text-xs text-[var(--color-text-secondary)]">
                              {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </div>
                          </div>
                          {evt.description && (
                            <div className="text-xs text-[var(--color-text-secondary)]">{evt.description}</div>
                          )}
                          {evt.location && (
                            <div className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1 mt-1">
                              <MapPin size={10} />
                              {evt.location}
                            </div>
                          )}
                          {evt.meeting_url && (
                            <div className="text-xs text-[var(--color-accent)] flex items-center gap-1 mt-1 hover:opacity-80">
                              <ExternalLink size={10} />
                              <a href={evt.meeting_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                Join Meeting
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  const renderContent = () => {
    if (activeTab === 'calendar') {
      return (
        <div className="flex h-full min-h-0">
          {!clientMode ? (
            <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/85">
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Active Source</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{selectedCalendarSource?.name || 'No source selected'}</div>
                    </div>
                    <button
                      onClick={() => setShowCalendarOps((current) => !current)}
                      className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                    >
                      {showCalendarOps ? 'Hide Details' : 'Source Details'}
                    </button>
                  </div>
                  <select
                    value={selectedCalendarSourceId || ''}
                    onChange={(e) => setSelectedCalendarSourceId(e.target.value)}
                    className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  >
                    {calendarSources.map((source) => (
                      <option key={source.id} value={source.id}>{source.name}</option>
                    ))}
                  </select>
                  {selectedCalendarSource ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-secondary)]">{selectedCalendarSource.health?.label || selectedCalendarSource.status}</span>
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-secondary)]">Events {selectedCalendarSource.event_counts?.total || 0}</span>
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-secondary)]">Conflicts {selectedCalendarSource.event_counts?.conflicts || 0}</span>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleSyncCalendarSource} disabled={!selectedCalendarSource?.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)] disabled:opacity-50">Sync</button>
                    <button onClick={handleImportCalendarSource} disabled={!selectedCalendarSource?.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)] disabled:opacity-50">Import</button>
                    <button onClick={() => setShowSourceComposer((current) => !current)} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]">
                      {showSourceComposer ? 'Hide New Source' : 'New Source'}
                    </button>
                    <button onClick={openCalendarAdmin} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]">Integrations</button>
                  </div>
                </div>

                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                  <div className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider">Visible Calendars</div>
                  <div className="space-y-2">
                    {calendars.map(cal => (
                      <label key={cal.id} className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                        <input
                          type="checkbox"
                          checked={cal.is_visible}
                          onChange={() => toggleCalendar(cal.id)}
                          className="rounded bg-[var(--color-bg-primary)] border-[var(--color-border)]"
                          style={{ accentColor: cal.color }}
                        />
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }}></div>
                        <span className="truncate">{cal.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          ) : null}

          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="calendar-panel-soft border-b border-[var(--color-border)] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateMonth(-1)}
                      className="rounded-[var(--radius-card)] p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setCurrentDate(new Date())}
                      className="rounded-[var(--radius-card)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => navigateMonth(1)}
                      className="rounded-[var(--radius-card)] p-2 text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar">
                  {['day', 'week', 'month'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setView(mode)}
                      className={`shrink-0 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${view === mode ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]' : 'bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto no-scrollbar p-4 md:p-6">
              {renderCalendarView()}
            </div>
          </div>

          {(!clientMode || selectedDayEvents.length > 0 || upcomingBookings.length > 0 || calendarNotice) ? (
            <aside className="hidden xl:flex w-[340px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]/85">
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                {calendarNotice ? (
                  <div className={`rounded-[var(--radius-panel)] border px-3 py-3 text-sm ${calendarNotice.tone === 'success' ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)]'}`}>
                    {calendarNotice.message}
                  </div>
                ) : null}

                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Selected Day</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedDayEvents.length > 0 ? selectedDayEvents.map((evt) => (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => handleEditEvent(evt)}
                        className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-left transition hover:border-[var(--color-primary)]/40"
                      >
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{evt.title}</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                        {evt.guest_name || evt.guest_email ? (
                          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{evt.guest_name || evt.guest_email}</div>
                        ) : null}
                      </button>
                    )) : (
                      <div className="text-sm text-[var(--color-text-secondary)]">No bookings on the selected day.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Upcoming Bookings</div>
                  <div className="mt-3 space-y-3">
                    {upcomingBookings.length > 0 ? upcomingBookings.map((evt) => (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => {
                          setCurrentDate(new Date(evt.start_time));
                          handleEditEvent(evt);
                        }}
                        className="w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-left transition hover:border-[var(--color-primary)]/40"
                      >
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{evt.title}</div>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {new Date(evt.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                        {evt.guest_name || evt.guest_email ? (
                          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{evt.guest_name || evt.guest_email}</div>
                        ) : null}
                      </button>
                    )) : (
                      <div className="text-sm text-[var(--color-text-secondary)]">No upcoming bookings are scheduled.</div>
                    )}
                  </div>
                </div>

                {!clientMode && selectedCalendarSource && showCalendarOps ? (
                  <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[var(--color-text-primary)] font-semibold">Source Details</div>
                      <button onClick={handleTestCalendarSource} disabled={!selectedCalendarSource?.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)] disabled:opacity-50">Test</button>
                    </div>
                    <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                      <div><span className="text-[var(--color-text-primary)] font-medium">Provider:</span> {selectedCalendarSource.provider}</div>
                      <div><span className="text-[var(--color-text-primary)] font-medium">Authority:</span> {sourceRuleLabels[selectedCalendarSource.authority_mode] || selectedCalendarSource.authority_mode}</div>
                      <div><span className="text-[var(--color-text-primary)] font-medium">Import:</span> {sourceRuleLabels[selectedCalendarSource.import_policy] || selectedCalendarSource.import_policy}</div>
                      <div>{selectedCalendarSource.health?.detail || 'Calendar source ready.'}</div>
                    </div>
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                      Calendar credentials, OAuth connection, and authority settings live in Integrations. Calendar keeps operational sync and import controls only.
                    </div>
                  </div>
                ) : null}

                {!clientMode && showSourceComposer ? (
                  <div className="rounded-[var(--radius-panel)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 p-4 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">New Source</div>
                    <div className="grid gap-3 text-sm">
                      <label className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Source Name</div>
                        <input value={sourceDraft.name} onChange={(e) => setSourceDraft((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-[var(--radius-card)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                      </label>
                      <label className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Provider</div>
                        <select value={sourceDraft.provider} onChange={(e) => setSourceDraft((current) => ({ ...current, provider: e.target.value, config: { authority_mode: current.config?.authority_mode || 'local-first', import_policy: current.config?.import_policy || 'review' } }))} className="w-full rounded-[var(--radius-card)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                          {calendarProviders.map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setShowSourceComposer(false); setSourceDraft(createCalendarSourceDraft()); }} className="rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]">Cancel</button>
                      <button onClick={handleCreateCalendarSource} disabled={!sourceDraft.name.trim()} className="rounded-[var(--radius-card)] bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50">Create Source</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      );
    }
    if (activeTab === 'bookers') {
      if (viewMode === 'card') {
        return (
          <div className="h-full overflow-auto no-scrollbar p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <button
              onClick={() => {
                setSelectedBooker(null);
                setShowBookerModal(true);
              }}
              className="border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-panel)] flex flex-col items-center justify-center p-8 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition gap-3 h-48"
            >
              <div className="w-10 h-10 rounded-full bg-[var(--color-bg-primary)] flex items-center justify-center border border-[var(--color-border)] shadow-island-sm">
                <Plus size={20} />
              </div>
              <span className="font-medium">Create Meeting Type</span>
            </button>

            {filteredBookingTypes.map(booker => (
              <div key={booker.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-5 hover:border-[var(--color-primary)]/50 transition group flex flex-col h-48 shadow-island-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-bold text-[var(--color-text-primary)] text-lg mb-1">{booker.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] mb-2">{booker.duration_minutes} min • {booker.location}</div>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] border ${booker.is_active
                    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border-[var(--color-border)]'
                    }`}>
                    {booker.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>

                <div className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2 flex-1">
                  {booker.description}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedBookingType(booker);
                      setShowBookingPage(true);
                    }}
                    className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-accent)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                    title="Preview"
                  >
                    <Eye size={12} />
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/book/${booker.slug}`);
                    }}
                    className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                    title="Copy Link"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBooker(booker);
                      setShowBookerModal(true);
                    }}
                    className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                    title="Edit"
                  >
                    <Edit size={12} />
                  </button>
                </div>
              </div>
            ))}
            {filteredBookingTypes.length === 0 ? (
              <div className="col-span-full rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 text-center text-[var(--color-text-secondary)]">
                No meeting types match the current search.
              </div>
            ) : null}
            </div>
          </div>
        );
      } else {
        // List view
        return (
          <div className="h-full overflow-auto no-scrollbar p-6">
            <div className="mb-4">
              <button
                onClick={() => {
                  setSelectedBooker(null);
                  setShowBookerModal(true);
                }}
                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] rounded text-sm font-medium flex items-center gap-2"
              >
                <Plus size={16} />
                Create Meeting Type
              </button>
            </div>
            <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-bg-primary)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs uppercase font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Duration</th>
                    <th className="p-4">Location</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredBookingTypes.map(booker => (
                    <tr key={booker.id} className="hover:bg-[var(--color-hover)]/20">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: booker.color }}></div>
                          <span className="text-[var(--color-text-primary)] font-medium">{booker.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-[var(--color-text-secondary)]">{booker.duration_minutes} min</td>
                      <td className="p-4 text-[var(--color-text-secondary)]">{booker.location}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${booker.is_active
                          ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                          }`}>
                          {booker.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedBookingType(booker);
                              setShowBookingPage(true);
                            }}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-accent)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/book/${booker.slug}`);
                            }}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Copy Link"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBooker(booker);
                              setShowBookerModal(true);
                            }}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteBooker(booker.id)}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredBookingTypes.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-[var(--color-text-tertiary)]">
                        No meeting types match the current search
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
    }
    if (activeTab === 'bookings') {
      if (viewMode === 'card') {
        return (
          <div className="h-full overflow-auto no-scrollbar p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map(evt => {
              const cal = calendars.find(c => c.id === evt.calendar_id);
              return (
                <div key={evt.id} className={`bg-[var(--color-bg-primary)] border rounded-[var(--radius-panel)] p-5 transition shadow-island-sm ${evt.is_backend_artifact ? 'border-[var(--color-success)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-[var(--color-text-primary)] mb-1">{evt.title}</h3>
                      <div className="text-xs text-[var(--color-text-secondary)] mb-2">
                        {new Date(evt.start_time).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <select
                      value={evt.status}
                      onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                      className={`px-2 py-1 rounded-[var(--radius-card)] text-xs bg-[var(--color-bg-secondary)] border ${getStatusTone(evt.status)} focus:outline-none transition`}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="no_show">No Show</option>
                    </select>
                  </div>

                  {evt.guest_name && (
                    <div className="text-sm text-[var(--color-text-secondary)] mb-2">
                      👤 {evt.guest_name}
                    </div>
                  )}
                  {evt.guest_email && (
                    <div className="text-sm text-[var(--color-text-secondary)] mb-2">
                      ✉️ {evt.guest_email}
                    </div>
                  )}
                  {evt.location && (
                    <div className="text-sm text-[var(--color-text-secondary)] mb-3 flex items-center gap-1">
                      <MapPin size={12} />
                      {evt.location}
                    </div>
                  )}
                  {evt.meeting_url && (
                    <a
                      href={evt.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--color-accent)] hover:opacity-80 mb-3 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                      Join Meeting
                    </a>
                  )}
                  {evt.is_backend_artifact && evt.sync_note ? (
                    <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {evt.sync_note}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: cal?.color + '20', color: cal?.color }}>
                        {cal?.name}
                      </span>
                      {evt.is_backend_artifact ? (
                        <span className="px-2 py-1 rounded text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          {evt.source_label || 'Comms'}
                        </span>
                      ) : null}
                      {evt.is_backend_artifact ? (
                        <span className={`px-2 py-1 rounded text-xs border ${syncTone(evt.sync_status)}`}>
                          {evt.sync_status || 'pending'}
                        </span>
                      ) : null}
                      {evt.is_backend_artifact ? (
                        <span className={`px-2 py-1 rounded text-xs border ${conflictTone(evt.conflict_state)}`}>
                          {evt.conflict_state || 'clear'}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {evt.is_backend_artifact ? (
                        <button
                          onClick={() => handlePushEvent(evt.id)}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-success)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                          title="Push to source"
                        >
                          <ExternalLink size={16} />
                        </button>
                      ) : null}
                      {evt.is_backend_artifact && evt.conflict_state === 'review' ? (
                        <>
                          <button
                            onClick={() => handleReconcileEvent(evt.id, 'keep_local')}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Keep local schedule"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => handleReconcileEvent(evt.id, 'accept_import')}
                            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                            title="Accept imported schedule"
                          >
                            <Eye size={16} />
                          </button>
                        </>
                      ) : null}
                      <button
                        onClick={() => handleEditEvent(evt)}
                        className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-island-sm transition"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredEvents.length === 0 && (
              <div className="col-span-full p-8 text-center text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg">
                No bookings match the current search
              </div>
            )}
            </div>
          </div>
        );
      } else {
        // List view
        return (
          <div className="h-full overflow-auto no-scrollbar p-6">
            <div className="border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden bg-[var(--color-bg-primary)] shadow-island-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs uppercase font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Event Title</th>
                    <th className="p-4">Guest</th>
                    <th className="p-4">Time</th>
                    <th className="p-4">Calendar</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredEvents.map(evt => {
                    const cal = calendars.find(c => c.id === evt.calendar_id);
                    return (
                      <tr key={evt.id} className={`hover:bg-[var(--color-hover)]/20 ${evt.is_backend_artifact ? 'bg-emerald-500/[0.04]' : ''}`}>
                        <td className="p-4 text-[var(--color-text-primary)] font-medium">
                          <div>{evt.title}</div>
                          {evt.is_backend_artifact ? (
                            <div className="mt-1 text-[11px] text-[var(--color-success)] uppercase tracking-[0.2em]">{evt.source_label || 'Comms'} managed</div>
                          ) : null}
                        </td>
                        <td className="p-4 text-[var(--color-text-secondary)]">{evt.guest_name || evt.guest_email || (evt.contact_id ? 'Linked CRM contact' : '-')}</td>
                        <td className="p-4 text-[var(--color-text-secondary)]">
                          {new Date(evt.start_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: cal?.color + '20', color: cal?.color }}>
                              {cal?.name}
                            </span>
                            {evt.thread_id ? (
                              <span className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                                Thread linked
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col items-start">
                            <select
                              value={evt.status}
                              onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                              className={`px-2 py-1 rounded-[var(--radius-card)] text-xs bg-[var(--color-bg-secondary)] border border-[var(--color-border)] ${getStatusTone(evt.status)} focus:outline-none transition`}
                            >
                              <option value="scheduled">Scheduled</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                              <option value="no_show">No Show</option>
                            </select>
                            {evt.is_backend_artifact ? (
                              <div className="flex flex-wrap gap-2">
                                <span className={`px-2 py-1 rounded text-[11px] uppercase tracking-[0.2em] border ${syncTone(evt.sync_status)}`}>{evt.sync_status || 'pending'}</span>
                                <span className={`px-2 py-1 rounded text-[11px] uppercase tracking-[0.2em] border ${conflictTone(evt.conflict_state)}`}>{evt.conflict_state || 'clear'}</span>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {evt.is_backend_artifact ? (
                              <button
                                onClick={() => handlePushEvent(evt.id)}
                                className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-success)]"
                                title="Push to source"
                              >
                                <ExternalLink size={16} />
                              </button>
                            ) : null}
                            {evt.is_backend_artifact && evt.conflict_state === 'review' ? (
                              <>
                                <button
                                  onClick={() => handleReconcileEvent(evt.id, 'keep_local')}
                                  className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
                                  title="Keep local schedule"
                                >
                                  <Copy size={16} />
                                </button>
                                <button
                                  onClick={() => handleReconcileEvent(evt.id, 'accept_import')}
                                  className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-warning)]"
                                  title="Accept imported schedule"
                                >
                                  <Eye size={16} />
                                </button>
                              </>
                            ) : null}
                            <button
                              onClick={() => handleEditEvent(evt)}
                              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(evt.id)}
                              disabled={evt.is_backend_artifact}
                              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-[var(--color-text-tertiary)]">
                        No bookings match the current search
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="calendar-surface h-full flex flex-col relative rounded-[var(--radius-outer)] overflow-hidden border border-[var(--color-border)] shadow-island">
      <ModuleHeader
        title="Calendar"
        titleIcon={CalendarIcon}
        showTitle={false}
        showCompactTitle
        subtitle={
          activeTab === 'calendar'
            ? 'Coordinate sources, booking types, and scheduled meetings from one workspace.'
            : activeTab === 'bookers'
              ? 'Manage meeting types without crowding the live calendar grid.'
              : 'Browse and update scheduled bookings from one operational list.'
        }
        statusBadge={{
          label: activeTab.charAt(0).toUpperCase() + activeTab.slice(1),
          color: 'info'
        }}
        showActions={true}
        actions={
          activeTab === 'calendar'
            ? [
              ...(!clientMode ? [{
                label: 'Manage Sources',
                icon: CalendarIcon,
                onClick: openCalendarAdmin,
                variant: 'secondary'
              }] : []),
              {
                label: 'Create Event',
                icon: Plus,
                onClick: handleCreateEvent,
                variant: 'primary',
                color: 'primary'
              }
            ]
            : activeTab === 'bookers'
              ? [{
                label: 'Create Meeting Type',
                icon: Plus,
                onClick: () => {
                  setSelectedBooker(null);
                  setShowBookerModal(true);
                },
                variant: 'primary',
                color: 'primary'
              }]
              : [{
                label: 'Create Event',
                icon: Plus,
                onClick: handleCreateEvent,
                variant: 'primary',
                color: 'primary'
              }]
        }
        className="border-b-0"
        toolbarCenterSlot={
          activeTab === 'bookers' || activeTab === 'bookings' ? (
            <div className="relative w-full max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={moduleSearch}
                onChange={(event) => setModuleSearch(event.target.value)}
                placeholder={activeTab === 'bookers' ? 'Search meeting types' : 'Search bookings'}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-10 pr-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          ) : null
        }
        toolbarRightSlot={
          activeTab === 'bookers' || activeTab === 'bookings' ? (
            <div className="flex gap-1 rounded-[var(--radius-card)] bg-[var(--color-bg-primary)] p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded text-xs ${viewMode === 'list' ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                title="List View"
              >
                List
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`px-3 py-1 rounded-[var(--radius-card)] text-xs ${viewMode === 'card' ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                title="Card View"
              >
                Card
              </button>
            </div>
          ) : null
        }
      />
      <div className="bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)]">
        <div className="flex px-4 gap-6">
          {visibleTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition capitalize ${activeTab === tab ? 'text-[var(--color-text-primary)] border-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[var(--color-text-secondary)]">Loading...</div>
          </div>
        ) : (
          renderContent()
        )}
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <EventModal
          event={selectedEvent}
          calendars={calendars}
          clientMode={clientMode}
          managedByBackend={Boolean(selectedEvent?.thread_id || selectedEvent?.source === 'comms')}
          allowDelete={!selectedEvent?.thread_id}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={() => setShowEventModal(false)}
        />
      )}

      {/* Booker Modal */}
      {!clientMode && showBookerModal && (
        <BookerModal
          booker={selectedBooker}
          onSave={handleSaveBooker}
          onDelete={handleDeleteBooker}
          onClose={() => setShowBookerModal(false)}
        />
      )}

      {/* Booking Page */}
      {showBookingPage && selectedBookingType && (
        <BookingPage
          bookingType={selectedBookingType}
          events={events}
          onClose={() => setShowBookingPage(false)}
          onBook={handleGuestBooking}
        />
      )}

      {/* Google Integration Link Modal */}
      {showIntegrationLink && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-md shadow-island">
            <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Google Calendar Integration</h3>
              <button onClick={() => setShowIntegrationLink(false)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[var(--color-text-secondary)] text-sm">
                Connect your Google Calendar to sync events between AIO CRM and Google Calendar.
              </p>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-4 shadow-island-sm">
                <div className="flex items-center gap-3 mb-3">
                  <svg className="w-10 h-10 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
                  </svg>
                  <div>
                    <div className="text-[var(--color-text-primary)] font-bold">Google Calendar</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">Two-way sync</div>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
                  Sync your events, manage multiple calendars, and never miss a booking.
                </p>
                <a
                  href="/integrations"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowIntegrationLink(false);
                    window.location.hash = '#/integrations';
                  }}
                  className="block w-full bg-[var(--color-accent)] hover:opacity-90 text-[var(--color-text-on-primary)] font-medium py-2 rounded text-center text-sm"
                >
                  Go to Integrations
                </a>
              </div>
              <div className="text-xs text-[var(--color-text-tertiary)]">
                <strong>Note:</strong> Google Calendar integration is available in the Integrations module.
                Configure your OAuth credentials there to enable sync.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Booker Modal Component
const BookerModal = ({ booker, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState({
    name: booker?.name || '',
    description: booker?.description || '',
    duration_minutes: booker?.duration_minutes || 30,
    location: booker?.location || '',
    location_type: booker?.location_type || 'other',
    color: booker?.color || 'var(--color-primary)',
    buffer_before_minutes: booker?.buffer_before_minutes || 0,
    buffer_after_minutes: booker?.buffer_after_minutes || 0
  });
  const [assistTarget, setAssistTarget] = useState('');
  const [assistError, setAssistError] = useState('');

  const buildBookerAssistText = (field) => {
    if (field === 'name') {
      const labelByType = {
        zoom: 'Strategy Zoom Session',
        google_meet: 'Google Meet Check-In',
        phone: 'Phone Discovery Call',
        other: 'Client Planning Session',
      };
      return labelByType[formData.location_type] || 'Client Meeting';
    }
    if (field === 'description') {
      return `Use this booking type for ${formData.name || 'this meeting'}.\nClarify the goal, who should attend, and what the client should prepare before the call.`;
    }
    if (field === 'location') {
      const valueByType = {
        zoom: 'Zoom Meeting',
        google_meet: 'Google Meet',
        phone: '+1 (555) 555-5555',
        other: 'Main office or private meeting link',
      };
      return valueByType[formData.location_type] || 'Main office';
    }
    return '';
  };

  const applyBookerAssist = async (field) => {
    setAssistError('');
    setAssistTarget(field);
    try {
      const suggestion = await requestAiSuggestion({
        module: 'calendar',
        surface: 'booker',
        field,
        currentValue: formData[field] || '',
        context: {
          ...formData,
          name: formData.name || '',
          location_type: formData.location_type || 'other',
        },
        fallback: () => buildBookerAssistText(field),
      });
      if (suggestion) {
        setFormData((current) => ({ ...current, [field]: suggestion }));
      }
    } catch (error) {
      setAssistError(error.message || 'Unable to draft calendar copy right now.');
    } finally {
      setAssistTarget('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-island">
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center">
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{booker ? 'Edit' : 'Create'} Meeting Type</h3>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {assistError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {assistError}
            </div>
          ) : null}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)]">Meeting Name</label>
              <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('name')} loading={assistTarget === 'name'} tooltip="Draft meeting name" iconType="crosshair" />
            </div>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
              placeholder="e.g., 30 Minute Meeting"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)]">Description</label>
              <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('description')} loading={assistTarget === 'description'} tooltip="Draft booking description" iconType="crosshair" />
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
              rows="3"
              placeholder="Describe this meeting type"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Duration (minutes)</label>
              <input
                type="number"
                required
                min="15"
                step="15"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Color</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1 py-1 focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Location Type</label>
            <select
              value={formData.location_type}
              onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
            >
              <option value="zoom">🎥 Zoom</option>
              <option value="google_meet">📹 Google Meet</option>
              <option value="phone">📞 Phone Call</option>
              <option value="other">🔗 Other</option>
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)]">Location Details</label>
              <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('location')} loading={assistTarget === 'location'} tooltip="Draft location details" iconType="crosshair" />
            </div>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
              placeholder={
                formData.location_type === 'zoom' ? 'Zoom Meeting' :
                  formData.location_type === 'google_meet' ? 'Google Meet' :
                    formData.location_type === 'phone' ? 'Phone number' :
                      'e.g., Office, Address, or Link'
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Buffer Before (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_before_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_before_minutes: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Buffer After (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_after_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_after_minutes: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-[var(--color-border)] flex justify-between">
          <div>
            {booker && (
              <button
                type="button"
                onClick={() => onDelete(booker.id)}
                className="px-4 py-2 bg-[var(--color-danger)] hover:opacity-90 text-[var(--color-text-on-primary)] rounded text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--color-hover)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-[var(--radius-card)] text-sm font-medium border border-[var(--color-border)] shadow-island-sm transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] rounded-[var(--radius-card)] text-sm font-medium border border-[var(--color-primary)] shadow-island-sm transition"
            >
              {booker ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Booking Page Component (Public-facing) - With Calendar
const BookingPage = ({ bookingType, events, onClose, onBook }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [guestInfo, setGuestInfo] = useState({ name: '', email: '', phone: '', notes: '' });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getAvailableSlots = (date) => {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotTime = new Date(date);
        slotTime.setHours(hour, min, 0, 0);
        const hasConflict = events.some(evt => {
          const evtStart = new Date(evt.start_time);
          const evtEnd = new Date(evt.end_time);
          const slotEnd = new Date(slotTime.getTime() + bookingType.duration_minutes * 60000);
          return slotTime < evtEnd && slotEnd > evtStart;
        });
        if (!hasConflict && slotTime > new Date()) slots.push(slotTime);
      }
    }
    return slots;
  };

  const handleBooking = (e) => {
    e.preventDefault();
    const startTime = selectedTime;
    const endTime = new Date(startTime.getTime() + bookingType.duration_minutes * 60000);
    onBook({
      title: `${bookingType.name} - ${guestInfo.name}`,
      description: guestInfo.notes,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      location: bookingType.location,
      guest_name: guestInfo.name,
      guest_email: guestInfo.email,
      guest_phone: guestInfo.phone,
      booking_type_id: bookingType.id,
      all_day: false
    });
  };

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      days.push({ date: prevMonthLastDay - i, isCurrentMonth: false, fullDate: new Date(year, month - 1, prevMonthLastDay - i) });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: i, isCurrentMonth: true, fullDate: new Date(year, month, i) });
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: i, isCurrentMonth: false, fullDate: new Date(year, month + 1, i) });
    }
    return days;
  };

  return (
    <div className="fixed inset-0 bg-[var(--color-bg-secondary)] z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">{bookingType.name}</h1>
            <p className="text-[var(--color-text-secondary)]">{bookingType.duration_minutes} minutes • {bookingType.location}</p>
            {bookingType.description && <p className="text-[var(--color-text-secondary)] mt-2">{bookingType.description}</p>}
          </div>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"><X size={24} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 shadow-island">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[var(--color-text-primary)]">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-2">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                <div key={day} className="text-center text-xs text-[var(--color-text-tertiary)] font-medium p-2">{day}</div>
              ))}
              {getDaysInMonth().map((day, i) => {
                const availableSlots = day.isCurrentMonth && day.fullDate >= new Date() ? getAvailableSlots(day.fullDate) : [];
                const isSelected = selectedDate && day.fullDate.toDateString() === selectedDate.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => availableSlots.length > 0 && setSelectedDate(day.fullDate)}
                    disabled={!day.isCurrentMonth || availableSlots.length === 0}
                    className={`p-2 text-sm rounded-[var(--radius-card)] ${isSelected ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)] shadow-island-sm' : availableSlots.length > 0 ? 'hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] cursor-pointer' : 'text-[var(--color-text-secondary)] cursor-not-allowed'} ${!day.isCurrentMonth ? 'opacity-40' : ''} transition`}
                  >
                    {day.date}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            {selectedDate && (
              <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 shadow-island">
                <h3 className="font-bold text-[var(--color-text-primary)] mb-4">Available Times - {selectedDate.toLocaleDateString()}</h3>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {getAvailableSlots(selectedDate).map((slot, i) => (
                    <button key={i} onClick={() => setSelectedTime(slot)} className={`p-2 text-sm rounded ${selectedTime && selectedTime.getTime() === slot.getTime() ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]' : 'bg-[var(--color-hover)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'}`}>
                      {slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTime && (
              <form onSubmit={handleBooking} className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4 shadow-island">
                <h3 className="font-bold text-[var(--color-text-primary)] mb-4">Your Information</h3>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-2">Name *</label>
                  <input type="text" required value={guestInfo.name} onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-2">Email *</label>
                  <input type="email" required value={guestInfo.email} onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-2">Phone</label>
                  <input type="tel" value={guestInfo.phone} onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-2">Notes</label>
                  <textarea value={guestInfo.notes} onChange={(e) => setGuestInfo({ ...guestInfo, notes: e.target.value })} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" rows="3" />
                </div>
                <button type="submit" className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] font-medium py-3 rounded-[var(--radius-panel)] shadow-island transition">Confirm Booking</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Mini Calendar Picker Component with Time Spinners
const MiniCalendar = ({ selectedDate, onSelect, onClose, position = 'left' }) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate ? new Date(selectedDate) : new Date());
  const [selectedTime, setSelectedTime] = useState(() => {
    if (selectedDate) {
      const date = new Date(selectedDate);
      return {
        hour: date.getHours() % 12 || 12,
        minute: date.getMinutes(),
        period: date.getHours() >= 12 ? 'PM' : 'AM'
      };
    }
    return { hour: 9, minute: 0, period: 'AM' };
  });

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      days.push({ date: prevMonthLastDay - i, isCurrentMonth: false, fullDate: new Date(year, month - 1, prevMonthLastDay - i) });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: i, isCurrentMonth: true, fullDate: new Date(year, month, i) });
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: i, isCurrentMonth: false, fullDate: new Date(year, month + 1, i) });
    }
    return days;
  };

  const handleDateClick = (date) => {
    const newDate = new Date(date);
    let hour24 = selectedTime.hour;
    if (selectedTime.period === 'PM' && selectedTime.hour !== 12) hour24 += 12;
    if (selectedTime.period === 'AM' && selectedTime.hour === 12) hour24 = 0;
    newDate.setHours(hour24, selectedTime.minute, 0, 0);
    onSelect(newDate.toISOString().slice(0, 16));
  };

  const handleTimeChange = (type, value) => {
    const newTime = { ...selectedTime, [type]: value };
    setSelectedTime(newTime);

    if (selectedDate) {
      const date = new Date(selectedDate);
      let hour24 = newTime.hour;
      if (newTime.period === 'PM' && newTime.hour !== 12) hour24 += 12;
      if (newTime.period === 'AM' && newTime.hour === 12) hour24 = 0;
      date.setHours(hour24, newTime.minute, 0, 0);
      onSelect(date.toISOString().slice(0, 16));
    }
  };

  const positionClasses = position === 'right' ? 'right-0' : 'left-0';

  return (
    <div className={`absolute top-full ${positionClasses} mt-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] shadow-island z-50 p-4 w-80`}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-[var(--color-text-primary)] text-sm">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h4>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
          <div key={day} className="text-center text-xs text-[var(--color-text-tertiary)] font-medium">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {getDaysInMonth().map((day, i) => {
          const isSelected = selectedDate && day.fullDate.toDateString() === new Date(selectedDate).toDateString();
          const isToday = day.fullDate.toDateString() === new Date().toDateString();
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleDateClick(day.fullDate)}
              className={`p-2 text-xs rounded-[var(--radius-card)] ${isSelected
                ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)] font-bold shadow-island-sm'
                : isToday
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-bold'
                  : day.isCurrentMonth
                    ? 'hover:bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)]'
                } transition`}
            >
              {day.date}
            </button>
          );
        })}
      </div>

      <div className="border-t border-[var(--color-border)] pt-3">
        <label className="block text-xs text-[var(--color-text-secondary)] mb-2 font-medium">Time</label>
        <div className="flex items-center gap-2">
          <select
            value={selectedTime.hour}
            onChange={(e) => handleTimeChange('hour', parseInt(e.target.value))}
            className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-2 py-2 text-[var(--color-text-primary)] text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
            ))}
          </select>
          <span className="text-[var(--color-text-secondary)]">:</span>
          <select
            value={selectedTime.minute}
            onChange={(e) => handleTimeChange('minute', parseInt(e.target.value))}
            className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-2 py-2 text-[var(--color-text-primary)] text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
          >
            {[0, 15, 30, 45].map(min => (
              <option key={min} value={min}>{String(min).padStart(2, '0')}</option>
            ))}
          </select>
          <select
            value={selectedTime.period}
            onChange={(e) => handleTimeChange('period', e.target.value)}
            className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-2 py-2 text-[var(--color-text-primary)] text-center text-sm focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] text-sm py-2 rounded-[var(--radius-card)] font-medium shadow-island-sm transition"
      >
        Done
      </button>
    </div>
  );
};

// Event Modal Component
const EventModal = ({ event, calendars, onSave, onDelete, onClose, readOnly = false, managedByBackend = false, allowDelete = true, clientMode = false }) => {
  const [formData, setFormData] = useState({
    title: event?.title || '',
    description: event?.description || '',
    start_time: event?.start_time ? new Date(event.start_time).toISOString().slice(0, 16) : '',
    end_time: event?.end_time ? new Date(event.end_time).toISOString().slice(0, 16) : '',
    location: event?.location || '',
    location_type: event?.location_type || 'other',
    meeting_url: event?.meeting_url || '',
    all_day: event?.all_day || false,
    timezone: event?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [assistTarget, setAssistTarget] = useState('');
  const [assistError, setAssistError] = useState('');

  const buildEventAssistText = (field) => {
    if (field === 'title') {
      const titleByType = {
        zoom: 'Strategy Review Meeting',
        google_meet: 'Working Session',
        phone: 'Phone Follow-Up',
        other: 'Client Meeting',
      };
      return titleByType[formData.location_type] || 'Client Meeting';
    }
    if (field === 'description') {
      return 'Objective: align on the next step.\nAgenda: review context, confirm blockers, and leave with one owner and one concrete action.\nPreparation: bring the latest notes and any open questions.';
    }
    if (field === 'location') {
      const valueByType = {
        phone: '+1 (555) 555-5555',
        other: 'Office address, room, or external meeting link',
      };
      return valueByType[formData.location_type] || formData.location || 'Meeting details';
    }
    return '';
  };

  const applyEventAssist = async (field) => {
    setAssistError('');
    setAssistTarget(field);
    try {
      const suggestion = await requestAiSuggestion({
        module: 'calendar',
        surface: 'event',
        field,
        currentValue: formData[field] || '',
        context: {
          ...formData,
          location_type: formData.location_type || 'other',
          title: formData.title || '',
        },
        fallback: () => buildEventAssistText(field),
      });
      if (suggestion) {
        setFormData((current) => ({ ...current, [field]: suggestion }));
      }
    } catch (error) {
      setAssistError(error.message || 'Unable to draft event copy right now.');
    } finally {
      setAssistTarget('');
    }
  };

  const timezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Asia/Shanghai', label: 'China (CST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Seoul', label: 'Seoul (KST)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (readOnly) return;
    onSave({
      ...formData,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
    });
  };

  const generateMeetingLink = async (type) => {
    setGeneratingLink(true);
    try {
      let result;
      const eventInfo = {
        title: formData.title || 'Meeting',
        description: formData.description || '',
        start_time: formData.start_time,
        end_time: formData.end_time
      };
      if (type === 'zoom') {
        result = await generateZoomLink(eventInfo);
      } else if (type === 'google_meet') {
        result = await generateGoogleMeetLink(eventInfo);
      }
      if (result.success) {
        setFormData({
          ...formData,
          meeting_url: result.meeting_url,
          location: type === 'zoom' ? 'Zoom Meeting' : 'Google Meet',
          meeting_id: result.meeting_id || null,
          meeting_password: result.password || null
        });
      }
    } catch (error) {
      console.error('Error generating meeting link:', error);
    } finally {
      setGeneratingLink(false);
    }
  };

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'Click to select';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-island">
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center">
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{readOnly ? 'Event Signal' : event ? 'Edit Event' : 'Create Event'}</h3>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {managedByBackend ? (
            <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-2 text-sm text-[var(--color-accent)]">
              This meeting is managed as a backend Comms object. Changes here will update the linked thread and CRM activity trail.
            </div>
          ) : null}
          {assistError ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {assistError}
            </div>
          ) : null}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)]">Event Title *</label>
              {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('title')} loading={assistTarget === 'title'} tooltip="Draft event title" iconType="crosshair" />}
            </div>
            <input
              type="text"
              required
              value={formData.title}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="Enter event title"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)]">Description</label>
              {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('description')} loading={assistTarget === 'description'} tooltip="Draft event description" iconType="crosshair" />}
            </div>
            <textarea
              value={formData.description}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              rows="3"
              placeholder="Add description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                <Clock size={14} className="inline mr-1" />
                Start Time *
              </label>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setShowStartPicker(!showStartPicker);
                  setShowEndPicker(false);
                }}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
              >
                {formatDateForDisplay(formData.start_time)}
              </button>
              {showStartPicker && (
                <MiniCalendar
                  selectedDate={formData.start_time}
                  onSelect={(date) => setFormData({ ...formData, start_time: date })}
                  onClose={() => setShowStartPicker(false)}
                  position="left"
                />
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                <Clock size={14} className="inline mr-1" />
                End Time *
              </label>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setShowEndPicker(!showEndPicker);
                  setShowStartPicker(false);
                }}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
              >
                {formatDateForDisplay(formData.end_time)}
              </button>
              {showEndPicker && (
                <MiniCalendar
                  selectedDate={formData.end_time}
                  onSelect={(date) => setFormData({ ...formData, end_time: date })}
                  onClose={() => setShowEndPicker(false)}
                  position="right"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Timezone</label>
            <select
              value={formData.timezone}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {timezones.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="all-day"
              checked={formData.all_day}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })}
              className="rounded bg-[var(--color-bg-secondary)] border-[var(--color-border)]"
            />
            <label htmlFor="all-day" className="text-sm text-[var(--color-text-secondary)]">All day event</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Meeting Location</label>
            <select
              value={formData.location_type}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, location_type: e.target.value, meeting_url: '' })}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="zoom">🎥 Zoom</option>
              <option value="google_meet">📹 Google Meet</option>
              <option value="phone">📞 Phone Call</option>
              <option value="other">🔗 Other</option>
            </select>
          </div>

          {(formData.location_type === 'zoom' || formData.location_type === 'google_meet') && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Video Call Link</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.meeting_url}
                  disabled={readOnly}
                  onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                  className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none text-sm"
                  placeholder="Meeting link will be generated"
                  readOnly={generatingLink}
                />
                <button
                  type="button"
                  onClick={() => generateMeetingLink(formData.location_type)}
                  disabled={generatingLink || readOnly}
                  className="px-4 py-2 bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 text-[var(--color-text-on-primary)] rounded-[var(--radius-card)] text-sm font-medium whitespace-nowrap border border-transparent shadow-island-sm transition"
                >
                  {generatingLink ? '...' : 'Generate'}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {formData.location_type === 'zoom' ? '🎥 Zoom' : '📹 Google Meet'} link will be created automatically
              </p>
            </div>
          )}

          {formData.location_type === 'phone' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                  <MapPin size={14} className="inline mr-1" />
                  Phone Number
                </label>
                {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('location')} loading={assistTarget === 'location'} tooltip="Draft phone details" iconType="crosshair" />}
              </div>
              <input
                type="tel"
                value={formData.location}
                disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                placeholder="Enter phone number"
              />
            </div>
          )}

          {formData.location_type === 'other' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                  <MapPin size={14} className="inline mr-1" />
                  Location (Address, Link, or Details)
                </label>
                {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('location')} loading={assistTarget === 'location'} tooltip="Draft location details" iconType="crosshair" />}
              </div>
              <input
                type="text"
                value={formData.location}
                disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                placeholder="Enter address, link, or details"
              />
            </div>
          )}

          {formData.meeting_url && (
            <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded p-3">
              <div className="text-xs text-[var(--color-success)] mb-1 font-medium">Meeting Link Generated</div>
              <div className="text-xs text-[var(--color-text-secondary)] break-all">{formData.meeting_url}</div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(formData.meeting_url);
                }}
                className="text-xs text-[var(--color-accent)] hover:opacity-80 mt-2 flex items-center gap-1"
              >
                <Copy size={12} /> Copy Link
              </button>
            </div>
          )}
        </form>

        <div className="p-4 border-t border-[var(--color-border)] flex justify-between">
          <div>
            {event && !readOnly && allowDelete && (
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="px-4 py-2 bg-[var(--color-danger)] hover:opacity-90 text-[var(--color-text-on-primary)] rounded text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--color-hover)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded text-sm font-medium"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly ? (
              <button
                onClick={handleSubmit}
              className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] rounded-[var(--radius-card)] text-sm font-medium border border-[var(--color-primary)] shadow-island-sm transition"
              >
                {event ? 'Update' : 'Create'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarModule;
