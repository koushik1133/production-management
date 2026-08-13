export type RecipientType = 'user' | 'everyone';

export interface UserProfile {
  id: string; // Supabase Auth user UUID
  name: string; // e.g. 'T1', 'T2', 'T3', 'Manager'
  role: 'worker' | 'manager';
  email?: string;
  online?: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_type: RecipientType;
  recipient_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  // Joined or calculated fields
  sender_profile?: UserProfile;
  recipient_profile?: UserProfile;
  is_read_by_me?: boolean;
}

export interface RecipientOption {
  id: string; // User UUID or 'everyone'
  name: string; // 'Everyone', 'T1', 'T2', 'T3', 'Manager'
  type: RecipientType;
  role?: 'worker' | 'manager';
}
