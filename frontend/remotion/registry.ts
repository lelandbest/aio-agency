/**
 * AIO REMOTION TEMPLATE REGISTRY
 * 
 * Defines the mapping between AIO template IDs and Remotion Composition IDs.
 */

export interface RemotionTemplate {
  templateId: string;
  humanLabel: string;
  compositionId: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  supportedProps: string[];
}

export const REMOTION_TEMPLATES: Record<string, RemotionTemplate> = {
  'aio_base_vertical': {
    templateId: 'aio_base_vertical',
    humanLabel: 'AIO Base Vertical',
    compositionId: 'VideoComposition', // Preserving compatibility with current root
    description: 'Universal AIO vertical template with animated background, title, subtitle, and dynamic captions.',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    supportedProps: ['title', 'subtitle', 'audioUrl', 'transcript', 'transcriptLines', 'watermarkText', 'themeVariant', 'logoUrl']
  },
  'aio_audiogram_vertical': {
    templateId: 'aio_audiogram_vertical',
    humanLabel: 'AIO Audiogram Vertical',
    compositionId: 'AudiogramComposition',
    description: 'Audio-first branded vertical social video with high-impact captions and animated waveform.',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    supportedProps: ['title', 'subtitle', 'audioUrl', 'transcriptLines', 'watermarkText', 'themeVariant', 'logoUrl']
  }
};

export const DEFAULT_TEMPLATE_ID = 'aio_base_vertical';

export const getTemplateById = (id: string): RemotionTemplate | undefined => {
  return REMOTION_TEMPLATES[id];
};

export const getAllTemplates = (): RemotionTemplate[] => {
  return Object.values(REMOTION_TEMPLATES);
};
