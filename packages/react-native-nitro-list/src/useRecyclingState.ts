import { createContext, useCallback, useContext, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const RecyclingKeyContext = createContext<string | null>(null);

/**
 * State owned by an item while it occupies a recycled slot. Changing the item
 * resets it before children render. Late setters belonging to the old item are
 * ignored; async effects must still cancel their own external side effects.
 */
export function useRecyclingState<T>(
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const key = useContext(RecyclingKeyContext);
  if (key === null) {
    throw new Error('useRecyclingState must be used inside a NitroList renderItem component.');
  }
  const initialize = () =>
    typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  const [stored, setStored] = useState(() => ({ key, value: initialize(), generation: 0 }));
  let value = stored.value;
  let generation = stored.generation;
  if (stored.key !== key) {
    value = initialize();
    generation += 1;
    setStored({ key, value, generation });
  }
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setStored((previous) => {
      if (previous.key !== key || previous.generation !== generation) return previous;
      const next = typeof action === 'function'
        ? (action as (value: T) => T)(previous.value)
        : action;
      return Object.is(previous.value, next) ? previous : { key, value: next, generation };
    });
  }, [key, generation]);
  return [value, setValue];
}
