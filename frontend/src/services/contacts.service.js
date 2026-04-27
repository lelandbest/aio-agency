import { getContactsApi } from './backendApi';

export const ContactsService = {
  async fetchContacts() {
    return await getContactsApi();
  },
};