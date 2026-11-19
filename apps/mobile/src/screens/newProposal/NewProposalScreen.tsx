// S-20 New proposal (SCREENS.md; GOV-01, R11, R12.1).
// Supports all FSD proposal types: MEMBER_ADD, RULE_CHANGE, ROTATION_CHANGE, ADMIN_CHANGE,
// MEMBER_REMOVE, EARLY_EXIT, FINE_WAIVER, LEDGER_CORRECTION.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PROPOSAL_RULES, thresholdCount, type ProposalType } from '@njangi/rules';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import type { CreateProposalRequest } from '@njangi/shared/contracts/proposals';
import { space } from '@/theme';
import {
  AppHeader,
  BottomSheet,
  Button,
  ChoiceRow,
  PhoneField,
  PickerField,
  TextField,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup, useMembers, useRules } from '@/features/groups/useGroups';
import { useCreateProposal, useRefreshProposals } from '@/features/proposals/useProposals';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

const PROPOSABLE_TYPES: readonly ProposalType[] = [
  'RULE_CHANGE',
  'MEMBER_ADD',
  'ROTATION_CHANGE',
  'ADMIN_CHANGE',
  'MEMBER_REMOVE',
  'EARLY_EXIT',
  'FINE_WAIVER',
  'LEDGER_CORRECTION',
];

type CommonRuleParam =
  'lateFine' | 'contributionAmount' | 'solidarityContribution' | 'voteWindowHours' | 'minBid';
const RULE_PARAMS: readonly CommonRuleParam[] = [
  'lateFine',
  'contributionAmount',
  'solidarityContribution',
  'voteWindowHours',
  'minBid',
];

