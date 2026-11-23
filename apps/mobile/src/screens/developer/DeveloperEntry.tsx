// /developer: the console with a developer session, the developer login without one (D28).
import { useDeveloperSession } from '@/state/developerSession';
import { DeveloperConsoleScreen } from './DeveloperConsoleScreen';
import { DeveloperLoginScreen } from './DeveloperLoginScreen';

export function DeveloperEntry() {
  const signedIn = useDeveloperSession((s) => s.token !== null);
  return signedIn ? <DeveloperConsoleScreen /> : <DeveloperLoginScreen />;
}
