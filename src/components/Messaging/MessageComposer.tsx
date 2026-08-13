import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, RefreshCw, Smile, Mic, Square, Trash2, Paperclip, X, Reply, Camera } from 'lucide-react';
import type { RecipientOption } from '../../types/messaging';
import { RecipientSelector } from './RecipientSelector';
import { formatVoiceNoteBody } from '../../lib/voiceNotes';
import { formatImagePayload, formatStructuredPayload } from '../../lib/messagePayloads';
import type { QuotedReply } from '../../lib/messagePayloads';
import { ImageDrawingEditor } from './ImageDrawingEditor';
import { CameraCaptureModal } from './CameraCaptureModal';

interface MessageComposerProps {
  recipientOptions: RecipientOption[];
  selectedRecipients: RecipientOption[];
  onSelectRecipients: (recipients: RecipientOption[]) => void;
  onSendMessage: (body: string) => Promise<boolean>;
  isSending: boolean;
  sendError: string | null;
  onClearError: () => void;
  onlineUserIds?: Set<string>;
  replyTo?: QuotedReply | null;
  onClearReply?: () => void;
  editingImageUrl?: string | null;
  onClearEditingImage?: () => void;
}

const QUICK_EMOJIS = ['👍', '😊', '🔥', '👏', '🚀', '❤️', '🚨', '✅', '📍'];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  recipientOptions,
  selectedRecipients,
  onSelectRecipients,
  onSendMessage,
  isSending,
  sendError,
  onClearError,
  onlineUserIds = new Set(),
  replyTo = null,
  onClearReply,
  editingImageUrl = null,
  onClearEditingImage,
}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [showDrawingEditor, setShowDrawingEditor] = useState<boolean>(false);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const isTextEmpty = !text.trim();
  const hasSelectedRecipient = selectedRecipients.length > 0;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
          }
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // When editingImageUrl prop changes (from "Draw & Edit" action on bubble), trigger editor
  useEffect(() => {
    if (editingImageUrl) {
      setSelectedImageSrc(editingImageUrl);
      setShowDrawingEditor(true);
    }
  }, [editingImageUrl]);

  const handleSend = async () => {
    if (isTextEmpty || isSending || !hasSelectedRecipient) return;
    const bodyToSend = formatStructuredPayload(text, replyTo || undefined);
    const success = await onSendMessage(bodyToSend);
    if (success) {
      setText('');
      setShowEmojiPicker(false);
      if (onClearReply) onClearReply();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSendImage = async (annotatedBase64: string) => {
    if (isSending || !hasSelectedRecipient) return;
    const imageBody = formatImagePayload(annotatedBase64, text, replyTo || undefined);
    const success = await onSendMessage(imageBody);
    if (success) {
      setText('');
      setSelectedImageSrc(null);
      setShowDrawingEditor(false);
      if (onClearReply) onClearReply();
      if (onClearEditingImage) onClearEditingImage();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WEBP, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file is too large. Please select an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      if (base64Data) {
        setSelectedImageSrc(base64Data);
        setShowDrawingEditor(true);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openCamera = () => {
    // Check if on mobile touch device or supports mediaDevices
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;
    
    if (isMobile && cameraInputRef.current) {
      // Direct native OS camera launch on mobile/tablet
      cameraInputRef.current.click();
    } else {
      // In-app viewfinder camera modal
      setShowCameraModal(true);
    }
  };

  const handleCapturedPhoto = (base64Data: string) => {
    setShowCameraModal(false);
    setSelectedImageSrc(base64Data);
    setShowDrawingEditor(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (sendError) onClearError();
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  };

  const addEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Unable to access microphone. Please allow microphone permissions.');
    }
  };

  // Stop Recording and Send Voice Note
  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const recorder = mediaRecorderRef.current;
    const duration = recordingTime;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        const voiceBody = formatVoiceNoteBody(base64Audio, duration);
        await onSendMessage(voiceBody);

        // Stop all audio tracks
        recorder.stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setRecordingTime(0);
      };
    };

    recorder.stop();
  };

  // Cancel Recording
  const cancelRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setRecordingTime(0);
      audioChunksRef.current = [];
    };

    recorder.stop();
  };

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const placeholderText = selectedRecipients.some((r) => r.type === 'everyone')
    ? 'Type a message to Everyone...'
    : selectedRecipients.length === 1
    ? `Type a message to ${selectedRecipients[0].name}...`
    : `Type a message to ${selectedRecipients.map((r) => r.name).join(', ')}...`;

  return (
    <div
      className="message-composer-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        padding: '0.85rem 1rem',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      {/* Hidden Gallery File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Hidden Camera File Input (Native Camera Capture for Mobile/Tablet) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Live Viewfinder Camera Modal */}
      {showCameraModal && (
        <CameraCaptureModal
          onCapture={handleCapturedPhoto}
          onClose={() => setShowCameraModal(false)}
        />
      )}

      {/* Image Drawing Editor Modal Overlay */}
      {showDrawingEditor && selectedImageSrc && (
        <ImageDrawingEditor
          imageUrl={selectedImageSrc}
          onSave={handleSendImage}
          onCancel={() => {
            setShowDrawingEditor(false);
            setSelectedImageSrc(null);
            if (onClearEditingImage) onClearEditingImage();
          }}
        />
      )}

      {/* Quoted Reply Banner */}
      {replyTo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(59, 130, 246, 0.12)',
            borderLeft: '4px solid #3b82f6',
            borderRadius: '8px',
            padding: '0.4rem 0.75rem',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
            <Reply size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong style={{ color: '#3b82f6', marginRight: '6px' }}>Replying to {replyTo.senderName}:</strong>
              <span style={{ color: 'var(--text-secondary)' }}>
                {replyTo.isImage ? '📷 [Image]' : replyTo.snippet}
              </span>
            </div>
          </div>

          <button
            onClick={onClearReply}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '2px',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Controls: Recipient Selector & Emoji Quick Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <RecipientSelector
          options={recipientOptions}
          selectedOptions={selectedRecipients}
          onSelectRecipients={onSelectRecipients}
          onlineUserIds={onlineUserIds}
          disabled={isSending || isRecording}
        />

        {!isRecording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{
                background: showEmojiPicker ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                padding: '0.3rem 0.5rem',
                color: showEmojiPicker ? '#60a5fa' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.8rem',
                fontWeight: 700,
              }}
            >
              <Smile size={16} /> Emojis
            </button>

            {showEmojiPicker && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'var(--bg-main)', padding: '2px 6px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addEmoji(emoji)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: '4px',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Failure Banner with Retry */}
      {sendError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.85rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} />
            <span>Failed to send message. {sendError}</span>
          </div>
          <button
            onClick={handleSend}
            disabled={isSending}
            className="btn btn-secondary"
            style={{
              padding: '0.2rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Voice Recording Active Bar OR Normal Input Bar */}
      {isRecording ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '0.65rem 1rem',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ef4444', fontWeight: 800, fontSize: '0.9rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
            <span>Recording Voice Note... ({formatSecs(recordingTime)})</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={cancelRecording}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'var(--text-secondary)',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Trash2 size={14} /> Cancel
            </button>

            <button
              onClick={stopAndSendRecording}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Square size={14} fill="currentColor" /> Send Voice Note
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
          {/* Attach Gallery Picture Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || !hasSelectedRecipient}
            title="Attach Gallery Picture"
            style={{
              height: '42px',
              width: '42px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSending || !hasSelectedRecipient ? 'not-allowed' : 'pointer',
              opacity: isSending || !hasSelectedRecipient ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Paperclip size={18} />
          </button>

          {/* Camera Button */}
          <button
            onClick={openCamera}
            disabled={isSending || !hasSelectedRecipient}
            title="Take Photo with Camera"
            style={{
              height: '42px',
              width: '42px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSending || !hasSelectedRecipient ? 'not-allowed' : 'pointer',
              opacity: isSending || !hasSelectedRecipient ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Camera size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            disabled={isSending}
            style={{
              flex: 1,
              minHeight: '42px',
              maxHeight: '140px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.9rem',
              borderRadius: '12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              outline: 'none',
              resize: 'none',
              lineHeight: 1.4,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
            }}
          />

          {/* Voice Record Mic Button */}
          <button
            onClick={startRecording}
            disabled={isSending || !hasSelectedRecipient}
            title="Record Voice Note"
            style={{
              height: '42px',
              width: '42px',
              borderRadius: '12px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSending || !hasSelectedRecipient ? 'not-allowed' : 'pointer',
              opacity: isSending || !hasSelectedRecipient ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Mic size={18} />
          </button>

          {/* Send Text Button */}
          <button
            onClick={handleSend}
            disabled={isTextEmpty || isSending || !hasSelectedRecipient}
            className="btn btn-primary"
            style={{
              height: '42px',
              padding: '0 1.25rem',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: isTextEmpty || isSending || !hasSelectedRecipient ? 0.5 : 1,
              cursor: isTextEmpty || isSending || !hasSelectedRecipient ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {isSending ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <>
                Send <Send size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
