import {
  getSignalsApi,
  dismissSignalApi,
  archiveSignalsApi,
} from './backendApi';

export const SignalsService = {
  getSignals: () => getSignalsApi(),
  dismissSignal: (signalId) => dismissSignalApi(signalId),
  archiveSignals: (signalIds) => archiveSignalsApi(signalIds),
};