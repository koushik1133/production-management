import React, { useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import type { ImagePayload } from '../../lib/messagePayloads';

interface ImageMessageBubbleProps {
  payload: ImagePayload;
  isOwnMessage: boolean;
}

export const ImageMessageBubble: React.FC<ImageMessageBubbleProps> = ({
  payload,
  isOwnMessage,
}) => {
  const [showLightbox, setShowLightbox] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '300px' }}>
      {/* Lightbox Modal */}
      {showLightbox && !hasError && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            style={{
              position: 'absolute',
              top: '1.5rem',
              right: '1.5rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={22} />
          </button>
          <img
            src={payload.image}
            alt="Full size attachment"
            style={{
              maxWidth: '95vw',
              maxHeight: '90vh',
              borderRadius: '8px',
              objectFit: 'contain',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
            onError={() => setHasError(true)}
          />
        </div>
      )}

      {/* Image Thumbnail Container */}
      <div
        style={{
          position: 'relative',
          borderRadius: '10px',
          overflow: 'hidden',
          cursor: hasError ? 'default' : 'pointer',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          background: 'black',
        }}
        onClick={() => !hasError && setShowLightbox(true)}
      >
        {hasError ? (
          <div style={{ padding: '1rem', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
            ⚠️ Image unavailable or corrupted
          </div>
        ) : (
          <img
            src={payload.image}
            alt="Attachment"
            onError={() => setHasError(true)}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '260px',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        )}

        {/* Hover / Corner Expand Hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            background: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            borderRadius: '6px',
            padding: '3px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: '0.65rem',
            fontWeight: 700,
          }}
        >
          <Maximize2 size={12} /> Expand
        </div>
      </div>

      {/* Optional Caption */}
      {payload.caption && (
        <div
          style={{
            fontSize: '0.88rem',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            color: isOwnMessage ? '#e9edef' : 'var(--text-primary)',
          }}
        >
          {payload.caption}
        </div>
      )}
    </div>
  );
};
