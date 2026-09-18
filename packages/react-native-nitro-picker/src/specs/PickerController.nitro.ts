import type { HybridObject } from 'react-native-nitro-modules';

export interface PickerConfig {
  epoch: number;
  count: number;
  itemHeight: number;
  selectedIndex: number;
  immediateChange: boolean;
}

export interface PickerEvent {
  epoch: number;
  index: number;
  phase: string;
  error: string;
}

/** One native controller per Fabric ScrollView column. */
export interface PickerController extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  connect(viewTag: number, config: PickerConfig, callback: (event: PickerEvent) => void): void;
  configure(config: PickerConfig): void;
  step(delta: number): void;
  stop(): void;
  disconnect(): void;
}
