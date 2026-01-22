import React, { useState, useEffect } from 'react';
import { Filter, Download, ShoppingCart } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';

const OrdersModule = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData('orders');
  }, [activeTab]);

  const fetchData = async (table) => {
    setLoading(true);
    const { data } = await mockSupabase.from(table).select();
    if (data) setData(data);
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col relative bg-[#0F0F11] rounded-xl overflow-hidden border border-[#27272A]">
      <div className="border-b border-[#27272A] bg-[#050505]">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingCart size={20} className="text-green-500" />
            <span className="capitalize">{activeTab}</span>
          </h2>
          <div className="flex gap-2">
            <button className="bg-[#27272A] hover:bg-[#333] text-white px-3 py-1.5 rounded text-sm flex items-center gap-2">
              <Filter size={14}/> Filter
            </button>
            <button className="bg-[#27272A] hover:bg-[#333] text-white px-3 py-1.5 rounded text-sm flex items-center gap-2">
              <Download size={14}/> Export
            </button>
          </div>
        </div>
        <div className="flex px-4 gap-6">
          {['orders', 'invoices', 'products', 'coupons'].map(tab => (
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
      <div className="flex-1 overflow-auto p-4 relative">
        {loading ? (
          <div className="text-center text-gray-500 mt-10">Loading Orders...</div>
        ) : (
          <div className="border border-[#27272A] rounded-lg overflow-hidden bg-[#18181B]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#27272A] text-gray-400 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Fulfillment</th>
                  <th className="p-4">Items</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {data.length > 0 ? data.map(order => (
                  <tr key={order.id} className="hover:bg-[#27272A]/50 cursor-pointer transition">
                    <td className="p-4 font-mono text-purple-400">{order.id}</td>
                    <td className="p-4 font-medium text-white">{order.contact}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${order.payment_status === 'Paid' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${order.fulfillment_status === 'Shipped' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                        {order.fulfillment_status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400">{order.items || '-'}</td>
                    <td className="p-4 font-bold text-white">${order.total || '0'}</td>
                    <td className="p-4 text-gray-500 text-xs">{order.date || 'N/A'}</td>
                  </tr>
                )) : <tr><td colSpan="7" className="p-4 text-center text-gray-500">No orders found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersModule;
