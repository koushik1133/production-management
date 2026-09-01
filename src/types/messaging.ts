export type RecipientType = 'user' | 'everyone' | 'group';

export interface UserProfile {
  id: string; // Supabase Auth user UUID
  name: string; // e.g. 'Logan', 'Trim', 'Bay 1'
  role: 'worker' | 'manager';
  email?: string;
  online?: boolean;
}

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  admin_ids: string[];
  member_ids: string[];
  created_at?: string;
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
  group?: ChatGroup;
}

export interface RecipientOption {
  id: string; // User UUID, 'everyone', or Group UUID
  name: string;
  type: RecipientType;
  role?: 'worker' | 'manager';
  group?: ChatGroup;
}
