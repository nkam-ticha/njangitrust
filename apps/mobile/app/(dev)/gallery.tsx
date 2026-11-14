// Component gallery (development only): every UI component in every state, with theme and
// FR/EN toggles, on Android and in the browser. Route: /gallery.
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { contentWidth, space, useTheme, type ThemePreference } from '@/theme';
import { useRouter } from 'expo-router';
import { Button, SegmentedControl, Txt } from '@/ui';
import { FoundationsSection } from '@/ui/gallery/FoundationsSection';
import { ControlsSection } from '@/ui/gallery/ControlsSection';
import { StructureSection } from '@/ui/gallery/StructureSection';
import { MoneySection } from '@/ui/gallery/MoneySection';
import { RingSection } from '@/ui/gallery/RingSection';
import { ConversationSection } from '@/ui/gallery/ConversationSection';
import { SheetsSection } from '@/ui/gallery/SheetsSection';

export default function Gallery() {
  const { colors, preference, setPreference } = useTheme();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + space.s4,
        paddingBottom: insets.bottom + space.s16,
      }}
    >
      <View style={styles.column}>
        <View style={styles.controls}>
          <Txt variant="screenTitle">UI kit</Txt>
          <Button variant="secondary" label="Progress" onPress={() => router.push('/progress')} />
          <SegmentedControl<ThemePreference>
            accessibilityLabel="Theme"
            value={preference}
            onChange={setPreference}
            segments={[
              { key: 'system', label: 'System' },
              { key: 'light', label: 'Light' },
              { key: 'dark', label: 'Dark' },
            ]}
          />
          <SegmentedControl<'fr' | 'en'>
            accessibilityLabel="Language"
            value={lang}
            onChange={(l) => void setLanguage(l)}
            segments={[
              { key: 'fr', label: 'FR' },
              { key: 'en', label: 'EN' },
            ]}
          />
        </View>
        <FoundationsSection />
        <ControlsSection />
        <StructureSection />
        <MoneySection />
        <RingSection />
        <ConversationSection />
        <SheetsSection />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: contentWidth.reading, alignSelf: 'center' },
  controls: { gap: space.s3, paddingBottom: space.s6, paddingHorizontal: 0 },
});
