/**
 * GET /blood-banks → { ok, source, banks, stock } from Supabase (official
 * directory rows imported with npm run data:blood-banks, and any stock an
 * admin entered). 404 when there is no database or nothing imported yet; the
 * app then shows its labelled demo banks.
 */
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { json, type Route } from '../http/router.ts';

type Row = Record<string, unknown>;

export function routes(): Route[] {
  return [
    {
      method: 'GET',
      path: '/blood-banks',
      handler: async () => {
        const cfg = restConfigFromEnv();
        if (!cfg) return json({ ok: false, reason: 'not_configured' }, 404);
        const db = new RestClient(cfg);
        const banks = await db.select<Row>('blood_banks', { is_active: 'eq.true', source: 'neq.mock' }, { limit: 2000 });
        if (!banks.length) return json({ ok: false, reason: 'none_imported' }, 404);
        const stock = await db.select<Row>('blood_stock', {}, { limit: 20000 });
        const byBank: Record<string, { bloodGroup: string; component: string; units: number; updatedAt: string }[]> = {};
        for (const s of stock) (byBank[String(s.bank_id)] ??= []).push({ bloodGroup: String(s.blood_group), component: String(s.component), units: Number(s.units), updatedAt: String(s.updated_at) });
        return json(
          {
            ok: true,
            source: 'supabase',
            banks: banks.map((b) => ({
              id: String(b.id),
              name: String(b.name),
              category: b.category,
              address: String(b.address),
              area: String(b.area),
              city: String(b.city),
              location: { lat: Number(b.lat), lng: Number(b.lng) },
              phone: b.phone ?? null,
              phoneVerified: b.phone_verified === true,
              open24x7: b.open_24x7 === true,
              facilityId: b.facility_id ?? null,
            })),
            stock: byBank,
          },
          200,
        );
      },
    },
  ];
}
