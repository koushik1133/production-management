import { supabase } from './supabase';
import type { Message, UserProfile, RecipientOption, RecipientType, ChatGroup } from '../types/messaging';

export const DEFAULT_GROUPS: ChatGroup[] = [];

export const DEFAULT_PROFILES: UserProfile[] = [
  { id: '00000000-0000-4000-a000-000000000001', name: 'Logan', role: 'manager', email: 'logan@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000002', name: 'Eric', role: 'manager', email: 'eric@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000003', name: 'Darin', role: 'manager', email: 'darin@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000004', name: 'Angie', role: 'manager', email: 'angie@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000005', name: 'Lucas', role: 'manager', email: 'lucas@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000006', name: 'Joel', role: 'manager', email: 'joel@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000010', name: 'Trim', role: 'worker', email: 'trim@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000011', name: 'Paint', role: 'worker', email: 'paint@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000012', name: 'Bay 1', role: 'worker', email: 'bay1@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000013', name: 'Bay 2', role: 'worker', email: 'bay2@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000014', name: 'Bay 3', role: 'worker', email: 'bay3@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000015', name: 'Bay 4', role: 'worker', email: 'bay4@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000016', name: 'Prefab', role: 'worker', email: 'prefab@lanetrailers.com' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ensureValidUuid(id: string | null | undefined, fallbackName?: string): string | null {
  if (id && UUID_REGEX.test(id)) return id;
  if (fallbackName) {
    const match = DEFAULT_PROFILES.find(p => p.name.toLowerCase() === fallbackName.toLowerCase());
    if (match) return match.id;
  }
  return null;
}

export const MANAGER_EMAILS = [
  'logan@lanetrailers.com',
  'eric@lanetrailers.com',
  'darin@lanetrailers.com',
  'angie@lanetrailers.com',
  'lucas@lanetrailers.com',
  'joel@lanetrailers.com',
  'manager@lanetrailers.com'
];

export const isManagerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return MANAGER_EMAILS.includes(lower);
};

const EMAIL_NAME_MAP: Record<string, string> = {
  'logan@lanetrailers.com': 'Logan',
  'eric@lanetrailers.com': 'Eric',
  'darin@lanetrailers.com': 'Darin',
  'angie@lanetrailers.com': 'Angie',
  'lucas@lanetrailers.com': 'Lucas',
  'joel@lanetrailers.com': 'Joel',
  'manager@lanetrailers.com': 'Manager',
  'trim@lanetrailers.com': 'Trim',
  'paint@lanetrailers.com': 'Paint',
  'bay1@lanetrailers.com': 'Bay 1',
  'bay2@lanetrailers.com': 'Bay 2',
  'bay3@lanetrailers.com': 'Bay 3',
  'bay4@lanetrailers.com': 'Bay 4',
  'prefab@lanetrailers.com': 'Prefab',
};

/**
 * Maps email to canonical profile name and role for target users.
 */
export function deriveProfileFromEmail(email?: string): { name: string; role: 'worker' | 'manager' } {
  if (!email) return { name: 'Worker', role: 'worker' };
  const lower = email.toLowerCase().trim();
  const role: 'worker' | 'manager' = isManagerEmail(lower) ? 'manager' : 'worker';

  if (EMAIL_NAME_MAP[lower]) {
    return { name: EMAIL_NAME_MAP[lower], role };
  }

  const parts = lower.split('@')[0];
  if (parts.startsWith('bay')) {
    return { name: `Bay ${parts.replace('bay', '')}`, role };
  }
  const capitalized = parts.charAt(0).toUpperCase() + parts.slice(1);
  return { name: capitalized, role };
}

/**
 * Fetches the user profile from public.profiles, or auto-creates it if missing.
 */
export async function getOrSyncProfile(userId: string, email?: string): Promise<UserProfile> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        name: data.name,
        role: data.role as 'worker' | 'manager',
        email: email,
      };
    }

    const derived = deriveProfileFromEmail(email);
    const newProfile: UserProfile = {
      id: userId,
      name: derived.name,
      role: derived.role,
      email: email,
    };

    const { error: insertError } = await supabase.from('profiles').upsert({
      id: userId,
      name: derived.name,
      role: derived.role,
    });

    if (insertError) {
      console.warn('Could not insert profile into DB:', insertError.message);
    }

    return newProfile;
  } catch (err) {
    console.error('Error in getOrSyncProfile:', err);
    const derived = deriveProfileFromEmail(email);
    return { id: userId, name: derived.name, role: derived.role, email };
  }
}

// ─── Module-level profile cache ───────────────────────────────────────────────
// fetchAllProfiles is called in realtime handlers and on every message load.
// Without a cache it fires a DB query every single time, exhausting the pool.
let _profilesCache: UserProfile[] | null = null;
let _profilesCacheTs = 0;
const PROFILES_CACHE_TTL_MS = 60_000; // 60 s

