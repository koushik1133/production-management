import React, { useState } from 'react';
import { Users, User as UserIcon, Search, CheckCheck } from 'lucide-react';
import type { UserProfile, Message } from '../../types/messaging';
import { getSnippetFromMessageBody } from '../../lib/messagePayloads';

export interface ConversationItem {
  id: string; // 'everyone' or user UUID
  name: string;
  type: 'everyone' | 'user';
  role?: 'worker' | 'manager';
  profile?: UserProfile;
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
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  currentUserId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

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
            Chats
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
            placeholder="Search or start new chat..."
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
        {filteredConversations.map((conv) => {
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
                padding: '0.75rem',
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
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: conv.type === 'everyone' ? 'var(--accent-gradient)' : 'rgba(59, 130, 246, 0.15)',
                    color: conv.type === 'everyone' ? 'white' : '#60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}
                >
                  {conv.type === 'everyone' ? <Users size={18} /> : <UserIcon size={18} />}
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
                      fontSize: '0.88rem',
                      fontWeight: hasUnread || isActive ? 800 : 700,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {conv.name}
                  </span>

                  {conv.role === 'manager' && (
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
                      M1
                    </span>
                  )}
                </div>

                {/* Last Message Snippet + Status Ticks */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
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
        })}
      </div>
    </div>
  );
};
