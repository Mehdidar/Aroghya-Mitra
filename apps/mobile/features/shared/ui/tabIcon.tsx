import type { ColorValue } from 'react-native';

import { Icon, type IconName } from './Icon';

/** Builds a `tabBarIcon` option: outline icon when idle, filled when focused. */
export function tabIcon(name: IconName, focusedName?: IconName) {
  function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Icon name={focused && focusedName ? focusedName : name} color={typeof color === 'string' ? color : undefined} size={size} />;
  }
  return TabIcon;
}
