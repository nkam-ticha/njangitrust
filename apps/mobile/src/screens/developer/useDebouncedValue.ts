import { useEffect, useState } from 'react';

/** A value that follows `value` after it has stopped changing for `ms` (search boxes). */
export function useDebouncedValue<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
