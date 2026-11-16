// Connectivity: `isOnline()` for the API client, `useIsOnline()` for components, the offline strip.
export {
  isOnline,
  isSimulatedOffline,
  setSimulatedOffline,
  startNetworkMonitor,
  subscribeOnline,
  useIsOnline,
} from './network-state';
export { OfflineBannerHost, type OfflineBannerHostProps } from './offline-banner';
