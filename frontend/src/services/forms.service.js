import { getFormsApi } from './backendApi';

export const FormsService = {
  async fetchForms(summary = false) {
    return await getFormsApi(summary);
  },
};