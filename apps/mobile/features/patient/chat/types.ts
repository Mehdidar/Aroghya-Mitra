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

/** Mirrors server/ai/chat/chatService.ts ChatEvent. */
export type ChatEvent =
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
  /** A canned reply shown because the server could not be reached: labelled, never passed off as AI. */
  demo?: boolean;
  emergency?: EmergencyInfo;
  sources?: SourceRef[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}
