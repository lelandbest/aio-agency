import { getCurrentSessionApi } from './backendApi';

export const AuthService = {
  async getSession() {
    return await getCurrentSessionApi();
  },
};