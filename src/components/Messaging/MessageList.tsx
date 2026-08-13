import React, { useRef, useEffect } from 'react';
import { MessageSquare, ArrowUp, RefreshCw } from 'lucide-react';
import type { Message } from '../../types/messaging';
import { MessageBubble } from './MessageBubble';
import type { QuotedReply } from '../../lib/messagePayloads';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  currentUserName?: string;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  onReply?: (replyTo: QuotedReply) => void;
  onAnnotateImage?: (imageUrl: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  currentUserName,
  loading,
  loadingOlder,
  hasMore,
  onLoadOlder,
  onReply,
  onAnnotateImage,
  onReact,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto scroll to bottom on initial load or new incoming messages
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const container = containerRef.current;
      if (container) {
        const isNearBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isNearBottom || messages[messages.length - 1]?.sender_id === currentUserId) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, currentUserId]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading]);

  if (loading && messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '250px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading Production Messages...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="message-list-container"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        background: 'var(--bg-main)',
      }}
    >
      {/* Load Older Messages Trigger */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <button
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="btn btn-secondary"
            style={{
              fontSize: '0.75rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontWeight: 700,
              gap: '0.4rem',
            }}
          >
            {loadingOlder ? (
              <>
                <RefreshCw size={12} className="animate-spin" /> Loading older...
              </>
            ) : (
              <>
                <ArrowUp size={12} /> Load older messages
              </>
            )}
          </button>
        </div>
      )}

      {/* Empty State */}
      {messages.length === 0 && !loading && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          <MessageSquare size={36} style={{ color: 'var(--border-default)', marginBottom: '0.75rem' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            No Production Messages Yet
          </h4>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', maxWidth: '300px' }}>
            Select a recipient above and send your first message to T1, T2, T3, or Manager.
          </p>
        </div>
      )}

      {/* Message Bubbles */}
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onReply={onReply}
          onAnnotateImage={onAnnotateImage}
          onReact={onReact}
        />
      ))}

      {/* Scroll Anchor */}
      <div ref={bottomRef} />
    </div>
  );
};
