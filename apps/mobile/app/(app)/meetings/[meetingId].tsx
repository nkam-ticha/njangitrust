import { useLocalSearchParams } from 'expo-router';
import { MeetingDetailScreen } from '@/screens/meetings/MeetingDetailScreen';

export default function MeetingRoute() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  return <MeetingDetailScreen meetingId={meetingId} />;
}
