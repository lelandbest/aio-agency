import React, { useState, useEffect } from 'react';
import { X, Link, Code, Zap, Copy, Check, ExternalLink } from 'lucide-react';

const ShareFormModal = ({ form, onClose }) => {
  const [activeTab, setActiveTab] = useState('link');
  const [copied, setCopied] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.example.com';
  const publicUrl = `${origin}/form/${form?.slug || form?.id}`;
  const embedCode = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0"></iframe>`;

  const apiEndpoint = `${origin}/api/forms/${form?.id}/submit`;
  const apiExample = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      field_name: 'value',
      email: 'user@example.com'
    })
  };

  useEffect(() => {
    const handleEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const copyToClipboard = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!form) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div 
        className="relative w-full max-w-2xl bg-[var(--color-bg-primary)] rounded-[var(--radius-panel)] border border-[var(--color-border)] shadow-island overflow-hidden animate-in zoom-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Share Form</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{form.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition">
            <X size={20} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        <div className="flex border-b border-[var(--color-border)]">
          {[
            { id: 'link', label: 'Share Link', icon: Link },
            { id: 'embed', label: 'Embed Code', icon: Code },
            { id: 'api', label: 'API Connection', icon: Zap }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'link' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Public URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] shadow-island-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(publicUrl, 'link')}
                    className="px-4 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-[var(--radius-card)] transition flex items-center gap-2 shadow-island-sm active:scale-95"
                  >
                    {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
                      {copied === 'link' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] rounded-[var(--radius-card)] text-sm transition shadow-island-sm"
                >
                  <ExternalLink size={14} />
                  Open in New Tab
                </a>
              </div>
            </div>
          )}

          {activeTab === 'embed' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">iFrame Embed Code</label>
                <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4">
                  <pre className="text-xs text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap font-mono">
                    {embedCode}
                  </pre>
                </div>
                <button
                  onClick={() => copyToClipboard(embedCode, 'embed')}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-[var(--radius-card)] transition text-sm shadow-island-sm active:scale-95"
                >
                  {copied === 'embed' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'embed' ? 'Copied' : 'Copy Embed Code'}
                </button>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-[var(--radius-card)] p-3 shadow-island-sm">
                <p className="text-xs text-amber-200">
                  <strong>Tip:</strong> Adjust the width and height attributes to fit your website layout.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">API Endpoint</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={apiEndpoint}
                    className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] font-mono shadow-island-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(apiEndpoint, 'api')}
                    className="px-4 py-2.5 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-[var(--radius-card)] transition flex items-center gap-2 shadow-island-sm active:scale-95"
                  >
                    {copied === 'api' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Request Example</label>
                <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 shadow-island-sm">
                  <pre className="text-xs text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap font-mono">
                    {JSON.stringify(apiExample, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Form Fields</label>
                <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
                  {(form.schema || []).map((field) => (
                    <div key={field.id} className="flex items-center justify-between text-xs">
                      <code className="text-[var(--color-primary)]">{field.name}</code>
                      <span className="text-[var(--color-text-tertiary)]">{field.type}</span>
                    </div>
                  ))}
                  {(!form.schema || form.schema.length === 0) && (
                    <p className="text-xs text-[var(--color-text-tertiary)] italic">No fields defined yet</p>
                  )}
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-[var(--radius-card)] p-3 shadow-island-sm">
                <p className="text-xs text-blue-200">
                  <strong>System Variables:</strong> Submit form data via POST with JSON body matching field names.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareFormModal;
