import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Component, Ref } from 'react';
import type { ScrollViewProps } from 'react-native';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation, ReduceMotion, scrollTo, useAnimatedProps, useAnimatedRef,
  useAnimatedReaction, useAnimatedStyle, useDerivedValue, useScrollOffset, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { thresholdReached } from './haptics';
import type { RefreshProps, RefreshState } from './types';

const spring = { duration: 400, dampingRatio: 1, overshootClamping: true, reduceMotion: ReduceMotion.System } as const;
const nativeBounce = Platform.OS === 'ios';

export function useRefresh<T extends Component>(
  {
    onRefresh, onStateChange, refreshRef, enabled = true, headerHeight = 64,
    dragRate = 0.5, maxDragRate = 2, hapticsEnabled = true,
    scrollEnabled = true, contentInset, contentOffset,
  }: RefreshProps & Pick<ScrollViewProps, 'scrollEnabled' | 'contentInset' | 'contentOffset'>,
  forwardedRef?: Ref<T>,
) {
  if (!Number.isFinite(headerHeight) || headerHeight <= 0 ||
      !Number.isFinite(dragRate) || dragRate <= 0 ||
      !Number.isFinite(maxDragRate) || maxDragRate < 1) {
    throw new Error('Refresh requires headerHeight > 0, dragRate > 0 and maxDragRate >= 1 (finite numbers).');
  }

  const scrollRef = useAnimatedRef<T>();
  const top = -(contentInset?.top ?? 0);
  const initialOffset = useSharedValue(contentOffset?.y ?? top);
  // Observes native events independently; the caller keeps its original handlers.
  const offset = useScrollOffset(scrollRef, initialOffset);
  const state = useSharedValue<RefreshState>('idle');
  const distance = useSharedValue(0);
  const progress = useDerivedValue(() => distance.get() / headerHeight);
  const active = useSharedValue(false);
  const cycle = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const didHaptic = useSharedValue(false);
  const dragging = useSharedValue(false);
  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onStateChange, hapticsEnabled });

  useLayoutEffect(() => {
    callbacks.current = { onRefresh, onStateChange, hapticsEnabled };
  }, [onRefresh, onStateChange, hapticsEnabled]);
  useLayoutEffect(() => {
    mounted.current = true;
    active.set(true);
    return () => {
      mounted.current = false;
      scheduleOnUI(() => {
        'worklet';
        active.set(false);
        cycle.set(cycle.get() + 1);
        cancelAnimation(distance);
      });
    };
  }, [active, cycle, distance]);

  // T is a class instance; Reanimated's ref type also accepts function components.
  useImperativeHandle(forwardedRef, () => scrollRef.current as T, [scrollRef]);

  const notifyState = useCallback((next: RefreshState) => {
    if (mounted.current) callbacks.current.onStateChange?.(next);
  }, []);
  const notifyHaptic = useCallback(() => {
    if (mounted.current && callbacks.current.hapticsEnabled) thresholdReached();
  }, []);
  const transition = useCallback((next: RefreshState) => {
    'worklet';
    if (!active.get() || state.get() === next) return;
    state.set(next);
    scheduleOnRN(notifyState, next);
  }, [active, state, notifyState]);

  const settle = useCallback(() => {
    'worklet';
    if (!active.get() || state.get() === 'idle' || state.get() === 'settling') return;
    cycle.set(cycle.get() + 1);
    if (nativeBounce && (state.get() === 'pulling' || state.get() === 'armed')) {
      dragging.set(false);
      transition('idle');
      return;
    }
    transition('settling');
    distance.set(withSpring(0, spring, (finished) => {
      if (finished && active.get()) transition('idle');
    }));
  }, [active, state, cycle, transition, distance, dragging]);

  const notifyRefresh = useCallback((id: number) => {
    if (!mounted.current || cycle.get() !== id) return;
    try {
      callbacks.current.onRefresh();
    } catch (error) {
      scheduleOnUI(settle);
      throw error;
    }
  }, [cycle, settle]);

  const begin = useCallback(() => {
    'worklet';
    if (!active.get() || !enabled || state.get() === 'refreshing' || state.get() === 'settling') return;
    cancelAnimation(distance);
    cycle.set(cycle.get() + 1);
    transition('refreshing');
    scrollTo(scrollRef, 0, top, false);
    distance.set(withSpring(headerHeight, spring));
    scheduleOnRN(notifyRefresh, cycle.get());
  }, [active, enabled, state, distance, cycle, transition, scrollRef, top, headerHeight, notifyRefresh]);

  useImperativeHandle(refreshRef, () => ({
    beginRefresh: () => scheduleOnUI(begin),
    finishRefresh: () => scheduleOnUI(() => {
      'worklet';
      if (state.get() === 'refreshing') settle();
    }),
  }), [begin, settle, state]);

  useAnimatedReaction(
    () => ({ y: offset.get(), touching: dragging.get(), current: state.get() }),
    ({ y, touching, current }) => {
      if (!nativeBounce || !active.get() || current === 'refreshing' || current === 'settling') return;
      const pulled = Math.max(0, top - y);
      distance.set(pulled);
      if (!enabled || !touching) return;
      transition(pulled >= headerHeight ? 'armed' : pulled > 0 ? 'pulling' : 'idle');
      if (pulled >= headerHeight && !didHaptic.get()) {
        didHaptic.set(true);
        if (hapticsEnabled) scheduleOnRN(notifyHaptic);
      }
    },
  );

  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      if (!active.get()) return;
      if (state.get() === 'pulling' || state.get() === 'armed') settle();
      // Disabling refresh never abandons a running request.
      if (state.get() === 'refreshing') distance.set(withSpring(headerHeight, spring));
    });
  }, [enabled, scrollEnabled, headerHeight, dragRate, maxDragRate, active, state, settle, distance]);

  const pan = Gesture.Pan()
    .enabled(enabled && scrollEnabled)
    .manualActivation(true)
    .maxPointers(1)
    .onTouchesDown((event, manager) => {
      dragging.set(false);
      didHaptic.set(false);
      if (!active.get() || state.get() !== 'idle' || (!nativeBounce && offset.get() > top + 1) || event.numberOfTouches !== 1) {
        manager.fail();
        return;
      }
      startX.set(event.allTouches[0].absoluteX);
      startY.set(event.allTouches[0].absoluteY);
    })
    .onTouchesMove((event, manager) => {
      if (dragging.get()) return;
      if (event.numberOfTouches !== 1 || state.get() !== 'idle') {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      const dx = Math.abs(touch.absoluteX - startX.get());
      const dy = touch.absoluteY - startY.get();
      if (nativeBounce) {
        if (dx > 8 && dx >= Math.abs(dy)) manager.fail();
        else if (Math.abs(dy) > 8) manager.activate();
        return;
      }
      if (dx > 8 || dy < -8) manager.fail();
      else if (dy > 8 && dy > dx) manager.activate();
    })
    .onTouchesUp((_event, manager) => {
      if (!dragging.get()) manager.fail();
    })
    .onStart(() => {
      if (!active.get() || state.get() !== 'idle') return;
      dragging.set(true);
      if (!nativeBounce) transition('pulling');
    })
    .onUpdate((event) => {
      if (nativeBounce) return;
      if (state.get() !== 'pulling' && state.get() !== 'armed') return;
      const pulled = Math.min(Math.max(0, event.absoluteY - startY.get()) * dragRate, headerHeight * maxDragRate);
      distance.set(pulled);
      const armed = pulled >= headerHeight;
      transition(armed ? 'armed' : 'pulling');
      if (armed && !didHaptic.get()) {
        didHaptic.set(true);
        if (hapticsEnabled) scheduleOnRN(notifyHaptic);
      }
    })
    .onEnd((_event, success) => {
      dragging.set(false);
      if (success && (nativeBounce ? top - offset.get() >= headerHeight : state.get() === 'armed')) begin();
      else if (nativeBounce) transition('idle');
      else if (state.get() === 'pulling' || state.get() === 'armed') settle();
    })
    .onFinalize(() => {
      dragging.set(false);
      if (nativeBounce && (state.get() === 'pulling' || state.get() === 'armed')) transition('idle');
      if (state.get() === 'pulling' || state.get() === 'armed') settle();
    });

  // Ordinary scrolling must not wait for a UI-worklet round trip to fail Pan.
  // Only a pull that started at the top locks the scrollable below.
  const nativeGesture = Gesture.Native()
    .enabled(enabled && scrollEnabled)
    .shouldCancelWhenOutside(false)
    .simultaneousWithExternalGesture(pan);
  const animatedProps = useAnimatedProps(() => ({
    scrollEnabled: scrollEnabled && (nativeBounce
      ? state.get() !== 'refreshing' && state.get() !== 'settling'
      : state.get() === 'idle'),
  }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: nativeBounce
    ? (state.get() === 'refreshing' || state.get() === 'settling'
      ? distance.get() - Math.max(0, top - offset.get()) : 0)
    : distance.get() }] }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: enabled || state.get() === 'refreshing' || state.get() === 'settling' ? 1 : 0,
    transform: [{ translateY: distance.get() - headerHeight }],
  }));

  return { scrollRef, pan, nativeGesture, animatedProps, contentStyle, headerStyle, headerHeight,
    header: { state, distance, progress } };
}
