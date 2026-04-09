import React from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  darkMode?: boolean;
}

export const Modal: React.FC<Props> = ({ isOpen, onClose, title, children, darkMode }) => {
  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${darkMode ? 'dark' : ''}`} onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={darkMode ? { background: '#18181b', borderColor: '#27272a', color: '#fafafa' } : {}}
      >
        <div className="modal-header" style={darkMode ? { borderBottomColor: '#27272a' } : {}}>
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} style={darkMode ? { color: '#a1a1aa' } : {}}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};
