import {
  getAutomationProviderConfigsApi,
  upsertAutomationProviderConfigApi,
  deleteAutomationProviderConfigApi,
  testAutomationProviderConfigApi,
  getPaymentProviderConfigsApi,
  upsertPaymentProviderConfigApi,
  deletePaymentProviderConfigApi,
  testPaymentProviderConfigApi,
  getSocialProviderConfigsApi,
  upsertSocialProviderConfigApi,
  deleteSocialProviderConfigApi,
} from './backendApi';

export const IntegrationsService = {
  getAutomationProviderConfigs: () => getAutomationProviderConfigsApi(),
  upsertAutomationProviderConfig: (providerKey, payload) => upsertAutomationProviderConfigApi(providerKey, payload),
  deleteAutomationProviderConfig: (configId) => deleteAutomationProviderConfigApi(configId),
  testAutomationProviderConfig: (configId) => testAutomationProviderConfigApi(configId),
  getPaymentProviderConfigs: () => getPaymentProviderConfigsApi(),
  upsertPaymentProviderConfig: (providerKey, payload) => upsertPaymentProviderConfigApi(providerKey, payload),
  deletePaymentProviderConfig: (configId) => deletePaymentProviderConfigApi(configId),
  testPaymentProviderConfig: (configId) => testPaymentProviderConfigApi(configId),
  getSocialProviderConfigs: () => getSocialProviderConfigsApi(),
  upsertSocialProviderConfig: (providerKey, payload) => upsertSocialProviderConfigApi(providerKey, payload),
  deleteSocialProviderConfig: (configId) => deleteSocialProviderConfigApi(configId),
};