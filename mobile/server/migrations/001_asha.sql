-- ASHA module (P3) tables. Mirrors features/asha/types.ts; nested objects are stored as JSON.
-- Works on PostgreSQL. Upserts use last-write-wins on updated_at (see services/sync.ts contract).

CREATE TABLE IF NOT EXISTS patients (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  sex              CHAR(1) NOT NULL CHECK (sex IN ('F', 'M')),
  dob              TIMESTAMPTZ NOT NULL,
  phone            TEXT,
  village          TEXT NOT NULL,
  address          TEXT,
  categories       TEXT[] NOT NULL DEFAULT '{general}',
  assigned_asha_id TEXT NOT NULL,
  pregnancy        JSONB,
  newborn          JSONB,
  conditions       TEXT[],
  home             JSONB,
  risk_level       TEXT NOT NULL DEFAULT 'none',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_asha_idx ON patients (assigned_asha_id, updated_at);

CREATE TABLE IF NOT EXISTS visits (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  asha_id      TEXT NOT NULL,
  visited_at   TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('completed', 'follow_up', 'referred', 'not_at_home')),
  gps          JSONB,
  vitals       JSONB,
  notes        TEXT,
  photos       TEXT[] NOT NULL DEFAULT '{}',
  follow_up_on TIMESTAMPTZ,
  source       TEXT NOT NULL DEFAULT 'manual',
  transcript   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_patient_idx ON visits (patient_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS visits_asha_idx ON visits (asha_id, updated_at);

CREATE TABLE IF NOT EXISTS risk_alerts (
  id            TEXT PRIMARY KEY, -- `${patientId}:${ruleId}:${visitId}`, so re-sends are idempotent
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  visit_id      TEXT REFERENCES visits(id),
  rule_id       TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  reason        TEXT NOT NULL,
  reason_key    TEXT NOT NULL,
  reason_params JSONB NOT NULL DEFAULT '{}',
  evidence      JSONB NOT NULL DEFAULT '[]',
  source        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  acknowledged  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON risk_alerts (severity, created_at DESC) WHERE NOT acknowledged;

CREATE TABLE IF NOT EXISTS referrals (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  from_asha_id  TEXT NOT NULL,
  to_doctor_id  TEXT,
  reason        TEXT NOT NULL,
  alert_ids     TEXT[] NOT NULL DEFAULT '{}',
  urgency       TEXT NOT NULL CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'seen', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL,
  notes         TEXT
);
-- P4 (doctor) queue: open referrals, most urgent first.
CREATE INDEX IF NOT EXISTS referrals_queue_idx ON referrals (status, urgency, created_at);
CREATE INDEX IF NOT EXISTS referrals_asha_idx ON referrals (from_asha_id, updated_at);
