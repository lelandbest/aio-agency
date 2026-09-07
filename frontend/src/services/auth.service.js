import {
  getAuthStatusApi,
  bootstrapOwnerApi,
  loginApi,
  forgotPasswordApi,
  validateResetTokenApi,
  resetPasswordApi,
  getCurrentSessionApi,
  getProfileApi,
  updateProfileApi,
  uploadAvatarApi,
  deleteAvatarApi,
  changePasswordApi,
  getAuthSessionsApi,
  revokeAuthSessionApi,
  exportUserDataApi,
  getExportStatusApi,
  getExportDownloadUrl,
  deleteUserAccountApi,
  logoutOtherSessionsApi,
  logoutApi,
  switchTenantSessionApi,
  getGoogleAppAuthorizeUrl,
} from './backendApi';

export const AuthService = {
  getAuthStatus: async () => {
    const res = await getAuthStatusApi();
    const hasUsers = Boolean(res?.hasUsers ?? res?.has_users);
    const canBootstrapOwner = Boolean(res?.canBootstrapOwner ?? res?.can_bootstrap_owner ?? !hasUsers);
    const googleOauthAvailable = Boolean(res?.googleOauthAvailable ?? res?.google_oauth_available);
    return {
      hasUsers,
      canBootstrapOwner,
      googleOauthAvailable,
      providers: res?.providers || [],
    };
  },
  bootstrapOwner: (payload) => bootstrapOwnerApi(payload),
  login: (payload) => loginApi(payload),
  forgotPassword: (email) => forgotPasswordApi(email),
  validateResetToken: (token) => validateResetTokenApi(token),
  resetPassword: (payload) => resetPasswordApi(payload),
  getSession: () => getCurrentSessionApi(),
  getProfile: () => getProfileApi(),
  updateProfile: (payload) => updateProfileApi(payload),
  uploadAvatar: (file) => uploadAvatarApi(file),
  deleteAvatar: () => deleteAvatarApi(),
  changePassword: (payload) => changePasswordApi(payload),
  getAuthSessions: () => getAuthSessionsApi(),
  revokeAuthSession: (sessionId) => revokeAuthSessionApi(sessionId),
  exportUserData: () => exportUserDataApi(),
  getExportStatus: (exportId) => getExportStatusApi(exportId),
  getExportDownloadUrl: (exportId) => getExportDownloadUrl(exportId),
  deleteUserAccount: () => deleteUserAccountApi(),
  logoutOtherSessions: () => logoutOtherSessionsApi(),
  logout: () => logoutApi(),
  switchTenantSession: (tenantId) => switchTenantSessionApi(tenantId),
  getGoogleAppAuthorizeUrl: () => getGoogleAppAuthorizeUrl(),
};