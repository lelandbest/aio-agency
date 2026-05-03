import { getFormsApi, createFormApi, updateFormApi, deleteFormApi, bulkDeleteFormsApi, getFormFoldersApi, createFormFolderApi, updateFormFolderApi, deleteFormFolderApi, getFormBySlugApi, getFormByIdApi, submitFormApi } from './backendApi';

export const FormsService = {
  fetchForms: (summary) => getFormsApi(summary),
  createForm: (payload) => createFormApi(payload),
  updateForm: (formId, payload) => updateFormApi(formId, payload),
  deleteForm: (formId) => deleteFormApi(formId),
  bulkDeleteForms: (ids) => bulkDeleteFormsApi(ids),
  getFormFolders: () => getFormFoldersApi(),
  createFormFolder: (payload) => createFormFolderApi(payload),
  updateFormFolder: (folderId, payload) => updateFormFolderApi(folderId, payload),
  deleteFormFolder: (folderId) => deleteFormFolderApi(folderId),
  getFormBySlug: (slug) => getFormBySlugApi(slug),
  getFormById: (formId) => getFormByIdApi(formId),
  submitForm: (formId, formData) => submitFormApi(formId, formData),
};