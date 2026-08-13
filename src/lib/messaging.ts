import { supabase } from './supabase';
import type { Message, UserProfile, RecipientOption, RecipientType } from '../types/messaging';

export const DEFAULT_PROFILES: UserProfile[] = [
  { id: '00000000-0000-4000-a000-000000000001', name: 'T1', role: 'worker', email: 't1@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000002', name: 'T2', role: 'worker', email: 't2@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000003', name: 'T3', role: 'worker', email: 't3@lanetrailers.com' },
  { id: '00000000-0000-4000-a000-000000000009', name: 'Manager', role: 'manager', email: 'manager@lanetrailers.com' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ensureValidUuid(id: string | null | undefined, fallbackName?: string): string | null {
  if (id && UUID_REGEX.test(id)) return id;

  if (fallbackName) {
    const lower = fallbackName.toLowerCase();
    if (lower.includes('t1')) return '00000000-0000-4000-a000-000000000001';
    if (lower.includes('t2')) return '00000000-0000-4000-a000-000000000002';
    if (lower.includes('t3')) return '00000000-0000-4000-a000-000000000003';
    if (lower.includes('manager')) return '00000000-0000-4000-a000-000000000009';
  }
  return null;
}

/**
 * Maps email to canonical profile name and role for V1 target users.
 */
export function deriveProfileFromEmail(email?: string): { name: string; role: 'worker' | 'manager' } {
  if (!email) return { name: 'Worker', role: 'worker' };
  const lower = email.toLowerCase();
  if (lower.includes('manager')) return { name: 'Manager', role: 'manager' };
  if (lower.includes('t1')) return { name: 'T1', role: 'worker' };
  if (lower.includes('t2')) return { name: 'T2', role: 'worker' };
  if (lower.includes('t3')) return { name: 'T3', role: 'worker' };

  const parts = email.split('@')[0];
  const capitalized = parts.charAt(0).toUpperCase() + parts.slice(1);
  return { name: capitalized, role: 'worker' };
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

/**
 * Fetches all user profiles from public.profiles and merges defaults.
 */
export async function fetchAllProfiles(): Promise<UserProfile[]> {
  try {
    const { data } = await supabase.from('profiles').select('*').order('name');
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

    return result;
  } catch (err) {
    console.error('Error fetching profiles:', err);
    return DEFAULT_PROFILES;
  }
}

/**
 * Builds the list of available recipient options for the current user.
 */
export function getRecipientOptions(
  currentUserId: string,
  allProfiles: UserProfile[],
  currentUserProfile?: UserProfile | null
): RecipientOption[] {
  const options: RecipientOption[] = [];

  options.push({
    id: 'everyone',
    name: 'Everyone',
    type: 'everyone',
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

    const { data: readData } = await supabase
      .from('message_reads')
      .select('message_id')
      .eq('user_id', currentUserId);

    const readMessageIds = new Set((readData || []).map((r) => r.message_id));

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
      } else if (m.recipient_type === 'everyone') {
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
  const validRecipientId = recipientType === 'user' ? ensureValidUuid(recipientId) : null;

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
