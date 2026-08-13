import React, { useState } from 'react';
import { Bell, BellOff, WifiOff, Menu, X, Users, User as UserIcon, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { UseMessagesReturn } from '../../hooks/useMessages';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { ConversationSidebar } from './ConversationSidebar';
import type { QuotedReply } from '../../lib/messagePayloads';

interface MessagesViewProps {
  messaging: UseMessagesReturn;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ messaging }) => {
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<QuotedReply | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);

  const {
    currentProfile,
    recipientOptions,
    selectedRecipients,
    setSelectedRecipients,
    activeConversationId,
    setActiveConversationId,
    conversations,
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlderMessages,
    sendMessage,
    isSending,
    sendError,
    clearSendError,
    connectionStatus,
    onlineUserIds,
    notifications,
    toggleReaction,
  } = messaging;

  const currentUserId = currentProfile?.id || '';
  const currentUserName = currentProfile?.name || 'User';
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || conversations[0];

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setIsMobileSidebarOpen(false);
    setReplyTo(null);
  };

  return (
    <div
      className="messages-view-page"
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: 'calc(100vh - var(--header-height, 72px))',
        width: '100%',
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'var(--bg-main)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 1. Desktop & Mobile Conversation Sidebar */}
      <div className={`sidebar-wrapper ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          currentUserId={currentUserId}
        />
      </div>

      {/* 2. Main Active Chat Panel */}
      <div
        className="chat-panel"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minWidth: 0,
          background: 'var(--bg-main)',
        }}
      >
        {/* Active Conversation Header Bar */}
        <div
          className="messages-header-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.25rem',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-default)',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Home"
            >
              <Home size={18} /> Home
            </button>

            {/* Mobile Sidebar Toggle Button */}
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="btn btn-secondary hide-on-desktop"
              style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}
            >
              {isMobileSidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>

            {/* Active Conversation Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  background: activeConversation?.type === 'everyone' ? 'var(--accent-gradient)' : 'rgba(59, 130, 246, 0.15)',
                  padding: '8px',
                  borderRadius: '10px',
                  color: activeConversation?.type === 'everyone' ? 'white' : '#60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {activeConversation?.type === 'everyone' ? <Users size={20} /> : <UserIcon size={20} />}
              </div>

              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {activeConversation ? activeConversation.name : 'Production Messages'}
                  {activeConversation?.role === 'manager' && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(234, 179, 8, 0.2)',
                        color: '#eab308',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                      }}
                    >
                      M1
                    </span>
                  )}
                </h2>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {activeConversation?.type === 'everyone' ? (
                    'Broadcast channel for all production team members'
                  ) : activeConversation?.isOnline ? (
                    <strong style={{ color: '#10b981' }}>🟢 Active Online</strong>
                  ) : (
                    '⚫ Offline'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Action Controls: Notification Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {notifications.isSupported && (
              <button
                onClick={() => {
                  if (notifications.permission !== 'granted') {
                    notifications.requestPermission();
                  }
                }}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  borderColor: notifications.permission === 'granted' ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-default)',
                  color: notifications.permission === 'granted' ? '#10b981' : 'var(--text-secondary)',
                }}
              >
                {notifications.permission === 'granted' ? <Bell size={14} /> : <BellOff size={14} />}
                <span>{notifications.permission === 'granted' ? 'Notifications On' : '🔔 Enable Notifications'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Connection Loss Banner */}
        {connectionStatus === 'disconnected' && (
          <div
            style={{
              background: 'rgba(234, 179, 8, 0.12)',
              borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
              color: '#eab308',
              padding: '0.5rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <WifiOff size={16} />
            <span>⚠️ Connection lost — reconnecting... Messages will sync automatically upon reconnection.</span>
          </div>
        )}

        {/* Filtered Thread Message History List */}
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          loading={loading}
          loadingOlder={loadingOlder}
          hasMore={hasMore}
          onLoadOlder={loadOlderMessages}
          onReply={(replyObj) => setReplyTo(replyObj)}
          onAnnotateImage={(imgUrl) => setEditingImageUrl(imgUrl)}
          onReact={(msgId, emoji) => toggleReaction(msgId, emoji)}
        />

        {/* Message Composer & Multi-Select Recipient Selector */}
        <MessageComposer
          recipientOptions={recipientOptions}
          selectedRecipients={selectedRecipients}
          onSelectRecipients={setSelectedRecipients}
          onSendMessage={sendMessage}
          isSending={isSending}
          sendError={sendError}
          onClearError={clearSendError}
          onlineUserIds={onlineUserIds}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          editingImageUrl={editingImageUrl}
          onClearEditingImage={() => setEditingImageUrl(null)}
        />
      </div>
    </div>
  );
};
