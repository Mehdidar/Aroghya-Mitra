/**
 * Storage for ASHA connect.
 *
 *  - MemoryAshaConnectRepository: tests and the laptop demo, over the demo
 *    records (patients + profiles) so an assignment shows everywhere at once.
 *  - SupabaseAshaConnectRepository (supabaseRepository.ts): PostgREST with the
 *    service-role key, when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 */
import { sameRecord } from '../../packages/shared/ids.ts';
import type { Patient, Profile } from '../../packages/shared/types.ts';
import { areaKey } from './match.ts';
import type { AshaMessage, AssignmentEvent, ConnectPatient, ConnectRequest, ConnectStaff, ServiceArea } from './types.ts';

export type MessagePatch = Partial<Pick<AshaMessage, 'status' | 'scheduledFor' | 'readAt' | 'updatedAt'>>;
export type MessageFilter = { patientId?: string; patientIds?: string[]; ashaId?: string; since?: string; limit?: number };

export interface AshaConnectRepository {
  listAshas(facilityId: string | null): Promise<ConnectStaff[]>;
  getStaff(id: string): Promise<ConnectStaff | null>;
  /** The facility's patients plus patients not yet linked to any facility. */
  listPatients(facilityId: string | null): Promise<ConnectPatient[]>;
  getPatient(id: string): Promise<ConnectPatient | null>;
  findPatientByUser(userId: string): Promise<ConnectPatient | null>;
  /** Set (or clear) the patient's ASHA; also fills a missing facility / area. */
  setPatientAsha(patientId: string, ashaId: string | null, fill: { facilityId?: string | null; area?: string | null }): Promise<void>;
  setPatientArea(patientId: string, area: string): Promise<void>;

  listAreas(facilityId: string | null): Promise<ServiceArea[]>;
  replaceAreas(ashaId: string, facilityId: string | null, areas: string[]): Promise<ServiceArea[]>;

  addEvent(e: AssignmentEvent): Promise<void>;
  listEvents(f: { patientId?: string; previousAshaId?: string; since?: string }): Promise<AssignmentEvent[]>;

  listRequests(): Promise<ConnectRequest[]>;
  upsertRequest(r: ConnectRequest): Promise<void>;
  deleteRequest(patientId: string): Promise<void>;

  listMessages(f: MessageFilter): Promise<AshaMessage[]>;
  getMessage(id: string): Promise<AshaMessage | null>;
  insertMessage(m: AshaMessage): Promise<AshaMessage>;
  updateMessage(id: string, patch: MessagePatch): Promise<AshaMessage | null>;
  /** Mark the other side's messages in a thread as read; returns how many changed. */
  markRead(patientId: string, readerSide: 'patient' | 'asha', at: string): Promise<number>;
}

export interface MemoryConnectData {
  areas: ServiceArea[];
  events: AssignmentEvent[];
  requests: ConnectRequest[];
  messages: AshaMessage[];
}

type RecordsData = { patients: Patient[]; profiles: Profile[] };

const toConnectPatient = (p: Patient): ConnectPatient => ({
  id: p.id,
  userId: p.userId,
  fullName: p.fullName,
  phone: p.phone,
  area: p.area,
  facilityId: p.facilityId,
  ashaWorkerId: p.ashaWorkerId,
  createdAt: p.createdAt,
});

export class MemoryAshaConnectRepository implements AshaConnectRepository {
  readonly data: MemoryConnectData;
  private readonly records: () => RecordsData;
  private readonly phones: Record<string, string>;

  constructor(opts: { data?: Partial<MemoryConnectData>; records?: () => RecordsData; phones?: Record<string, string> } = {}) {
    this.data = { areas: [], events: [], requests: [], messages: [], ...opts.data };
    this.records = opts.records ?? (() => ({ patients: [], profiles: [] }));
    this.phones = opts.phones ?? {};
  }

  private staff(p: Profile): ConnectStaff {
    return { id: p.id, fullName: p.fullName, phone: this.phones[p.id] ?? null, facilityId: p.facilityId, isActive: p.isActive };
  }
  private patientRow(id: string): Patient | undefined {
    return this.records().patients.find((p) => p.id === id) ?? this.records().patients.find((p) => sameRecord(p.id, id));
  }

