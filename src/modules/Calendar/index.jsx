import React, { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';

const CalendarModule = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tableMap = { calendar: 'bookings', bookers: 'bookers', bookings: 'bookings' };
    fetchData(tableMap[activeTab]);
  }, [activeTab]);

  const fetchData = async (table) => {
    setLoading(true);
    const { data } = await mockSupabase.from(table).select();
    if (data) setData(data);
    setLoading(false);
  };

  const renderContent = () => {
    if (activeTab === 'calendar') {
      return (
        <div className="flex h-full">
          <div className="w-64 border-r border-[#27272A] p-4 hidden md:block">
            <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded text-sm mb-6">+ Create Event</button>
            <div className="space-y-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">My Calendars</div>
              <div className="space-y-2">
                {['Personal', 'Work', 'AIO Booking'].map(cal => (
                  <div key={cal} className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" defaultChecked className="rounded bg-[#18181B] border-gray-600 text-purple-600"/>
                    {cal}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 p-6">
            <div className="grid grid-cols-7 gap-px bg-[#27272A] border border-[#27272A] rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-[#18181B] p-2 text-center text-xs text-gray-500 font-medium uppercase">{day}</div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="bg-[#0F0F11] h-32 p-2 hover:bg-[#18181B] transition group relative">
                  <span className="text-xs text-gray-600">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (activeTab === 'bookers') {
      return (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button className="border-2 border-dashed border-[#27272A] rounded-xl flex flex-col items-center justify-center p-8 text-gray-500 hover:text-white hover:border-purple-500 transition gap-3 h-48">
            <div className="w-10 h-10 rounded-full bg-[#18181B] flex items-center justify-center">
              <Plus size={20}/>
            </div>
            <span className="font-medium">Create Meeting Type</span>
          </button>
          {data.map(booker => (
            <div key={booker.id} className="bg-[#18181B] border border-[#27272A] rounded-xl p-5 hover:border-purple-500/50 transition group flex flex-col h-48">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold text-white text-lg">{booker.name}</div>
                <div className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-[10px] border border-green-900">Active</div>
              </div>
              <div className="text-sm text-gray-400 mb-4">{booker.duration || 'N/A'}</div>
            </div>
          ))}
        </div>
      );
    }
    if (activeTab === 'bookings') {
      return (
        <div className="p-6">
          <div className="border border-[#27272A] rounded-lg overflow-hidden bg-[#18181B]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#27272A] text-gray-400 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-4">Meeting Title</th>
                  <th className="p-4">Guest</th>
                  <th className="p-4">Time</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {data.map(booking => (
                  <tr key={booking.id}>
                    <td className="p-4 text-white">{booking.title || 'N/A'}</td>
                    <td className="p-4 text-gray-400">{booking.guest || 'N/A'}</td>
                    <td className="p-4 text-gray-400">{booking.time || 'N/A'}</td>
                    <td className="p-4"><span className="px-2 py-1 rounded text-xs bg-green-900/20 text-green-400">Confirmed</span></td>
                    <td className="p-4 text-right text-gray-500">Edit</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-[#0F0F11] rounded-xl overflow-hidden border border-[#27272A]">
      <div className="border-b border-[#27272A] bg-[#050505]">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon size={20} className="text-blue-500" />
            <span className="capitalize">{activeTab}</span>
          </h2>
          {activeTab === 'calendar' && (
            <div className="flex gap-2">
              <button className="bg-[#27272A] text-gray-300 px-3 py-1.5 rounded text-xs">Day</button>
              <button className="bg-[#27272A] text-gray-300 px-3 py-1.5 rounded text-xs">Week</button>
              <button className="bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold">Month</button>
            </div>
          )}
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
      <div className="flex-1 overflow-auto relative">{renderContent()}</div>
    </div>
  );
};

export default CalendarModule;
