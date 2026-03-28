/**
 * Node Config Drawer
 * Right-side drawer panel for configuring selected node
 * Slides in from right, token-first styling
 */

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getFormsApi } from '../../../services/backendApi';

const NodeConfigDrawer = ({ node, isOpen, onClose, onSave }) => {
  const [config, setConfig] = useState(node?.data?.config || {});
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);

  useEffect(() => {
    setConfig(node?.data?.config || {});
  }, [node]);

  useEffect(() => {
    if (isOpen && node?.data?.id === 'form-submitted-trigger') {
      loadForms();
    }
  }, [isOpen, node]);

  const loadForms = async () => {
    setLoadingForms(true);
    try {
      const data = await getFormsApi();
      setForms(data?.data || []);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoadingForms(false);
    }
  };

  if (!node || !isOpen) return null;

  const handleSave = () => {
    onSave?.(node.id, config);
    onClose();
  };

  const handleInputChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Render node-type-specific config UI
  const renderConfigForm = () => {
    const nodeType = node.type;

    if (nodeType === 'trigger') {
      const showFormSelect = config.event === 'form_submitted';
      
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Trigger Event
            </label>
            <select
              value={config.event || ''}
              onChange={(e) => handleInputChange('event', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="">Select event...</option>
              <option value="form_submitted">Form Submitted</option>
              <option value="contact_created">Contact Created</option>
              <option value="deal_updated">Deal Updated</option>
              <option value="scheduled">Scheduled Time</option>
              <option value="booking_created">Booking Created</option>
              <option value="booking_updated">Booking Updated</option>
              <option value="booking_cancelled">Booking Cancelled</option>
            </select>
          </div>

          {showFormSelect && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Select Form
              </label>
              {loadingForms ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" /> Loading forms...
                </div>
              ) : forms.length > 0 ? (
                <select
                  value={config.formId || ''}
                  onChange={(e) => handleInputChange('formId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Any form</option>
                  {forms.map(form => (
                    <option key={form.id} value={form.id}>{form.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)]">
                  No forms found. Create forms in the Forms module.
                </div>
              )}
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                Flow will trigger on form submission. Captured data available as variables.
              </p>
            </div>
          )}

          {config.event === 'form_submitted' && config.formId && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Captured Variables
              </label>
              <div className="p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] font-mono text-xs space-y-1">
                <div className="text-[var(--color-text-tertiary)]">// Available after form submission:</div>
                <div className="text-cyan-400">form.id</div>
                <div className="text-cyan-400">form.name</div>
                <div className="text-cyan-400">form.submittedAt</div>
                <div className="text-cyan-400">form.fields.<span className="text-amber-400">fieldName</span></div>
                <div className="text-[var(--color-text-tertiary)] mt-2">// Example: form.fields.email</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Description
            </label>
            <textarea
              value={config.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe trigger behavior..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[80px]"
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'action') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Action Type
            </label>
            <select
              value={config.actionType || ''}
              onChange={(e) => handleInputChange('actionType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select action...</option>
              <option value="send_email">Send Email</option>
              <option value="send_sms">Send SMS</option>
              <option value="store_data">Store Data</option>
              <option value="create_task">Create Task</option>
              <option value="create_booking">Create Booking</option>
              <option value="update_booking">Update Booking</option>
              <option value="cancel_booking">Cancel Booking</option>
              <option value="get_booking">Get Booking</option>
              <option value="generate_script">Generate Script</option>
              <option value="generate_run_of_show">Generate Run of Show</option>
              <option value="generate_voice">Generate Voice</option>
              <option value="text_to_speech">Text to Speech</option>
              <option value="generate_thumbnail">Generate Thumbnail</option>
              <option value="generate_video">Generate Video</option>
              <option value="transcribe_media">Transcribe Media</option>
              <option value="ingest_meeting_artifacts">Ingest Meeting Artifacts</option>
              <option value="publish_asset">Publish Asset</option>
            </select>
          </div>

          {config.actionType === 'generate_script' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.topic || ''}
                onChange={(e) => handleInputChange('topic', e.target.value)}
                placeholder="Topic"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.tone || ''}
                onChange={(e) => handleInputChange('tone', e.target.value)}
                placeholder="Tone"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.length || config.duration || ''}
                onChange={(e) => { handleInputChange('length', e.target.value); handleInputChange('duration', e.target.value); }}
                placeholder="Length"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.context || ''}
                onChange={(e) => handleInputChange('context', e.target.value)}
                placeholder="Context"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'generate_run_of_show' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.topic || ''}
                onChange={(e) => handleInputChange('topic', e.target.value)}
                placeholder="Topic"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.duration || ''}
                onChange={(e) => handleInputChange('duration', e.target.value)}
                placeholder="Duration"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.context || ''}
                onChange={(e) => handleInputChange('context', e.target.value)}
                placeholder="Production context"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'generate_voice' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.voice || ''}
                onChange={(e) => handleInputChange('voice', e.target.value)}
                placeholder="Voice"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.style || ''}
                onChange={(e) => handleInputChange('style', e.target.value)}
                placeholder="Style"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.text || config.scriptText || ''}
                onChange={(e) => handleInputChange('text', e.target.value)}
                placeholder="Text or script input"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
              />
            </div>
          )}

          {config.actionType === 'text_to_speech' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.voice || ''}
                onChange={(e) => handleInputChange('voice', e.target.value)}
                placeholder="Voice"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.style || ''}
                onChange={(e) => handleInputChange('style', e.target.value)}
                placeholder="Style"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.text || config.scriptText || ''}
                onChange={(e) => handleInputChange('text', e.target.value)}
                placeholder="Text or script input"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
              />
            </div>
          )}

          {config.actionType === 'generate_thumbnail' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Title"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.subtitle || ''}
                onChange={(e) => handleInputChange('subtitle', e.target.value)}
                placeholder="Subtitle"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.image || ''}
                onChange={(e) => handleInputChange('image', e.target.value)}
                placeholder="Background"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.prompt || ''}
                onChange={(e) => handleInputChange('prompt', e.target.value)}
                placeholder="Prompt"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'publish_asset' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.publishTarget || ''}
                onChange={(e) => handleInputChange('publishTarget', e.target.value)}
                placeholder="Publish Target"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.assetRef || ''}
                onChange={(e) => handleInputChange('assetRef', e.target.value)}
                placeholder="Asset Ref (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          )}

          {config.actionType === 'generate_video' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.templateId || ''}
                onChange={(e) => handleInputChange('templateId', e.target.value)}
                placeholder="Template ID"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.outputTarget || ''}
                onChange={(e) => handleInputChange('outputTarget', e.target.value)}
                placeholder="Output Target"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.script || ''}
                onChange={(e) => handleInputChange('script', e.target.value)}
                placeholder="Script or prompt"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'transcribe_media' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.sourceType || ''}
                onChange={(e) => handleInputChange('sourceType', e.target.value)}
                placeholder="Source Type"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.sourceRef || ''}
                onChange={(e) => handleInputChange('sourceRef', e.target.value)}
                placeholder="Source Ref"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.transcriptText || ''}
                onChange={(e) => handleInputChange('transcriptText', e.target.value)}
                placeholder="Transcript text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'ingest_meeting_artifacts' && (
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={config.meetingProvider || ''}
                onChange={(e) => handleInputChange('meetingProvider', e.target.value)}
                placeholder="Meeting Provider"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <input
                type="text"
                value={config.meetingRef || ''}
                onChange={(e) => handleInputChange('meetingRef', e.target.value)}
                placeholder="Meeting Ref"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={config.transcriptText || ''}
                onChange={(e) => handleInputChange('transcriptText', e.target.value)}
                placeholder="Transcript text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Configuration
            </label>
            <textarea
              value={config.configuration || ''}
              onChange={(e) => handleInputChange('configuration', e.target.value)}
              placeholder="Enter action configuration..."
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                min-h-[100px]
              `}
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'logic') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Logic Type
            </label>
            <select
              value={config.logicType || ''}
              onChange={(e) => handleInputChange('logicType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select logic...</option>
              <option value="if_then">If/Then Condition</option>
              <option value="switch">Switch/Branch</option>
              <option value="filter">Filter Data</option>
            </select>
          </div>
        </div>
      );
    }

    if (nodeType === 'input') {
      const isAiBuilder = node.data.id === 'ai-form-builder';
      const sourceMode = config.sourceMode || (config.existingFormId ? 'existing' : 'generate');
      
      return (
        <div className="space-y-4">
          {isAiBuilder && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Form Source
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleInputChange('sourceMode', 'generate')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${sourceMode === 'generate' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]'}`}
                >
                  Generate New
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('sourceMode', 'existing')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${sourceMode === 'existing' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]'}`}
                >
                  Use Existing
                </button>
              </div>
            </div>
          )}

          {isAiBuilder && sourceMode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Select Saved Form
              </label>
              {loadingForms ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" /> Loading forms...
                </div>
              ) : forms.length > 0 ? (
                <select
                  value={config.existingFormId || ''}
                  onChange={(e) => handleInputChange('existingFormId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Select a form...</option>
                  {forms.map(form => (
                    <option key={form.id} value={form.id}>{form.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)]">
                  No forms found. Switch to "Generate New" to create one.
                </div>
              )}
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                Selected form fields will be available as variables.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  {isAiBuilder ? 'AI Form Description' : 'Form Fields'}
                </label>
                <textarea
                  value={config.fields || config.prompt || ''}
                  onChange={(e) => handleInputChange(isAiBuilder ? 'prompt' : 'fields', e.target.value)}
                  placeholder={isAiBuilder ? 'Describe the form you want to create...' : 'Enter field definitions (JSON)...'}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
                />
              </div>
              
              {isAiBuilder && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                      Save Form As
                    </label>
                    <input
                      type="text"
                      value={config.formName || ''}
                      onChange={(e) => handleInputChange('formName', e.target.value)}
                      placeholder="My AI Generated Form"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                      Target Module
                    </label>
                    <select
                      value={config.targetModule || ''}
                      onChange={(e) => handleInputChange('targetModule', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                      <option value="">Select module...</option>
                      <option value="crm">CRM (Create Contact)</option>
                      <option value="pipeline">Pipeline (Create Deal)</option>
                      <option value="comms">Comms (Send Message)</option>
                      <option value="brain">Brain (Save to Memory)</option>
                    </select>
                  </div>
                </>
              )}
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Output Variable Name
            </label>
            <input
              type="text"
              value={config.outputVar || 'formData'}
              onChange={(e) => handleInputChange('outputVar', e.target.value)}
              placeholder="formData"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>
      );
    }

    if (node.data?.isSocket) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Workflow / Scenario ID or URL
            </label>
            <input
              type="text"
              value={config.workflowRef || ''}
              onChange={(e) => handleInputChange('workflowRef', e.target.value)}
              placeholder="workflow-id or https://..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Credential Reference
            </label>
            <input
              type="text"
              value={config.authRef || ''}
              onChange={(e) => handleInputChange('authRef', e.target.value)}
              placeholder="authRef"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Payload Mapping (JSON)
            </label>
            <textarea
              value={config.payloadMap || ''}
              onChange={(e) => handleInputChange('payloadMap', e.target.value)}
              placeholder='{"inputKey": "node.output"}'
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[80px] font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => handleInputChange('timeout', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Retry Count</label>
              <input
                type="number"
                value={config.retryCount || 1}
                onChange={(e) => handleInputChange('retryCount', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          General Configuration
        </label>
        <textarea
          value={config.general || ''}
          onChange={(e) => handleInputChange('general', e.target.value)}
          placeholder="Enter node configuration..."
          className={`
            w-full px-3 py-2 rounded-lg
            bg-[var(--color-bg-primary)] border border-[var(--color-border)]
            text-[var(--color-text-primary)]
            focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
            min-h-[120px]
          `}
        />
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] shadow-lg z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Configure {node.data.label}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderConfigForm()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium text-sm hover:bg-[var(--color-hover)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default NodeConfigDrawer;
