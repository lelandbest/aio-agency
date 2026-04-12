import React, { useState, useEffect } from 'react';
import { 
  Plus, Copy, Edit2, Trash2, Check, X, 
  Search, MoreHorizontal, AlertCircle, MessageSquare, ArrowRight
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';

const SEED_DATA = [
  {
    "shortcode": "/stat",
    "content": "Hi, I wanted to provide you with an update on the status of your issue. Unfortunately, our development team has not been able to resolve your problem yet, but please rest assured that we are actively working on finding a solution. We understand that this must be frustrating for you, and we sincerely apologize for any inconvenience this may have caused. We appreciate your patience and understanding while we work to resolve your issue. Our development team is dedicated to finding the root cause of the problem and implementing a fix as soon as possible. We will keep you updated throughout the process and provide you with an estimated timeline for resolution. Thank you for bringing this to our attention, and please don't hesitate to reach out if you have any further questions or concerns."
  },
  {
    "shortcode": "/det",
    "content": "Thank you for reaching out to us for support. We're here to help and we'll do our best to assist you. Please provide us with a detailed description of the issue you're facing and any relevant information that may help us better understand your situation. This could include: - A description of the problem - Account Email - Any relevant screenshots or other supporting materials The more information you can provide, the better we'll be able to assist you. Thank you for choosing our service."
  },
  {
    "shortcode": "/dev",
    "content": "Thank you for reaching out to us. I have reviewed your issue and it appears that it falls under the responsibility of our development team. I will forward your case to them for further review and action. Please allow some time for the team to investigate and resolve the issue. I will keep you updated on the progress. If you have any further questions or concerns, please don't hesitate to reach out to us."
  },
  {
    "shortcode": "/thank",
    "content": "Thank you for sharing details. I have received your request and I am looking into it."
  },
  {
    "shortcode": "/time",
    "content": "Please allow me some time to gather the necessary information and thoroughly review your case. I will do my best to find a resolution and get back to you as soon as possible with an update."
  },
  {
    "shortcode": "/update",
    "content": "I wanted to reach out and provide an update on the issue you reported. Our development team is currently working on it and we appreciate your patience while we resolve it. Please know that your satisfaction is our top priority and we are doing everything we can to resolve this as soon as possible. If you need anything further in the meantime, please do not hesitate to reach out. Thank you for your understanding and continued business."
  },
  {
    "shortcode": "/assure",
    "content": "Rest assured, your issue is important to us, and we will make sure to address it as soon as possible. We appreciate your patience and understanding as we work to provide the best possible service to all our customers."
  },
  {
    "shortcode": "/apology",
    "content": "Thank you for reaching out to us. We apologize for the delay in addressing your issue. Our development team is currently working on a new feature that requires their full attention and resources. If you have any further concerns or questions, please don't hesitate to let us know."
  },
  {
    "shortcode": "/hi",
    "content": "Hello there! You've reached Sales & Support. How can I help you today?"
  }
];

const STORAGE_KEY = 'aio_canned_responses';

const generateId = () => Math.random().toString(36).substr(2, 9);

const loadResponses = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load canned responses:', e);
  }
  return SEED_DATA.map(item => ({
    id: generateId(),
    shortcode: item.shortcode,
    content: item.content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
};

const saveResponses = (responses) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  } catch (e) {
    console.error('Failed to save canned responses:', e);
  }
};

