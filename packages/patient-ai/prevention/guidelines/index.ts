/** Every guideline the preventive plan draws on. Versioned data: bump `version` when the source changes. */
import type { GuidelineMeta } from '../types.ts';
import { AMB } from './anaemia.ts';
import { GROWTH } from './growth.ts';
import { ANC, CALCIUM, HBNC, PMSMA } from './maternal.ts';
import { NPNCD } from './ncd.ts';
import { RBSK } from './rbsk.ts';
import { UIP } from './uip.ts';

export const GUIDELINES: GuidelineMeta[] = [UIP, ANC, PMSMA, CALCIUM, HBNC, AMB, GROWTH, NPNCD, RBSK];

export const guidelineById = (id: string): GuidelineMeta | undefined => GUIDELINES.find((g) => g.id === id);

export { AMB, ANC, CALCIUM, GROWTH, HBNC, NPNCD, PMSMA, RBSK, UIP };
