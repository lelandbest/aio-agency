import React, { useState } from 'react';
import { X } from 'lucide-react';
import { createHelpTicketApi } from '../services/backendApi';

const TicketModal = ({ isOpen, onClose }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    const formData = new FormData(e.target);
    const payload = {
      subject: formData.get('subject'),
      content: formData.get('content'),
      priority: formData.get('priority'),
      category: formData.get('category')
    };

    try {
      await createHelpTicketApi(payload);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Failed to submit ticket:', err);
      setError('Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      <div 
        className="overlay-scrim absolute inset-0 bg-[var(--surface-overlay-bg)] backdrop-blur-md" 
        onClick={onClose} 
      />
      
      <div className="modal-surface relative flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden rounded-[var(--radius-modal)] bg-[var(--color-bg-secondary)] border border-[var(--surface-border-strong)] shadow-floating">
        <div className="p-6 sm:p-8 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/40">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] uppercase tracking-tighter">Submit a Ticket</h2>
              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-[0.2em] mt-1">Direct Support Protocol</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {success ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-8 h-8">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[var(--color-text-primary)]">Ticket Received</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">Your request has been routed to the appropriate agent.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 sm:space-y-6 overflow-auto no-scrollbar">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest ml-1">Subject</label>
              <input
                name="subject"
                required
                autoFocus
                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-bg-primary)] outline-none transition-all font-medium"
                placeholder="What can we help you with?"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest ml-1">Category</label>
                <select
                  name="category"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-bg-primary)] outline-none transition-all font-medium appearance-none cursor-pointer"
                >
                  <option value="general">General Support</option>
                  <option value="technical">Technical Issue</option>
                  <option value="billing">Billing/Account</option>
                  <option value="feature">Feature Request</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest ml-1">Priority</label>
                <select
                  name="priority"
                  defaultValue="normal"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-bg-primary)] outline-none transition-all font-medium appearance-none cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest ml-1">Description</label>
              <textarea
                name="content"
                required
                rows={4}
                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-bg-primary)] outline-none transition-all font-medium resize-none"
                placeholder="Please provide as much detail as possible..."
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-sky-600 text-white font-black uppercase tracking-widest shadow-xl shadow-[var(--color-primary)]/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {submitting ? 'Transmitting...' : 'Send Request'}
              </button>
              <p className="text-[9px] font-bold text-[var(--color-text-tertiary)] text-center mt-6 uppercase tracking-widest leading-relaxed">
                Your request will be analyzed instantly and provide <br className="hidden sm:block"/> specialized triage recommendations.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TicketModal;
