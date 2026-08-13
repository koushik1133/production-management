import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, SwitchCamera } from 'lucide-react';

interface CameraCaptureModalProps {
  onCapture: (imageBase64: string) => void;
  onClose: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  onCapture,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    stopStream();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      // Fallback try without facingMode constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
        setIsLoading(false);
      } catch (fallbackErr) {
        setError('Unable to access camera. Please allow camera permissions in browser settings.');
        setIsLoading(false);
      }
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    startCamera();

    return () => {
      stopStream();
    };
  }, [facingMode, startCamera, stopStream]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Compress photo as lightweight JPEG to keep row size small & fast
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    stopStream();
    onCapture(dataUrl);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Camera size={20} color="#10b981" />
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>Take Photo</span>
        </div>

        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Viewfinder */}
      <div
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '16px',
          margin: '0.75rem 0',
          background: 'black',
        }}
      >
        {isLoading && (
          <div style={{ color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw className="animate-spin" size={28} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Starting Camera...</span>
          </div>
        )}

        {error && (
          <div style={{ color: '#ef4444', textAlign: 'center', padding: '1rem', fontWeight: 700 }}>
            {error}
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isLoading || error ? 'none' : 'block',
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
          }}
        />
      </div>

      {/* Bottom Controls Bar: Camera Flip & Shutter Button */}
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0.5rem 0',
        }}
      >
        {/* Flip Camera Button */}
        <button
          onClick={flipCamera}
          disabled={isLoading || Boolean(error)}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            border: 'none',
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isLoading || error ? 0.5 : 1,
          }}
          title="Switch Camera (Front/Back)"
        >
          <SwitchCamera size={22} />
        </button>

        {/* Shutter Button */}
        <button
          onClick={takePhoto}
          disabled={isLoading || Boolean(error)}
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'white',
            border: '4px solid #10b981',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
            opacity: isLoading || error ? 0.5 : 1,
          }}
          title="Click Picture"
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: '#10b981',
            }}
          />
        </button>

        <div style={{ width: '48px' }} />
      </div>
    </div>
  );
};
