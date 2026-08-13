import React from 'react';
import { Reply, Edit3, X } from 'lucide-react';
import type { Message } from '../../types/messaging';
import { parseImagePayload } from '../../lib/messagePayloads';

interface MessageContextMenuProps {
  message: Message;
  currentUserId: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onAnnotateImage?: (imageUrl: string) => void;
  onClose: () => void;
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '👏', '🚀', '👎', '🚨'];

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  message,
  onReact,
  onReply,
  onAnnotateImage,
  onClose,
}) => {
  const imagePayload = parseImagePayload(message.body);
  const hasImage = Boolean(imagePayload?.image);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '1rem',
          width: '100%',
          maxWidth: '340px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Message Actions
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Emoji Reactions Quick Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            REACT WITH EMOJI:
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-secondary)',
              padding: '0.4rem 0.6rem',
              borderRadius: '12px',
              border: '1px solid var(--border-default)',
            }}
          >
            {EMOJI_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(emoji);
                  onClose();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  transition: 'transform 0.1s ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Action List Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {/* Reply Action */}
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              padding: '0.6rem 0.85rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 700,
              justifyContent: 'flex-start',
            }}
          >
            <Reply size={16} color="#3b82f6" />
            <span>Reply to Message</span>
          </button>

          {/* Draw & Edit Image Action (If message contains an image) */}
          {hasImage && imagePayload && onAnnotateImage && (
            <button
              onClick={() => {
                onAnnotateImage(imagePayload.image);
                onClose();
              }}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.6rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                justifyContent: 'flex-start',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
              }}
            >
              <Edit3 size={16} />
              <span>Draw & Edit Image (Send back)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
