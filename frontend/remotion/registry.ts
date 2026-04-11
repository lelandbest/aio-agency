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
  'aio_916': {
    templateId: 'aio_916',
    humanLabel: 'AIO 9:16',
    compositionId: 'VideoComposition', // Preserving compatibility with current root
    description: 'Universal AIO vertical template with animated background, title, subtitle, and dynamic captions.',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    supportedProps: ['title', 'subtitle', 'audioUrl', 'transcript', 'transcriptLines', 'watermarkText', 'themeVariant', 'logoUrl']
  },
  'aio_11': {
    templateId: 'aio_11',
    humanLabel: 'AIO 1:1',
    compositionId: 'AudiogramComposition',
    description: 'Audio-first branded square social video with high-impact captions and animated waveform.',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    supportedProps: ['title', 'subtitle', 'audioUrl', 'transcriptLines', 'watermarkText', 'themeVariant', 'logoUrl']
  },
  'bltv_169': {
    templateId: 'bltv_169',
    humanLabel: 'BLTV 16:9',
    compositionId: 'BLTVLandscapeComposition',
    description: 'Broadcast-style BLTV landscape template for YouTube-ready production output.',
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 300,
    supportedProps: ['title', 'subtitle', 'audioUrl', 'transcript', 'transcriptLines', 'watermarkText', 'themeVariant', 'logoUrl']
  }
};

export const DEFAULT_TEMPLATE_ID = 'aio_916';

export const getTemplateById = (id: string): RemotionTemplate | undefined => {
  return REMOTION_TEMPLATES[id];
};

export const getAllTemplates = (): RemotionTemplate[] => {
  return Object.values(REMOTION_TEMPLATES);
};
