import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import type { VoiceNotePayload } from '../../lib/voiceNotes';

interface VoiceNotePlayerProps {
  payload: VoiceNotePayload;
  isOwnMessage: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ payload, isOwnMessage }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const duration = payload.duration || 0;

  useEffect(() => {
    if (!payload?.audio) return;
    const audio = new Audio(payload.audio);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, [payload?.audio]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch((err) => console.error('Audio play error:', err));
      setIsPlaying(true);
    }
  };

  const handleSpeedToggle = () => {
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.4rem 0.2rem',
        minWidth: '220px',
        maxWidth: '300px',
        userSelect: 'none',
      }}
    >
      {/* Mic Icon Avatar */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: isOwnMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(59, 130, 246, 0.2)',
          color: isOwnMessage ? '#ffffff' : '#60a5fa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Mic size={18} />
      </div>

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: isOwnMessage ? '#ffffff' : '#3b82f6',
          color: isOwnMessage ? '#005c4b' : '#ffffff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        }}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />}
      </button>

      {/* Waveform Progress & Duration */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{
            width: '100%',
            height: '4px',
            accentColor: isOwnMessage ? '#34d399' : '#3b82f6',
            cursor: 'pointer',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.68rem',
            color: isOwnMessage ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback Speed Toggle */}
      <button
        onClick={handleSpeedToggle}
        style={{
          background: isOwnMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
          border: 'none',
          borderRadius: '12px',
          padding: '2px 6px',
          fontSize: '0.65rem',
          fontWeight: 800,
          color: isOwnMessage ? '#ffffff' : 'var(--text-primary)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {playbackRate}x
      </button>
    </div>
  );
};
