import React, { useState } from 'react';
import { Users, User as UserIcon, Search, CheckCheck, Hash, Plus } from 'lucide-react';
import type { UserProfile, Message, ChatGroup } from '../../types/messaging';
import { getSnippetFromMessageBody } from '../../lib/messagePayloads';

export interface ConversationItem {
  id: string; // 'everyone', user UUID, or group UUID
  name: string;
  type: 'everyone' | 'user' | 'group';
  role?: 'worker' | 'manager';
  profile?: UserProfile;
  group?: ChatGroup;
  lastMessage?: Message;
  unreadCount: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  currentUserId?: string;
  userRole?: 'worker' | 'manager';
  onCreateGroup?: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUserId,
  userRole,
  onCreateGroup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const channelConversations = filteredConversations.filter(
    (c) => c.type === 'everyone' || c.type === 'group'
  );

  const directConversations = filteredConversations.filter(
    (c) => c.type === 'user'
  );

  const renderConversationRow = (conv: ConversationItem) => {
    const isActive = conv.id === activeConversationId;
    const hasUnread = conv.unreadCount > 0;
    const lastMsg = conv.lastMessage;
    const isSentByMe = lastMsg && currentUserId && lastMsg.sender_id === currentUserId;

    return (
      <div
        key={conv.id}
        onClick={() => onSelectConversation(conv.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.65rem 0.75rem',
          borderRadius: '10px',
          cursor: 'pointer',
          background: isActive
            ? 'rgba(59, 130, 246, 0.18)'
            : hasUnread
            ? 'rgba(59, 130, 246, 0.06)'
            : 'transparent',
          borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
          transition: 'all 0.15s ease',
          marginBottom: '0.2rem',
        }}
      >
        {/* Avatar Icon with Online Badge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: conv.type === 'group' ? '10px' : '50%',
              background:
                conv.type === 'everyone'
                  ? 'var(--accent-gradient)'
                  : conv.type === 'group'
                  ? 'linear-gradient(135deg, #4f46e5, #06b6d4)'
                  : 'rgba(59, 130, 246, 0.15)',
              color: conv.type === 'everyone' || conv.type === 'group' ? 'white' : '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
            }}
          >
            {conv.type === 'everyone' ? (
              <Users size={16} />
            ) : conv.type === 'group' ? (
              <Hash size={16} />
            ) : (
              <UserIcon size={16} />
            )}
          </div>

          {conv.type === 'user' && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: conv.isOnline ? '#10b981' : '#64748b',
                border: '2px solid var(--bg-secondary)',
              }}
            />
          )}
        </div>

        {/* Chat Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '0.86rem',
                fontWeight: hasUnread || isActive ? 800 : 700,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {conv.type === 'group' ? `# ${conv.name}` : conv.name}
            </span>

            {conv.type === 'group' && (
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'rgba(99, 102, 241, 0.18)',
                  color: '#818cf8',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                GROUP
              </span>
            )}

            {conv.role === 'manager' && conv.type === 'user' && (
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: 'rgba(234, 179, 8, 0.18)',
                  color: '#eab308',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                }}
              >
                MGR
              </span>
            )}
          </div>

          {/* Last Message Snippet + Status Ticks */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
            <span
              style={{
                fontSize: '0.74rem',
                color: hasUnread ? '#60a5fa' : 'var(--text-secondary)',
                fontWeight: hasUnread ? 700 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isSentByMe && (
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {lastMsg.read_at ? (
                    <CheckCheck size={13} color="#34d399" />
                  ) : (
                    <CheckCheck size={13} color="#94a3b8" />
                  )}
                </span>
              )}
              {lastMsg ? getSnippetFromMessageBody(lastMsg.body) : 'No messages yet'}
            </span>

            {hasUnread && (
              <span className="unread-badge" style={{ marginLeft: '4px', flexShrink: 0 }}>
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="conversation-sidebar"
      style={{
        width: '280px',
        height: '100%',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* Header & Search Bar */}
      <div
        style={{
          padding: '0.85rem 1rem',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
            Lane Messages
          </h3>
        </div>

        {/* Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '0.4rem 0.65rem',
          }}
        >
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search channels or team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Conversations List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.4rem',
        }}
      >
        {/* Section 1: Channels & Groups */}
        <div style={{ marginBottom: '0.85rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.35rem 0.5rem',
              marginBottom: '0.2rem',
            }}
          >
            <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Channels & Groups
            </span>
            {userRole === 'manager' && onCreateGroup && (
              <button
                type="button"
                onClick={onCreateGroup}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={10} strokeWidth={3} />
                <span>New Group</span>
              </button>
            )}
          </div>
          {channelConversations.map(renderConversationRow)}
        </div>

        {/* Section 2: Direct Messages */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.35rem 0.5rem',
              marginBottom: '0.2rem',
            }}
          >
            <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Direct Messages
            </span>
          </div>
          {directConversations.map(renderConversationRow)}
        </div>
      </div>
    </div>
  );
};
