import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';
import { formTemplateCategories, formTemplates } from './formTemplates';

const complexityTone = {
  Basic: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  Intermediate: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  Advanced: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
};

const FormTemplateGallery = ({ isOpen, onClose, onSelectTemplate }) => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(formTemplates[0]?.id || null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredTemplates = useMemo(() => {
    return formTemplates.filter((template) => {
      const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSubmitting(false);
      return;
    }
    if (!filteredTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0]?.id || null);
    }
  }, [filteredTemplates, isOpen, selectedTemplateId]);

  if (!isOpen) {
    return null;
  }

  const previewTemplate = filteredTemplates.find((template) => template.id === selectedTemplateId) || filteredTemplates[0] || null;

  const handleUseTemplate = async () => {
    if (!previewTemplate) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSelectTemplate?.(previewTemplate);
      onClose?.();
    } catch (selectError) {
      setError(selectError.message || 'Unable to create form from template.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 p-4 pt-16 backdrop-blur-md">
      <div className="mt-16 flex max-h-[calc(100vh-8rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Layers size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Form Template Library</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Start from a template or build from scratch.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {formTemplateCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                    selectedCategory === category
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="no-scrollbar w-1/2 min-w-0 overflow-y-auto border-r border-[var(--color-border)] px-4 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const selected = template.id === previewTemplate?.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_0_1px_var(--color-primary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                          {template.category}
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">{template.name}</h3>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{template.description}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                      <span>{template.fields.length} fields</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${complexityTone[template.complexity] || 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]'}`}>
                        {template.complexity}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="flex h-full min-h-[260px] items-center justify-center">
                <div className="text-center">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">No templates match this filter</div>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Clear the search or choose another category.</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="no-scrollbar min-h-0 w-1/2 overflow-y-auto bg-[var(--color-bg-secondary)] px-5 py-5">
            {previewTemplate ? (
              <>
                <div className="relative">
                  <div className="absolute right-0 top-0 flex flex-wrap justify-end gap-1.5">
                    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                      {previewTemplate.category}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${complexityTone[previewTemplate.complexity] || 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]'}`}>
                      {previewTemplate.complexity}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pr-20">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{previewTemplate.name}</h3>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{previewTemplate.description}</p>

                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Fields ({previewTemplate.fields.length})</div>
                  <div className="mt-3 space-y-2">
                    {previewTemplate.fields.map((field, index) => (
                      <div key={`${previewTemplate.id}-${field.label}-${index}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                        <div className="text-xs font-medium text-[var(--color-text-primary)]">{field.label}</div>
                        <div className="text-[10px] text-[var(--color-text-tertiary)]">{field.type}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {error ? (
                  <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={handleUseTemplate}
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Creating Form...' : 'Use Template'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
                Select a template
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormTemplateGallery;
