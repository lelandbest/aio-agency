/**
 * Prebuilt Flow Templates
 * Organized by category with predefined nodes, edges, and variable placeholders
 */

export const templates = [
  {
    id: 'ai-lead-responder',
    name: 'AI Lead Responder',
    description: 'Instantly qualifies leads via SMS and routes to CRM based on intent.',
    category: 'AI Agents',
    iconName: 'Bot',
    complexity: 'Advanced',
    nodes: [
      { id: 'trigger', type: 'trigger', data: { label: 'New Lead', iconName: 'User' }, position: { x: 100, y: 200 } },
      { id: 'ai-qualifier', type: 'action', data: { label: 'AI Qualifier', iconName: 'Bot' }, position: { x: 400, y: 200 } },
      { id: 'crm-update', type: 'action', data: { label: 'Update CRM', iconName: 'Database' }, position: { x: 700, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'ai-qualifier', animated: false },
      { id: 'e2-3', source: 'ai-qualifier', target: 'crm-update', animated: false }
    ],
    placeholders: ['{{agent_prompt}}', '{{contact_phone}}']
  },
  {
    id: 'abandoned-cart-sms',
    name: 'Abandoned Cart SMS',
    description: 'Recover lost sales by sending an automated SMS reminder.',
    category: 'Messaging',
    iconName: 'MessageSquare',
    complexity: 'Intermediate',
    nodes: [
      { id: 'trigger', type: 'webhook', data: { label: 'Cart Abandoned', iconName: 'Webhook' }, position: { x: 100, y: 200 } },
      { id: 'wait', type: 'logic', data: { label: 'Wait 1 Hour', iconName: 'Clock' }, position: { x: 400, y: 200 } },
      { id: 'sms', type: 'action', data: { label: 'Send SMS', iconName: 'MessageSquare' }, position: { x: 700, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'wait', animated: false },
      { id: 'e2-3', source: 'wait', target: 'sms', animated: false }
    ],
    placeholders: ['{{customer_name}}', '{{checkout_url}}']
  },
  {
    id: 'webhook-to-slack',
    name: 'Webhook to Internal Alert',
    description: 'Routes incoming webhook data to internal messaging channels.',
    category: 'Automation',
    iconName: 'Zap',
    complexity: 'Basic',
    nodes: [
      { id: 'trigger', type: 'webhook', data: { label: 'Incoming Hook', iconName: 'Webhook' }, position: { x: 100, y: 200 } },
      { id: 'alert', type: 'action', data: { label: 'Send Alert', iconName: 'Bell' }, position: { x: 400, y: 200 } }
    ],
    edges: [
      { id: 'e1-2', source: 'trigger', target: 'alert', animated: false }
    ],
    placeholders: ['{{webhook_url}}', '{{alert_channel}}']
  },
  {
    id: 'podcast-pipeline',
    name: 'Media Pipeline',
    description: 'Generate, render, and publish media assets including scripts, audio, images, and video.',
    category: 'Media',
    iconName: 'Headphones',
    complexity: 'Advanced',
    nodes: [
      {
        id: 'podcast-trigger',
        type: 'trigger',
        data: {
          label: 'Manual Trigger',
          iconName: 'Play',
          templateId: 'manual-trigger',
          config: { event: 'manual' },
        },
        position: { x: 80, y: 240 },
      },
      {
        id: 'podcast-script',
        type: 'action',
        data: {
          label: 'Generate Script',
          iconName: 'FileText',
          templateId: 'generate-script',
          config: {
            actionType: 'generate_script',
            topic: 'Product update',
            tone: 'Clear',
            length: '12 minutes',
            duration: '12 minutes',
            context: 'Media brief for a campaign-ready asset package.',
            inputs: {
              topic: 'Product update',
              tone: 'Clear',
              length: '12 minutes',
            },
            provider: 'stub-script',
          },
        },
        position: { x: 360, y: 240 },
      },
      {
        id: 'podcast-tts',
        type: 'action',
        data: {
          label: 'Text to Speech',
          iconName: 'Headphones',
          templateId: 'text-to-speech',
          config: {
            actionType: 'text_to_speech',
            text: '{{previous.artifact.script_text}}',
            voice: 'Rachel',
            style: 'Conversational',
            provider: 'elevenlabs_tts',
          },
        },
        position: { x: 660, y: 240 },
      },
      {
        id: 'podcast-thumbnail',
        type: 'action',
        data: {
          label: 'Generate Thumbnail',
          iconName: 'Image',
          templateId: 'generate-thumbnail',
          config: {
            actionType: 'generate_thumbnail',
            title: 'Product update',
            subtitle: 'Feature spotlight',
            image: 'Bold studio backdrop',
            prompt: 'Create a bold media thumbnail with strong contrast and clean title space.',
            provider: 'stub-render',
          },
        },
        position: { x: 960, y: 240 },
      },
      {
        id: 'podcast-video',
        type: 'action',
        data: {
          label: 'Generate Video',
          iconName: 'Image',
          templateId: 'generate-video',
          config: {
            actionType: 'generate_video',
            templateId: 'aio_916',
            outputTarget: 'media.library',
            script: 'Create a short teaser video for the product update asset package.',
            provider: 'stub-render',
          },
        },
        position: { x: 1260, y: 240 },
      },
      {
        id: 'podcast-publish',
        type: 'action',
        data: {
          label: 'Publish Asset',
          iconName: 'Send',
          templateId: 'publish-asset',
          config: {
            actionType: 'publish_asset',
            publishTarget: 'internal.media',
          },
        },
        position: { x: 1560, y: 240 },
      }
    ],
    edges: [
      { id: 'podcast-e1', source: 'podcast-trigger', target: 'podcast-script', animated: false },
      { id: 'podcast-e2', source: 'podcast-script', target: 'podcast-tts', animated: false },
      { id: 'podcast-e3', source: 'podcast-tts', target: 'podcast-thumbnail', animated: false },
      { id: 'podcast-e4', source: 'podcast-thumbnail', target: 'podcast-video', animated: false },
      { id: 'podcast-e5', source: 'podcast-video', target: 'podcast-publish', animated: false }
    ],
    placeholders: []
  },
  {
    id: 'new-oaks-podcast-script',
    name: 'New Oaks AI Podcast Script',
    description: 'Generates a podcast run-of-show from intake data. Rebuilt from the New Oaks n8n workflow.',
    category: 'Media',
    iconName: 'Headphones',
    complexity: 'Advanced',
    nodes: [
      {
        id: 'podcast-intake-trigger',
        type: 'trigger',
        data: {
          label: 'Podcast Intake Submitted',
          iconName: 'FileText',
          templateId: 'form-submitted-trigger',
          config: { event: 'form_submission', formId: 'podcast-script-intake', brandKey: 'newOaksPodcast' },
        },
        position: { x: 80, y: 240 },
      },
      {
        id: 'generate-run-of-show',
        type: 'action',
        data: {
          label: 'Generate Run of Show',
          iconName: 'FileText',
          templateId: 'generate_podcast_script',
          config: {
            actionType: 'generate_podcast_script',
            brandKey: 'newOaksPodcast',
            episodeTitle: '{{formData.episodeTitle}}',
            episodeTopic: '{{formData.episodeTopic}}',
            episodeSummary: '{{formData.episodeSummary}}',
            aiTrends: '{{formData.sourceNotes}}',
            easySiteUpdates: '',
            newOaksUpdates: '{{formData.sourceNotes}}',
            links: '{{formData.sourceLinks}}',
            desiredLength: '{{formData.desiredLength}}',
            guestName: '{{formData.guestName}}',
            guestTitle: '{{formData.guestTitle}}',
            includeIntro: '{{formData.includeIntro}}',
            includeSponsorBreak: '{{formData.includeSponsorBreak}}',
            includeOutro: '{{formData.includeOutro}}',
            provider: 'stub-script',
          },
        },
        position: { x: 420, y: 240 },
      },
      {
        id: 'generate-youtube-desc',
        type: 'action',
        data: {
          label: 'Generate YouTube Description',
          iconName: 'Video',
          templateId: 'generate_podcast_script',
          config: {
            actionType: 'generate_podcast_script',
            brandKey: 'newOaksPodcast',
            episodeTitle: '{{formData.episodeTitle}}',
            episodeNumber: '',
            airDate: '',
            runOfShow: '{{previous.artifact.script}}',
            provider: 'stub-script',
          },
        },
        position: { x: 760, y: 240 },
      },
    ],
    edges: [
      { id: 'no-e1', source: 'podcast-intake-trigger', target: 'generate-run-of-show', animated: false },
      { id: 'no-e2', source: 'generate-run-of-show', target: 'generate-youtube-desc', animated: false },
    ],
    placeholders: ['{{formData.episodeTitle}}', '{{formData.episodeTopic}}', '{{formData.sourceNotes}}', '{{formData.sourceLinks}}'],
  },
  {
    id: 'aio-best-ai-podcast-script',
    name: 'AIO Best AI Podcast Script',
    description: 'Generates a podcast script using Cortex Business DNA for AIO brand voice and positioning.',
    category: 'Media',
    iconName: 'Headphones',
    complexity: 'Advanced',
    nodes: [
      {
        id: 'aio-podcast-intake-trigger',
        type: 'trigger',
        data: {
          label: 'Podcast Intake Submitted',
          iconName: 'FileText',
          templateId: 'form-submitted-trigger',
          config: { event: 'form_submission', formId: 'podcast-script-intake', brandKey: 'aioBestAiPodcast' },
        },
        position: { x: 80, y: 240 },
      },
      {
        id: 'resolve-brand-dna',
        type: 'action',
        data: {
          label: 'Resolve Cortex Brand DNA',
          iconName: 'Database',
          templateId: 'store-data',
          config: {
            actionType: 'store_data',
            brandVoice: '{{brain.profile.brandVoice}}',
            mission: '{{brain.profile.mission}}',
            valueProp: '{{brain.profile.valueProp}}',
            differentiation: '{{brain.profile.differentiation}}',
            idealCustomer: '{{brain.profile.idealCustomer}}',
            painPoints: '{{brain.profile.painPoints}}',
          },
        },
        position: { x: 300, y: 240 },
      },
      {
        id: 'aio-generate-script',
        type: 'action',
        data: {
          label: 'Generate AIO Podcast Script',
          iconName: 'Headphones',
          templateId: 'generate_podcast_script',
          config: {
            actionType: 'generate_podcast_script',
            brandKey: 'aioBestAiPodcast',
            episodeTitle: '{{formData.episodeTitle}}',
            episodeTopic: '{{formData.episodeTopic}}',
            episodeSummary: '{{formData.episodeSummary}}',
            targetAudience: '{{formData.targetAudience}}',
            episodeGoal: '{{formData.episodeGoal}}',
            sourceTranscript: '{{formData.sourceTranscript}}',
            sourceNotes: '{{formData.sourceNotes}}',
            keyPoints: '{{formData.keyPoints}}',
            guestName: '{{formData.guestName}}',
            guestTitle: '{{formData.guestTitle}}',
            guestBio: '{{formData.guestBio}}',
            toneDirection: '{{formData.toneDirection}}',
            segmentStructure: '{{formData.segmentStructure}}',
            callToAction: '{{formData.callToAction}}',
            desiredLength: '{{formData.desiredLength}}',
            includeIntro: '{{formData.includeIntro}}',
            includeSponsorBreak: '{{formData.includeSponsorBreak}}',
            includeOutro: '{{formData.includeOutro}}',
            brandVoice: '{{brain.profile.brandVoice}}',
            mission: '{{brain.profile.mission}}',
            valueProp: '{{brain.profile.valueProp}}',
            differentiation: '{{brain.profile.differentiation}}',
            idealCustomer: '{{brain.profile.idealCustomer}}',
            painPoints: '{{brain.profile.painPoints}}',
            provider: 'stub-script',
          },
        },
        position: { x: 620, y: 240 },
      },
      {
        id: 'aio-generate-youtube-desc',
        type: 'action',
        data: {
          label: 'Generate YouTube Description',
          iconName: 'Video',
          templateId: 'generate_podcast_script',
          config: {
            actionType: 'generate_podcast_script',
            brandKey: 'aioBestAiPodcast',
            episodeTitle: '{{formData.episodeTitle}}',
            runOfShow: '{{previous.artifact.script}}',
            brandVoice: '{{brain.profile.brandVoice}}',
            provider: 'stub-script',
          },
        },
        position: { x: 960, y: 240 },
      },
    ],
    edges: [
      { id: 'aio-e1', source: 'aio-podcast-intake-trigger', target: 'resolve-brand-dna', animated: false },
      { id: 'aio-e2', source: 'resolve-brand-dna', target: 'aio-generate-script', animated: false },
      { id: 'aio-e3', source: 'aio-generate-script', target: 'aio-generate-youtube-desc', animated: false },
    ],
    placeholders: ['{{formData.episodeTitle}}', '{{formData.episodeTopic}}', '{{brain.profile.brandVoice}}', '{{brain.profile.mission}}'],
  },
  {
    id: 'aio-postbot',
    name: 'AIO PostBot™ Social Content Engine',
    description: 'Curates articles into platform-optimized social posts with AI-generated images. Rebuilt from the Make.com n8n workflow.',
    category: 'Media',
    iconName: 'Share2',
    complexity: 'Advanced',
    nodes: [
      {
        id: 'postbot-trigger',
        type: 'trigger',
        data: {
          label: 'PostBot Intake Submitted',
          iconName: 'FileText',
          templateId: 'form-submitted-trigger',
          config: { event: 'form_submission', formIds: ['aio-postbot'] },
        },
        position: { x: 80, y: 240 },
      },
      {
        id: 'curate-article',
        type: 'action',
        data: {
          label: 'Curate Article Summary',
          iconName: 'FileText',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            articleUrl: '{{formData.articleUrl}}',
            imageStyle: '{{formData.imageStyle}}',
            platforms: '{{formData.platforms}}',
            customInstructions: '{{formData.customInstructions}}',
            provider: 'stub-script',
          },
        },
        position: { x: 420, y: 240 },
      },
      {
        id: 'facebook-branch',
        type: 'action',
        data: {
          label: 'Facebook Post + Image',
          iconName: 'Facebook',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            platform: 'facebook',
            articleSummary: '{{previous.articleSummary}}',
            imageStyle: '{{formData.imageStyle}}',
          },
        },
        position: { x: 760, y: 60 },
      },
      {
        id: 'instagram-branch',
        type: 'action',
        data: {
          label: 'Instagram Post + Image',
          iconName: 'Instagram',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            platform: 'instagram',
            articleSummary: '{{previous.articleSummary}}',
            imageStyle: '{{formData.imageStyle}}',
          },
        },
        position: { x: 760, y: 240 },
      },
      {
        id: 'x-branch',
        type: 'action',
        data: {
          label: 'X / Twitter Post',
          iconName: 'Twitter',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            platform: 'x',
            articleSummary: '{{previous.articleSummary}}',
          },
        },
        position: { x: 760, y: 420 },
      },
      {
        id: 'linkedin-branch',
        type: 'action',
        data: {
          label: 'LinkedIn Post + Image',
          iconName: 'Linkedin',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            platform: 'linkedin',
            articleSummary: '{{previous.articleSummary}}',
            imageStyle: '{{formData.imageStyle}}',
          },
        },
        position: { x: 760, y: 600 },
      },
      {
        id: 'youtube-audio-branch',
        type: 'action',
        data: {
          label: 'YouTube Script + Audio Narration',
          iconName: 'Headphones',
          templateId: 'generate_script',
          config: {
            actionType: 'generate_postbot_content',
            platform: 'youtube',
            articleSummary: '{{previous.articleSummary}}',
            generateAudio: '{{formData.generateAudio}}',
            generateShorts: '{{formData.generateShorts}}',
            publishToYouTube: '{{formData.publishToYouTube}}',
          },
        },
        position: { x: 760, y: 780 },
      },
    ],
    edges: [
      { id: 'pb-e1', source: 'postbot-trigger', target: 'curate-article', animated: false },
      { id: 'pb-e2', source: 'curate-article', target: 'facebook-branch', animated: false },
      { id: 'pb-e3', source: 'curate-article', target: 'instagram-branch', animated: false },
      { id: 'pb-e4', source: 'curate-article', target: 'x-branch', animated: false },
      { id: 'pb-e5', source: 'curate-article', target: 'linkedin-branch', animated: false },
      { id: 'pb-e6', source: 'curate-article', target: 'youtube-audio-branch', animated: false },
    ],
    placeholders: ['{{formData.articleUrl}}', '{{formData.imageStyle}}', '{{formData.platforms}}', '{{previous.articleSummary}}'],
  }
];

export const categories = ['All', 'AI Agents', 'CRM', 'Messaging', 'Automation', 'Media'];