export function NewProposalScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const members = useMembers(groupId);
  const rules = useRules(groupId);
  const create = useCreateProposal(groupId);
  const refresh = useRefreshProposals(groupId);

  const [type, setType] = useState<ProposalType>('MEMBER_ADD');
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  // Common reason
  const [reason, setReason] = useState('');

  // MEMBER_ADD
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);

  // RULE_CHANGE
  const [ruleParam, setRuleParam] = useState<CommonRuleParam>('lateFine');
  const [ruleParamSheetOpen, setRuleParamSheetOpen] = useState(false);
  const [ruleValue, setRuleValue] = useState('');

  // ROTATION_CHANGE
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  const [swapSecond, setSwapSecond] = useState<string | null>(null);
  const [swapSheetOpen, setSwapSheetOpen] = useState<'first' | 'second' | null>(null);

  // ADMIN_CHANGE
  const [newAdmin, setNewAdmin] = useState<string | null>(null);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);

  // MEMBER_REMOVE
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeSheetOpen, setRemoveSheetOpen] = useState(false);

  // FINE_WAIVER
  const [fineId, setFineId] = useState('');

  // LEDGER_CORRECTION
  const [ledgerSeq, setLedgerSeq] = useState('1');
  const [ledgerCorrection, setLedgerCorrection] = useState('');

  const [action, setAction] = useState<PendingActionDto | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/votes'));

  const activeMembers = (members.data ?? []).filter((m) => m.status === 'ACTIVE');
  const ruleConfig = PROPOSAL_RULES[type];
  const hasExclusion = ruleConfig?.excluded && ruleConfig.excluded !== 'NONE';
  const eligible = Math.max(0, activeMembers.length - (hasExclusion ? 1 : 0));
  const kind = ruleConfig?.threshold ?? 'MAJORITY';
  const needed = eligible > 0 ? thresholdCount(kind, eligible) : 0;
  const hours =
    type === 'SOLIDARITY_PAYOUT'
      ? (rules.data?.params.solidarityVoteWindowHours ?? 24)
      : (rules.data?.params.voteWindowHours ?? 72);

  const getTypeLabel = (pType: ProposalType): string => {
    switch (pType) {
      case 'RULE_CHANGE':
        return t('votes.types.RULE_CHANGE');
      case 'MEMBER_ADD':
        return t('votes.types.MEMBER_ADD');
      case 'ROTATION_CHANGE':
        return t('votes.types.ROTATION_CHANGE');
      case 'ADMIN_CHANGE':
        return t('votes.types.ADMIN_CHANGE');
      case 'MEMBER_REMOVE':
        return t('votes.types.MEMBER_REMOVE');
      case 'EARLY_EXIT':
        return t('votes.types.EARLY_EXIT');
      case 'FINE_WAIVER':
        return t('votes.types.FINE_WAIVER');
      case 'LEDGER_CORRECTION':
        return t('votes.types.LEDGER_CORRECTION');
      case 'ADMIN_LOAN':
        return t('votes.types.ADMIN_LOAN');
      case 'SOLIDARITY_PAYOUT':
        return t('votes.types.SOLIDARITY_PAYOUT');
    }
  };

  const getTypeHelp = (pType: ProposalType): string => {
    switch (pType) {
      case 'RULE_CHANGE':
        return t('newProposal.typeHelp.RULE_CHANGE');
      case 'MEMBER_ADD':
        return t('newProposal.typeHelp.MEMBER_ADD');
      case 'ROTATION_CHANGE':
        return t('newProposal.typeHelp.ROTATION_CHANGE');
      case 'ADMIN_CHANGE':
        return t('newProposal.typeHelp.ADMIN_CHANGE');
      case 'MEMBER_REMOVE':
        return t('newProposal.typeHelp.MEMBER_REMOVE');
      case 'EARLY_EXIT':
        return t('newProposal.typeHelp.EARLY_EXIT');
      case 'FINE_WAIVER':
        return t('newProposal.typeHelp.FINE_WAIVER');
      case 'LEDGER_CORRECTION':
        return t('newProposal.typeHelp.LEDGER_CORRECTION');
      default:
        return '';
    }
  };

  // Validation
  let valid = false;
  let requestBody: CreateProposalRequest | null = null;

  switch (type) {
    case 'MEMBER_ADD':
      valid = name.trim().length >= 2 && !!phone;
      if (valid && phone) {
        requestBody = {
          type: 'MEMBER_ADD',
          name: name.trim(),
          phone,
          reason: reason.trim() || undefined,
        };
      }
      break;
    case 'RULE_CHANGE': {
      const num = Number(ruleValue.replace(/\s+/g, ''));
      const current = rules.data?.params ? rules.data.params[ruleParam] : null;
      valid = !isNaN(num) && num > 0 && num !== current;
      if (valid) {
        requestBody = {
          type: 'RULE_CHANGE',
          changes: { [ruleParam]: num },
          reason: reason.trim() || undefined,
        };
      }
      break;
    }
    case 'ROTATION_CHANGE':
      valid = !!swapFirst && !!swapSecond && swapFirst !== swapSecond;
      if (valid && swapFirst && swapSecond) {
        requestBody = {
          type: 'ROTATION_CHANGE',
          swap: [swapFirst, swapSecond],
          reason: reason.trim() || undefined,
        };
      }
      break;
    case 'ADMIN_CHANGE':
      valid = !!newAdmin;
      if (valid && newAdmin) {
        requestBody = {
          type: 'ADMIN_CHANGE',
          membershipId: newAdmin,
          reason: reason.trim() || undefined,
        };
      }
      break;
    case 'MEMBER_REMOVE':
      valid = !!removeTarget && reason.trim().length >= 2;
      if (valid && removeTarget) {
        requestBody = {
          type: 'MEMBER_REMOVE',
          membershipId: removeTarget,
          reason: reason.trim(),
        };
      }
      break;
    case 'EARLY_EXIT':
      valid = reason.trim().length >= 2;
      if (valid) {
        requestBody = {
          type: 'EARLY_EXIT',
          reason: reason.trim(),
        };
      }
      break;
    case 'FINE_WAIVER':
      valid = fineId.trim().length >= 8 && reason.trim().length >= 2;
      if (valid) {
        requestBody = {
          type: 'FINE_WAIVER',
          fineId: fineId.trim(),
          reason: reason.trim(),
        };
      }
      break;
    case 'LEDGER_CORRECTION': {
      const seq = parseInt(ledgerSeq.trim(), 10);
      valid =
        !isNaN(seq) && seq >= 1 && ledgerCorrection.trim().length >= 2 && reason.trim().length >= 2;
      if (valid) {
        requestBody = {
          type: 'LEDGER_CORRECTION',
          seq,
          correction: ledgerCorrection.trim(),
          reason: reason.trim(),
        };
      }
      break;
    }
  }

  const currentRuleVal = rules.data?.params ? rules.data.params[ruleParam] : null;
  const isReasonRequired =
    type === 'MEMBER_REMOVE' ||
    type === 'EARLY_EXIT' ||
    type === 'FINE_WAIVER' ||
    type === 'LEDGER_CORRECTION';

  return (
    <Screen
      width="form"
      header={<AppHeader kind="pushed" title={t('newProposal.title')} onBack={back} />}
      footer={
        action ? undefined : (
          <>
            {create.error ? (
              <Txt variant="secondary" color="textDanger">
                {errorMessage(create.error, t, lang)}
              </Txt>
            ) : null}
            <Button
              fullWidth
              label={t('newProposal.prepare')}
              disabled={!valid || !requestBody}
              loading={create.isPending}
              onPress={() => requestBody && create.mutate(requestBody, { onSuccess: setAction })}
            />
          </>
        )
      }
    >
      {action ? (
        <ActionCard
          action={action}
          onConfirmed={() => {
            void refresh();
            router.replace('/votes');
          }}
          onCancelled={() => setAction(null)}
          onClose={back}
        />
      ) : (
        <>
          <Txt variant="sectionTitle" accessibilityRole="header">
            {t('newProposal.chooseType')}
          </Txt>

          <PickerField
            label={t('newProposal.chooseType')}
            value={getTypeLabel(type)}
            onPress={() => setTypeSheetOpen(true)}
          />

          <View style={{ gap: space.s4 }}>
            {type === 'MEMBER_ADD' && (
              <>
                <TextField
                  label={t('newProposal.memberAdd.name')}
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                />
                <PhoneField
                  label={t('newProposal.memberAdd.phone')}
                  helper={t('newProposal.memberAdd.phoneHelp')}
                  onChange={(e164) => setPhone(e164)}
                />
              </>
            )}

            {type === 'RULE_CHANGE' && (
              <>
                <PickerField
                  label={t('newProposal.rule.label')}
                  value={ruleParam}
                  onPress={() => setRuleParamSheetOpen(true)}
                  helper={
                    currentRuleVal !== null
                      ? t('newProposal.rule.current', { value: String(currentRuleVal) })
                      : undefined
                  }
                />
                <TextField
                  label={t('newProposal.rule.newValue')}
                  value={ruleValue}
                  onChangeText={setRuleValue}
                  keyboardType="numeric"
                  placeholder={currentRuleVal !== null ? String(currentRuleVal) : ''}
                />
              </>
            )}

            {type === 'ROTATION_CHANGE' && (
              <>
                <PickerField
                  label={t('newProposal.rotation.first')}
                  value={activeMembers.find((m) => m.membershipId === swapFirst)?.name ?? null}
                  placeholder={t('newProposal.rotation.first')}
                  onPress={() => setSwapSheetOpen('first')}
                />
                <PickerField
                  label={t('newProposal.rotation.second')}
                  value={activeMembers.find((m) => m.membershipId === swapSecond)?.name ?? null}
                  placeholder={t('newProposal.rotation.second')}
                  onPress={() => setSwapSheetOpen('second')}
                />
                <Txt variant="secondary" color="textSecondary">
                  {t('newProposal.rotation.note')}
                </Txt>
              </>
            )}

            {type === 'ADMIN_CHANGE' && (
              <>
                <PickerField
                  label={t('newProposal.admin.member')}
                  value={activeMembers.find((m) => m.membershipId === newAdmin)?.name ?? null}
                  placeholder={t('newProposal.admin.member')}
                  onPress={() => setAdminSheetOpen(true)}
                />
                <Txt variant="secondary" color="textSecondary">
                  {t('newProposal.admin.note')}
                </Txt>
              </>
            )}

            {type === 'MEMBER_REMOVE' && (
              <>
                <PickerField
                  label={t('newProposal.memberRemove.member')}
                  value={activeMembers.find((m) => m.membershipId === removeTarget)?.name ?? null}
                  placeholder={t('newProposal.memberRemove.member')}
                  onPress={() => setRemoveSheetOpen(true)}
                />
                <Txt variant="secondary" color="textSecondary">
                  {t('newProposal.memberRemove.note')}
                </Txt>
              </>
            )}

            {type === 'EARLY_EXIT' && (
              <Txt variant="secondary" color="textSecondary">
                {t('newProposal.earlyExit.note')}
              </Txt>
            )}

            {type === 'FINE_WAIVER' && (
              <>
                <TextField
                  label={t('newProposal.fineWaiver.fine')}
                  value={fineId}
                  onChangeText={setFineId}
                  placeholder="ID de l'amende (obligation UUID)"
                />
                <Txt variant="secondary" color="textSecondary">
                  {t('newProposal.fineWaiver.note')}
                </Txt>
              </>
            )}

            {type === 'LEDGER_CORRECTION' && (
              <>
                <TextField
                  label={t('newProposal.ledgerCorrection.seq')}
                  value={ledgerSeq}
                  onChangeText={setLedgerSeq}
                  keyboardType="numeric"
                />
                <TextField
                  label={t('newProposal.ledgerCorrection.correction')}
                  value={ledgerCorrection}
                  onChangeText={setLedgerCorrection}
                  multiline
                />
                <Txt variant="secondary" color="textSecondary">
                  {t('newProposal.ledgerCorrection.note')}
                </Txt>
              </>
            )}

            <TextField
              label={`${t('newProposal.reason')} ${
                isReasonRequired
                  ? `(${lang === 'fr' ? 'obligatoire' : 'required'})`
                  : `(${t('common.optional').toLocaleLowerCase(lang)})`
              }`}
              placeholder={t('newProposal.reasonPlaceholder')}
              helper={t('newProposal.reasonHelp')}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
            />
          </View>

          {needed > 0 ? (
            <Txt>
              {t('newProposal.preview', {
                needed,
                eligible,
                kind: t(
                  kind === 'MAJORITY'
                    ? 'newProposal.previewKinds.majority'
                    : 'newProposal.previewKinds.twoThirds',
                ),
              })}
            </Txt>
          ) : null}
          <Txt variant="secondary" color="textSecondary">
            {t('newProposal.window', { duration: t('time.duration.hours', { count: hours }) })}
          </Txt>
          {type === 'MEMBER_ADD' && (
            <Txt variant="secondary" color="textSecondary">
              {t('newProposal.memberAdd.effect')}
            </Txt>
          )}

          {/* Type Selection Sheet */}
          <BottomSheet
            visible={typeSheetOpen}
            onClose={() => setTypeSheetOpen(false)}
            title={t('newProposal.chooseType')}
          >
            <ScrollView style={styles.sheetScroll}>
              {PROPOSABLE_TYPES.map((item) => (
                <ChoiceRow
                  key={item}
                  label={getTypeLabel(item)}
                  description={getTypeHelp(item)}
                  selected={type === item}
                  onPress={() => {
                    setType(item);
                    setTypeSheetOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </BottomSheet>

          {/* Rule Parameter Sheet */}
          <BottomSheet
            visible={ruleParamSheetOpen}
            onClose={() => setRuleParamSheetOpen(false)}
            title={t('newProposal.rule.label')}
          >
            <ScrollView style={styles.sheetScroll}>
              {RULE_PARAMS.map((param) => (
                <ChoiceRow
                  key={param}
                  label={param}
                  selected={ruleParam === param}
                  onPress={() => {
                    setRuleParam(param);
                    setRuleParamSheetOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </BottomSheet>

          {/* Rotation Member Selection Sheets */}
          <BottomSheet
            visible={swapSheetOpen !== null}
            onClose={() => setSwapSheetOpen(null)}
            title={
              swapSheetOpen === 'first'
                ? t('newProposal.rotation.first')
                : t('newProposal.rotation.second')
            }
          >
            <ScrollView style={styles.sheetScroll}>
              {activeMembers.map((m) => (
                <ChoiceRow
                  key={m.membershipId}
                  label={m.name}
                  selected={
                    swapSheetOpen === 'first'
                      ? swapFirst === m.membershipId
                      : swapSecond === m.membershipId
                  }
                  onPress={() => {
                    if (swapSheetOpen === 'first') setSwapFirst(m.membershipId);
                    else setSwapSecond(m.membershipId);
                    setSwapSheetOpen(null);
                  }}
                />
              ))}
            </ScrollView>
          </BottomSheet>

          {/* Admin Member Selection Sheet */}
          <BottomSheet
            visible={adminSheetOpen}
            onClose={() => setAdminSheetOpen(false)}
            title={t('newProposal.admin.member')}
          >
            <ScrollView style={styles.sheetScroll}>
              {activeMembers
                .filter((m) => m.role !== 'ADMIN')
                .map((m) => (
                  <ChoiceRow
                    key={m.membershipId}
                    label={m.name}
                    selected={newAdmin === m.membershipId}
                    onPress={() => {
                      setNewAdmin(m.membershipId);
                      setAdminSheetOpen(false);
                    }}
                  />
                ))}
            </ScrollView>
          </BottomSheet>

          {/* Member Removal Selection Sheet */}
          <BottomSheet
            visible={removeSheetOpen}
            onClose={() => setRemoveSheetOpen(false)}
            title={t('newProposal.memberRemove.member')}
          >
            <ScrollView style={styles.sheetScroll}>
              {activeMembers
                .filter((m) => m.role !== 'ADMIN' && m.membershipId !== group?.membershipId)
                .map((m) => (
                  <ChoiceRow
                    key={m.membershipId}
                    label={m.name}
                    selected={removeTarget === m.membershipId}
                    onPress={() => {
                      setRemoveTarget(m.membershipId);
                      setRemoveSheetOpen(false);
                    }}
                  />
                ))}
            </ScrollView>
          </BottomSheet>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sheetScroll: {
    maxHeight: 380,
  },
});
