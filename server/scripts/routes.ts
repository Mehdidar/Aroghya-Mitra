/** Routes beyond P2's speech/chat. Each module exports a `routes()` list; register it here. */
import { foodRoutes } from '../ai/food/routes.ts';
import { routes as prescriptionRoutes } from '../ai/prescription/routes.ts';
import { routes as appointmentRoutes } from '../appointments/routes.ts';
import { routes as ashaRoutes } from '../asha/routes.ts';
import { routes as bloodBankRoutes } from '../bloodbanks/routes.ts';
import { routes as copilotRoutes } from '../copilot/routes.ts';
import { routes as integrationRoutes } from '../integrations/routes.ts';
import { routes as placesRoutes } from '../places/routes.ts';
import { routes as preventionRoutes } from '../prevention/routes.ts';
import { routes as qrRoutes } from '../qr/routes.ts';
import { routes as recordsRoutes } from '../records/routes.ts';
import type { Route } from '../http/router.ts';

export function extraRoutes(): Route[] {
  return [...foodRoutes(), ...prescriptionRoutes(), ...qrRoutes(), ...recordsRoutes(), ...ashaRoutes(), ...bloodBankRoutes(), ...placesRoutes(), ...copilotRoutes(), ...integrationRoutes(), ...appointmentRoutes(), ...preventionRoutes()];
}
