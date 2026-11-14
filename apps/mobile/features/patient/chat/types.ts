export type ChatRole = 'user' | 'assistant';

export interface SourceRef {
  id: string;
  title: string;
  org?: string;
  url: string;
}

export interface EmergencyInfo {
  categories: string[];
  contacts: { number: string; labelKey: string }[];
  steps: string[];
}

/** Which parts of the patient's record informed a reply (server/ai/chat/patientContext.ts ContextLabel). */
export type ContextLabel = 'pregnancy' | 'conditions' | 'allergies' | 'medicines' | 'past_medicines' | 'vitals' | 'reports' | 'consultation' | 'alerts' | 'asha_visit' | 'diet' | 'age';

export interface ReplyContext {
  used: ContextLabel[];
  personalised: boolean;
  /** Why the record was not used, when it was not. */
  reason?: 'not_permitted' | 'no_patient' | 'unavailable';
  pregnancyWeeks?: number;
}

/** A deterministic safety warning from server/ai/chat/personalSafety.ts. */
export interface ChatWarning {
  code: string;
  /** Server text (translated); the app prefers its own assistant:warning.<code>. */
  text: string;
  params?: Record<string, string | number>;
  escalate?: boolean;
}

/** Mirrors server/ai/chat/chatService.ts ChatEvent. */
export type ChatEvent =
  | ({ type: 'context' } & ReplyContext)
  | ({ type: 'warning' } & ChatWarning)
  | { type: 'emergency'; categories: string[]; contacts: { number: string; labelKey: string }[]; steps: string[]; sources?: SourceRef[] }
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'delta'; text: string }
  | { type: 'chips'; chips: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string; retryable: boolean };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  /** True while the assistant is still streaming this reply. */
  streaming?: boolean;
  /** The server could not be reached or the reply failed: the screen says so and offers a retry. */
  failed?: boolean;
  emergency?: EmergencyInfo;
  sources?: SourceRef[];
  /** Personalisation: the record parts used (shown as "based on: ..."). */
  context?: ReplyContext;
  /** Safety warnings shown above the reply (and spoken first in voice mode). */
  warnings?: ChatWarning[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}
