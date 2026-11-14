// Progress (development builds only, route /progress): what is built and what is coming, per FSD
// area and per acceptance criterion. Data lives in ./progress.ts. One column on phones, two on
// tablets, three areas per row on wide screens.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { interpolate } from '@njangi/shared';
import { setLanguage } from '@/i18n';
import { contentWidth, radius, space, useBreakpoint, useTheme, type ThemeColors } from '@/theme';
import { AppHeader, Button, SegmentedControl, Txt, useLang } from '@/ui';
import { Screen } from '@/screens/shared/Screen';
import {
  acceptance,
  areas,
  overallEstimate,
  progressCopy as copy,
  progressUpdatedAt,
  tryNow,
  type ProgressStatus,
} from './progress';

const STATUS_COLOR: Record<ProgressStatus, keyof ThemeColors> = {
  done: 'statusPaid',
  inProgress: 'statusPending',
  waitingApi: 'primary',
  notStarted: 'outline',
};

function StatusTag({ status, label }: { status: ProgressStatus; label?: string }) {
  const { colors } = useTheme();
  const lang = useLang();
  const filled = status === 'done' || status === 'inProgress';
  return (
    <View style={styles.tag}>
      <View
        style={[
          styles.dot,
          { borderColor: colors[STATUS_COLOR[status]] },
          filled || status === 'waitingApi'
            ? { backgroundColor: colors[STATUS_COLOR[status]] }
            : null,
        ]}
      />
      <Txt variant="caption" numberOfLines={1}>
        {label ? `${label} · ` : ''}
        {copy.status[status][lang]}
      </Txt>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.divider }]}
    >
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="sectionTitle" accessibilityRole="header">
        {title}
      </Txt>
      {children}
    </View>
  );
}

export function ProgressScreen() {
  const router = useRouter();
  const lang = useLang();
  const { colors } = useTheme();
  const { breakpoint, gutter } = useBreakpoint();
  const columns = breakpoint === 'compact' ? 1 : breakpoint === 'medium' ? 2 : 3;
  const cell = { width: `${100 / columns}%` as const, padding: space.s2 };

  const counts = acceptance.reduce<Record<ProgressStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { done: 0, inProgress: 0, waitingApi: 0, notStarted: 0 },
  );

  return (
    <Screen
      width="full"
      header={
        <AppHeader
          kind="pushed"
          title={copy.title[lang]}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      <View style={[styles.page, { paddingHorizontal: gutter }]}>
        <View style={styles.top}>
          <Txt variant="secondary" color="textSecondary" style={styles.flex}>
            {interpolate(copy.intro[lang], { date: progressUpdatedAt })}
          </Txt>
          <SegmentedControl<'fr' | 'en'>
            accessibilityLabel="Langue / Language"
            value={lang}
            onChange={(l) => void setLanguage(l)}
            segments={[
              { key: 'fr', label: 'FR' },
              { key: 'en', label: 'EN' },
            ]}
          />
        </View>

        <View style={[styles.row, { marginHorizontal: -space.s2 }]}>
          <View style={columns === 1 ? styles.full : [cell, { width: '50%' }]}>
            <Card>
              <Txt variant="secondaryStrong" color="textSecondary">
                {copy.overall[lang]}
              </Txt>
              <Txt variant="screenTitle">{`${overallEstimate} %`}</Txt>
              <View
                style={[styles.track, { backgroundColor: colors.disabledFill }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: overallEstimate }}
              >
                <View
                  style={[
                    styles.fill,
                    { width: `${overallEstimate}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
              <View style={styles.tags}>
                {(['done', 'inProgress', 'waitingApi', 'notStarted'] as const).map((s) => (
                  <StatusTag key={s} status={s} label={`${counts[s]} AC`} />
                ))}
              </View>
            </Card>
          </View>
          <View style={columns === 1 ? [styles.full, styles.gapTop] : [cell, { width: '50%' }]}>
            <Card>
              <Txt variant="secondaryStrong" color="textSecondary">
                {copy.tryNow[lang]}
              </Txt>
              {tryNow.map((item) => (
                <Txt key={item.en} variant="secondary">
                  {`•  ${item[lang]}`}
                </Txt>
              ))}
            </Card>
          </View>
        </View>

        <Section title={copy.areas[lang]}>
          <View style={[styles.row, { marginHorizontal: -space.s2 }]}>
            {areas.map((area) => (
              <View key={area.ref} style={cell}>
                <Card>
                  <Txt variant="captionStrong" color="textSecondary">
                    {area.ref}
                  </Txt>
                  <Txt variant="bodyStrong">{area.title[lang]}</Txt>
                  <View style={styles.tags}>
                    {area.rules ? <StatusTag status={area.rules} label={copy.rules[lang]} /> : null}
                    <StatusTag status={area.api} label={copy.api[lang]} />
                    <StatusTag status={area.app} label={copy.app[lang]} />
                  </View>
                  <Txt variant="secondary" color="textSecondary">
                    {area.note[lang]}
                  </Txt>
                </Card>
              </View>
            ))}
          </View>
        </Section>

        <Section title={copy.acceptance[lang]}>
          <View style={[styles.row, { marginHorizontal: -space.s2 }]}>
            {acceptance.map((ac) => (
              <View key={ac.id} style={columns === 1 ? cell : [cell, { width: '50%' }]}>
                <Card>
                  <View style={styles.acHead}>
                    <Txt variant="captionStrong" color="textSecondary">
                      {ac.id}
                    </Txt>
                    <StatusTag status={ac.status} />
                  </View>
                  <Txt variant="bodyStrong">{ac.title[lang]}</Txt>
                  <Txt variant="secondary" color="textSecondary">
                    {ac.note[lang]}
                  </Txt>
                </Card>
              </View>
            ))}
          </View>
        </Section>

        <View style={styles.footer}>
          <Button
            variant="secondary"
            label={copy.gallery[lang]}
            onPress={() => router.push('/gallery')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: contentWidth.page, alignSelf: 'center', gap: space.s6 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s3 },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 240 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  full: { width: '100%', paddingHorizontal: space.s2 },
  gapTop: { marginTop: space.s4 },
  section: { gap: space.s2 },
  card: {
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: radius.group,
    padding: space.s4,
    gap: space.s2,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s3, rowGap: space.s1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: space.s1 + 2 },
  dot: { width: 10, height: 10, borderRadius: radius.full, borderWidth: 2 },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
  acHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.s2,
  },
  footer: { alignItems: 'flex-start' },
});
