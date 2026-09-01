import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Message, UserProfile, RecipientOption, ChatGroup } from '../types/messaging';
import {
  getOrSyncProfile,
  fetchAllProfiles,
  getRecipientOptions,
  fetchMessages,
  fetchChatGroups,
  createChatGroup,
  deleteChatGroup,
  sendMessage as apiSendMessage,
  markMessagesAsRead,
} from '../lib/messaging';
import { updatePayloadReactions, formatCleanNotificationMessage } from '../lib/messagePayloads';
import { useMessageNotifications } from './useMessageNotifications';
import type { ConversationItem } from '../components/Messaging/ConversationSidebar';

export interface UseMessagesReturn {
  currentProfile: UserProfile | null;
  allProfiles: UserProfile[];
  chatGroups: ChatGroup[];
  recipientOptions: RecipientOption[];
  selectedRecipients: RecipientOption[];
  setSelectedRecipients: (recipients: RecipientOption[]) => void;
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
  conversations: ConversationItem[];
  messages: Message[];
  allMessages: Message[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (body: string) => Promise<boolean>;
  createGroup: (params: { name: string; description?: string; adminIds: string[]; memberIds: string[] }) => Promise<ChatGroup>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  isSending: boolean;
  sendError: string | null;
  clearSendError: () => void;
  unreadCount: number;
  markAsRead: () => Promise<void>;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  onlineUserIds: Set<string>;
  notifications: ReturnType<typeof useMessageNotifications>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
}

export function useMessages(currentUser: User | null, isViewingMessagesPage: boolean = false): UseMessagesReturn {
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('everyone');
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientOption[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const notifications = useMessageNotifications();
  const currentUserId = currentUser?.id;
  const isViewingRef = useRef(isViewingMessagesPage);
  isViewingRef.current = isViewingMessagesPage;

  // 1. Initialize User Profile and All Profiles
  const loadProfiles = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const selfProfile = await getOrSyncProfile(currentUserId, currentUser?.email);
      setCurrentProfile(selfProfile);

      const fetchedProfiles = await fetchAllProfiles();
      const hasSelf = fetchedProfiles.some((p) => p.id === currentUserId);
      const combined = hasSelf ? fetchedProfiles : [...fetchedProfiles, selfProfile];
      setAllProfiles(combined);

      const groups = await fetchChatGroups();
      setChatGroups(groups);
    } catch (err) {
      console.error('Failed to load user profiles:', err);
    }
  }, [currentUserId, currentUser?.email]);

  useEffect(() => {
    if (currentUserId) {
      loadProfiles();
    }
  }, [currentUserId, loadProfiles]);

  // 2. Derive Recipient Options
  const recipientOptions = useMemo(() => {
    if (!currentUserId) return [];
    return getRecipientOptions(currentUserId, allProfiles, currentProfile, chatGroups);
  }, [currentUserId, allProfiles, currentProfile, chatGroups]);

  useEffect(() => {
    if (recipientOptions.length > 0 && selectedRecipients.length === 0) {
      const everyoneOpt = recipientOptions.find((r) => r.type === 'everyone') || recipientOptions[0];
      setSelectedRecipients([everyoneOpt]);
    }
  }, [recipientOptions, selectedRecipients]);

  // 3. Load Initial Messages
  const loadInitialMessages = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { messages: fetched, hasMore: more } = await fetchMessages({
        currentUserId,
        limit: 50,
      });
      setAllMessages(fetched);
      setHasMore(more);
    } catch (err) {
      console.error('Failed to load initial messages:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      loadInitialMessages();
    }
  }, [currentUserId, loadInitialMessages]);

  // 4. Load Older Messages
  const loadOlderMessages = useCallback(async () => {
    if (!currentUserId || loadingOlder || !hasMore || allMessages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestTimestamp = allMessages[0].created_at;

      const { messages: olderMessages, hasMore: more } = await fetchMessages({
        currentUserId,
        limit: 50,
        beforeCreatedAt: oldestTimestamp,
      });

      setAllMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredOlder = olderMessages.filter((m) => !existingIds.has(m.id));
        return [...filteredOlder, ...prev];
      });

      setHasMore(more);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [currentUserId, loadingOlder, hasMore, allMessages]);

  // Helper matcher to test if a message belongs to a target conversation thread
  const isMessageInUserThread = useCallback(
    (m: Message, targetProf: UserProfile) => {
      if (m.recipient_type !== 'user' || !currentUserId) return false;

      const targetId = targetProf.id;
      const targetName = targetProf.name.toLowerCase();
      const selfName = (currentProfile?.name || '').toLowerCase();

      const senderId = m.sender_id;
      const senderName = (m.sender_profile?.name || '').toLowerCase();

      const recipientId = m.recipient_id;
      const recipientName = (m.recipient_profile?.name || '').toLowerCase();

      // Case 1: Sent by self, addressed to target user
      const isFromSelf = senderId === currentUserId || (selfName && senderName === selfName);
      const isToTarget =
        recipientId === targetId ||
        (recipientName && recipientName === targetName) ||
        (recipientId && recipientId.toLowerCase().includes(targetName)) ||
        (!recipientId && !recipientName); // Fallback for legacy messages

      if (isFromSelf && isToTarget) return true;

      // Case 2: Sent by target user, addressed to self
      const isFromTarget = senderId === targetId || (senderName && senderName === targetName);
      const isToSelf = recipientId === currentUserId || (selfName && recipientName === selfName);

      if (isFromTarget && isToSelf) return true;

      return false;
    },
    [currentUserId, currentProfile]
  );

  // 5. Generate Conversations List for Sidebar
  const conversations = useMemo<ConversationItem[]>(() => {
    const list: ConversationItem[] = [];

    // Everyone Channel
    const everyoneMsgs = allMessages.filter((m) => m.recipient_type === 'everyone');
    const everyoneUnread = everyoneMsgs.filter((m) => m.sender_id !== currentUserId && !m.is_read_by_me).length;
    const everyoneLast = everyoneMsgs[everyoneMsgs.length - 1];

    list.push({
      id: 'everyone',
      name: 'Everyone',
      type: 'everyone',
      lastMessage: everyoneLast,
      unreadCount: everyoneUnread,
    });

    // Group Channels
    chatGroups.forEach((g) => {
      const groupMsgs = allMessages.filter((m) => m.recipient_type === 'group' && m.recipient_id === g.id);
      const groupUnread = groupMsgs.filter((m) => m.sender_id !== currentUserId && !m.is_read_by_me).length;
      const groupLast = groupMsgs[groupMsgs.length - 1];

      list.push({
        id: g.id,
        name: g.name,
        type: 'group',
        group: g,
        lastMessage: groupLast,
        unreadCount: groupUnread,
      });
    });

    // Individual User DM Threads
    const currentName = currentProfile?.name?.toLowerCase();
    const otherProfiles = allProfiles.filter((p) => {
      if (p.id === currentUserId) return false;
      if (currentName && p.name.toLowerCase() === currentName) return false;
      return true;
    });

    otherProfiles.forEach((p) => {
      const userMsgs = allMessages.filter((m) => isMessageInUserThread(m, p));
      const unread = userMsgs.filter((m) => m.sender_id !== currentUserId && !m.is_read_by_me).length;
      const lastMsg = userMsgs[userMsgs.length - 1];

      list.push({
        id: p.id,
        name: p.name,
        type: 'user',
        role: p.role,
        profile: p,
        lastMessage: lastMsg,
        unreadCount: unread,
        isOnline: onlineUserIds.has(p.id),
      });
    });

    return list;
  }, [allMessages, allProfiles, chatGroups, currentUserId, currentProfile, onlineUserIds, isMessageInUserThread]);

  // 6. Filter Messages for Active Conversation Thread
  const filteredMessages = useMemo(() => {
    if (activeConversationId === 'everyone') {
      return allMessages.filter((m) => m.recipient_type === 'everyone');
    }

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv) return [];

    if (activeConv.type === 'group') {
      return allMessages.filter((m) => m.recipient_type === 'group' && m.recipient_id === activeConv.id);
    }

    if (!activeConv.profile) return [];
    return allMessages.filter((m) => isMessageInUserThread(m, activeConv.profile!));
  }, [allMessages, activeConversationId, conversations, isMessageInUserThread]);

  // 7. Calculate Global Unread Count
  const unreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + c.unreadCount, 0);
  }, [conversations]);

  // 8. Mark Active Conversation Messages as Read
  const markAsRead = useCallback(async () => {
    if (!currentUserId || filteredMessages.length === 0) return;

    const unreadList = filteredMessages.filter((m) => m.sender_id !== currentUserId && !m.is_read_by_me);
    if (unreadList.length === 0) return;

    const unreadIds = new Set(unreadList.map((m) => m.id));
    setAllMessages((prev) =>
      prev.map((m) => (unreadIds.has(m.id) ? { ...m, is_read_by_me: true } : m))
    );

    await markMessagesAsRead(currentUserId, unreadList);
  }, [currentUserId, filteredMessages]);

  useEffect(() => {
    if (isViewingMessagesPage && unreadCount > 0) {
      markAsRead();
    }
  }, [isViewingMessagesPage, activeConversationId, unreadCount, markAsRead]);

  // Handle switching active conversation tab
  const handleSelectConversation = useCallback(
    (convId: string) => {
      setActiveConversationId(convId);
      const matchedOpt = recipientOptions.find((r) => r.id === convId);
      if (matchedOpt) {
        setSelectedRecipients([matchedOpt]);
      }
    },
    [recipientOptions]
  );

  // 9. Realtime Subscription
  useEffect(() => {
    if (!currentUserId) return;

    const channelName = `realtime-messages:${currentUserId}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new;

          const isRelevant =
            newMsg.sender_id === currentUserId ||
            (newMsg.recipient_type === 'user' && (newMsg.recipient_id === currentUserId || !newMsg.recipient_id)) ||
            newMsg.recipient_type === 'everyone' ||
            newMsg.recipient_type === 'group';

          if (!isRelevant) return;

          let senderProf: UserProfile | undefined = undefined;
          if (newMsg.sender_id === currentUserId) {
            senderProf = currentProfile || undefined;
          } else {
            senderProf = allProfiles.find((p) => p.id === newMsg.sender_id);
            if (!senderProf) {
              const profiles = await fetchAllProfiles();
              senderProf = profiles.find((p) => p.id === newMsg.sender_id);
            }
          }

          let recipientProf: UserProfile | undefined = undefined;
          if (newMsg.recipient_id) {
            recipientProf = allProfiles.find((p) => p.id === newMsg.recipient_id);
          }

          let msgGroup: ChatGroup | undefined = undefined;
          if (newMsg.recipient_type === 'group' && newMsg.recipient_id) {
            msgGroup = chatGroups.find((g) => g.id === newMsg.recipient_id);
          }

          const formattedNewMsg: Message = {
            id: newMsg.id,
            sender_id: newMsg.sender_id,
            recipient_type: newMsg.recipient_type,
            recipient_id: newMsg.recipient_id,
            body: newMsg.body,
            created_at: newMsg.created_at,
            read_at: newMsg.read_at,
            sender_profile: senderProf,
            recipient_profile: recipientProf,
            group: msgGroup,
            is_read_by_me: newMsg.sender_id === currentUserId,
          };

          setAllMessages((prev) => {
            if (prev.some((m) => m.id === formattedNewMsg.id)) return prev;
            return [...prev, formattedNewMsg];
          });

          // Play notification sound / trigger toast if from someone else
          if (newMsg.sender_id !== currentUserId) {
            const senderTitle = senderProf?.name || 'Someone';
            const cleanBodyText = formatCleanNotificationMessage(newMsg.body, senderTitle);
            notifications.sendNotification(`Message from ${senderTitle}`, {
              body: cleanBodyText,
              senderName: senderTitle,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updated = payload.new;
          if (updated && updated.id) {
            setAllMessages((prev) =>
              prev.map((m) =>
                m.id === updated.id
                  ? {
                      ...m,
                      read_at: updated.read_at !== undefined ? updated.read_at : m.read_at,
                      body: updated.body !== undefined ? updated.body : m.body,
                    }
                  : m
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (navigator.onLine) {
            setConnectionStatus('reconnecting');
          } else {
            setConnectionStatus('disconnected');
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, currentProfile, allProfiles, chatGroups, notifications]);

  // 10. Presence Tracking
  useEffect(() => {
    if (!currentUserId || !currentProfile) return;

    const presenceChannel = supabase.channel('online-presence', {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          onlineIds.add(key);
        });
        setOnlineUserIds(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            userId: currentUserId,
            name: currentProfile.name,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUserId, currentProfile]);

  // 11. Offline/Online & Background Tab Sync Events
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('connected');
      if (currentUserId) {
        loadInitialMessages();
      }
    };
    const handleOffline = () => {
      setConnectionStatus('disconnected');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentUserId) {
        loadInitialMessages();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId, loadInitialMessages]);

  // 12. Send Message Action
  const handleSendMessage = useCallback(
    async (bodyText: string): Promise<boolean> => {
      if (!currentUserId || selectedRecipients.length === 0 || !bodyText.trim() || isSending) {
        return false;
      }

      setIsSending(true);
      setSendError(null);

      try {
        const isEveryone = selectedRecipients.some((r) => r.type === 'everyone');
        const isGroup = selectedRecipients.some((r) => r.type === 'group');

        if (isEveryone) {
          const newMsg = await apiSendMessage({
            senderId: currentUserId,
            recipientType: 'everyone',
            recipientId: null,
            body: bodyText,
          });

          newMsg.sender_profile = currentProfile || undefined;

          setAllMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        } else if (isGroup) {
          const groupRec = selectedRecipients.find((r) => r.type === 'group')!;
          const newMsg = await apiSendMessage({
            senderId: currentUserId,
            recipientType: 'group',
            recipientId: groupRec.id,
            body: bodyText,
          });

          newMsg.sender_profile = currentProfile || undefined;
          newMsg.group = groupRec.group;

          setAllMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        } else {
          const sendPromises = selectedRecipients.map((rec) =>
            apiSendMessage({
              senderId: currentUserId,
              recipientType: 'user',
              recipientId: rec.id, // Store actual recipient ID!
              body: bodyText,
            })
          );

          const sentMessages = await Promise.all(sendPromises);
          sentMessages.forEach((msg, idx) => {
            msg.sender_profile = currentProfile || undefined;
            const rec = selectedRecipients[idx];
            msg.recipient_profile = {
              id: rec.id,
              name: rec.name,
              role: rec.role || 'worker',
            };
          });

          setAllMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = sentMessages.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newOnes];
          });
        }

        setIsSending(false);
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to send message';
        console.error('Send message error:', err);
        setSendError(errMsg);
        setIsSending(false);
        return false;
      }
    },
    [currentUserId, selectedRecipients, isSending, currentProfile]
  );

  const clearSendError = useCallback(() => {
    setSendError(null);
  }, []);

  const createGroup = useCallback(
    async (params: { name: string; description?: string; adminIds: string[]; memberIds: string[] }): Promise<ChatGroup> => {
      const newGroup = await createChatGroup({
        ...params,
        createdBy: currentUserId!,
      });
      setChatGroups((prev) => [newGroup, ...prev.filter((g) => g.id !== newGroup.id)]);
      handleSelectConversation(newGroup.id);
      return newGroup;
    },
    [currentUserId, handleSelectConversation]
  );

  const deleteGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      const ok = await deleteChatGroup(groupId);
      if (ok) {
        setChatGroups((prev) => prev.filter((g) => g.id !== groupId));
        if (activeConversationId === groupId) {
          handleSelectConversation('everyone');
        }
      }
      return ok;
    },
    [activeConversationId, handleSelectConversation]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = allMessages.find((m) => m.id === messageId);
      if (!msg || !currentProfile) return;

      const userName = currentProfile.name || 'User';
      const updatedBody = updatePayloadReactions(msg.body, emoji, userName);

      setAllMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, body: updatedBody } : m))
      );

      try {
        await supabase.from('messages').update({ body: updatedBody }).eq('id', messageId);
      } catch (err) {
        console.error('Failed to update reaction:', err);
      }
    },
    [allMessages, currentProfile]
  );

  return {
    currentProfile,
    allProfiles,
    chatGroups,
    recipientOptions,
    selectedRecipients,
    setSelectedRecipients,
    activeConversationId,
    setActiveConversationId: handleSelectConversation,
    conversations,
    messages: filteredMessages,
    allMessages,
    loading,
    loadingOlder,
    hasMore,
    loadOlderMessages,
    sendMessage: handleSendMessage,
    createGroup,
    deleteGroup,
    isSending,
    sendError,
    clearSendError,
    unreadCount,
    markAsRead,
    connectionStatus,
    onlineUserIds,
    notifications,
    toggleReaction,
  };
}
