import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';
import type { IconName } from '@/features/shared/ui';

// Placeholder targets for the Home service tiles until P2/P4 add the real screens. When a real
// screen lands (e.g. app/(patient)/chat.tsx), point the tile at it in (tabs)/index.tsx.
const META: Record<string, { icon: IconName; owner: string }> = {
  chat: { icon: 'chatbubbles-outline', owner: 'P2' },
  voice: { icon: 'mic-outline', owner: 'P2' },
  prescription: { icon: 'document-text-outline', owner: 'P2' },
  nutrition: { icon: 'nutrition-outline', owner: 'P2' },
  hospitalMap: { icon: 'map-outline', owner: 'P3' },
  qrCard: { icon: 'qr-code-outline', owner: 'P4' },
  bloodBanks: { icon: 'water-outline', owner: 'P4' },
  reports: { icon: 'folder-open-outline', owner: 'P4' },
};

export default function ServicePlaceholder() {
  const { id = 'chat' } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('patient');
  const meta = META[id] ?? META.chat;
  return <PlaceholderScreen back title={t(`services.${id}`, { defaultValue: id })} icon={meta.icon} owner={meta.owner} testID={`screen-service-${id}`} />;
}
