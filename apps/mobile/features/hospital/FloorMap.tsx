import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

import type { HospitalGraph, HospitalNode } from './graph';
import { DEMO_HOSPITAL } from './graph';
import type { Route } from './pathfinding';

/** One floor of the plan, with rooms, lifts and the route for that floor drawn on top. */
export function FloorMap({ floor, route, width = 340, graph = DEMO_HOSPITAL, testID }: { floor: number; route: Route | null; width?: number; graph?: HospitalGraph; testID?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('hospital');
  const scale = width / graph.width;
  const height = graph.height * scale;
  const X = (x: number) => x * scale;
  const Y = (y: number) => y * scale;
  const nodes = graph.nodes.filter((n) => n.floor === floor);
  const edges = graph.edges.filter((e) => {
    const a = graph.nodes.find((n) => n.id === e.from);
    const b = graph.nodes.find((n) => n.id === e.to);
    return a && b && a.floor === floor && b.floor === floor;
  });
  const routeNodes = route?.byFloor[floor] ?? [];
  const onRoute = new Set(routeNodes.map((n) => n.id));
  const label = (n: HospitalNode) => (n.label ? tr(`places.${n.label}`) : '');

  return (
    <View testID={testID} accessible accessibilityLabel={tr('map.a11y', { floor: tr(`floors.${graph.floors[floor]?.label ?? floor}`) })}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={16} fill={t.colors.surfaceMuted} stroke={t.colors.border} />
        {edges.map((e, i) => {
          const a = graph.nodes.find((n) => n.id === e.from)!;
          const b = graph.nodes.find((n) => n.id === e.to)!;
          return <Line key={i} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={t.colors.border} strokeWidth={6} strokeLinecap="round" />;
        })}
        {nodes
          .filter((n) => n.kind === 'room' || n.kind === 'entrance' || n.kind === 'lift' || n.kind === 'stairs')
          .map((n) => (
            <Rect
              key={`r-${n.id}`}
              x={X(n.x) - 22}
              y={Y(n.y) - 14}
              width={44}
              height={28}
              rx={8}
              fill={onRoute.has(n.id) ? t.accent.accentSoft : t.colors.surface}
              stroke={onRoute.has(n.id) ? t.accent.accent : t.colors.border}
              strokeWidth={onRoute.has(n.id) ? 2 : 1}
            />
          ))}
        {routeNodes.length > 1 ? (
          <Polyline points={routeNodes.map((n) => `${X(n.x)},${Y(n.y)}`).join(' ')} fill="none" stroke={t.accent.accent} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="8 6" />
        ) : null}
        {routeNodes.length ? (
          <>
            <Circle cx={X(routeNodes[0].x)} cy={Y(routeNodes[0].y)} r={7} fill={t.colors.status.success.solid} />
            <Circle cx={X(routeNodes[routeNodes.length - 1].x)} cy={Y(routeNodes[routeNodes.length - 1].y)} r={7} fill={t.colors.status.danger.solid} />
          </>
        ) : null}
        {nodes
          .filter((n) => n.label)
          .map((n) => (
            <SvgText key={`l-${n.id}`} x={X(n.x)} y={Y(n.y) + 4} fontSize={9} fontWeight="600" textAnchor="middle" fill={t.colors.textPrimary}>
              {label(n)}
            </SvgText>
          ))}
      </Svg>
    </View>
  );
}
