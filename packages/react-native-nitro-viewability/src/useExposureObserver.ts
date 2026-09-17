import { useCallback, useLayoutEffect, useRef } from 'react';
import { findNodeHandle, Platform } from 'react-native';
import type { View } from 'react-native';
import type { ExposureConfig, ExposureController, ExposureEvent } from './specs/ExposureController.nitro';
import type { ExposureInfo, ExposureObserverOptions } from './types';

let nextEpoch = 0;

/** Attach to a native View with collapsable={false}, including through a forwarded ref. */
export function useExposureObserver({
  exposureKey, visiblePercentThreshold = 50, minimumViewTime = 0,
  enabled = true, active = true, onExposure, onVisibilityChange,
}: ExposureObserverOptions): (view: View | null) => void {
  if (Platform.OS !== 'android') throw new Error(`react-native-nitro-viewability supports Android only (received ${Platform.OS}).`);
  if (typeof exposureKey !== 'string' || exposureKey.length === 0) throw new Error('ExposureObserver exposureKey must be a nonempty string.');
  if (!Number.isFinite(visiblePercentThreshold) || visiblePercentThreshold < 0 || visiblePercentThreshold > 100) {
    throw new Error('ExposureObserver visiblePercentThreshold must be between 0 and 100.');
  }
  if (!Number.isFinite(minimumViewTime) || minimumViewTime < 0) throw new Error('ExposureObserver minimumViewTime must be nonnegative and finite.');

  const target = useRef<View | null>(null);
  const controller = useRef<ExposureController | null>(null);
  const ready = useRef(false);
  const session = useRef<{ target: View; config: ExposureConfig } | null>(null);
  const committed = useRef({ exposureKey, visiblePercentThreshold, minimumViewTime, enabled, active, onExposure, onVisibilityChange });

  const receive = useCallback((event: ExposureEvent) => {
    const current = session.current;
    if (!ready.current || !current || current.config.epoch !== event.epoch || current.config.key !== event.key) return;
    if (event.error) throw new Error(`ExposureObserver: ${event.error}`);
    const callbacks = committed.current;
    const info: ExposureInfo = {
      key: event.key, isViewable: event.isViewable,
      visiblePercent: event.visiblePercent, timestamp: event.timestamp,
    };
    callbacks.onVisibilityChange?.(info);
    if (event.isViewable) callbacks.onExposure?.(info);
  }, []);

  const reconcile = useCallback(() => {
    if (!ready.current || !target.current) return;
    const view = target.current;
    const options = committed.current;
    const previous = session.current;
    const config: ExposureConfig = {
      key: options.exposureKey, epoch: previous?.config.epoch ?? 0,
      visiblePercentThreshold: options.visiblePercentThreshold,
      minimumViewTime: options.minimumViewTime, enabled: options.enabled, active: options.active,
    };
    if (previous?.target === view && previous.config.key === config.key &&
      previous.config.visiblePercentThreshold === config.visiblePercentThreshold &&
      previous.config.minimumViewTime === config.minimumViewTime &&
      previous.config.enabled === config.enabled && previous.config.active === config.active) return;

    if (!controller.current) {
      // Importing this package is safe without native modules; resolve only on mount.
      const { NitroModules } = require('react-native-nitro-modules') as typeof import('react-native-nitro-modules');
      controller.current = NitroModules.createHybridObject<ExposureController>('ExposureController');
    }
    config.epoch = ++nextEpoch;
    if (previous?.target === view) {
      session.current = { target: view, config };
      controller.current.configure(config);
    } else {
      const tag = findNodeHandle(view);
      if (tag == null || tag <= 0) throw new Error('ExposureObserver could not obtain a native View tag. Forward the ref to a mounted View with collapsable={false}.');
      session.current = { target: view, config };
      controller.current.observe(tag, config, receive);
    }
  }, [receive]);

  const observerRef = useCallback((view: View | null) => {
    if (view === target.current) return;
    if (view != null && (typeof view.measure !== 'function' || typeof view.setNativeProps !== 'function' || !('_nativeTag' in view || '__internalInstanceHandle' in view))) {
      throw new Error('ExposureObserver ref must point to a native View, not a composite component. Forward its native View ref and set collapsable={false}.');
    }
    session.current = null;
    controller.current?.disconnect();
    target.current = view;
    reconcile();
  }, [reconcile]);

  useLayoutEffect(() => {
    ready.current = true;
    return () => {
      ready.current = false;
      session.current = null;
      controller.current?.disconnect();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    committed.current = { exposureKey, visiblePercentThreshold, minimumViewTime, enabled, active, onExposure, onVisibilityChange };
    reconcile();
  });
  return observerRef;
}
