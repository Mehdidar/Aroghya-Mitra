/** Routes beyond P2's speech/chat. Each module exports a `routes()` list; register it here. */
import { foodRoutes } from '../ai/food/routes.ts';
import { routes as prescriptionRoutes } from '../ai/prescription/routes.ts';
import type { Route } from '../http/router.ts';

export function extraRoutes(): Route[] {
  return [...foodRoutes(), ...prescriptionRoutes()];
}
