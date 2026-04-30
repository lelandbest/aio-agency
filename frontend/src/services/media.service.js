import {
  getMediaAssetsApi,
  getVaultApi,
  getMediaRenderJobsApi,
  getMediaTranscriptJobsApi,
  getMediaTranscriptArtifactsApi,
  getMediaScriptJobsApi,
  getMediaScriptArtifactsApi,
  getMediaRunOfShowJobsApi,
  getMediaRunOfShowArtifactsApi,
  getMediaAudioRenderJobsApi,
  getMediaPublishJobsApi,
  getMediaPublishArtifactsApi,
  createMediaScriptJobApi,
  createMediaRunOfShowJobApi,
  createMediaAudioRenderJobApi,
  generateAudioAssetApi,
  createMediaRenderJobApi,
  getMediaRenderTemplatesApi,
  createMediaTranscriptJobApi,
  ingestMeetingMediaApi,
  uploadMediaFileApi,
  createMediaPublishJobApi,
  deleteMediaAssetApi,
  deleteMediaJobApi,
  deleteMediaArtifactApi,
  getMediaJobStatusApi,
  probeMediaAssetApi,
  getMediaProviderConfigsApi,
  upsertMediaProviderConfigApi,
  deleteMediaProviderConfigApi,
  testMediaProviderConfigApi,
  voicePreviewApi,
  getApiBaseUrl,
  withSessionToken,
} from './backendApi';

export { getApiBaseUrl, withSessionToken };

export const MediaService = {
  getMediaAssets: () => getMediaAssetsApi(),
  getVault: () => getVaultApi(),
  getMediaRenderJobs: () => getMediaRenderJobsApi(),
  getMediaTranscriptJobs: () => getMediaTranscriptJobsApi(),
  getMediaTranscriptArtifacts: () => getMediaTranscriptArtifactsApi(),
  getMediaScriptJobs: () => getMediaScriptJobsApi(),
  getMediaScriptArtifacts: () => getMediaScriptArtifactsApi(),
  getMediaRunOfShowJobs: () => getMediaRunOfShowJobsApi(),
  getMediaRunOfShowArtifacts: () => getMediaRunOfShowArtifactsApi(),
  getMediaAudioRenderJobs: () => getMediaAudioRenderJobsApi(),
  getMediaPublishJobs: () => getMediaPublishJobsApi(),
  getMediaPublishArtifacts: () => getMediaPublishArtifactsApi(),
  createMediaScriptJob: (payload) => createMediaScriptJobApi(payload),
  createMediaRunOfShowJob: (payload) => createMediaRunOfShowJobApi(payload),
  createMediaAudioRenderJob: (payload) => createMediaAudioRenderJobApi(payload),
  generateAudioAsset: (payload) => generateAudioAssetApi(payload),
  createMediaRenderJob: (payload) => createMediaRenderJobApi(payload),
  getMediaRenderTemplates: () => getMediaRenderTemplatesApi(),
  createMediaTranscriptJob: (payload) => createMediaTranscriptJobApi(payload),
  ingestMeetingMedia: (payload) => ingestMeetingMediaApi(payload),
  uploadMediaFile: (file, tags) => uploadMediaFileApi(file, tags),
  createMediaPublishJob: (payload) => createMediaPublishJobApi(payload),
  deleteMediaAsset: (assetId) => deleteMediaAssetApi(assetId),
  deleteMediaJob: (jobType, jobId) => deleteMediaJobApi(jobType, jobId),
  deleteMediaArtifact: (artifactType, artifactId) => deleteMediaArtifactApi(artifactType, artifactId),
  getMediaJobStatus: (jobType, jobId) => getMediaJobStatusApi(jobType, jobId),
  probeMediaAsset: (payload) => probeMediaAssetApi(payload),
  getMediaProviderConfigs: () => getMediaProviderConfigsApi(),
  upsertMediaProviderConfig: (providerKey, payload) => upsertMediaProviderConfigApi(providerKey, payload),
  deleteMediaProviderConfig: (configId) => deleteMediaProviderConfigApi(configId),
  testMediaProviderConfig: (configId) => testMediaProviderConfigApi(configId),
  voicePreview: (payload) => voicePreviewApi(payload),
  voicePreviewBlob: async (payload) => {
    const url = withSessionToken(`${getApiBaseUrl()}/api/media/voice-preview`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || 'Failed to generate preview');
    }
    return res.blob();
  },
  buildAssetUrl: (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/api/') || url.startsWith('/media/')) {
      return withSessionToken(`${getApiBaseUrl()}${url}`);
    }
    return url;
  },
};