  async listAshas(facilityId: string | null) {
    return this.records()
      .profiles.filter((p) => p.role === 'asha' && (!facilityId || p.facilityId === facilityId))
      .map((p) => this.staff(p));
  }
  async getStaff(id: string) {
    const p = this.records().profiles.find((x) => x.id === id);
    return p ? this.staff(p) : null;
  }
  async listPatients(facilityId: string | null) {
    return this.records()
      .patients.filter((p) => !facilityId || !p.facilityId || p.facilityId === facilityId)
      .map(toConnectPatient);
  }
  async getPatient(id: string) {
    const p = this.patientRow(id);
    return p ? toConnectPatient(p) : null;
  }
  async findPatientByUser(userId: string) {
    const p = this.records().patients.find((x) => x.userId === userId);
    return p ? toConnectPatient(p) : null;
  }
  async setPatientAsha(patientId: string, ashaId: string | null, fill: { facilityId?: string | null; area?: string | null }) {
    const p = this.patientRow(patientId);
    if (!p) return;
    p.ashaWorkerId = ashaId;
    if (!p.facilityId && fill.facilityId) p.facilityId = fill.facilityId;
    if (!p.area && fill.area) p.area = fill.area;
  }
  async setPatientArea(patientId: string, area: string) {
    const p = this.patientRow(patientId);
    if (p) p.area = area;
  }

  async listAreas(facilityId: string | null) {
    return this.data.areas.filter((a) => !facilityId || !a.facilityId || a.facilityId === facilityId).map((a) => ({ ...a }));
  }
  async replaceAreas(ashaId: string, facilityId: string | null, areas: string[]) {
    const rows = areas.map((area) => ({ ashaId, facilityId, area, key: areaKey(area) }));
    this.data.areas = [...this.data.areas.filter((a) => a.ashaId !== ashaId), ...rows];
    return rows.map((r) => ({ ...r }));
  }

  async addEvent(e: AssignmentEvent) {
    this.data.events.push({ ...e });
  }
  async listEvents(f: { patientId?: string; previousAshaId?: string; since?: string }) {
    return this.data.events
      .filter((e) => (!f.patientId || sameRecord(e.patientId, f.patientId)) && (!f.previousAshaId || e.previousAshaId === f.previousAshaId) && (!f.since || e.createdAt > f.since))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((e) => ({ ...e }));
  }

  async listRequests() {
    return this.data.requests.map((r) => ({ ...r }));
  }
  async upsertRequest(r: ConnectRequest) {
    this.data.requests = [...this.data.requests.filter((x) => !sameRecord(x.patientId, r.patientId)), { ...r }];
  }
  async deleteRequest(patientId: string) {
    this.data.requests = this.data.requests.filter((x) => !sameRecord(x.patientId, patientId));
  }

  async listMessages(f: MessageFilter) {
    const ids = f.patientIds?.map((i) => i.toLowerCase());
    const rows = this.data.messages
      .filter(
        (m) =>
          (!f.patientId || sameRecord(m.patientId, f.patientId)) &&
          (!ids || ids.some((i) => sameRecord(i, m.patientId))) &&
          (!f.ashaId || m.ashaId === f.ashaId) &&
          (!f.since || m.updatedAt > f.since),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return (f.limit ? rows.slice(-f.limit) : rows).map((m) => ({ ...m }));
  }
  async getMessage(id: string) {
    const m = this.data.messages.find((x) => x.id === id);
    return m ? { ...m } : null;
  }
  async insertMessage(m: AshaMessage) {
    this.data.messages.push({ ...m });
    return { ...m };
  }
  async updateMessage(id: string, patch: MessagePatch) {
    const m = this.data.messages.find((x) => x.id === id);
    if (!m) return null;
    Object.assign(m, patch);
    return { ...m };
  }
  async markRead(patientId: string, readerSide: 'patient' | 'asha', at: string) {
    let n = 0;
    for (const m of this.data.messages) {
      if (sameRecord(m.patientId, patientId) && m.from !== readerSide && !m.readAt) {
        m.readAt = at;
        m.updatedAt = at;
        n++;
      }
    }
    return n;
  }
}
