import React, { useState, useEffect } from 'react';
import { Filter, Download, ShoppingCart } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import { draftAiApi, getOrdersApi } from '../../services/backendApi';

const OrdersModule = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const runOrdersAssist = async () => {
    try {
      const response = await draftAiApi({
        module: 'orders',
        surface: 'order-list',
        field: 'summary',
        intent: 'analyze',
        current_value: '',
        context: { orderCount: data.length }
      });
      if (response?.suggestion) {
        console.log('Orders insight:', response.suggestion);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData('orders');
  }, [activeTab]);

  const fetchData = async (table) => {
    setLoading(true);
    try {
      if (table !== 'orders') {
        setData([]);
        return;
      }
      const response = await getOrdersApi();
      const formatted = response.map(o => ({
        id: o.id.split('-').pop() || o.id,
        contact: o.contact_id || 'Unknown',
        payment_status: o.payment_status === 'pending' ? 'Pending' : (o.payment_status || 'Paid'),
        fulfillment_status: o.status === 'active' ? 'Processing' : 'Shipped',
        items: o.items?.length || 1,
        total: o.total_amount || 0,
        date: new Date(o.created_at).toLocaleDateString()
      }));
      setData(formatted);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col relative bg-[var(--color-bg-secondary)] rounded-xl overflow-hidden border border-[var(--color-border)]">
      <ModuleHeader
        showTitle={false}
        toolbarLeftSlot={(
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { key: 'orders', label: 'Orders', enabled: true },
              { key: 'invoices', label: 'Invoices Disabled', enabled: false },
              { key: 'products', label: 'Products Disabled', enabled: false },
              { key: 'coupons', label: 'Coupons Disabled', enabled: false },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => tab.enabled && setActiveTab(tab.key)}
                disabled={!tab.enabled}
                className={[
                  'shrink-0 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition',
                  activeTab === tab.key
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]'
                    : tab.enabled
                    ? 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)]'
                    : 'border-[var(--color-border)]/80 bg-[var(--color-bg-primary)]/55 text-[var(--color-text-secondary)] cursor-not-allowed opacity-100'
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        statusBadge={{
          label: activeTab.charAt(0).toUpperCase() + activeTab.slice(1),
          color: 'info'
        }}
        actions={[
          {
            label: 'Filter Disabled',
            icon: Filter,
            onClick: () => {},
            variant: 'secondary',
            className: '!text-[var(--color-text-secondary)] opacity-100'
          },
          {
            label: 'Export Disabled',
            icon: Download,
            onClick: () => {},
            variant: 'secondary',
            className: '!text-[var(--color-text-secondary)] opacity-100'
          }
        ]}
        showActions={true}
        aiAssistSlot={(
          <AIAssistButton
            onAssist={runOrdersAssist}
            tooltip="Analyze Orders"
            iconType="crosshair"
          />
        )}
      />
      <div className="flex-1 overflow-auto p-4 relative">
        {loading ? (
          <div className="text-center text-gray-500 mt-10">Loading Orders...</div>
        ) : activeTab !== 'orders' ? (
          <div className="text-center text-gray-500 mt-10">This surface is disabled until it is backed by live workspace data.</div>
        ) : (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-bg-primary)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-hover)] text-gray-400 text-xs uppercase font-bold tracking-wider">
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
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.length > 0 ? data.map(order => (
                  <tr key={order.id} className="hover:bg-[var(--color-hover)]/50 cursor-pointer transition">
                    <td className="p-4 font-mono text-[var(--color-accent)]">{order.id}</td>
                    <td className="p-4 font-medium text-[var(--color-text-primary)]">{order.contact}</td>
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
                    <td className="p-4 font-bold text-[var(--color-text-primary)]">${order.total || '0'}</td>
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
