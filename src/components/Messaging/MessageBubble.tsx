import React, { useState, useRef, useEffect } from 'react';
import { format, isToday } from 'date-fns';
import { Users, User as UserIcon, Check, CheckCheck, ArrowRight, MoreHorizontal, Reply as ReplyIcon } from 'lucide-react';
import type { Message } from '../../types/messaging';
import { parseVoiceNote } from '../../lib/voiceNotes';
import { parseImagePayload, parseStructuredPayload } from '../../lib/messagePayloads';
import type { QuotedReply } from '../../lib/messagePayloads';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { ImageMessageBubble } from './ImageMessageBubble';
import { MessageContextMenu } from './MessageContextMenu';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  currentUserName?: string;
  onReply?: (replyTo: QuotedReply) => void;
  onAnnotateImage?: (imageUrl: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserId,
  currentUserName = 'User',
  onReply,
  onAnnotateImage,
  onReact,
}) => {
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);
  const touchTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }
    };
  }, []);

  const isOwnMessage = message.sender_id === currentUserId;
  const senderName = message.sender_profile?.name || (isOwnMessage ? 'You' : 'User');
  const senderRole = message.sender_profile?.role || 'worker';
  const recipientName = message.recipient_profile?.name || (message.recipient_id ? 'User' : 'Everyone');

  let timeFormatted = '';
  try {
    const dateObj = message.created_at ? new Date(message.created_at) : new Date();
    timeFormatted = isNaN(dateObj.getTime())
      ? ''
      : isToday(dateObj)
      ? format(dateObj, 'h:mm a')
      : format(dateObj, 'MMM d, h:mm a');
  } catch {
    timeFormatted = '';
  }
  const isReadByRecipient = Boolean(message.read_at);

  const voicePayload = parseVoiceNote(message.body);
  const imagePayload = parseImagePayload(message.body);
  const structuredPayload = parseStructuredPayload(message.body);

  const replyTo = imagePayload?.replyTo || structuredPayload.replyTo;
  const reactions = imagePayload?.reactions || structuredPayload.reactions;

  // Handlers for Long Press / Hold
  const handleTouchStart = () => {
    touchTimerRef.current = setTimeout(() => {
      setShowContextMenu(true);
    }, 500); // 500ms hold trigger
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  };

  const handleTriggerReply = () => {
    if (!onReply) return;
    const textSnippet = imagePayload
      ? imagePayload.caption || 'Image'
      : voicePayload
      ? 'Voice note'
      : structuredPayload.text || message.body;

    onReply({
      id: message.id,
      senderName,
      snippet: textSnippet,
      isImage: Boolean(imagePayload),
    });
  };

  return (
    <div
      className={`message-bubble-wrapper ${isOwnMessage ? 'own-message' : 'other-message'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwnMessage ? 'flex-end' : 'flex-start',
        marginBottom: '0.85rem',
        maxWidth: '100%',
        position: 'relative',
      }}
    >
      {/* Context Menu Modal */}
      {showContextMenu && (
        <MessageContextMenu
          message={message}
          currentUserId={currentUserId}
          onReact={(emoji) => onReact && onReact(message.id, emoji)}
          onReply={handleTriggerReply}
          onAnnotateImage={onAnnotateImage}
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {/* Header Info: Sender Name, M1 Badge, Recipient Tag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginBottom: '0.2rem',
          padding: '0 0.2rem',
          fontSize: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {!isOwnMessage && (
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            {senderName}
          </span>
        )}

        {senderRole === 'manager' && (
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '4px',
              background: 'rgba(234, 179, 8, 0.18)',
              color: '#eab308',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
          >
            M1
          </span>
        )}

        {message.recipient_type === 'user' ? (
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#93c5fd',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: 'rgba(59, 130, 246, 0.12)',
              padding: '1px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(59, 130, 246, 0.25)',
            }}
          >
            <ArrowRight size={10} /> To: <UserIcon size={10} /> {recipientName}
          </span>
        ) : (
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '1px 6px',
              borderRadius: '4px',
            }}
          >
            <Users size={10} /> Everyone
          </span>
        )}
      </div>

      {/* Message Bubble */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        style={{
          maxWidth: '85%',
          minWidth: '140px',
          padding: '0.65rem 0.85rem 0.4rem 0.85rem',
          borderRadius: isOwnMessage ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
          background: isOwnMessage
            ? 'linear-gradient(135deg, #005c4b 0%, #025143 100%)'
            : 'var(--bg-secondary)',
          color: isOwnMessage ? '#e9edef' : 'var(--text-primary)',
          border: isOwnMessage ? '1px solid rgba(0, 168, 132, 0.3)' : '1px solid var(--border-default)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          lineHeight: 1.45,
          fontSize: '0.9rem',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          position: 'relative',
        }}
      >
        {/* Quick Options Button (Visible on Hover/Click) */}
        <button
          onClick={() => setShowContextMenu(true)}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'rgba(0,0,0,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            color: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6,
          }}
          title="Hold/Click for Options & Reactions"
        >
          <MoreHorizontal size={12} />
        </button>

        {/* Render Quoted Reply Banner if Present */}
        {replyTo && (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              borderLeft: '3px solid #3b82f6',
              borderRadius: '6px',
              padding: '0.35rem 0.6rem',
              marginBottom: '0.5rem',
              fontSize: '0.78rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 800, color: '#60a5fa' }}>
              <ReplyIcon size={12} /> {replyTo.senderName}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.isImage ? '📷 [Image]' : replyTo.snippet}
            </div>
          </div>
        )}

        {/* Content: Voice Note OR Image OR Text */}
        {voicePayload ? (
          <VoiceNotePlayer payload={voicePayload} isOwnMessage={isOwnMessage} />
        ) : imagePayload ? (
          <ImageMessageBubble payload={imagePayload} isOwnMessage={isOwnMessage} />
        ) : (
          <div>{structuredPayload.text || message.body}</div>
        )}

        {/* Timestamp & Status Ticks Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '4px',
            marginTop: '4px',
            fontSize: '0.68rem',
            color: isOwnMessage ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          <span>{timeFormatted}</span>

          {isOwnMessage && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isReadByRecipient ? (
                <span title="Read (Double Blue Ticks)" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <CheckCheck size={14} color="#34d399" />
                </span>
              ) : message.created_at ? (
                <span title="Delivered (Double Gray Ticks)" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <CheckCheck size={14} color="#94a3b8" />
                </span>
              ) : (
                <span title="Sent (Single Gray Tick)" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Check size={14} color="#94a3b8" />
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Render Emoji Reactions Bar below bubble */}
      {reactions && Object.keys(reactions).length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
            marginTop: '2px',
            padding: '2px 6px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            fontSize: '0.75rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
          }}
        >
          {Object.entries(reactions).map(([emoji, users]) => (
            <span
              key={emoji}
              onClick={() => onReact && onReact(message.id, emoji)}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '1px 4px',
                borderRadius: '6px',
                background: users.includes(currentUserName) ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              }}
              title={`Reacted by: ${users.join(', ')}`}
            >
              <span>{emoji}</span>
              {users.length > 1 && (
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  {users.length}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
