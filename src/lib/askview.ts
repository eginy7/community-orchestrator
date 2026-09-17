/** Serializable, already de-pseudonymized payload of one "ask the community" answer (shared by the API route and the client). */

export interface AskQuote {
  messageId: number;
  groupName: string;
  date: string;
  text: string;
}

export interface AskPerson {
  id: string;
  name: string;
  short: string;
  initials: string;
  why: string;
  quotes: AskQuote[];
}

export interface AskResponse {
  answer: string;
  people: AskPerson[];
  suggestedMessage: string | null;
  costUsd: number;
  elapsedMs: number;
}
