import React, { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Clock, MapPin, Trash2, Edit, Eye, Copy, ExternalLink } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';
import { generateZoomLink, generateGoogleMeetLink } from '../../services/videoCallService';

const CalendarModule = () => {
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

  const fetchData = async () => {
    setLoading(true);
    const { data: cals } = await mockSupabase.from('calendars').select();
    const { data: evts } = await mockSupabase.from('events').select();
    const { data: bookers } = await mockSupabase.from('booking_types').select();
    if (cals) setCalendars(cals);
    if (evts) setEvents(evts);
    if (bookers) setBookingTypes(bookers);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

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
      // Update
      await mockSupabase.from('events').update(eventData).eq('id', selectedEvent.id);
    } else {
      // Create
      await mockSupabase.from('events').insert({
        ...eventData,
        id: Date.now().toString(),
        calendar_id: calendars.find(c => c.is_default)?.id || calendars[0]?.id,
        status: 'scheduled'
      });
    }
    fetchData();
    setShowEventModal(false);
  };

  const handleDeleteEvent = async (eventId) => {
    await mockSupabase.from('events').delete().eq('id', eventId);
    fetchData();
    setShowEventModal(false);
  };

  const handleSaveBooker = async (bookerData) => {
    if (selectedBooker) {
      await mockSupabase.from('booking_types').update(bookerData).eq('id', selectedBooker.id);
    } else {
      await mockSupabase.from('booking_types').insert({
        ...bookerData,
        id: Date.now().toString(),
        user_id: '1',
        slug: bookerData.name.toLowerCase().replace(/\s+/g, '-'),
        is_active: true
      });
    }
    fetchData();
    setShowBookerModal(false);
  };

  const handleDeleteBooker = async (bookerId) => {
    await mockSupabase.from('booking_types').delete().eq('id', bookerId);
    fetchData();
    setShowBookerModal(false);
  };

  const handleGuestBooking = async (bookingData) => {
    await mockSupabase.from('events').insert({
      ...bookingData,
      id: Date.now().toString(),
      calendar_id: calendars.find(c => c.name === 'AIO Booking')?.id || calendars[0]?.id,
      status: 'scheduled'
    });
    fetchData();
    setShowBookingPage(false);
  };

  const handleStatusChange = async (eventId, newStatus) => {
    await mockSupabase.from('events').update({ status: newStatus }).eq('id', eventId);
    fetchData();
  };

  const renderCalendarView = () => {
    if (view === 'month') {
      const days = getDaysInMonth(currentDate);
      return (
        <div className="grid grid-cols-7 gap-px bg-[#27272A] border border-[#27272A] rounded-lg overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="bg-[#18181B] p-2 text-center text-xs text-gray-500 font-medium uppercase">
              {day}
            </div>
          ))}
          {days.map((day, i) => {
            const dayEvents = getEventsForDay(day.fullDate);
            const isToday = day.fullDate.toDateString() === new Date().toDateString();
            return (
              <div
                key={i}
                className={`bg-[#0F0F11] min-h-[120px] p-2 hover:bg-[#18181B] transition group relative ${
                  !day.isCurrentMonth ? 'opacity-40' : ''
                }`}
              >
                <div className={`text-xs mb-1 ${isToday ? 'bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold' : 'text-gray-600'}`}>
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
                        <div className="text-white font-medium truncate">{evt.title}</div>
                        <div className="text-gray-400 text-[10px]">
                          {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
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
        <div className="overflow-auto">
          <div className="min-w-[800px]">
            {/* Week header */}
            <div className="grid grid-cols-8 gap-px bg-[#27272A] border border-[#27272A] rounded-t-lg overflow-hidden">
              <div className="bg-[#18181B] p-2"></div>
              {weekDays.map((day, i) => {
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`bg-[#18181B] p-2 text-center ${isToday ? 'bg-purple-600/20' : ''}`}>
                    <div className="text-xs text-gray-500">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-purple-400' : 'text-white'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Time slots */}
            <div className="border border-t-0 border-[#27272A] rounded-b-lg overflow-hidden">
              {hours.map(hour => (
                <div key={hour} className="grid grid-cols-8 gap-px bg-[#27272A]">
                  <div className="bg-[#18181B] p-2 text-xs text-gray-500 text-right pr-3">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  {weekDays.map((day, i) => {
                    const dayEvents = getEventsForDay(day).filter(evt => {
                      const evtHour = new Date(evt.start_time).getHours();
                      return evtHour === hour;
                    });
                    return (
                      <div key={i} className="bg-[#0F0F11] p-1 min-h-[60px] hover:bg-[#18181B] transition relative">
                        {dayEvents.map(evt => {
                          const cal = calendars.find(c => c.id === evt.calendar_id);
                          return (
                            <div
                              key={evt.id}
                              onClick={() => handleEditEvent(evt)}
                              className="text-xs p-1 rounded cursor-pointer mb-1"
                              style={{ backgroundColor: cal?.color + '20', borderLeft: `3px solid ${cal?.color}` }}
                            >
                              <div className="text-white font-medium truncate">{evt.title}</div>
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
        <div className="border border-[#27272A] rounded-lg overflow-hidden">
          <div className="bg-[#18181B] p-4 border-b border-[#27272A] text-center">
            <div className="text-sm text-gray-500">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="text-2xl font-bold text-white">
              {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          
          <div className="overflow-auto max-h-[600px]">
            {hours.map(hour => {
              const hourEvents = dayEvents.filter(evt => {
                const evtHour = new Date(evt.start_time).getHours();
                return evtHour === hour;
              });
              
              return (
                <div key={hour} className="flex border-b border-[#27272A] hover:bg-[#18181B] transition">
                  <div className="w-24 p-3 text-xs text-gray-500 text-right border-r border-[#27272A]">
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
                            <div className="text-white font-medium">{evt.title}</div>
                            <div className="text-xs text-gray-400">
                              {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </div>
                          </div>
                          {evt.description && (
                            <div className="text-xs text-gray-400">{evt.description}</div>
                          )}
                          {evt.location && (
                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                              <MapPin size={10} />
                              {evt.location}
                            </div>
                          )}
                          {evt.meeting_url && (
                            <div className="text-xs text-blue-400 flex items-center gap-1 mt-1 hover:text-blue-300">
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
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 border-r border-[#27272A] p-4 hidden md:block">
            <button
              onClick={handleCreateEvent}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded text-sm mb-6"
            >
              + Create Event
            </button>
            <div className="space-y-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">My Calendars</div>
              <div className="space-y-2">
                {calendars.map(cal => (
                  <div key={cal.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={cal.is_visible}
                      onChange={() => toggleCalendar(cal.id)}
                      className="rounded bg-[#18181B] border-gray-600"
                      style={{ accentColor: cal.color }}
                    />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cal.color }}></div>
                    {cal.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Calendar */}
          <div className="flex-1 p-6 overflow-auto">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">
                  {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1 hover:bg-[#27272A] rounded text-sm text-gray-400 hover:text-white"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setView('day')}
                  className={`px-3 py-1.5 rounded text-xs ${view === 'day' ? 'bg-purple-600 text-white' : 'bg-[#27272A] text-gray-300'}`}
                >
                  Day
                </button>
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1.5 rounded text-xs ${view === 'week' ? 'bg-purple-600 text-white' : 'bg-[#27272A] text-gray-300'}`}
                >
                  Week
                </button>
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1.5 rounded text-xs ${view === 'month' ? 'bg-purple-600 text-white font-bold' : 'bg-[#27272A] text-gray-300'}`}
                >
                  Month
                </button>
              </div>
            </div>

            {renderCalendarView()}
          </div>
        </div>
      );
    }
    if (activeTab === 'bookers') {
      if (viewMode === 'card') {
        return (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <button 
              onClick={() => {
                setSelectedBooker(null);
                setShowBookerModal(true);
              }}
              className="border-2 border-dashed border-[#27272A] rounded-xl flex flex-col items-center justify-center p-8 text-gray-500 hover:text-white hover:border-purple-500 transition gap-3 h-48"
            >
              <div className="w-10 h-10 rounded-full bg-[#18181B] flex items-center justify-center">
                <Plus size={20}/>
              </div>
              <span className="font-medium">Create Meeting Type</span>
            </button>
            
            {bookingTypes.map(booker => (
              <div key={booker.id} className="bg-[#18181B] border border-[#27272A] rounded-xl p-5 hover:border-purple-500/50 transition group flex flex-col h-48">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-bold text-white text-lg mb-1">{booker.name}</div>
                    <div className="text-xs text-gray-400 mb-2">{booker.duration_minutes} min • {booker.location}</div>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] border ${
                    booker.is_active 
                      ? 'bg-green-900/30 text-green-400 border-green-900' 
                      : 'bg-gray-900/30 text-gray-400 border-gray-700'
                  }`}>
                    {booker.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                
                <div className="text-sm text-gray-400 mb-4 line-clamp-2 flex-1">
                  {booker.description}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedBookingType(booker);
                      setShowBookingPage(true);
                    }}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1"
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/book/${booker.slug}`);
                    }}
                    className="flex-1 px-3 py-1.5 bg-[#27272A] hover:bg-[#333] text-white rounded text-xs font-medium flex items-center justify-center gap-1"
                  >
                    <Copy size={12} />
                    Copy Link
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBooker(booker);
                      setShowBookerModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#27272A] hover:bg-[#333] text-white rounded text-xs"
                  >
                    <Edit size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      } else {
        // List view
        return (
          <div className="p-6">
            <div className="mb-4">
              <button 
                onClick={() => {
                  setSelectedBooker(null);
                  setShowBookerModal(true);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium flex items-center gap-2"
              >
                <Plus size={16}/>
                Create Meeting Type
              </button>
            </div>
            <div className="border border-[#27272A] rounded-lg overflow-hidden bg-[#18181B]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#27272A] text-gray-400 text-xs uppercase font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Duration</th>
                    <th className="p-4">Location</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {bookingTypes.map(booker => (
                    <tr key={booker.id} className="hover:bg-[#27272A]/20">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: booker.color }}></div>
                          <span className="text-white font-medium">{booker.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-400">{booker.duration_minutes} min</td>
                      <td className="p-4 text-gray-400">{booker.location}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          booker.is_active 
                            ? 'bg-green-900/30 text-green-400' 
                            : 'bg-gray-900/30 text-gray-400'
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
                            className="p-1 hover:bg-[#27272A] rounded text-blue-400 hover:text-blue-300"
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/book/${booker.slug}`);
                            }}
                            className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                            title="Copy Link"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBooker(booker);
                              setShowBookerModal(true);
                            }}
                            className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteBooker(booker.id)}
                            className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {bookingTypes.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500">
                        No meeting types yet
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
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(evt => {
              const cal = calendars.find(c => c.id === evt.calendar_id);
              const statusColors = {
                scheduled: 'bg-blue-900/20 text-blue-400 border-blue-900',
                confirmed: 'bg-green-900/20 text-green-400 border-green-900',
                cancelled: 'bg-red-900/20 text-red-400 border-red-900',
                completed: 'bg-gray-900/20 text-gray-400 border-gray-700',
                no_show: 'bg-orange-900/20 text-orange-400 border-orange-900'
              };
              return (
                <div key={evt.id} className="bg-[#18181B] border border-[#27272A] rounded-xl p-5 hover:border-purple-500/50 transition">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-white mb-1">{evt.title}</h3>
                      <div className="text-xs text-gray-400 mb-2">
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
                      className={`px-2 py-1 rounded text-xs bg-[#0F0F11] border ${statusColors[evt.status]}`}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="no_show">No Show</option>
                    </select>
                  </div>
                  
                  {evt.guest_name && (
                    <div className="text-sm text-gray-400 mb-2">
                      👤 {evt.guest_name}
                    </div>
                  )}
                  {evt.guest_email && (
                    <div className="text-sm text-gray-400 mb-2">
                      ✉️ {evt.guest_email}
                    </div>
                  )}
                  {evt.location && (
                    <div className="text-sm text-gray-400 mb-3 flex items-center gap-1">
                      <MapPin size={12} />
                      {evt.location}
                    </div>
                  )}
                  {evt.meeting_url && (
                    <a 
                      href={evt.meeting_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 mb-3 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                      Join Meeting
                    </a>
                  )}
                  
                  <div className="flex items-center justify-between pt-3 border-t border-[#27272A]">
                    <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: cal?.color + '20', color: cal?.color }}>
                      {cal?.name}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditEvent(evt)}
                        className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <div className="col-span-full p-8 text-center text-gray-500 bg-[#18181B] border border-[#27272A] rounded-lg">
                No bookings yet
              </div>
            )}
          </div>
        );
      } else {
        // List view
        return (
          <div className="p-6">
            <div className="border border-[#27272A] rounded-lg overflow-hidden bg-[#18181B]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#27272A] text-gray-400 text-xs uppercase font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Event Title</th>
                    <th className="p-4">Guest</th>
                    <th className="p-4">Time</th>
                    <th className="p-4">Calendar</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {events.map(evt => {
                    const cal = calendars.find(c => c.id === evt.calendar_id);
                    const statusColors = {
                      scheduled: 'bg-blue-900/20 text-blue-400',
                      confirmed: 'bg-green-900/20 text-green-400',
                      cancelled: 'bg-red-900/20 text-red-400',
                      completed: 'bg-gray-900/20 text-gray-400',
                      no_show: 'bg-orange-900/20 text-orange-400'
                    };
                    return (
                      <tr key={evt.id} className="hover:bg-[#27272A]/20">
                        <td className="p-4 text-white font-medium">{evt.title}</td>
                        <td className="p-4 text-gray-400">{evt.guest_name || evt.guest_email || '-'}</td>
                        <td className="p-4 text-gray-400">
                          {new Date(evt.start_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: cal?.color + '20', color: cal?.color }}>
                            {cal?.name}
                          </span>
                        </td>
                        <td className="p-4">
                          <select
                            value={evt.status}
                            onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                            className={`px-2 py-1 rounded text-xs bg-[#0F0F11] border border-[#27272A] ${statusColors[evt.status]}`}
                          >
                            <option value="scheduled">Scheduled</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="no_show">No Show</option>
                          </select>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditEvent(evt)}
                              className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-white"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(evt.id)}
                              className="p-1 hover:bg-[#27272A] rounded text-gray-400 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {events.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-gray-500">
                        No bookings yet
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
    <div className="h-full flex flex-col relative bg-[#0F0F11] rounded-xl overflow-hidden border border-[#27272A]">
      {/* Header */}
      <div className="border-b border-[#27272A] bg-[#050505]">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon size={20} className="text-blue-500" />
            <span className="capitalize">{activeTab}</span>
          </h2>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle for Bookers and Bookings */}
            {(activeTab === 'bookers' || activeTab === 'bookings') && (
              <div className="flex gap-1 bg-[#18181B] rounded p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded text-xs ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="List View"
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-1 rounded text-xs ${viewMode === 'card' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Card View"
                >
                  Card
                </button>
              </div>
            )}
            {/* Google Calendar Integration Link */}
            <button
              onClick={() => setShowIntegrationLink(true)}
              className="px-3 py-1.5 bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] text-gray-300 hover:text-white rounded text-xs font-medium flex items-center gap-1"
              title="Connect Google Calendar"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
              </svg>
              Sync Google
            </button>
            <button
              onClick={handleCreateEvent}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium md:hidden"
            >
              + Event
            </button>
          </div>
        </div>
        <div className="flex px-4 gap-6">
          {['calendar', 'bookers', 'bookings'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              className={`pb-3 text-sm font-medium border-b-2 transition capitalize ${activeTab === tab ? 'text-white border-purple-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading...</div>
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
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={() => setShowEventModal(false)}
        />
      )}

      {/* Booker Modal */}
      {showBookerModal && (
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-[#27272A] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Google Calendar Integration</h3>
              <button onClick={() => setShowIntegrationLink(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-400 text-sm">
                Connect your Google Calendar to sync events between AIO Agency and Google Calendar.
              </p>
              <div className="bg-[#0F0F11] border border-[#27272A] rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                    <path fill="#4285F4" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
                  </svg>
                  <div>
                    <div className="text-white font-bold">Google Calendar</div>
                    <div className="text-xs text-gray-500">Two-way sync</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Sync your events, manage multiple calendars, and never miss a booking.
                </p>
                <a
                  href="/integrations"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowIntegrationLink(false);
                    window.location.hash = '#/integrations';
                  }}
                  className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded text-center text-sm"
                >
                  Go to Integrations
                </a>
              </div>
              <div className="text-xs text-gray-500">
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
    color: booker?.color || '#3b82f6',
    buffer_before_minutes: booker?.buffer_before_minutes || 0,
    buffer_after_minutes: booker?.buffer_after_minutes || 0
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181B] border border-[#27272A] rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#27272A] flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">{booker ? 'Edit' : 'Create'} Meeting Type</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Meeting Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              placeholder="e.g., 30 Minute Meeting"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              rows="3"
              placeholder="Describe this meeting type"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Duration (minutes)</label>
              <input
                type="number"
                required
                min="15"
                step="15"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Color</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 bg-[#0F0F11] border border-[#27272A] rounded px-1 py-1 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Location Type</label>
            <select
              value={formData.location_type}
              onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="zoom">🎥 Zoom</option>
              <option value="google_meet">📹 Google Meet</option>
              <option value="phone">📞 Phone Call</option>
              <option value="other">🔗 Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Location Details</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
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
              <label className="block text-sm font-medium text-gray-400 mb-2">Buffer Before (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_before_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_before_minutes: parseInt(e.target.value) })}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Buffer After (min)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.buffer_after_minutes}
                onChange={(e) => setFormData({ ...formData, buffer_after_minutes: parseInt(e.target.value) })}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-[#27272A] flex justify-between">
          <div>
            {booker && (
              <button
                type="button"
                onClick={() => onDelete(booker.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2"
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
              className="px-4 py-2 bg-[#27272A] hover:bg-[#333] text-white rounded text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium"
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
    <div className="fixed inset-0 bg-[#0F0F11] z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{bookingType.name}</h1>
            <p className="text-gray-400">{bookingType.duration_minutes} minutes • {bookingType.location}</p>
            {bookingType.description && <p className="text-gray-500 mt-2">{bookingType.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-2">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-1 hover:bg-[#27272A] rounded text-gray-400">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-1 hover:bg-[#27272A] rounded text-gray-400">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                <div key={day} className="text-center text-xs text-gray-500 font-medium p-2">{day}</div>
              ))}
              {getDaysInMonth().map((day, i) => {
                const availableSlots = day.isCurrentMonth && day.fullDate >= new Date() ? getAvailableSlots(day.fullDate) : [];
                const isSelected = selectedDate && day.fullDate.toDateString() === selectedDate.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => availableSlots.length > 0 && setSelectedDate(day.fullDate)}
                    disabled={!day.isCurrentMonth || availableSlots.length === 0}
                    className={`p-2 text-sm rounded ${isSelected ? 'bg-purple-600 text-white' : availableSlots.length > 0 ? 'hover:bg-[#27272A] text-white cursor-pointer' : 'text-gray-600 cursor-not-allowed'} ${!day.isCurrentMonth ? 'opacity-40' : ''}`}
                  >
                    {day.date}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            {selectedDate && (
              <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-6">
                <h3 className="font-bold text-white mb-4">Available Times - {selectedDate.toLocaleDateString()}</h3>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {getAvailableSlots(selectedDate).map((slot, i) => (
                    <button key={i} onClick={() => setSelectedTime(slot)} className={`p-2 text-sm rounded ${selectedTime && selectedTime.getTime() === slot.getTime() ? 'bg-purple-600 text-white' : 'bg-[#27272A] hover:bg-[#333] text-gray-300'}`}>
                      {slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTime && (
              <form onSubmit={handleBooking} className="bg-[#18181B] border border-[#27272A] rounded-lg p-6 space-y-4">
                <h3 className="font-bold text-white mb-4">Your Information</h3>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Name *</label>
                  <input type="text" required value={guestInfo.name} onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })} className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email *</label>
                  <input type="email" required value={guestInfo.email} onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })} className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Phone</label>
                  <input type="tel" value={guestInfo.phone} onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })} className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Notes</label>
                  <textarea value={guestInfo.notes} onChange={(e) => setGuestInfo({ ...guestInfo, notes: e.target.value })} className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none" rows="3" />
                </div>
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded">Confirm Booking</button>
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
    <div className={`absolute top-full ${positionClasses} mt-1 bg-[#18181B] border border-[#27272A] rounded-lg shadow-xl z-50 p-4 w-80`}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-white text-sm">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h4>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-1 hover:bg-[#27272A] rounded text-gray-400"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-1 hover:bg-[#27272A] rounded text-gray-400"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
          <div key={day} className="text-center text-xs text-gray-500 font-medium">{day}</div>
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
              className={`p-2 text-xs rounded ${
                isSelected
                  ? 'bg-purple-600 text-white font-bold'
                  : isToday
                  ? 'bg-blue-600/30 text-blue-400 font-bold'
                  : day.isCurrentMonth
                  ? 'hover:bg-[#27272A] text-white'
                  : 'text-gray-600'
              }`}
            >
              {day.date}
            </button>
          );
        })}
      </div>
      
      <div className="border-t border-[#27272A] pt-3">
        <label className="block text-xs text-gray-400 mb-2 font-medium">Time</label>
        <div className="flex items-center gap-2">
          <select
            value={selectedTime.hour}
            onChange={(e) => handleTimeChange('hour', parseInt(e.target.value))}
            className="flex-1 bg-[#0F0F11] border border-[#27272A] rounded px-2 py-2 text-white text-center text-sm focus:border-purple-500 focus:outline-none"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
            ))}
          </select>
          <span className="text-gray-400">:</span>
          <select
            value={selectedTime.minute}
            onChange={(e) => handleTimeChange('minute', parseInt(e.target.value))}
            className="flex-1 bg-[#0F0F11] border border-[#27272A] rounded px-2 py-2 text-white text-center text-sm focus:border-purple-500 focus:outline-none"
          >
            {[0, 15, 30, 45].map(min => (
              <option key={min} value={min}>{String(min).padStart(2, '0')}</option>
            ))}
          </select>
          <select
            value={selectedTime.period}
            onChange={(e) => handleTimeChange('period', e.target.value)}
            className="flex-1 bg-[#0F0F11] border border-[#27272A] rounded px-2 py-2 text-white text-center text-sm focus:border-purple-500 focus:outline-none"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
      
      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 rounded font-medium"
      >
        Done
      </button>
    </div>
  );
};

// Event Modal Component
const EventModal = ({ event, calendars, onSave, onDelete, onClose }) => {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#18181B] border border-[#27272A] rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#27272A] flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">{event ? 'Edit Event' : 'Create Event'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Event Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              placeholder="Enter event title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              rows="3"
              placeholder="Add description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Clock size={14} className="inline mr-1" />
                Start Time *
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowStartPicker(!showStartPicker);
                  setShowEndPicker(false);
                }}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-left text-sm text-white hover:border-purple-500"
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
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Clock size={14} className="inline mr-1" />
                End Time *
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowEndPicker(!showEndPicker);
                  setShowStartPicker(false);
                }}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-left text-sm text-white hover:border-purple-500"
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
            <label className="block text-sm font-medium text-gray-400 mb-2">Timezone</label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
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
              onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })}
              className="rounded bg-[#0F0F11] border-gray-600"
            />
            <label htmlFor="all-day" className="text-sm text-gray-400">All day event</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Meeting Location</label>
            <select
              value={formData.location_type}
              onChange={(e) => setFormData({ ...formData, location_type: e.target.value, meeting_url: '' })}
              className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="zoom">🎥 Zoom</option>
              <option value="google_meet">📹 Google Meet</option>
              <option value="phone">📞 Phone Call</option>
              <option value="other">🔗 Other</option>
            </select>
          </div>

          {(formData.location_type === 'zoom' || formData.location_type === 'google_meet') && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Video Call Link</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.meeting_url}
                  onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                  className="flex-1 bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none text-sm"
                  placeholder="Meeting link will be generated"
                  readOnly={generatingLink}
                />
                <button
                  type="button"
                  onClick={() => generateMeetingLink(formData.location_type)}
                  disabled={generatingLink}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm font-medium whitespace-nowrap"
                >
                  {generatingLink ? '...' : 'Generate'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formData.location_type === 'zoom' ? '🎥 Zoom' : '📹 Google Meet'} link will be created automatically
              </p>
            </div>
          )}

          {formData.location_type === 'phone' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <MapPin size={14} className="inline mr-1" />
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                placeholder="Enter phone number"
              />
            </div>
          )}

          {formData.location_type === 'other' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <MapPin size={14} className="inline mr-1" />
                Location (Address, Link, or Details)
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                placeholder="Enter address, link, or details"
              />
            </div>
          )}

          {formData.meeting_url && (
            <div className="bg-green-900/20 border border-green-900 rounded p-3">
              <div className="text-xs text-green-400 mb-1 font-medium">Meeting Link Generated</div>
              <div className="text-xs text-gray-300 break-all">{formData.meeting_url}</div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(formData.meeting_url);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 mt-2 flex items-center gap-1"
              >
                <Copy size={12} /> Copy Link
              </button>
            </div>
          )}
        </form>

        <div className="p-4 border-t border-[#27272A] flex justify-between">
          <div>
            {event && (
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium flex items-center gap-2"
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
              className="px-4 py-2 bg-[#27272A] hover:bg-[#333] text-white rounded text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium"
            >
              {event ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarModule;
