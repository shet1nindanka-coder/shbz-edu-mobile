/**
 * Connectivity of the device: one module-level store fed by expo-network (which also works on web through
 * `navigator.onLine`). `isOnline()` is what the composition root hands to the API client; `useIsOnline()`
 * drives the offline banner; TanStack Query's `onlineManager` is kept in sync so paused queries resume.
 *
 * Unknown is treated as online: only an explicit "not connected" / "internet not reachable" is offline.
 */
import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';

type Listener = (online: boolean) => void;

let deviceOnline = true;
/** Demo-screen switch of mock builds: pretend the connection is gone without touching the device. */
let simulatedOffline = false;
const listeners = new Set<Listener>();
let started = false;

function effective(): boolean {
  return deviceOnline && !simulatedOffline;
}

function publish(previous: boolean): void {
  const next = effective();
  if (next === previous) return;
  onlineManager.setOnline(next);
  listeners.forEach((listener) => listener(next));
}

function apply(state: Network.NetworkState): void {
  const previous = effective();
  deviceOnline = state.isConnected !== false && state.isInternetReachable !== false;
  publish(previous);
}

/** Starts listening once; safe to call again. Returns nothing to stop — the monitor lives as long as the app. */
export function startNetworkMonitor(): void {
  if (started) return;
  started = true;
  // TanStack must follow this store only (its own default listens to browser events on web).
  onlineManager.setEventListener(() => undefined);
  onlineManager.setOnline(effective());
  try {
    Network.addNetworkStateListener(apply);
    void Network.getNetworkStateAsync().then(apply, () => undefined);
  } catch {
    // No network module (unusual runtime): stay "online" and let requests fail on their own.
  }
}

/** Current connectivity. This is the `isOnline` the API client is created with. */
export function isOnline(): boolean {
  return effective();
}

/** Calls `listener` on every change; returns the unsubscribe function. */
export function subscribeOnline(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders on connectivity changes. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (notify) => subscribeOnline(notify),
    isOnline,
    () => true,
  );
}

/** Demo data screen: force the offline state (and back). */
export function setSimulatedOffline(offline: boolean): void {
  const previous = effective();
  simulatedOffline = offline;
  publish(previous);
}

export function isSimulatedOffline(): boolean {
  return simulatedOffline;
}