export function invalidateProfilesCache() {
  _profilesCache = null;
  _profilesCacheTs = 0;
}

/**
 * Fetches all user profiles from public.profiles and merges defaults.
 * Results are cached for 60 s to prevent pool exhaustion.
 */
export async function fetchAllProfiles(): Promise<UserProfile[]> {
  const now = Date.now();
  if (_profilesCache && now - _profilesCacheTs < PROFILES_CACHE_TTL_MS) {
    return _profilesCache;
  }

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, role')  // Only needed columns — no SELECT *
      .order('name')
      .limit(500);
    const dbProfiles: UserProfile[] = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role as 'worker' | 'manager',
    }));

    const result = [...dbProfiles];
    DEFAULT_PROFILES.forEach((def) => {
      const exists = result.some((p) => p.name.toLowerCase() === def.name.toLowerCase());
      if (!exists) {
        result.push(def);
      }
    });

    _profilesCache = result;
    _profilesCacheTs = now;
    return result;
  } catch (err) {
    console.error('Error fetching profiles:', err);
    // Return cache if available, even if stale, to avoid hammering a failing DB
    return _profilesCache ?? DEFAULT_PROFILES;
  }
}

/**
 * Fetches all chat groups from Supabase chat_groups table.
 */
export async function fetchChatGroups(): Promise<ChatGroup[]> {
  try {
    const { data, error } = await supabase
      .from('chat_groups')
      .select('*')
      .order('name');

    if (error) {
      console.warn('Could not fetch chat_groups from db (table may not exist yet):', error.message);
      return [];
    }

    const dbGroups: ChatGroup[] = (data || []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      created_by: g.created_by,
      admin_ids: g.admin_ids || [],
      member_ids: g.member_ids || [],
      created_at: g.created_at,
    }));

    return dbGroups;
  } catch (err) {
    console.error('Error fetching chat groups:', err);
    return [];
  }
}

/**
 * Creates a new chat group in Supabase.
 */
export async function createChatGroup({
  name,
  description,
  createdBy,
  adminIds,
  memberIds,
}: {
  name: string;
  description?: string;
  createdBy?: string;
  adminIds: string[];
  memberIds: string[];
}): Promise<ChatGroup> {
  const payload = {
    name: name.trim(),
    description: description?.trim() || null,
    created_by: createdBy || null,
    admin_ids: adminIds,
    member_ids: memberIds,
  };

  const { data, error } = await supabase
    .from('chat_groups')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    // If table doesn't exist in Supabase yet, generate a client-side UUID
    console.warn('Failed to insert group into DB, generating local group:', error?.message);
    const localId = `00000000-0000-4000-b000-${Date.now().toString(16).padStart(12, '0')}`;
    return {
      id: localId,
      name: name.trim(),
      description: description?.trim(),
      created_by: createdBy,
      admin_ids: adminIds,
      member_ids: memberIds,
      created_at: new Date().toISOString(),
    };
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    created_by: data.created_by,
    admin_ids: data.admin_ids || [],
    member_ids: data.member_ids || [],
    created_at: data.created_at,
  };
}

/**
 * Deletes a chat group from Supabase.
 */
export async function deleteChatGroup(groupId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chat_groups')
      .delete()
      .eq('id', groupId);
    return !error;
  } catch (err) {
    console.error('Error deleting chat group:', err);
    return false;
  }
}

/**
 * Builds the list of available recipient options for the current user.
 */
export function getRecipientOptions(
  currentUserId: string,
  allProfiles: UserProfile[],
  currentUserProfile?: UserProfile | null,
  groups: ChatGroup[] = []
): RecipientOption[] {
  const options: RecipientOption[] = [];

  options.push({
    id: 'everyone',
    name: 'Everyone',
    type: 'everyone',
  });

  // Groups
  groups.forEach((g) => {
    options.push({
      id: g.id,
      name: g.name,
      type: 'group',
      group: g,
    });
  });

  const currentName = currentUserProfile?.name?.toLowerCase();
  const otherProfiles = allProfiles.filter((p) => {
    if (p.id === currentUserId) return false;
    if (currentName && p.name.toLowerCase() === currentName) return false;
    return true;
  });

  otherProfiles.sort((a, b) => {
    if (a.name === 'Manager') return 1;
    if (b.name === 'Manager') return -1;
    return a.name.localeCompare(b.name);
  });

  otherProfiles.forEach((p) => {
    options.push({
      id: p.id,
      name: p.name,
      type: 'user',
      role: p.role,
    });
  });

  return options;
}

/**
 * Fetches message history with pagination.
 */
