// "Hors ligne, mis à jour à 14:32" (spec 1.7, NFR-06; DESIGN_SYSTEM.md 10.2).
import { useTranslation } from 'react-i18next';
import { formatClock, formatDateShort, toDouala } from '@njangi/shared';
import { useConnectivity } from '@/state/connectivity';
import { Banner, useLang } from '@/ui';

export function OfflineBanner() {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const lastSyncAt = useConnectivity((s) => s.lastSyncAt);
  if (online) return null;
  let text: string = t('offline.bannerNever');
  if (lastSyncAt) {
    const then = toDouala(lastSyncAt);
    const nowDate = new Date();
    const now = toDouala(nowDate);
    const sameDay = then.year === now.year && then.month === now.month && then.day === now.day;
    const yesterday = new Date(nowDate.getTime() - 86_400_000);
    const y = toDouala(yesterday);
    const wasYesterday = then.year === y.year && then.month === y.month && then.day === y.day;
    text = sameDay
      ? t('offline.banner', { time: formatClock(lastSyncAt, lang) })
      : wasYesterday
        ? t('offline.bannerYesterday', { time: formatClock(lastSyncAt, lang) })
        : t('offline.bannerDate', { date: formatDateShort(lastSyncAt, lang) });
  }
  return <Banner kind="offline" text={text} />;
}
