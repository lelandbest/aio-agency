import React, { useState, useEffect } from 'react';
import { Filter, Download, ShoppingCart, Plus, Pencil, Trash2 } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import { draftAiApi, getOrdersApi, createOrderApi, updateOrderApi, deleteOrderApi } from '../../services/backendApi';

const OrdersModule = () => {
  const { openAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
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
        currentValue: '',
        context: { orderCount: data.length }
      });
      if (response?.suggestion) {
        console.log('AI suggestion:', response.suggestion);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateOrder = async () => {
    const contact = prompt('Contact ID or email:');
    if (!contact) return;
    try {
      await createOrderApi({ contactId: contact, totalAmount: 0, items: [] });
      fetchData('orders');
    } catch (err) {
      showNotice({ type: 'error', message: 'Failed to create order: ' + err.message });
    }
  };

  const handleDeleteOrder = async (orderId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this order?')) return;
    try {
      await deleteOrderApi(orderId);
      fetchData('orders');
    } catch (err) {
      showNotice({ type: 'error', message: 'Failed to delete order: ' + err.message });
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
        paymentStatus: o.payment_status === 'pending' ? 'Pending' : (o.payment_status || 'Paid'),
        fulfillmentStatus: o.status === 'active' ? 'Processing' : 'Shipped',
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
    <div className="h-full flex flex-col gap-4 relative overflow-hidden">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          {
            label: 'Orders',
            icon: ShoppingCart,
            onClick: () => setActiveTab('orders'),
            variant: activeTab === 'orders' ? 'primary' : 'secondary'
          },
          {
            label: 'Invoices',
            icon: null,
            onClick: () => {},
            variant: 'secondary',
            disabled: true,
            title: 'Disabled until backed by live data'
          },
          {
            label: 'Products',
            icon: null,
            onClick: () => {},
            variant: 'secondary',
            disabled: true,
            title: 'Disabled until backed by live data'
          },
          {
            label: 'Coupons',
            icon: null,
            onClick: () => {},
            variant: 'secondary',
            disabled: true,
            title: 'Disabled until backed by live data'
          }
        ]}
        actions={[
          {
            label: 'Create',
            icon: Plus,
            onClick: handleCreateOrder,
            variant: 'primary'
          },
          {
            label: 'Filter',
            icon: Filter,
            onClick: () => {},
            variant: 'secondary'
          },
          {
            label: 'Export',
            icon: Download,
            onClick: () => {},
            variant: 'secondary'
          }
        ]}
        showActions={true}
        hasSelection={false}
        onModuleAi={() => openAIAssist({ context: { module: 'orders', tab: activeTab } })}
      />
      <div className="flex-1 min-h-0 bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] shadow-island overflow-hidden p-2">
        <div className="h-full flex-1 overflow-auto p-4 relative">
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
                  <th className="p-4"></th>
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
                    <td className="p-4">
                      <button onClick={(e) => handleDeleteOrder(order.id, e)} className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="7" className="p-4 text-center text-gray-500">No orders found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default OrdersModule;
