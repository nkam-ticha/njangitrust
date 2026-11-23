// React side of the single-flight guard (singleFlight.ts).
import { useRef, useState } from 'react';
import { createSingleFlight, type FlightState, type SingleFlight } from './singleFlight';

/** How long a tap that returned at once keeps the button from firing again. */
export const PRESS_COOLDOWN_MS = 600;

export function useSingleFlight(cooldownMs = PRESS_COOLDOWN_MS): {
  run: SingleFlight['run'];
  working: boolean;
  locked: boolean;
} {
  const [state, setState] = useState<FlightState>({ working: false, locked: false });
  const flight = useRef<SingleFlight | null>(null);
  flight.current ??= createSingleFlight({ cooldownMs, onChange: setState });
  return { run: (fn) => flight.current!.run(fn), working: state.working, locked: state.locked };
}
