import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Send, RotateCcw, Trash2, Edit3, Check } from 'lucide-react';

interface ImageDrawingEditorProps {
  imageUrl: string;
  onSave: (annotatedBase64: string) => void;
  onCancel: () => void;
}

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Yellow', hex: '#f59e0b' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#000000' },
];

const BRUSH_SIZES = [
  { label: 'S', value: 3 },
  { label: 'M', value: 6 },
  { label: 'L', value: 12 },
];

const MAX_HISTORY = 12;

export const ImageDrawingEditor: React.FC<ImageDrawingEditorProps> = ({
  imageUrl,
  onSave,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [brushSize, setBrushSize] = useState<number>(6);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  // Initialize Canvas with Image
  useEffect(() => {
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isMounted) {
        setBgImage(img);
        setImageLoaded(true);
      }
    };
    img.onerror = () => {
      console.error('Failed to load image for drawing editor.');
    };
    img.src = imageUrl;
    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  const setupCanvas = useCallback(() => {
    if (!bgImage || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = Math.min(window.innerWidth * 0.9, 800);
    const maxHeight = Math.min(window.innerHeight * 0.65, 600);

    let width = bgImage.width || 800;
    let height = bgImage.height || 600;

    // Scale down image to fit container while maintaining aspect ratio
    if (width > maxWidth) {
      height = (maxWidth / width) * height;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (maxHeight / height) * width;
      height = maxHeight;
    }

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);

    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    // Save initial state to history
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
  }, [bgImage]);

  useEffect(() => {
    if (imageLoaded) {
      setupCanvas();
    }
  }, [imageLoaded, setupCanvas]);

  const saveStateToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const next = [...prev, currentData];
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY);
      }
      return next;
    });
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e && e.touches.length > 0) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else if ('clientX' in e) {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveStateToHistory();
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(previousState, 0, 0);
    setHistory(newHistory);
  };

  const handleClear = () => {
    if (!bgImage || !canvasRef.current) return;
    setupCanvas();
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export PNG or compressed JPEG based on quality
    const base64Data = canvas.toDataURL('image/jpeg', 0.88);
    onSave(base64Data);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'white',
          paddingBottom: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Edit3 size={20} style={{ color: '#ef4444' }} />
          <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Draw & Annotate Image</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              padding: '0.4rem 0.7rem',
              cursor: history.length <= 1 ? 'not-allowed' : 'pointer',
              opacity: history.length <= 1 ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
            title="Undo last stroke"
          >
            <RotateCcw size={15} /> Undo
          </button>

          <button
            onClick={handleClear}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              color: '#ef4444',
              padding: '0.4rem 0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
            title="Clear all drawings"
          >
            <Trash2 size={15} /> Clear
          </button>

          <button
            onClick={onCancel}
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
              marginLeft: '0.5rem',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxHeight: 'calc(100vh - 160px)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {!imageLoaded && (
          <div style={{ color: 'white', fontWeight: 600 }}>Loading image for editing...</div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            cursor: 'crosshair',
            touchAction: 'none',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      </div>

      {/* Bottom Color Palette & Controls Bar */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '0.6rem 1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        {/* Colors Palette */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700 }}>COLORS:</span>
          {COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => setSelectedColor(c.hex)}
              style={{
                width: selectedColor === c.hex ? '32px' : '26px',
                height: selectedColor === c.hex ? '32px' : '26px',
                borderRadius: '50%',
                background: c.hex,
                border: selectedColor === c.hex ? '3px solid white' : '1px solid rgba(255,255,255,0.3)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: selectedColor === c.hex ? '0 0 10px ' + c.hex : 'none',
              }}
              title={c.name}
            >
              {selectedColor === c.hex && <Check size={14} color={c.hex === '#ffffff' ? 'black' : 'white'} />}
            </button>
          ))}
        </div>

        {/* Brush Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700 }}>SIZE:</span>
          {BRUSH_SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => setBrushSize(s.value)}
              style={{
                background: brushSize === s.value ? 'white' : 'rgba(255,255,255,0.15)',
                color: brushSize === s.value ? 'black' : 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Send / Done Action Button */}
        <button
          onClick={handleSend}
          className="btn btn-primary"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '0.5rem 1.25rem',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          Done & Send <Send size={14} />
        </button>
      </div>
    </div>
  );
};