const EditorModal = ({ response, onSave, onClose }) => {
  const [shortcode, setShortcode] = useState(response?.shortcode || '');
  const [content, setContent] = useState(response?.content || '');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!shortcode.trim()) {
      setError('Shortcode is required');
      return;
    }
    if (!shortcode.startsWith('/')) {
      setError('Shortcode must start with /');
      return;
    }
    if (!content.trim()) {
      setError('Content is required');
      return;
    }
    onSave({
      ...response,
      shortcode: shortcode.trim(),
      content: content.trim(),
      updatedAt: new Date().toISOString(),
      ...(response?.id ? {} : { id: generateId(), createdAt: new Date().toISOString() })
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div 
        className="relative w-full max-w-lg bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            {response?.id ? 'Edit Response' : 'New Response'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-hover)] rounded">
            <X size={16} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Shortcode</label>
            <input
              value={shortcode}
              onChange={(e) => { setShortcode(e.target.value); setError(''); }}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="/command"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Content</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              rows={6}
              className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="Enter response content..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition"
          >
            {response?.id ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DeleteConfirmModal = ({ response, onConfirm, onClose }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div 
        className="relative w-full max-w-sm bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Delete Response</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Delete <span className="font-mono text-[var(--color-primary)]">{response?.shortcode}</span>? This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const CannedResponsesModule = ({ onNavigate }) => {
  const [responses, setResponses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editorResponse, setEditorResponse] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleteResponse, setDeleteResponse] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    setResponses(loadResponses());
  }, []);

  const handleCopy = async (response) => {
    try {
      await navigator.clipboard.writeText(response.content);
      setCopiedId(response.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleEdit = (response) => {
    setEditorResponse(response);
    setShowEditor(true);
  };

  const handleCreate = () => {
    setEditorResponse(null);
    setShowEditor(true);
  };

  const handleSave = (response) => {
    let updated;
    if (response.id) {
      updated = responses.map(r => r.id === response.id ? response : r);
    } else {
      updated = [response, ...responses];
    }
    setResponses(updated);
    saveResponses(updated);
    setShowEditor(false);
    setEditorResponse(null);
  };

  const handleDeleteClick = (response) => {
    setDeleteResponse(response);
    setShowDelete(true);
  };

  const handleDeleteConfirm = () => {
    const updated = responses.filter(r => r.id !== deleteResponse.id);
    setResponses(updated);
    saveResponses(updated);
    setShowDelete(false);
    setDeleteResponse(null);
  };

  const filteredResponses = responses.filter(r =>
    r.shortcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="module-root-standard">
      <ModuleHeader
        showTitle={false}
        actions={[
          { label: 'New Response', icon: Plus, onClick: handleCreate, variant: 'primary' }
        ]}
        toolbarLeftSlot={(
          <div className="flex items-center gap-3">
            {onNavigate && (
              <button
                onClick={() => onNavigate('comms')}
                className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition"
                title="Back to Comms"
              >
                <ArrowRight size={16} className="rotate-180" />
              </button>
            )}
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
              <MessageSquare size={14} className="text-sky-400" />
              <span>Library</span>
            </div>
          </div>
        )}
        toolbarRightSlot={(
          <div className="relative w-48">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-xs focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        )}
      />

      <div className="module-content-stage module-surface-shell">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--color-bg-secondary)] z-10">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider w-40">ShortCode</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider">Content</th>
              <th className="px-6 py-3 text-right text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filteredResponses.map(response => (
              <tr key={response.id} className="hover:bg-[var(--color-hover)] group">
                <td className="px-6 py-4">
                  <code className="text-sm font-mono text-sky-400 bg-sky-500/10 px-2 py-1 rounded">
                    {response.shortcode}
                  </code>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {response.content}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleCopy(response)}
                      className={`p-2 rounded-lg transition ${copiedId === response.id ? 'bg-green-500/20 text-green-400' : 'hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}
                      title="Copy"
                    >
                      {copiedId === response.id ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                    <button
                      onClick={() => handleEdit(response)}
                      className="p-2 rounded-lg hover:bg-[var(--color-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(response)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--color-text-tertiary)] hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredResponses.length === 0 && (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-tertiary)]">
            <p className="text-sm">{searchQuery ? 'No matching responses' : 'No responses yet'}</p>
          </div>
        )}
      </div>
      </div>

      {showEditor && (
        <EditorModal
          response={editorResponse}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditorResponse(null); }}
        />
      )}

      {showDelete && deleteResponse && (
        <DeleteConfirmModal
          response={deleteResponse}
          onConfirm={handleDeleteConfirm}
          onClose={() => { setShowDelete(false); setDeleteResponse(null); }}
        />
      )}
    </div>
  );
};

export default CannedResponsesModule;
