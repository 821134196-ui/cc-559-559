export type Role = 'DISPATCHER' | 'MEDIC' | 'ADMIN';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export interface EntryAuthor {
  id: string;
  name: string;
  role: Role;
}

export interface Entry {
  id: string;
  type: string;
  content: string;
  meta: string | null;
  supersedesId: string | null;
  createdAt: string;
  author: EntryAuthor;
}

export interface Attachment {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  channel: string;
  payload: string;
  status: string;
  receipt: string | null;
  createdAt: string;
  ackedAt: string | null;
}

export type EventStatus = 'PENDING' | 'CLAIMED' | 'ESCALATED' | 'CLOSED';

export interface EventItem {
  id: string;
  code: string;
  location: string;
  occurredAt: string;
  injuredName: string;
  injuredGender: string;
  injuredAge: number | null;
  injuredContact: string | null;
  description: string;
  riskLevel: 'NORMAL' | 'HIGH';
  status: EventStatus;
  closeReason: string | null;
  createdById: string;
  assigneeId: string | null;
  createdByName: string | null;
  assigneeName: string | null;
  entries: Entry[];
  attachments: Attachment[];
  notifications: NotificationItem[];
  viewer: { participant: boolean };
  createdAt: string;
}
