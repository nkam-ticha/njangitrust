// Gallery: feedback, money display, ledger rows, every ConfirmationCard state, information cards,
// proposals (DESIGN_SYSTEM.md 5.12 to 5.22).
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Copy, FileText, Link, Smartphone, Vote } from 'lucide-react-native';
import { formatAmount, formatXAF } from '@njangi/shared';
import { space } from '@/theme';
import { useLang } from '../primitives/useLang';
import { Banner } from '../feedback/Banner';
import { DailyCheckStrip } from '../feedback/DailyCheckStrip';
import { EmptyState } from '../feedback/EmptyState';
import { SkeletonRows } from '../feedback/Skeleton';
import { AmountText } from '../money/AmountText';
import { MaskedNumber } from '../money/MaskedNumber';
import { LedgerRow } from '../money/LedgerRow';
import { ConfirmationCard } from '../confirmation/ConfirmationCard';
import { InfoCard } from '../confirmation/InfoCard';
import { ProposalCard } from '../votes/ProposalCard';
import { Txt } from '../primitives/Txt';
import { GallerySection, Specimen } from './GallerySection';
import { changeNumberAction, payAction, ruleChange, secretVote, withdrawAction } from './fixtures';

const noop = () => {};

export function MoneySection() {
  const { t } = useTranslation();
  const lang = useLang();
  const fine = t('votes.titles.ruleChange', {
    rule: t('rules.lateFine.label'),
    from: formatAmount(1000, lang),
    to: formatXAF(1500, lang),
  });
  const card = {
    onConfirm: noop,
    onCancel: noop,
    onRetry: noop,
    onPrepareAgain: noop,
    onViewLedger: noop,
    onClose: noop,
    operator: 'MTN',
    maskedNumber: '6•• •• •3 21',
  };
  const twoMinLeft = new Date('2026-11-05T13:40:30.000Z');

  return (
    <>
      <GallerySection title="Banner / DailyCheckStrip / EmptyState / Skeleton">
        <Banner kind="offline" text={t('offline.banner', { time: '14:32' })} />
        <Banner
          kind="error"
          text={t('withdraw.paused')}
          actionLabel={t('caisse.dailyCheck.details')}
          onAction={noop}
        />
        <Banner kind="info" text={t('withdraw.hold', { date: 'jeudi 7 à 14 h' })} />
        <Banner
          kind="summary"
          text={t('chat.summarize.banner', { count: 34 })}
          actionLabel={t('chat.summarize.action')}
          onAction={noop}
        />
        <DailyCheckStrip status="OK" onPress={noop} />
        <DailyCheckStrip status="WARNING" onPress={noop} />
        <DailyCheckStrip status="ALERT" onPress={noop} />
        <DailyCheckStrip status="NOT_YET" onPress={noop} />
        <EmptyState
          icon={Vote}
          title={t('votes.title')}
          body={t('votes.emptyOpen')}
          actionLabel={t('votes.propose')}
          onAction={noop}
        />
        <SkeletonRows rows={3} delayMs={0} />
      </GallerySection>

      <GallerySection title="AmountText / MaskedNumber / LedgerRow">
        <Specimen label="display / large / total / body / small / signed / secondary">
          <AmountText amount={70000} size="display" align="left" />
          <AmountText amount={37003} size="large" align="left" />
          <AmountText amount={11000} size="total" align="left" />
          <AmountText amount={10000} align="left" />
          <AmountText amount={1000} size="small" align="left" />
          <AmountText amount={10900} sign="always" align="left" />
          <AmountText amount={-99090} align="left" />
          <AmountText amount={1000} tone="secondary" align="left" />
          <MaskedNumber e164="+237677123789" />
          <MaskedNumber e164="+237677123456" own variant="amountLarge" />
        </Specimen>
        <View>
          <LedgerRow
            seq={412}
            type="PAYMENT_RECEIVED"
            description="Paiement reçu : Larissa Ngono, tour 4"
            when="5 nov., 11:04"
            cashAmount={10900}
            operatorRef="MP2611A9F2"
            onPress={noop}
          />
          <LedgerRow
            divider
            seq={410}
            type="EVENT"
            description="Vote ouvert : amende de retard"
            when="4 nov., 20:31"
            cashAmount={null}
            onPress={noop}
          />
          <LedgerRow
            divider
            seq={405}
            type="FINE_ASSESSED"
            description="Amende : Joël Ndi, tour 3"
            when="30 oct., 18:00"
            cashAmount={null}
            amount={1000}
            onPress={noop}
            selected
          />
          <LedgerRow
            divider
            seq={404}
            type="WITHDRAWAL_COMPLETED"
            description="Retrait : Ivo Fon, tour 3"
            when="31 oct., 19:20"
            cashAmount={-99090}
            operatorRef="MD2610F0B7"
            onPress={noop}
          />
        </View>
      </GallerySection>

      <GallerySection title="ConfirmationCard">
        <View style={{ paddingHorizontal: space.s4, gap: space.s5 }}>
          <Specimen label="PENDING" padded={false}>
            <ConfirmationCard action={payAction('PENDING')} {...card} />
          </Specimen>
          <Specimen label="PENDING, 2 minutes left" padded={false}>
            <ConfirmationCard action={payAction('PENDING')} {...card} now={twoMinLeft} />
          </Specimen>
          <Specimen label="PENDING, offline" padded={false}>
            <ConfirmationCard action={payAction('PENDING')} {...card} offline />
          </Specimen>
          <Specimen label="PENDING, L2" padded={false}>
            <ConfirmationCard action={changeNumberAction} {...card} />
          </Specimen>
          <Specimen label="CONFIRMED (payment)" padded={false}>
            <ConfirmationCard action={payAction('CONFIRMED')} {...card} stillWaiting />
          </Specimen>
          <Specimen label="CONFIRMED (withdrawal)" padded={false}>
            <ConfirmationCard action={withdrawAction} {...card} />
          </Specimen>
          <Specimen label="CONFIRMED, operator silent at 10 min" padded={false}>
            <ConfirmationCard action={payAction('CONFIRMED')} {...card} operatorSilent />
          </Specimen>
          <Specimen label="DONE" padded={false}>
            <ConfirmationCard action={payAction('DONE')} {...card} />
          </Specimen>
          <Specimen label="FAILED" padded={false}>
            <ConfirmationCard action={payAction('FAILED')} {...card} />
          </Specimen>
          <Specimen label="EXPIRED" padded={false}>
            <ConfirmationCard action={payAction('EXPIRED')} {...card} />
          </Specimen>
          <Specimen label="CANCELLED / compact" padded={false}>
            <ConfirmationCard action={payAction('CANCELLED')} {...card} />
            <ConfirmationCard action={payAction('CANCELLED')} {...card} compact />
          </Specimen>
        </View>
      </GallerySection>

      <GallerySection title="InfoCard">
        <View style={{ paddingHorizontal: space.s4, gap: space.s4 }}>
          <InfoCard
            icon={Smartphone}
            title={t('infoCards.paymentNumber.title')}
            value={<MaskedNumber e164="+237677123456" own variant="amountLarge" />}
            lines={[
              'MTN',
              t('infoCards.paymentNumber.since', { date: '2 octobre' }),
              t('infoCards.paymentNumber.onlyYou'),
            ]}
            actions={[
              { label: t('infoCards.paymentNumber.change'), onPress: noop },
              { label: t('infoCards.paymentNumber.copy'), onPress: noop, copies: true },
            ]}
          />
          <InfoCard
            icon={FileText}
            title={t('infoCards.statement.title', { period: 'octobre 2026' })}
            lines={[
              t('infoCards.statement.meta', { size: '84 Ko' }),
              t('infoCards.statement.code', { code: '3F9A1C0752BE' }),
            ]}
            actions={[
              { label: t('infoCards.statement.open'), onPress: noop },
              { label: t('infoCards.statement.share'), onPress: noop },
            ]}
          />
          <InfoCard
            icon={Link}
            title={t('infoCards.inviteLink.title', { name: 'Hervé Kamga' })}
            lines={[t('infoCards.inviteLink.validity', { date: 'dimanche 8 novembre à 14 h' })]}
            actions={[
              { label: t('infoCards.inviteLink.shareWhatsApp'), onPress: noop, variant: 'primary' },
              { label: t('infoCards.inviteLink.copyLink'), onPress: noop, copies: true },
            ]}
          />
          <InfoCard
            icon={Copy}
            title={t('infoCards.ledgerExport.title', { group: 'Njangi des Collègues' })}
            lines={[
              t('infoCards.ledgerExport.metaCsv', { count: 412 }),
              t('infoCards.ledgerExport.masked'),
            ]}
            actions={[
              { label: t('infoCards.ledgerExport.download'), onPress: noop, offline: true },
            ]}
          />
        </View>
      </GallerySection>

      <GallerySection title="ProposalCard">
        <View style={{ paddingHorizontal: space.s4, gap: space.s4 }}>
          <ProposalCard
            type="RULE_CHANGE"
            title={fine}
            proposerName="Sandrine Ewane"
            secret={false}
            status="OPEN"
            {...ruleChange}
            timeLeft={t('time.duration.days', { count: 2 })}
            myVote="none"
            onYes={noop}
            onNo={noop}
          />
          <ProposalCard
            type="MEMBER_REMOVE"
            title={t('votes.titles.memberRemove', { name: 'Joël Ndi' })}
            proposerName="Nadège Nkeng"
            secret
            status="OPEN"
            {...secretVote}
            yes={null}
            no={null}
            timeLeft={t('time.duration.hours', { count: 30 })}
            myVote="secret"
          />
          <ProposalCard
            type="MEMBER_REMOVE"
            title={t('votes.titles.memberRemove', { name: 'Joël Ndi' })}
            proposerName="Nadège Nkeng"
            secret
            status="OPEN"
            {...secretVote}
            yes={null}
            no={null}
            myVote="none"
            notEligible="excludedTarget"
          />
          <ProposalCard
            type="RULE_CHANGE"
            title={fine}
            proposerName="Sandrine Ewane"
            secret={false}
            status="OPEN"
            {...ruleChange}
            myVote="none"
            offline
          />
          <ProposalCard
            type="RULE_CHANGE"
            title={t('votes.titles.ruleChange', {
              rule: t('rules.solidarityContribution.label'),
              from: formatAmount(500, lang),
              to: formatXAF(1000, lang),
            })}
            proposerName="Nkam Ticha"
            secret={false}
            status="PASSED"
            eligible={10}
            needed={7}
            yes={8}
            no={1}
            voted={9}
            myVote="yes"
            effect={t('votes.card.effect.round', { round: 2 })}
          />
          <Txt variant="caption" color="textSecondary">
            {t('votes.threshold.countsEligible')}
          </Txt>
        </View>
      </GallerySection>
    </>
  );
}
