import { request } from './backendApi';

export const PocketService = {
  getBrief: () => request('/api/pocket/brief'),
  
  getApprovals: () => request('/api/pocket/approvals'),
  
  takeApprovalAction: (runId, action, reason = '') =>
    request(`/api/pocket/approvals/${encodeURIComponent(runId)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),
    
  getCues: () => request('/api/pocket/cues'),
  
  captureVaultItem: (formData) =>
    request('/api/pocket/capture', {
      method: 'POST',
      body: formData,
    }),
    
  sendVoiceCommand: (transcript, context = {}) =>
    request('/api/vtt/command', {
      method: 'POST',
      body: JSON.stringify({
        transcript,
        voiceEnabled: true,
        context,
      }),
    }),
};
