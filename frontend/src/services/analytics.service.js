import {
  getOmegaStatusApi,
  armOmegaApi,
  cancelOmegaApi,
  executeOmegaApi,
  getAnalyticsSummaryApi,
  generateReportApi,
  ingestExternalDataApi,
  listExternalDataApi,
  getExternalDataApi,
  deleteExternalDataApi,
  ingestContentMetricsApi,
  listContentMetricsApi,
} from './backendApi';

export const AnalyticsService = {
  getOmegaStatus: (limit) => getOmegaStatusApi(limit),
  armOmega: (payload) => armOmegaApi(payload),
  cancelOmega: (payload) => cancelOmegaApi(payload),
  executeOmega: (payload) => executeOmegaApi(payload),
  getAnalyticsSummary: () => getAnalyticsSummaryApi(),
  generateReport: (payload) => generateReportApi(payload),
  ingestExternalData: (payload) => ingestExternalDataApi(payload),
  listExternalData: () => listExternalDataApi(),
  getExternalData: (dataId) => getExternalDataApi(dataId),
  deleteExternalData: (dataId) => deleteExternalDataApi(dataId),
  ingestContentMetrics: (payload) => ingestContentMetricsApi(payload),
  listContentMetrics: (platform, limit) => listContentMetricsApi(platform, limit),
};