"use client";

/**
 * useControllableState — Controlled/uncontrolled state hook
 *
 * When `prop` is provided, component is controlled (external state).
 * When only `defaultProp` is provided, component is uncontrolled (internal state).
 * `onChange` fires in both modes.
 *
 * Provenance: @radix-ui/react-use-controllable-state pattern, ~30-line implementation.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface UseControllableStateParams<T> {
  prop?: T;
  defaultProp?: T;
  onChange?: (value: T) => void;
}

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>): [T, (value: T) => void] {
  const [internalValue, setInternalValue] = useState<T>(defaultProp as T);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : internalValue;
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setValue = useCallback(
    (nextValue: T) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      onChangeRef.current?.(nextValue);
    },
    [isControlled],
  );

  return [value, setValue];
}
