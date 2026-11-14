// Inviting a founding member (S-08, R1.6, ACC-03): name and phone → INVITE_CREATE card → the link,
// shown once, to send by WhatsApp or the share sheet. The phone is never shown to other members.
import { useState } from 'react';
import { Linking, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link as LinkIcon } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import { inviteCreatedSchema, type InviteCreatedDto } from '@njangi/shared/contracts/invites';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { useSession } from '@/state/session';
import { BottomSheet, Button, InfoCard, PhoneField, TextField, Txt, useLang } from '@/ui';
import { useCreateInvite } from '@/features/invites/useInvites';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

interface InviteSheetProps {
  visible: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

export function InviteSheet({ visible, groupId, groupName, onClose }: InviteSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const me = useSession((s) => s.user?.name ?? '');
  const create = useCreateInvite(groupId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const [invite, setInvite] = useState<InviteCreatedDto | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    setName('');
    setPhone(null);
    setAction(null);
    setInvite(null);
    create.reset();
    onClose();
  };
  const message = invite
    ? t('invite.shareMessage', { inviter: me, group: groupName, url: invite.link })
    : '';

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={invite ? t('infoCards.inviteLink.title', { name }) : t('invite.founding.add')}
    >
      {!action ? (
        <>
          <TextField
            label={t('invite.founding.nameLabel')}
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
          <PhoneField
            label={t('invite.founding.phoneLabel')}
            helper={t('invite.founding.phoneHelp')}
            onChange={(e164) => setPhone(e164)}
          />
          {create.error ? (
            <Txt variant="secondary" color="textDanger">
              {errorMessage(create.error, t, lang)}
            </Txt>
          ) : null}
          <Button
            fullWidth
            label={t('invite.founding.create')}
            disabled={name.trim().length < 2 || !phone}
            loading={create.isPending}
            onPress={() =>
              phone && create.mutate({ name: name.trim(), phone }, { onSuccess: setAction })
            }
          />
        </>
      ) : null}
      {action && !invite ? (
        <ActionCard
          action={action}
          onConfirmed={(data) => {
            if (!data || data.type !== 'INVITE_CREATE') return;
            const parsed = inviteCreatedSchema.safeParse({
              inviteId: data.inviteId,
              link: data.link,
              expiresAt: data.expiresAt,
            });
            if (parsed.success) setInvite(parsed.data);
          }}
          onCancelled={close}
          onClose={close}
        />
      ) : null}
      {invite ? (
        <InfoCard
          icon={LinkIcon}
          title={t('infoCards.inviteLink.title', { name: name.trim() })}
          lines={[
            t('infoCards.inviteLink.validity', { date: formatDateTime(invite.expiresAt, lang) }),
          ]}
          actions={[
            {
              label: t('infoCards.inviteLink.shareWhatsApp'),
              variant: 'primary',
              onPress: () => {
                const text = encodeURIComponent(message);
                void Linking.openURL(
                  Platform.OS === 'web'
                    ? `https://wa.me/?text=${text}`
                    : `whatsapp://send?text=${text}`,
                ).catch(() => Share.share({ message }));
              },
            },
            Platform.OS === 'web'
              ? {
                  label: copied ? t('common.actions.copied') : t('infoCards.inviteLink.copyLink'),
                  copies: true,
                  onPress: () => {
                    void navigator.clipboard
                      ?.writeText(invite.link)
                      .then(() => setCopied(true))
                      .catch(() => {});
                  },
                }
              : {
                  label: t('infoCards.inviteLink.share'),
                  onPress: () => void Share.share({ message }),
                },
          ]}
        />
      ) : null}
    </BottomSheet>
  );
}
