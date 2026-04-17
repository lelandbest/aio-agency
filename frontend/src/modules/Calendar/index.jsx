import React, { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Clock, MapPin, Trash2, Edit, Eye, Copy, ExternalLink, Search, Video, Phone, RefreshCw } from 'lucide-react';
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
import { useAIAssist } from '../../contexts/AIAssistContext';
import { openOAuthPopup } from '../../utils/oauthPopup';

const COMMS_CALENDAR = {
  id: 'calendar-comms',
  user_id: 'system',
  name: 'Comms',
  color: '#f59e0b',
  isDefault: false,
  isVisible: true,
  is_backend: true
};

const normalizeBackendEvent = (event) => ({
  ...event,
  calendarId: event.calendarId || COMMS_CALENDAR.id,
  locationType: event.locationType || 'other',
  allDay: Boolean(event.allDay),
  is_backend_artifact: Boolean(event.threadId || event.source === 'comms' || event.source === 'external-import'),
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
  const { openAIAssist, toggleAIAssist } = useAIAssist();
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
      cal.id === calId ? { ...cal, isVisible: !cal.isVisible } : cal
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
    const visibleCalendarIds = calendars.filter(c => c.isVisible).map(c => c.id);
    return events.filter(evt => {
      if (!visibleCalendarIds.includes(evt.calendarId)) return false;
      const evtDate = new Date(evt.startTime);
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

  const handleCreateBooker = () => {
    setSelectedBooker(null);
    setShowBookerModal(true);
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
        calendarId: calendars.find(c => c.isDefault)?.id || calendars[0]?.id,
        status: 'scheduled',
        source: 'calendar-local'
      });
    }
    fetchData();
    setShowEventModal(false);
  };

  const handleDeleteEvent = async (eventId) => {
    const eventToDelete = events.find((evt) => evt.id === eventId) || selectedEvent;
    if (eventToDelete?.threadId) {
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
      calendarId: calendars.find(c => c.name === 'AIO Booking')?.id || calendars[0]?.id,
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
        evt.guestName,
        evt.guestEmail,
        evt.location,
        evt.status,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedModuleSearch))
    )
    : events;
  const selectedDayEvents = [...getEventsForDay(currentDate)].sort((left, right) => new Date(left.startTime) - new Date(right.startTime));
  const upcomingBookings = [...events]
    .filter((evt) => {
      const start = new Date(evt.startTime).getTime();
      return start >= Date.now() && String(evt.status || '').toLowerCase() !== 'cancelled';
    })
    .sort((left, right) => new Date(left.startTime) - new Date(right.startTime))
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
        <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-[#1E2024] bg-[#1E2024]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="bg-[#0A0A0C] py-2 text-center text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">
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
                className={`calendar-cell min-h-[110px] p-2 transition bg-[#0A0A0C] relative hover:bg-[#111318] cursor-pointer ${!day.isCurrentMonth ? 'opacity-25' : ''}`}
              >
                <div className={`text-[10px] font-bold mb-1.5 ${isToday ? 'text-cyan-400' : 'text-slate-600'}`}>
                  {day.date}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(evt => {
                    const cal = calendars.find(c => c.id === evt.calendarId);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => handleEditEvent(evt)}
                        className="text-[9px] font-bold px-1.5 py-1 rounded-sm cursor-pointer hover:brightness-125 transition truncate border-l-2"
                        style={{ backgroundColor: cal?.color + '15', borderLeftColor: cal?.color, color: cal?.color }}
                      >
                        {evt.title}
                      </div>
                    );
                  })}
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
            <div className="grid grid-cols-8 gap-px border border-[#1E2024] bg-[#1E2024] rounded-t-xl overflow-hidden">
              <div className="bg-[#0A0A0C] p-2"></div>
              {weekDays.map((day, i) => {
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`bg-[#0A0A0C] p-2 text-center ${isToday ? 'bg-cyan-500/5' : ''}`}>
                    <div className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-xs font-black ${isToday ? 'text-cyan-400' : 'text-slate-200'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time slots */}
            <div className="border border-t-0 border-[#1E2024] bg-[#1E2024] rounded-b-xl overflow-hidden">
              {hours.map(hour => (
                <div key={hour} className="grid grid-cols-8 gap-px bg-[#1E2024]">
                  <div className="bg-[#0A0A0C] p-2 text-[8px] text-slate-600 font-black text-right pr-3 uppercase">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  {weekDays.map((day, i) => {
                    const dayEvents = getEventsForDay(day).filter(evt => {
                      const evtHour = new Date(evt.startTime).getHours();
                      return evtHour === hour;
                    });
                    return (
                      <div key={i} className="calendar-cell min-h-[50px] p-1 transition bg-[#0A0A0C] relative hover:bg-[#111318]">
                        {dayEvents.map(evt => {
                          const cal = calendars.find(c => c.id === evt.calendarId);
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
        <div className="overflow-hidden">
          <div className="p-3 text-center bg-[#0A0A0C] border-b border-[#1E2024]">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="text-lg font-black text-white uppercase tracking-tighter">
              {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div className="bg-[#0A0A0C]">
            {hours.map(hour => {
              const hourEvents = dayEvents.filter(evt => {
                const evtHour = new Date(evt.startTime).getHours();
                return evtHour === hour;
              });

              return (
                <div key={hour} className="flex border-b border-[#1E2024] hover:bg-[#111318] transition group">
                  <div className="w-20 p-3 text-[9px] text-slate-600 font-black text-right border-r border-[#1E2024] uppercase">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  <div className="flex-1 p-2 min-h-[80px]">
                    {hourEvents.map(evt => {
                      const cal = calendars.find(c => c.id === evt.calendarId);
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
                              {new Date(evt.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
                          {evt.meetingUrl && (
                            <div className="text-xs text-[var(--color-accent)] flex items-center gap-1 mt-1 hover:opacity-80">
                              <ExternalLink size={10} />
                              <a href={evt.meetingUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
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
        <div className="flex h-full min-h-0 gap-2 px-2 pb-2 overflow-hidden relative">
          {/* Column 1: Source Control Islands */}
          {!clientMode ? (
            <aside className="hidden lg:flex w-72 shrink-0 flex-col gap-2">
              <div className="rounded-xl border border-[#1E2024] bg-[#0A0A0C] p-3 shadow-2xl">
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">ACTIVE SOURCE</div>
                <div className="text-[11px] font-bold text-white mb-2 truncate opacity-90">{selectedCalendarSource?.name || 'No source selected'}</div>
                <select
                  value={selectedCalendarSourceId || ''}
                  onChange={(e) => setSelectedCalendarSourceId(e.target.value)}
                  className="w-full rounded bg-black/40 border border-[#2A2D35] px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/40 focus:outline-none transition"
                >
                  {calendarSources.map((source) => (
                    <option key={source.id} value={source.id}>{source.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-[#1E2024] bg-[#0A0A0C] p-3 shadow-2xl">
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2.5">VISIBLE LAYERS</div>
                <div className="space-y-2">
                  {calendars.map(cal => (
                    <label key={cal.id} className="flex items-center gap-2.5 text-[11px] text-slate-400 cursor-pointer hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={cal.isVisible}
                        onChange={() => toggleCalendar(cal.id)}
                        className="w-3.5 h-3.5 rounded bg-black border-[#2A2D35]"
                        style={{ accentColor: cal.color }}
                      />
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }}></div>
                      <span className="truncate">{cal.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </aside>
          ) : null}

          {/* Island 2: Main Calendar (Scale 90) */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl bg-[#08080A] border border-[#1E2024] overflow-hidden shadow-2xl">
            <div className="px-3 py-1.5 border-b border-white/5 bg-[#0A0A0C]">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black tracking-widest text-slate-200 uppercase">
                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h2>
                  <div className="flex items-center gap-0.5 bg-black/40 p-0.5 rounded border border-white/5">
                    <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-white/5 rounded transition text-zinc-500 hover:text-white"><ChevronLeft size={14} /></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition">Today</button>
                    <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-white/5 rounded transition text-zinc-500 hover:text-white"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="flex gap-0.5 bg-black/40 p-0.5 rounded border border-white/5">
                  {['day', 'week', 'month'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setView(mode)}
                      className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded transition-all ${view === mode ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30' : 'text-zinc-600 hover:text-zinc-300'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden relative bg-black">
              <div className="absolute inset-0 origin-top transform scale-[0.85] p-2 no-scrollbar overflow-hidden">
                {renderCalendarView()}
              </div>
            </div>
          </div>

          {/* Column 3: Independent Floating Islands */}
          {(!clientMode || selectedDayEvents.length > 0 || upcomingBookings.length > 0) ? (
            <aside className="hidden xl:flex w-80 shrink-0 flex-col gap-2">
              <div className="rounded-xl border border-[#1E2024] bg-[#0A0A0C] p-3 shadow-2xl">
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">AGENDA MONITOR</div>
                <div className="text-[10px] font-black text-white/40 mb-2 tracking-widest uppercase">
                  {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1.5">
                  {selectedDayEvents.length > 0 ? selectedDayEvents.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => handleEditEvent(evt)}
                      className="w-full rounded border border-white/5 bg-black/40 p-2.5 text-left hover:border-cyan-500/40 transition-all group"
                    >
                      <div className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{evt.title}</div>
                      <div className="mt-0.5 text-[9px] text-slate-600 font-mono tracking-tighter">
                        {new Date(evt.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                  )) : (
                    <div className="text-[10px] text-slate-600 italic py-2 tracking-tight">System state: NO_EVENTS_FOUND</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#1E2024] bg-[#0A0A0C] p-3 shadow-2xl">
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2.5">UPCOMING QUEUE</div>
                <div className="space-y-1.5">
                  {upcomingBookings.length > 0 ? upcomingBookings.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => handleEditEvent(evt)}
                      className="w-full rounded border border-white/5 bg-black/40 p-2.5 text-left hover:border-cyan-500/40 transition-all group"
                    >
                      <div className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{evt.title}</div>
                      <div className="mt-0.5 text-[9px] text-slate-600 font-mono flex items-center justify-between">
                        <span>{new Date(evt.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span>{new Date(evt.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  )) : (
                    <div className="text-[10px] text-slate-600 italic py-2 tracking-tight">System state: QUEUE_EMPTY</div>
                  )}
                </div>
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
            <div className="border border-white/10 rounded-lg overflow-hidden bg-[var(--color-bg-primary)] shadow-island-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[11px] uppercase font-black tracking-[0.2em]">
                  <tr>
                    <th className="p-4">NAME</th>
                    <th className="p-4">DURATION</th>
                    <th className="p-4">LOCATION</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4 text-right">ACTIONS</th>
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
                const cal = calendars.find(c => c.id === evt.calendarId);
                return (
                  <div key={evt.id} className={`bg-[var(--color-bg-primary)] border rounded-[var(--radius-panel)] p-5 transition shadow-island-sm ${evt.is_backend_artifact ? 'border-[var(--color-success)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-[var(--color-text-primary)] mb-1">{evt.title}</h3>
                        <div className="text-xs text-[var(--color-text-secondary)] mb-2">
                          {new Date(evt.startTime).toLocaleString('en-US', {
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

                    {evt.guestName && (
                      <div className="text-sm text-[var(--color-text-secondary)] mb-2">
                        👤 {evt.guestName}
                      </div>
                    )}
                    {evt.guestEmail && (
                      <div className="text-sm text-[var(--color-text-secondary)] mb-2">
                        ✉️ {evt.guestEmail}
                      </div>
                    )}
                    {evt.location && (
                      <div className="text-sm text-[var(--color-text-secondary)] mb-3 flex items-center gap-1">
                        <MapPin size={12} />
                        {evt.location}
                      </div>
                    )}
                    {evt.meetingUrl && (
                      <a
                        href={evt.meetingUrl}
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
                    const cal = calendars.find(c => c.id === evt.calendarId);
                    return (
                      <tr key={evt.id} className={`hover:bg-[var(--color-hover)]/20 ${evt.is_backend_artifact ? 'bg-emerald-500/[0.04]' : ''}`}>
                        <td className="p-4 text-[var(--color-text-primary)] font-medium">
                          <div>{evt.title}</div>
                          {evt.is_backend_artifact ? (
                            <div className="mt-1 text-[11px] text-[var(--color-success)] uppercase tracking-[0.2em]">{evt.source_label || 'Comms'} managed</div>
                          ) : null}
                        </td>
                        <td className="p-4 text-[var(--color-text-secondary)]">{evt.guestName || evt.guestEmail || (evt.contact_id ? 'Linked CRM contact' : '-')}</td>
                        <td className="p-4 text-[var(--color-text-secondary)]">
                          {new Date(evt.startTime).toLocaleString('en-US', {
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
                            {evt.threadId ? (
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
    <div className="module-root-standard">
      <ModuleHeader
        showTitle={false}
        showActions={true}
        leftActions={[
          ...visibleTabs.map(tab => ({
            label: tab.charAt(0).toUpperCase() + tab.slice(1),
            icon: null,
            onClick: () => setActiveTab(tab),
            variant: activeTab === tab ? 'primary' : 'secondary'
          }))
        ]}
        actions={[
          {
            label: activeTab === 'bookers' ? 'ADD MEETING TYPE' : 'ADD EVENT',
            icon: Plus,
            onClick: activeTab === 'bookers' ? handleCreateBooker : handleCreateEvent,
            variant: 'primary',
            groupStart: true
          }
        ]}
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
        onModuleAi={() => toggleAIAssist({ mode: 'help', context: { module: 'calendar', activeTab } })}
      />

      <div className="module-content-stage relative overflow-hidden px-2 pb-2">
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
        <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-[500px] pointer-events-none">
          <div className="relative h-full bg-black/60 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto">
            <EventModal
              event={selectedEvent}
              calendars={calendars}
              clientMode={clientMode}
              managedByBackend={Boolean(selectedEvent?.threadId || selectedEvent?.source === 'comms')}
              allowDelete={!selectedEvent?.threadId}
              onSave={handleSaveEvent}
              onDelete={handleDeleteEvent}
              onClose={() => setShowEventModal(false)}
            />
          </div>
        </div>
      )}

      {/* Booker Modal */}
      {!clientMode && showBookerModal && (
        <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-[500px] pointer-events-none">
          <div className="relative h-full bg-black/60 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto">
            <BookerModal
              booker={selectedBooker}
              onSave={handleSaveBooker}
              onDelete={handleDeleteBooker}
              onClose={() => setShowBookerModal(false)}
            />
          </div>
        </div>
      )}

      {/* Booking Page */}
      {showBookingPage && selectedBookingType && (
        <div className="fixed inset-y-0 right-0 z-[101] w-full max-w-[500px] pointer-events-none">
          <div className="relative h-full bg-black/60 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto">
            <BookingPage
              bookingType={selectedBookingType}
              events={events}
              onClose={() => setShowBookingPage(false)}
              onBook={handleGuestBooking}
            />
          </div>
        </div>
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
    locationType: booker?.locationType || 'other',
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
      return labelByType[formData.locationType] || 'Client Meeting';
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
      return valueByType[formData.locationType] || 'Main office';
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
          locationType: formData.locationType || 'other',
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-transparent">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{booker ? 'Edit' : 'Create'} Meeting Type</h3>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-[var(--color-text-secondary)] hover:text-white">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
        {assistError ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {assistError}
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Meeting Name *</label>
              <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('name')} loading={assistTarget === 'name'} tooltip="Draft meeting name" iconType="crosshair" />
            </div>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              placeholder="e.g., 30 Minute Meeting"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Description</label>
              <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('description')} loading={assistTarget === 'description'} tooltip="Draft booking description" iconType="crosshair" />
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              rows="3"
              placeholder="Describe this meeting type"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Duration (min)</label>
              <input
                type="number"
                required
                min="15"
                step="15"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Color Tag</label>
              <div className="flex gap-2 items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 h-[50px]">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                />
                <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest">{formData.color}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] block mb-2">Location Strategy</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { id: 'zoom', label: 'Zoom', icon: Video },
                { id: 'google_meet', label: 'Meet', icon: Video },
                { id: 'phone', label: 'Phone', icon: Phone },
                { id: 'other', label: 'Other', icon: MapPin }
              ].map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, locationType: type.id })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${formData.locationType === type.id
                    ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Location Details</label>
                <AIAssistButton variant="inline" onAssist={() => applyBookerAssist('location')} loading={assistTarget === 'location'} tooltip="Draft location details" iconType="crosshair" />
              </div>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                placeholder={
                  formData.locationType === 'zoom' ? 'Zoom Link' :
                    formData.locationType === 'google_meet' ? 'Meet Link' :
                      formData.locationType === 'phone' ? 'Phone number' :
                        'Office address or meeting link'
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Buffer Before (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_before_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_before_minutes: parseInt(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Buffer After (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_after_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_after_minutes: parseInt(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </form>

      <div className="p-6 border-t border-white/10 bg-black/20 flex gap-3">
        {booker && (
          <button
            type="button"
            onClick={() => onDelete(booker.id)}
            className="px-6 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl py-3 font-medium transition-all"
          >
            Delete
          </button>
        )}
        <div className="flex-1 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-xl py-3 font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-[2] bg-[var(--color-primary)] hover:opacity-90 text-white rounded-xl py-3 font-bold shadow-lg transition-all"
          >
            {booker ? 'Update' : 'Create'}
          </button>
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
          const evtStart = new Date(evt.startTime);
          const evtEnd = new Date(evt.endTime);
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
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      location: bookingType.location,
      guest_name: guestInfo.name,
      guest_email: guestInfo.email,
      guest_phone: guestInfo.phone,
      booking_type_id: bookingType.id,
      allDay: false
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-transparent">
        <div>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{bookingType.name}</h3>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{bookingType.duration_minutes} min • {bookingType.location}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-[var(--color-text-secondary)] hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
        {bookingType.description && (
          <div className="p-4 rounded-xl border border-white/5 bg-white/5 text-xs text-zinc-400 italic">
            "{bookingType.description}"
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
              <div className="flex gap-1">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-1 hover:bg-white/10 rounded transition text-zinc-400">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-1 hover:bg-white/10 rounded transition text-zinc-400">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                <div key={day} className="text-center text-[10px] text-zinc-600 font-bold p-1">{day}</div>
              ))}
              {getDaysInMonth().map((day, i) => {
                const availableSlots = day.isCurrentMonth && day.fullDate >= new Date() ? getAvailableSlots(day.fullDate) : [];
                const isSelected = selectedDate && day.fullDate.toDateString() === selectedDate.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => availableSlots.length > 0 && setSelectedDate(day.fullDate)}
                    disabled={!day.isCurrentMonth || availableSlots.length === 0}
                    className={`p-2 text-xs rounded-lg transition-all ${isSelected
                      ? 'bg-[var(--color-primary)] text-white font-bold shadow-lg'
                      : availableSlots.length > 0
                        ? 'hover:bg-white/10 text-white'
                        : 'text-zinc-700'
                      } ${!day.isCurrentMonth ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                    {day.date}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Available Times</label>
              <div className="grid grid-cols-3 gap-2">
                {getAvailableSlots(selectedDate).map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTime(slot)}
                    className={`p-2 text-[10px] font-bold rounded-lg border transition-all ${selectedTime && selectedTime.getTime() === slot.getTime()
                      ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                  >
                    {slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedTime && (
            <div className="border-t border-white/5 pt-6 space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Your Information</label>
              <input
                type="text"
                required
                placeholder="Name *"
                value={guestInfo.name}
                onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              />
              <input
                type="email"
                required
                placeholder="Email *"
                value={guestInfo.email}
                onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              />
              <textarea
                placeholder="Notes"
                value={guestInfo.notes}
                onChange={(e) => setGuestInfo({ ...guestInfo, notes: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                rows="3"
              />
              <button
                onClick={handleBooking}
                className="w-full bg-[var(--color-primary)] hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg transition-all uppercase tracking-widest text-xs"
              >
                Confirm Booking
              </button>
            </div>
          )}
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
    startTime: event?.startTime ? new Date(event.startTime).toISOString().slice(0, 16) : '',
    endTime: event?.endTime ? new Date(event.endTime).toISOString().slice(0, 16) : '',
    location: event?.location || '',
    locationType: event?.locationType || 'other',
    meetingUrl: event?.meetingUrl || '',
    allDay: event?.allDay || false,
    timezone: event?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [assistTarget, setAssistTarget] = useState('');
  const [assistError, setAssistError] = useState('');

  useEffect(() => {
    const handleEscape = (evt) => {
      if (evt.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const buildEventAssistText = (field) => {
    if (field === 'title') {
      const titleByType = {
        zoom: 'Strategy Review Meeting',
        google_meet: 'Working Session',
        phone: 'Phone Follow-Up',
        other: 'Client Meeting',
      };
      return titleByType[formData.locationType] || 'Client Meeting';
    }
    if (field === 'description') {
      return 'Objective: align on the next step.\nAgenda: review context, confirm blockers, and leave with one owner and one concrete action.\nPreparation: bring the latest notes and any open questions.';
    }
    if (field === 'location') {
      const valueByType = {
        phone: '+1 (555) 555-5555',
        other: 'Office address, room, or external meeting link',
      };
      return valueByType[formData.locationType] || formData.location || 'Meeting details';
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
          locationType: formData.locationType || 'other',
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
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString(),
    });
  };

  const generateMeetingLink = async (type) => {
    setGeneratingLink(true);
    try {
      let result;
      const eventInfo = {
        title: formData.title || 'Meeting',
        description: formData.description || '',
        startTime: formData.startTime,
        endTime: formData.endTime
      };
      if (type === 'zoom') {
        result = await generateZoomLink(eventInfo);
      } else if (type === 'google_meet') {
        result = await generateGoogleMeetLink(eventInfo);
      }
      if (result.success) {
        setFormData({
          ...formData,
          meetingUrl: result.meetingUrl,
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
      hour12: true
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-transparent">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
          {readOnly ? 'Event Signal' : event ? 'Edit Event' : 'Create Event'}
        </h3>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-[var(--color-text-secondary)] hover:text-white">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
        {(managedByBackend || event?.is_backend_artifact) && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Sync Pipeline: {event?.source_label || 'Comms'}</span>
                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${syncTone(event?.sync_status)}`}>
                  {event?.sync_status || 'synced'}
                </span>
              </div>
              {event?.sync_note && <p className="text-xs text-emerald-100/70">{event.sync_note}</p>}
            </div>

            {event?.conflict_state === 'review' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">Conflict Resolution Required</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSave({ ...formData, reconciliation_strategy: 'keep_local' })}
                    className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all"
                  >
                    Keep Local
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave({ ...formData, reconciliation_strategy: 'accept_import' })}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all"
                  >
                    Accept Import
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Meeting Status</label>
            <select
              value={formData.status || 'scheduled'}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all ${getStatusTone(formData.status || 'scheduled')}`}
            >
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Event Visibility</label>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-secondary)]">Public Booking</span>
              <div className={`w-2 h-2 rounded-full ${event?.public ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`}></div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Event Title *</label>
              {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('title')} loading={assistTarget === 'title'} tooltip="Draft event title" iconType="crosshair" />}
            </div>
            <input
              type="text"
              required
              value={formData.title}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              placeholder="Enter event title"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Description</label>
              {!readOnly && !clientMode && <AIAssistButton variant="inline" onAssist={() => applyEventAssist('description')} loading={assistTarget === 'description'} tooltip="Draft event description" iconType="crosshair" />}
            </div>
            <textarea
              value={formData.description}
              disabled={readOnly}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
              rows="3"
              placeholder="Add description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Start Time</label>
              <button
                type="button"
                onClick={() => { setShowStartPicker(!showStartPicker); setShowEndPicker(false); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left text-sm text-[var(--color-text-primary)] hover:border-white/20 transition-all flex items-center justify-between"
              >
                {formatDateForDisplay(formData.startTime)}
                <Clock size={14} className="opacity-40" />
              </button>
              {showStartPicker && (
                <MiniCalendar
                  selectedDate={formData.startTime}
                  onSelect={(date) => { setFormData({ ...formData, startTime: date }); setShowStartPicker(false); }}
                  onClose={() => setShowStartPicker(false)}
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">End Time</label>
              <button
                type="button"
                onClick={() => { setShowEndPicker(!showEndPicker); setShowStartPicker(false); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left text-sm text-[var(--color-text-primary)] hover:border-white/20 transition-all flex items-center justify-between"
              >
                {formatDateForDisplay(formData.endTime)}
                <Clock size={14} className="opacity-40" />
              </button>
              {showEndPicker && (
                <MiniCalendar
                  selectedDate={formData.endTime}
                  onSelect={(date) => { setFormData({ ...formData, endTime: date }); setShowEndPicker(false); }}
                  onClose={() => setShowEndPicker(false)}
                  position="right"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Guest Name</label>
              <input
                type="text"
                value={formData.guestName || ''}
                disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Guest Email</label>
              <input
                type="email"
                value={formData.guestEmail || ''}
                disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.allDay}
                disabled={readOnly}
                onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                className="rounded border-white/10 bg-white/5 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)] group-hover:text-white transition-colors">All Day Event</span>
            </label>
          </div>

          <div className="border-t border-white/5 pt-6 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] block mb-3">Location & Meeting Type</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { id: 'zoom', label: 'Zoom', icon: Video },
                  { id: 'google_meet', label: 'Meet', icon: Video },
                  { id: 'phone', label: 'Phone', icon: Phone },
                  { id: 'other', label: 'Other', icon: MapPin }
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setFormData({ ...formData, locationType: type.id })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${formData.locationType === type.id
                      ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                  >
                    <type.icon size={14} />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {formData.locationType === 'other' || formData.locationType === 'phone' ? (
              <div>
                <input
                  type="text"
                  value={formData.location}
                  disabled={readOnly}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                  placeholder={formData.locationType === 'phone' ? 'Enter phone number' : 'Enter location or address'}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={formData.meetingUrl}
                  disabled={readOnly}
                  onChange={(e) => setFormData({ ...formData, meetingUrl: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all text-sm"
                  placeholder="Meeting Link (generating URL...)"
                />
                {!readOnly && (
                  <button
                    type="button"
                    disabled={generatingLink}
                    onClick={() => generateMeetingLink(formData.locationType)}
                    className="flex items-center gap-2 text-xs font-bold text-[var(--color-primary)] hover:opacity-80 transition-all uppercase tracking-widest"
                  >
                    <RefreshCw size={12} className={generatingLink ? 'animate-spin' : ''} />
                    {generatingLink ? 'Syncing...' : 'Regenerate Link'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      <div className="p-6 border-t border-white/10 bg-black/20 flex gap-3">
        {!readOnly && (
          <button
            onClick={handleSubmit}
            className="flex-1 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-xl py-3 font-bold shadow-lg transition-all"
          >
            {event ? 'Update Event' : 'Create Event'}
          </button>
        )}
        <button
          onClick={onClose}
          className="px-6 bg-white/5 hover:bg-white/10 text-white rounded-xl py-3 font-medium transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default CalendarModule;
