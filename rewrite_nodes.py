import sys

with open(r'd:\AIOCRM\frontend\src\modules\Flows\data\nodeLibrary.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('export const utilityNodes = [')
end_idx = content.find('];\n\n/**\n * Socket Nodes', start_idx)
if end_idx != -1:
    end_idx += 2

utility_new = """export const dataNodes = [
  {
    id: 'store-data',
    type: 'action',
    label: 'Store Data',
    description: 'Save data to storage',
    iconName: 'Database',
    nodeColor: 'action',
  },
  {
    id: 'set-variable',
    type: 'action',
    label: 'Set Variable',
    description: 'Write or update variable',
    iconName: 'Settings',
    nodeColor: 'action',
  },
];

/**
 * Input Nodes
 */
export const inputNodes = [
  {
    id: 'user-input',
    type: 'input',
    label: 'Attach Form',
    description: 'Collect input via an existing form',
    iconName: 'PenLine',
    nodeColor: 'input',
    actionType: 'INPUT_REQUIRED',
    config: {
      actionType: 'INPUT_REQUIRED',
      formId: '',
      message: 'Please complete this form to continue.',
    },
  },
  {
    id: 'ai-form-builder',
    type: 'input',
    label: 'Generate Form (AI)',
    description: 'Pause flow and generate form with AI',
    iconName: 'Bot',
    nodeColor: 'input',
    actionType: 'INPUT_REQUIRED',
    config: {
      actionType: 'INPUT_REQUIRED',
      useAi: true,
      prompt: '',
    },
  },
];

/**
 * Booking Nodes
 */
export const bookingNodes = [
  {
    id: 'create-booking',
    type: 'action',
    label: 'Create Booking',
    description: 'Create a calendar booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'create_booking',
  },
  {
    id: 'update-booking',
    type: 'action',
    label: 'Update Booking',
    description: 'Update an existing booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'update_booking',
  },
  {
    id: 'cancel-booking',
    type: 'action',
    label: 'Cancel Booking',
    description: 'Cancel an existing booking',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'cancel_booking',
  },
  {
    id: 'get-booking',
    type: 'action',
    label: 'Get Booking',
    description: 'Fetch booking details',
    iconName: 'Calendar',
    nodeColor: 'action',
    actionType: 'get_booking',
  },
];

/**
 * Verification Nodes
 */
export const verificationNodes = [
  {
    id: 'verify-email',
    type: 'action',
    label: 'Verify Email',
    description: 'Verify a single email or contact email',
    iconName: 'Shield',
    nodeColor: 'action',
    actionType: 'verify_email',
    config: {
      actionType: 'verify_email',
      mode: 'quick',
      writeback: true,
    },
  },
  {
    id: 'verify-email-bulk',
    type: 'action',
    label: 'Verify Email Bulk',
    description: 'Submit async bulk email verification',
    iconName: 'Shield',
    nodeColor: 'action',
    actionType: 'verify_email_bulk',
    config: {
      actionType: 'verify_email_bulk',
      mode: 'power',
      writeback: true,
    },
  },
];

/**
 * Media Nodes
 */
export const mediaNodes = [
  {
    id: 'generate-script',
    type: 'action',
    label: 'Generate Script',
    description: 'Create a script job and structured script artifact',
    iconName: 'FileText',
    nodeColor: 'media',
    actionType: 'generate_script',
    config: {
      actionType: 'generate_script',
      topic: '',
      tone: 'clear',
      duration: '10 minutes',
      provider: 'stub-script',
    },
  },
  {
    id: 'generate-run-of-show',
    type: 'action',
    label: 'Generate Run of Show',
    description: 'Create a structured show plan artifact',
    iconName: 'ListChecks',
    nodeColor: 'media',
    actionType: 'generate_run_of_show',
    config: {
      actionType: 'generate_run_of_show',
      topic: '',
      duration: '30 minutes',
      provider: 'stub-run-of-show',
    },
  },
  {
    id: 'generate-voice',
    type: 'action',
    label: 'Generate Voice',
    description: 'Render audio from script or text input',
    iconName: 'Headphones',
    nodeColor: 'media',
    actionType: 'generate_voice',
    config: {
      actionType: 'generate_voice',
      text: '',
      voice: 'Rachel',
      provider: 'elevenlabs_tts',
    },
  },
  {
    id: 'generate-thumbnail',
    type: 'action',
    label: 'Generate Thumbnail',
    description: 'Create an image asset through the media engine',
    iconName: 'Image',
    nodeColor: 'media',
    actionType: 'generate_thumbnail',
    config: {
      actionType: 'generate_thumbnail',
      title: '',
      subtitle: '',
      provider: 'stub-render',
    },
  },
  {
    id: 'generate-video',
    type: 'action',
    label: 'Generate Video',
    description: 'Create a render job through the media engine',
    iconName: 'Image',
    nodeColor: 'media',
    actionType: 'generate_video',
    config: {
      actionType: 'generate_video',
      templateId: 'aio_916',
      outputTarget: '',
      provider: 'stub-render',
    },
  },
  {
    id: 'transcribe-media',
    type: 'action',
    label: 'Transcribe Media',
    description: 'Create a transcript job for media or transcript input',
    iconName: 'Headphones',
    nodeColor: 'media',
    actionType: 'transcribe_media',
    config: {
      actionType: 'transcribe_media',
      sourceType: 'asset',
      sourceRef: '{{previous.assetId}}',
      provider: 'elevenlabs_scribe',
      diarization: true,
      timestamps: true,
    },
  },
  {
    id: 'generate-transcript-intelligence',
    type: 'action',
    label: 'Transcript Intelligence',
    description: 'Generate structured summary, actions, topics, highlights, and content ideas from transcript output',
    iconName: 'Sparkles',
    nodeColor: 'media',
    actionType: 'generate_transcript_intelligence',
    config: {
      actionType: 'generate_transcript_intelligence',
      transcriptText: '{{previous.transcriptText}}',
      assetId: '{{previous.assetId}}',
      sourceUrl: '{{previous.sourceUrl}}',
      metadata: {},
    },
  },
  {
    id: 'ingest-meeting-artifacts',
    type: 'action',
    label: 'Ingest Meeting',
    description: 'Normalize meeting artifacts into the media engine',
    iconName: 'UploadCloud',
    nodeColor: 'media',
    actionType: 'ingest_meeting_artifacts',
    config: {
      actionType: 'ingest_meeting_artifacts',
      meetingProvider: 'zoom',
      meetingRef: '',
      attachTarget: '',
    },
  },
  {
    id: 'publish-asset',
    type: 'action',
    label: 'Publish Asset',
    description: 'Track publication of the latest media asset or artifact',
    iconName: 'Send',
    nodeColor: 'media',
    actionType: 'publish_asset',
    config: {
      actionType: 'publish_asset',
      publishTarget: 'internal.media',
      assetRef: '',
    },
  },
  {
    id: 'generate-image',
    type: 'action',
    label: 'Generate Image',
    description: 'Create an image from a text prompt via AI provider',
    iconName: 'Sparkles',
    nodeColor: 'media',
    actionType: 'generate_image',
    status: 'live',
    config: {
      actionType: 'generate_image',
      prompt: '',
      style: '',
      size: '1024x1024',
    },
    outputSchema: {
      imageUrl: 'string',
      prompt: 'string',
      provider: 'string',
      status: 'string',
    },
  },
]"""

trigger_start = content.find("id: 'booking-cancelled-trigger',")
if trigger_start != -1:
    trigger_end = content.find("event: 'booking_cancelled',", trigger_start)
    block = content[trigger_start:trigger_end]
    if "status: 'live'," not in block:
        content = content[:trigger_start] + block.replace("nodeColor: 'trigger',", "nodeColor: 'trigger',\n    status: 'live',") + content[trigger_end:]

content = content[:start_idx] + utility_new + content[end_idx:]

registry_start = content.find('export const nodeLibrary = {')
registry_end = content.find('};', registry_start)
if registry_end != -1:
    registry_end += 2

registry_new = """export const nodeLibrary = {
  Triggers: triggerNodes,
  'Logic/Condition': logicNodes,
  'Webhook/API': webhookNodes,
  Messaging: messagingNodes,
  Data: dataNodes,
  Input: inputNodes,
  Verification: verificationNodes,
  Booking: bookingNodes,
  Media: mediaNodes,
  'AI Agents': toolNodeTemplates.map((tool) => ({
    ...tool,
    id: `tool-${tool.id}`,
    type: 'action',
    nodeColor: 'agent',
  })),
  Sockets: socketNodes,
};"""

content = content[:registry_start] + registry_new + content[registry_end:]

with open(r'd:\AIOCRM\frontend\src\modules\Flows\data\nodeLibrary.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
