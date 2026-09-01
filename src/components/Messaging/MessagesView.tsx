import React, { useState } from 'react';
import { Bell, BellOff, WifiOff, Menu, X, Users, User as UserIcon, Home, Hash, Shield, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { UseMessagesReturn } from '../../hooks/useMessages';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { ConversationSidebar } from './ConversationSidebar';
import { CreateGroupModal } from './CreateGroupModal';
import type { QuotedReply } from '../../lib/messagePayloads';

interface MessagesViewProps {
  messaging: UseMessagesReturn;
  userRole?: 'worker' | 'manager';
}

export const MessagesView: React.FC<MessagesViewProps> = ({ messaging, userRole }) => {
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<QuotedReply | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const {
    currentProfile,
    allProfiles,
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
    createGroup,
    deleteGroup,
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
          userRole={userRole}
          onCreateGroup={() => setIsCreateGroupOpen(true)}
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
                  background:
                    activeConversation?.type === 'everyone'
                      ? 'var(--accent-gradient)'
                      : activeConversation?.type === 'group'
                      ? 'linear-gradient(135deg, #4f46e5, #06b6d4)'
                      : 'rgba(59, 130, 246, 0.15)',
                  padding: '8px',
                  borderRadius: activeConversation?.type === 'group' ? '10px' : '10px',
                  color: activeConversation?.type === 'everyone' || activeConversation?.type === 'group' ? 'white' : '#60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {activeConversation?.type === 'everyone' ? (
                  <Users size={20} />
                ) : activeConversation?.type === 'group' ? (
                  <Hash size={20} />
                ) : (
                  <UserIcon size={20} />
                )}
              </div>

              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {activeConversation?.type === 'group' ? `# ${activeConversation.name}` : activeConversation?.name || 'Lane Messages'}
                  {activeConversation?.type === 'group' && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#818cf8',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                      }}
                    >
                      CHANNEL
                    </span>
                  )}
                  {activeConversation?.role === 'manager' && activeConversation?.type === 'user' && (
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
                      MANAGER
                    </span>
                  )}
                </h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {activeConversation?.type === 'everyone' ? (
                      'Broadcast channel for all production team members'
                    ) : activeConversation?.type === 'group' ? (
                      activeConversation.group?.description || 'Custom team group channel'
                    ) : activeConversation?.isOnline ? (
                      <strong style={{ color: '#10b981' }}>🟢 Active Online</strong>
                    ) : (
                      '⚫ Offline'
                    )}
                  </span>

                  {/* Group Admins Badge */}
                  {activeConversation?.type === 'group' && activeConversation.group?.admin_ids && activeConversation.group.admin_ids.length > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', color: '#eab308', fontWeight: 700 }}>
                      <Shield size={10} />
                      <span>
                        Admins:{' '}
                        {activeConversation.group.admin_ids
                          .map((id) => allProfiles.find((p) => p.id === id)?.name || 'Admin')
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Controls: Notification Toggle & Group Admin Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Delete Group button - Only for Managers */}
            {userRole === 'manager' && activeConversation?.type === 'group' && (
              <button
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the #${activeConversation.name} group?`)) {
                    deleteGroup(activeConversation.id);
                  }
                }}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.08)',
                }}
                title="Delete Group"
              >
                <Trash2 size={13} />
                <span>Delete Channel</span>
              </button>
            )}

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

      {/* Create Group Channel Modal */}
      {userRole === 'manager' && (
        <CreateGroupModal
          isOpen={isCreateGroupOpen}
          onClose={() => setIsCreateGroupOpen(false)}
          allProfiles={allProfiles}
          currentProfile={currentProfile}
          onCreateGroup={createGroup}
        />
      )}
    </div>
  );
};
