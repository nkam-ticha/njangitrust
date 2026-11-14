// Gallery: group chat and Njangi tab elements (DESIGN_SYSTEM.md 5.23, 5.24).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Vote } from 'lucide-react-native';
import { space } from '@/theme';
import { MessageBubble } from '../chat/MessageBubble';
import { VoiceNote, type VoiceSpeed } from '../chat/VoiceNote';
import { DocumentAttachment, VisualMedia } from '../chat/MediaBlock';
import { DateSeparator, SystemEvent, UnreadDivider } from '../chat/SystemEvent';
import { Composer } from '../chat/Composer';
import { AgentMessage } from '../agent/AgentMessage';
import { AgentActivityLine, TypingDots } from '../agent/AgentActivity';
import { StatusHeader } from '../agent/StatusHeader';
import { Button } from '../buttons/Button';
import { GallerySection } from './GallerySection';
import { ringMembers } from './fixtures';

const noop = () => {};

export function ConversationSection() {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<VoiceSpeed>(1);
  const [draft, setDraft] = useState('');

  return (
    <>
      <GallerySection title="Chat (Groupe)">
        <View style={{ gap: space.s3 }}>
          <DateSeparator label={t('time.yesterday')} />
          <MessageBubble
            author="other"
            name="Carine Fotso"
            firstOfRun
            time="18:02"
            parts={['On se retrouve samedi à 16 h chez Nkam ?']}
          />
          <MessageBubble
            author="other"
            name="Carine Fotso"
            time="18:03"
            media={
              <VoiceNote
                playing={playing}
                position={playing ? 16 : 0}
                duration={42}
                speed={speed}
                onToggle={() => setPlaying(!playing)}
                onSpeed={setSpeed}
                from="Carine Fotso"
              />
            }
          />
          <MessageBubble
            author="other"
            name="Nkam Ticha"
            firstOfRun
            time="18:05"
            reply={{ name: 'Carine Fotso', text: 'On se retrouve samedi à 16 h chez Nkam ?' }}
            parts={['Oui, l’ordre du jour est prêt.']}
          />
          <MessageBubble
            author="other"
            name="Sandrine Ewane"
            firstOfRun
            time="18:20"
            media={
              <VisualMedia
                kind="image"
                width={1600}
                height={1200}
                state="notDownloaded"
                sizeLabel="240 Ko"
                from="Sandrine Ewane"
                onPress={noop}
              />
            }
          />
          <MessageBubble
            author="other"
            name="Sandrine Ewane"
            time="18:21"
            media={
              <DocumentAttachment
                fileName="PV-reunion-octobre.pdf"
                sizeLabel="1,2 Mo"
                onOpen={noop}
              />
            }
          />
          <UnreadDivider label={t('chat.newMessages', { count: 3 })} />
          <SystemEvent
            icon={CircleCheck}
            iconColor="statusPaid"
            text={t('chat.system.paymentReceived', { name: 'Larissa Ngono', round: 4 })}
            time="11:04"
            onPress={noop}
          />
          <SystemEvent
            icon={Vote}
            text={t('chat.system.voteOpened', { title: 'Amende de retard : 1 000 → 1 500 FCFA' })}
          />
          <MessageBubble
            author="other"
            name="Sandrine Ewane"
            firstOfRun
            time="14:20"
            parts={[{ mention: 'njangi' }, ' qui n’a pas encore payé le tour 4 ?']}
          />
          <MessageBubble
            author="agent"
            name="Njangi"
            firstOfRun
            time="14:20"
            parts={[
              '3 membres n’ont pas encore payé le tour 4 : Joël Ndi, Paul Mbarga et Nkam Ticha.',
            ]}
          />
          <MessageBubble
            author="agent"
            name="Njangi"
            firstOfRun
            time="14:22"
            parts={[t('agent.group.privateReply', { name: 'Paul' })]}
            footer={<Button variant="text" label={t('common.actions.open')} onPress={noop} />}
          />
          <MessageBubble author="own" time="14:24" parts={['Je paie ce soir.']} />
          <MessageBubble
            author="own"
            time="14:25"
            parts={['Message en attente']}
            delivery="queued"
          />
          <MessageBubble
            author="own"
            time="14:26"
            parts={['Message non envoyé']}
            delivery="failed"
            onRetry={noop}
          />
          <MessageBubble author="other" name="Ivo Fon" firstOfRun time="14:30" deleted />
          <MessageBubble author="other" name="Ivo Fon" time="14:31" hidden />
        </View>
        <Composer
          kind="chat"
          value={draft}
          onChange={setDraft}
          onSend={() => setDraft('')}
          onAttach={noop}
          onVoice={noop}
        />
      </GallerySection>

      <GallerySection title="Njangi tab">
        <StatusHeader
          round={4}
          roundsTotal={10}
          members={ringMembers}
          collected={70000}
          target={100000}
          beneficiaryName="Carine"
          contribution="toPay"
          onPress={noop}
        />
        <StatusHeader
          round={4}
          roundsTotal={10}
          members={ringMembers}
          collected={70000}
          target={100000}
          beneficiaryName="Carine"
          contribution="processing"
          operator="MTN"
          onPress={noop}
        />
        <StatusHeader
          round={4}
          roundsTotal={10}
          members={ringMembers}
          collected={70000}
          target={100000}
          beneficiaryName={null}
          contribution="paid"
          withdrawalsPaused
          onPress={noop}
        />
        <View style={{ gap: space.s3 }}>
          <AgentMessage
            text={`${t('agent.greeting.morning', { name: 'Paul' })} ${t('agent.greeting.owes', { round: 4, amount: '11 000 FCFA', date: 'demain à 18 h' })}`}
          />
          <MessageBubble author="own" time="14:31" parts={[t('agent.chips.howMuch')]} />
          <TypingDots />
          <AgentActivityLine tool="get_my_overview" />
          <AgentMessage
            streaming
            text={
              'Tu dois **11 000 FCFA** pour le tour 4 :\n- 10 000 de cotisation\n- 1 000 pour la caisse de secours'
            }
          />
          <SystemEvent
            icon={CircleCheck}
            iconColor="statusPaid"
            text={t('agent.results.paymentSuccess', { amount: '11 000 FCFA', ref: 'MP2611A9F2' })}
          />
        </View>
        <Composer kind="agent" value="" onChange={noop} onSend={noop} />
        <Composer
          kind="agent"
          value=""
          onChange={noop}
          onSend={noop}
          disabledReason={t('offline.agentComposer')}
        />
      </GallerySection>
    </>
  );
}
