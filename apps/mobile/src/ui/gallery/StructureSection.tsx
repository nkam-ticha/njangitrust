// Gallery: lists, chips, avatars, badges, header, segmented control, navigation layouts
// (DESIGN_SYSTEM.md 5.3 to 5.9).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';
import { space } from '@/theme';
import { ListRow } from '../lists/ListRow';
import { GroupedList } from '../lists/GroupedList';
import { SectionHeader } from '../lists/SectionHeader';
import { Chip, ChipRow } from '../chips/Chip';
import { Avatar } from '../identity/Avatar';
import { CountBadge, DotBadge, LabelBadge } from '../identity/Badge';
import { AppHeader } from '../navigation/AppHeader';
import { SegmentedControl } from '../navigation/SegmentedControl';
import { Navigation, type TabKey } from '../navigation/Navigation';
import { AmountText } from '../money/AmountText';
import { Txt } from '../primitives/Txt';
import { GallerySection, Specimen } from './GallerySection';

export function StructureSection() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<'tour' | 'fund' | 'solidarity' | 'ledger'>('tour');
  const [tab, setTab] = useState<TabKey>('njangi');
  const [filter, setFilter] = useState(true);
  const late = (
    <Txt variant="secondary" color="textDanger">
      {t('caisse.tour.late')}
    </Txt>
  );

  return (
    <>
      <GallerySection title="ListRow / GroupedList / SectionHeader">
        <SectionHeader
          title={t('caisse.tour.unpaidSection', { count: 3 })}
          actionLabel={t('common.actions.seeAll')}
          onAction={() => {}}
        />
        <View>
          <ListRow
            leading={<Avatar name="Joël Ndi" />}
            title="Joël Ndi"
            trailing={<AmountText amount={11000} />}
            trailingNote={late}
            onPress={() => {}}
          />
          <ListRow
            divider
            leading={<Avatar name="Paul Mbarga" />}
            title={t('common.youSuffix', { name: 'Paul Mbarga' })}
            trailing={<AmountText amount={11000} />}
            selected
            onPress={() => {}}
          />
          <ListRow
            divider
            leading={<Avatar name="Carine Fotso" beneficiary />}
            title={t('caisse.tour.beneficiary', { name: 'Carine', date: 'samedi à 18 h' })}
            titleWeight="regular"
            subtitle={t('caisse.tour.deadline', { date: 'demain à 18 h' })}
            chevron
            onPress={() => {}}
          />
        </View>
        <GroupedList>
          <ListRow
            title={t('moi.toPay')}
            titleWeight="regular"
            trailing={<AmountText amount={11000} />}
            chevron
            onPress={() => {}}
          />
          <ListRow
            title={t('moi.debts')}
            titleWeight="regular"
            trailing={<Txt>{t('moi.noDebts')}</Txt>}
          />
          <ListRow
            title={t('moi.reliability')}
            titleWeight="regular"
            trailing={<Txt variant="bodyStrong">92 %</Txt>}
          />
        </GroupedList>
      </GallerySection>

      <GallerySection title="Chip / Avatar / Badge">
        <ChipRow label={t('agent.chips.groupLabel')}>
          <Chip label={t('agent.chips.pay')} onPress={() => {}} />
          <Chip label={t('agent.chips.whoUnpaid')} onPress={() => {}} />
          <Chip label={t('agent.chips.missed')} onPress={() => {}} disabled />
        </ChipRow>
        <ChipRow>
          <Chip
            kind="filter"
            label={t('caisse.ledger.filters.all')}
            selected={filter}
            onPress={() => setFilter(!filter)}
          />
          <Chip
            kind="filter"
            label={t('caisse.ledger.filters.payments')}
            selected={!filter}
            onPress={() => setFilter(!filter)}
          />
        </ChipRow>
        <Specimen label="Avatar 32 / 40 / 56 / beneficiary / agent">
          <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
            <Avatar size={32} name="Paul Mbarga" />
            <Avatar size={40} name="Nadège Nkeng" />
            <Avatar size={56} name="Ivo Fon" />
            <Avatar size={40} name="Carine Fotso" beneficiary />
            <Avatar size={40} agent />
          </View>
        </Specimen>
        <Specimen label="LabelBadge / CountBadge / DotBadge">
          <View
            style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <LabelBadge icon={Lock} label={t('votes.card.secretBadge')} />
            <LabelBadge label={t('common.roles.ADMIN')} />
            <LabelBadge label={t('reliability.newMember')} />
            <CountBadge count={3} />
            <CountBadge count={120} />
            <DotBadge />
          </View>
        </Specimen>
      </GallerySection>

      <GallerySection title="AppHeader / SegmentedControl">
        <AppHeader
          kind="tab"
          groupName="Njangi des Collègues"
          unreadNotifications={2}
          onSwitchGroup={() => {}}
          onOpenNotifications={() => {}}
        />
        <AppHeader kind="pushed" title={t('caisse.entry.title', { seq: 412 })} onBack={() => {}} />
        <SegmentedControl
          accessibilityLabel={t('caisse.segmentsA11y')}
          value={segment}
          onChange={setSegment}
          segments={(['tour', 'fund', 'solidarity', 'ledger'] as const).map((key) => ({
            key,
            label: t(`caisse.segments.${key}`),
          }))}
        />
      </GallerySection>

      <GallerySection title="Navigation: tabs / rail / sidebar">
        <Navigation
          layout="tabs"
          active={tab}
          onSelect={setTab}
          unreadChat={3}
          votesWaiting={1}
          agentWaiting
        />
        <View style={{ flexDirection: 'row', height: 420, gap: space.s4 }}>
          <Navigation
            layout="rail"
            active={tab}
            onSelect={setTab}
            unreadChat={3}
            votesWaiting={1}
            agentWaiting={false}
          />
          <Navigation
            layout="sidebar"
            active={tab}
            onSelect={setTab}
            unreadChat={3}
            votesWaiting={1}
            agentWaiting={false}
            memberName="Paul Mbarga"
          />
        </View>
      </GallerySection>
    </>
  );
}
