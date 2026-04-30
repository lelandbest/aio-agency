import {
  getContactsApi,
  createContactApi,
  updateContactApi,
  deleteContactApi,
  restoreContactApi,
  listDeletedContactsApi,
  bulkDeleteContactsApi,
  getContactActivitiesApi,
  createContactActivityApi,
  getContactFormSubmissionsApi,
} from './backendApi';

export const ContactsService = {
  fetchContacts: () => getContactsApi(),
  createContact: (payload) => createContactApi(payload),
  updateContact: (contactId, payload) => updateContactApi(contactId, payload),
  deleteContact: (contactId) => deleteContactApi(contactId),
  restoreContact: (contactId) => restoreContactApi(contactId),
  listDeletedContacts: () => listDeletedContactsApi(),
  bulkDeleteContacts: (ids) => bulkDeleteContactsApi(ids),
  getContactActivities: (contactId) => getContactActivitiesApi(contactId),
  createContactActivity: (contactId, payload) => createContactActivityApi(contactId, payload),
  getContactFormSubmissions: (contactId) => getContactFormSubmissionsApi(contactId),
};