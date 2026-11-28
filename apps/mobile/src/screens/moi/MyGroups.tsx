// Moi > Mes groupes (FSD GRP-05): one card per group with its name, my role, the round in progress, what
// I owe now, what I can withdraw, unread messages and open votes. Every figure is the server's
// (GET /me/summary); nothing is added up across groups. Tapping a card makes that group the active one.
// While the summary loads, or if it cannot be read, each group still shows as a plain row.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { formatDateShort } from '@njangi/shared';
import type { MyGroupDto, SummaryGroupDto } from '@njangi/shared/contracts/me';
import { radius, space, useTheme } from '@/theme';
import { AmountText, LabelBadge, Touchable, Txt, amountLabel, useLang } from '@/ui';
import { useCombinedSummary } from '@/features/me/useCombinedSummary';

interface MyGroupsProps {
  groups: MyGroupDto[];
  activeId: string | null;
  onSelect: (groupId: string) => void;
}

export function MyGroups({ groups, activeId, onSelect }: MyGroupsProps) {
  const summary = useCombinedSummary();
  const byId = new Map((summary.data?.groups ?? []).map((g) => [g.groupId, g]));
  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <GroupCard
          key={group.groupId}
          group={group}
          summary={byId.get(group.groupId) ?? null}
          active={group.groupId === activeId}
          onSelect={() => onSelect(group.groupId)}
        />
      ))}
    </View>
  );
}

function GroupCard({
  group,
  summary,
  active,
  onSelect,
}: {
  group: MyGroupDto;
  summary: SummaryGroupDto | null;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const admin = group.role === 'ADMIN';
  const forming = (summary?.status ?? group.status) === 'FORMING';
  const round = summary?.currentRound ?? null;

  const spoken = [
    group.name,
    admin ? t('common.roles.ADMIN') : null,
    forming ? t('groupSwitcher.rowNotStarted') : null,
    round ? t('common.roundOf', { round: round.number, total: round.total }) : null,
    summary && !forming
      ? summary.myDue > 0
        ? `${t('moi.toPay')} ${amountLabel(summary.myDue, lang)}`
        : t('moi.upToDate')
      : null,
    summary && !forming ? `${t('moi.available')} ${amountLabel(summary.available, lang)}` : null,
    summary?.unreadMessages ? t('moi.summary.unread', { count: summary.unreadMessages }) : null,
    summary?.openVotes ? t('moi.summary.votes', { count: summary.openVotes }) : null,
    active ? t('groupSwitcher.active') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Touchable
      onPress={onSelect}
      radius={radius.group}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: active }}
    >
      <View
        style={[
          styles.card,
          { borderColor: active ? colors.primary : colors.divider },
          active && styles.cardActive,
        ]}
      >
        <View style={styles.head}>
          <Txt variant="bodyStrong" style={styles.flex} numberOfLines={2}>
            {group.name}
          </Txt>
          {admin ? <LabelBadge label={t('common.roles.ADMIN')} /> : null}
          {active ? <Check size={20} color={colors.iconActive} strokeWidth={2} /> : null}
        </View>

        {forming ? (
          <Txt variant="secondary" color="textSecondary">
            {t('groupSwitcher.rowNotStarted')}
          </Txt>
        ) : null}

        {summary && !forming ? (
          <>
            {round ? (
              <Txt variant="secondary" color="textSecondary">
                {`${t('common.roundOf', { round: round.number, total: round.total })} · ${t('caisse.tour.deadline', { date: formatDateShort(round.dueAt, lang) })}`}
              </Txt>
            ) : null}
            <View style={styles.figures}>
              <Figure label={t('moi.toPay')}>
                {summary.myDue > 0 ? (
                  <AmountText amount={summary.myDue} size="small" align="left" />
                ) : (
                  <Txt variant="secondaryStrong">{t('moi.upToDate')}</Txt>
                )}
              </Figure>
              <Figure label={t('moi.available')}>
                <AmountText amount={summary.available} size="small" align="left" />
              </Figure>
            </View>
            {summary.unreadMessages > 0 || summary.openVotes > 0 ? (
              <View style={styles.badges}>
                {summary.unreadMessages > 0 ? (
                  <LabelBadge label={t('moi.summary.unread', { count: summary.unreadMessages })} />
                ) : null}
                {summary.openVotes > 0 ? (
                  <LabelBadge label={t('moi.summary.votes', { count: summary.openVotes })} />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {!summary && !forming ? (
          <Txt variant="secondary" color="textSecondary">
            {t('common.membersCount', { count: group.memberCount })}
          </Txt>
        ) : null}
      </View>
    </Touchable>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.figure}>
      <Txt variant="caption" color="textSecondary">
        {label}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.s3 },
  card: {
    borderWidth: 1,
    borderRadius: radius.group,
    padding: space.s4,
    gap: space.s2,
    minHeight: 56,
  },
  cardActive: { borderWidth: 2, padding: space.s4 - 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  flex: { flex: 1, minWidth: 0 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s6, rowGap: space.s2 },
  figure: { gap: 2, minWidth: 120 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
});
