const DEFAULT_NOTE_STYLE = {
  color: 'rgba(15, 23, 42, 0.94)',
  borderColor: 'rgba(71, 85, 105, 0.55)',
  textColor: '#e2e8f0',
  width: 228,
  height: 148,
};

const getActionSummary = (node) => {
  const label = node?.data?.label || node?.label || 'This step';
  const description = node?.data?.description || '';
  const config = node?.data?.config || {};
  const actionType = String(config.actionType || '').trim();
  const event = String(config.event || '').trim();
  const logicType = String(config.logicType || '').trim();

  if (node?.type === 'trigger') {
    if (event === 'form_submitted') {
      return `Starts when a form submission arrives.\nExpected payload: submitted field values, form metadata, and contact context when available.`;
    }
    if (event === 'booking_created' || event === 'booking_updated' || event === 'booking_cancelled') {
      return `Starts from a booking event.\nExpected payload: booking id, timing, attendee details, and booking status context.`;
    }
    if (String(label).toLowerCase().includes('webhook')) {
      return `Starts from an inbound webhook.\nExpected payload: request body, headers, query parameters, and source metadata.`;
    }
    return `Starts the workflow.\nExpected payload: trigger context and any upstream event fields available at run time.`;
  }

  if (node?.type === 'logic') {
    if (logicType === 'wait_for_verification') {
      return `Pauses execution until a verification task resolves.\nExpected payload: verification task id, timeout settings, and polling interval.`;
    }
    if (logicType === 'verification_branch') {
      return `Routes the workflow by verification result.\nExpected payload: upstream verification outcome such as valid, risky, invalid, or unknown.`;
    }
    return `${label} controls flow routing.\nExpected payload: upstream fields plus the condition, filter, or delay settings configured on this node.`;
  }

  if (node?.type === 'webhook') {
    if (String(label).toLowerCase().includes('http request')) {
      return `Calls an external endpoint.\nExpected payload: URL, method, headers, and request body built from upstream node output.`;
    }
    return `Receives or bridges external webhook traffic.\nExpected payload: webhook body, headers, query params, and source metadata.`;
  }

  switch (actionType) {
    case 'send_email':
      return `Sends an email action.\nExpected payload: recipient address, subject, body content, and owner or sender context.`;
    case 'send_sms':
      return `Sends an SMS action.\nExpected payload: destination number, message body, and any personalization fields from upstream data.`;
    case 'generate_script':
      return `Creates script content from the incoming topic and context.\nExpected payload: topic, tone, duration, and supporting source material.`;
    case 'generate_run_of_show':
      return `Builds a structured run-of-show artifact.\nExpected payload: episode topic, segment timing, and production context.`;
    case 'generate_voice':
    case 'text_to_speech':
      return `Renders audio from text or script input.\nExpected payload: script text, selected voice, provider settings, and render options.`;
    case 'generate_thumbnail':
      return `Creates a thumbnail image asset.\nExpected payload: title, subtitle, prompt context, and any brand or visual direction.`;
    case 'generate_video':
      return `Creates a video render job.\nExpected payload: template id, output target, script or prompt content, and media options.`;
    case 'transcribe_media':
      return `Creates a transcription job for source media.\nExpected payload: media source reference, provider options, diarization, and timestamp settings.`;
    case 'generate_transcript_intelligence':
      return `Builds structured intelligence from transcript content.\nExpected payload: transcript text, media references, highlights, action items, and summary context.`;
    case 'ingest_meeting_artifacts':
      return `Normalizes meeting artifacts into the media pipeline.\nExpected payload: provider id, meeting reference, transcript or recording metadata, and destination target.`;
    case 'publish_asset':
      return `Publishes or records the final media asset.\nExpected payload: asset reference, publish target, and any release metadata required downstream.`;
    default:
      return `${label} executes a workflow step.\n${description ? `Intent: ${description}` : 'Review this node configuration for the exact payload contract and output behavior.'}`;
  }
};

export const createDocumentationNoteNodes = (nodes = []) => {
  return nodes
    .filter((node) => node && node.type !== 'note' && node.type !== 'frame')
    .map((node, index) => {
      const width = DEFAULT_NOTE_STYLE.width;
      const height = DEFAULT_NOTE_STYLE.height;
      return {
        id: `doc-note-${node.id}-${index}`,
        type: 'note',
        position: {
          x: (node.position?.x || 0) - Math.round((width - 72) / 2),
          y: (node.position?.y || 0) + 110,
        },
        data: {
          label: `${node.data?.label || node.label || 'Flow Step'} Notes`,
          note: getActionSummary(node),
          sourceNodeId: node.id,
          color: DEFAULT_NOTE_STYLE.color,
          borderColor: DEFAULT_NOTE_STYLE.borderColor,
          textColor: DEFAULT_NOTE_STYLE.textColor,
          width,
          height,
        },
        style: {
          zIndex: -1,
          width,
          height,
        },
      };
    });
};

export const getDefaultNoteStyle = () => ({ ...DEFAULT_NOTE_STYLE });
