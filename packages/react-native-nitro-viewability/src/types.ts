import type { ViewProps } from 'react-native';

export interface ExposureInfo {
  key: string;
  isViewable: boolean;
  /** Geometric visible area percentage at this state transition (0..100). */
  visiblePercent: number;
  /** Monotonic native milliseconds; not Unix time. */
  timestamp: number;
}

export interface ExposureObserverOptions {
  /** Stable business identity. Change it when a recycled view displays new content. */
  exposureKey: string;
  /** Visible AREA percentage, including horizontal clipping. Default 50. */
  visiblePercentThreshold?: number;
  /** Continuous time above the threshold, in milliseconds. Default 0. */
  minimumViewTime?: number;
  enabled?: boolean;
  /** Set false when a retained route is inactive or covered by your own overlay. */
  active?: boolean;
  /** Called on each qualified entry, including re-entry after leaving. */
  onExposure?: (info: ExposureInfo) => void;
  /**
   * Initial state and qualified entry/exit transitions, not every frame.
   * Host pause or Android window focus loss makes the target non-viewable.
   * Use minimumViewTime=0 for visibility-driven media pause; route focus uses active.
   */
  onVisibilityChange?: (info: ExposureInfo) => void;
}

export interface ExposureObserverProps extends ViewProps, ExposureObserverOptions {}
