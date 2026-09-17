import type { HybridObject } from 'react-native-nitro-modules';

export interface ExposureConfig {
  key: string;
  epoch: number;
  visiblePercentThreshold: number;
  minimumViewTime: number;
  enabled: boolean;
  active: boolean;
}

export interface ExposureEvent {
  key: string;
  epoch: number;
  isViewable: boolean;
  visiblePercent: number;
  timestamp: number;
  error?: string;
}

export interface ExposureController extends HybridObject<{ android: 'kotlin' }> {
  observe(targetTag: number, config: ExposureConfig, callback: (event: ExposureEvent) => void): void;
  configure(config: ExposureConfig): void;
  disconnect(): void;
}