export async function fetchMessages({
  currentUserId,
  limit = 50,
  beforeCreatedAt,
}: {
  currentUserId: string;
  limit?: number;
  beforeCreatedAt?: string;
}): Promise<{ messages: Message[]; hasMore: boolean }> {
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (beforeCreatedAt) {
      query = query.lt('created_at', beforeCreatedAt);
    }

    const { data: rawMessages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return { messages: [], hasMore: false };
    }

    const hasMore = (rawMessages || []).length > limit;
    const items = (rawMessages || []).slice(0, limit);

    const itemIds = items.map((m) => m.id);
    let readMessageIds = new Set<string>();

    if (itemIds.length > 0) {
      const { data: readData } = await supabase
        .from('message_reads')
        .select('message_id')
        .eq('user_id', currentUserId)
        .in('message_id', itemIds);

      readMessageIds = new Set((readData || []).map((r) => r.message_id));
    }

    const profiles = await fetchAllProfiles();
    const profileMap = new Map<string, UserProfile>();
    profiles.forEach((p) => {
      profileMap.set(p.id, p);
      profileMap.set(p.name.toLowerCase(), p);
    });

    const processedMessages: Message[] = items.map((m) => {
      const senderProf = profileMap.get(m.sender_id);
      const recipientProf = m.recipient_id ? profileMap.get(m.recipient_id) : undefined;

      let isRead = false;
      if (m.sender_id === currentUserId) {
        isRead = true;
      } else if (m.recipient_type === 'user') {
        isRead = Boolean(m.read_at);
      } else if (m.recipient_type === 'everyone' || m.recipient_type === 'group') {
        isRead = readMessageIds.has(m.id);
      }

      return {
        id: m.id,
        sender_id: m.sender_id,
        recipient_type: m.recipient_type as RecipientType,
        recipient_id: m.recipient_id,
        body: m.body,
        created_at: m.created_at,
        read_at: m.read_at,
        sender_profile: senderProf,
        recipient_profile: recipientProf,
        is_read_by_me: isRead,
      };
    });

    processedMessages.reverse();
    return { messages: processedMessages, hasMore };
  } catch (err) {
    console.error('Failed to fetch messages:', err);
    return { messages: [], hasMore: false };
  }
}

/**
 * Inserts a new message into the DB safely without UUID syntax errors.
 */
export async function sendMessage({
  senderId,
  recipientType,
  recipientId,
  body,
}: {
  senderId: string;
  recipientType: RecipientType;
  recipientId: string | null;
  body: string;
}): Promise<Message> {
  let validRecipientId: string | null = null;
  if (recipientType === 'user') {
    validRecipientId = ensureValidUuid(recipientId);
  } else if (recipientType === 'group') {
    validRecipientId = recipientId;
  }

  const payload: any = {
    sender_id: senderId,
    recipient_type: recipientType,
    recipient_id: validRecipientId,
    body: body.trim(),
  };

  let { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('*')
    .single();

  if (error && (error.code === '23503' || error.message?.includes('foreign key'))) {
    payload.recipient_id = null;
    const retry = await supabase
      .from('messages')
      .insert(payload)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new Error(error?.message || 'Failed to insert message into database');
  }

  return {
    id: data.id,
    sender_id: data.sender_id,
    recipient_type: data.recipient_type as RecipientType,
    recipient_id: data.recipient_id || validRecipientId || recipientId,
    body: data.body,
    created_at: data.created_at,
    read_at: data.read_at,
    is_read_by_me: true,
  };
}

/**
 * Marks messages as read for the current user.
 */
export async function markMessagesAsRead(
  currentUserId: string,
  messagesToRead: Message[]
): Promise<void> {
  if (!messagesToRead || messagesToRead.length === 0) return;

  const directMsgIdsToUpdate: string[] = [];
  const everyoneMsgIdsToRead: string[] = [];

  messagesToRead.forEach((m) => {
    if (m.sender_id === currentUserId || m.is_read_by_me) return;

    if (m.recipient_type === 'user') {
      directMsgIdsToUpdate.push(m.id);
    } else if (m.recipient_type === 'everyone') {
      everyoneMsgIdsToRead.push(m.id);
    }
  });

  try {
    if (directMsgIdsToUpdate.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', directMsgIdsToUpdate);
    }

    if (everyoneMsgIdsToRead.length > 0) {
      const readRows = everyoneMsgIdsToRead.map((mId) => ({
        message_id: mId,
        user_id: currentUserId,
        read_at: new Date().toISOString(),
      }));

      await supabase.from('message_reads').upsert(readRows, {
        onConflict: 'message_id,user_id',
      });
    }
  } catch (err) {
    console.error('Error marking messages as read:', err);
  }
}
