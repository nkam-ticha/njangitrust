// Public surface of the UI kit (docs/design/DESIGN_SYSTEM.md sections 5 and 6).
// Screens import from '@/ui'; every component lives in its own file.

export { Txt, type TxtProps } from './primitives/Txt';
export { Icon, type IconComponent } from './primitives/Icon';
export { Touchable, type TouchableProps, type TouchState } from './primitives/Touchable';
export { useLang } from './primitives/useLang';

export { RingMark } from './brand/RingMark';
export { NdopBand } from './brand/NdopBand';

export { Button, type ButtonProps, type ButtonVariant } from './buttons/Button';

export { TextField, type TextFieldProps } from './inputs/TextField';
export { PhoneField } from './inputs/PhoneField';
export { PinPad, PIN_LENGTH, type PinPadProps } from './inputs/PinPad';
export { AmountInput, type QuickAmount } from './inputs/AmountInput';
export { Slider } from './inputs/Slider';
export { ChoiceRow } from './inputs/ChoiceRow';
export { SwitchRow } from './inputs/SwitchRow';
export { DateField } from './inputs/DateField';
export { TimeField } from './inputs/TimeField';

export { ListRow, type ListRowProps } from './lists/ListRow';
export { GroupedList } from './lists/GroupedList';
export { SectionHeader } from './lists/SectionHeader';

export { Chip, ChipRow } from './chips/Chip';
export { Avatar, initials, type AvatarSize } from './identity/Avatar';
export { LabelBadge, CountBadge, DotBadge } from './identity/Badge';

export { SegmentedControl, type Segment } from './navigation/SegmentedControl';
export { AppHeader } from './navigation/AppHeader';
export {
  Navigation,
  navigationLayoutFor,
  type NavigationProps,
  type TabKey,
} from './navigation/Navigation';

export { BottomSheet, type BottomSheetProps } from './sheets/BottomSheet';
export { PinSheet, type PinSheetProps } from './sheets/PinSheet';
export { useScreenshotBlock } from './sheets/useScreenshotBlock';

export { Banner, type BannerKind } from './feedback/Banner';
export { DailyCheckStrip, type DailyCheckStatus } from './feedback/DailyCheckStrip';
export { EmptyState } from './feedback/EmptyState';
export { SkeletonRows } from './feedback/Skeleton';

export { AmountText, amountLabel, type AmountSize, type AmountTextProps } from './money/AmountText';
export { MaskedNumber } from './money/MaskedNumber';
export { LedgerRow, type LedgerRowProps, type LedgerType } from './money/LedgerRow';

export { ConfirmationCard, type ConfirmationCardProps } from './confirmation/ConfirmationCard';
export { InfoCard, type InfoCardAction } from './confirmation/InfoCard';

export {
  ProposalCard,
  type ProposalCardProps,
  type ProposalType,
  type ProposalStatus,
  type MyVote,
  type NotEligibleReason,
} from './votes/ProposalCard';

export {
  MessageBubble,
  type MessageBubbleProps,
  type MessageAuthor,
  type DeliveryState,
} from './chat/MessageBubble';
export { VoiceNote, type VoiceSpeed } from './chat/VoiceNote';
export { VisualMedia, DocumentAttachment, type MediaState } from './chat/MediaBlock';
export { SystemEvent, DateSeparator, UnreadDivider } from './chat/SystemEvent';
export { Composer } from './chat/Composer';

export { AgentMessage } from './agent/AgentMessage';
export { TypingDots, AgentActivityLine } from './agent/AgentActivity';
export { StatusHeader, type ContributionStatus } from './agent/StatusHeader';

export { NjangiRing, type NjangiRingProps, type RingMember } from './ring/NjangiRing';
export { ringLayout, RING_SPECS, type RingSize } from './ring/ringGeometry';

export { Reliability, type ReliabilityValue } from './members/Reliability';
export {
  MemberProfileSheet,
  type MemberProfile,
  type ProfileRoundStatus,
} from './members/MemberProfileSheet';
