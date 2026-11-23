import { Redirect, useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/screens/developer/GroupDetailScreen';
import { useDeveloperSession } from '@/state/developerSession';

export default function DeveloperGroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const signedIn = useDeveloperSession((s) => s.token !== null);
  if (!signedIn || !id) return <Redirect href="/developer" />;
  return <GroupDetailScreen id={id} />;
}
