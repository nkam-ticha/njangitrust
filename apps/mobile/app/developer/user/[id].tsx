import { Redirect, useLocalSearchParams } from 'expo-router';
import { UserDetailScreen } from '@/screens/developer/UserDetailScreen';
import { useDeveloperSession } from '@/state/developerSession';

export default function DeveloperUserRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const signedIn = useDeveloperSession((s) => s.token !== null);
  if (!signedIn || !id) return <Redirect href="/developer" />;
  return <UserDetailScreen id={id} />;
}
