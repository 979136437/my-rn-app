import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { useExposureObserver } from './useExposureObserver';
import type { ExposureObserverProps } from './types';

export type ExposureObserverRef = View;

export const ExposureObserver = forwardRef<ExposureObserverRef, ExposureObserverProps>(function ExposureObserver({
  exposureKey, visiblePercentThreshold, minimumViewTime, enabled, active,
  onExposure, onVisibilityChange, ...viewProps
}, forwardedRef) {
  const observerRef = useExposureObserver({
    exposureKey, visiblePercentThreshold, minimumViewTime, enabled, active,
    onExposure, onVisibilityChange,
  });
  const nativeRef = useRef<View | null>(null);
  const ref = useCallback((view: View | null) => {
    nativeRef.current = view;
    observerRef(view);
  }, [observerRef]);
  useImperativeHandle(forwardedRef, () => nativeRef.current!, []);
  return <View {...viewProps} ref={ref} collapsable={false} />;
});
