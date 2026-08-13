import React, { useState, useRef, useEffect } from 'react';
import { Users, User as UserIcon, Check, ChevronUp } from 'lucide-react';
import type { RecipientOption } from '../../types/messaging';

interface RecipientSelectorProps {
  options: RecipientOption[];
  selectedOptions: RecipientOption[];
  onSelectRecipients: (recipients: RecipientOption[]) => void;
  onlineUserIds?: Set<string>;
  disabled?: boolean;
}

export const RecipientSelector: React.FC<RecipientSelectorProps> = ({
  options,
  selectedOptions,
  onSelectRecipients,
  onlineUserIds = new Set(),
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isEveryoneSelected = selectedOptions.some((r) => r.type === 'everyone');

  const toggleOption = (opt: RecipientOption) => {
    if (opt.type === 'everyone') {
      onSelectRecipients([opt]);
      setIsOpen(false);
      return;
    }

    const exists = selectedOptions.some((r) => r.id === opt.id);
    let next: RecipientOption[];

    if (exists) {
      next = selectedOptions.filter((r) => r.id !== opt.id && r.type !== 'everyone');
      if (next.length === 0) {
        const everyoneOpt = options.find((o) => o.type === 'everyone') || opt;
        next = [everyoneOpt];
      }
    } else {
      const filtered = selectedOptions.filter((r) => r.type !== 'everyone');
      next = [...filtered, opt];
    }

    onSelectRecipients(next);
  };

  const getTriggerLabel = () => {
    if (isEveryoneSelected || selectedOptions.length === 0) {
      return 'Everyone';
    }
    if (selectedOptions.length === 1) {
      return selectedOptions[0].name;
    }
    return `${selectedOptions.length} Selected (${selectedOptions.map((o) => o.name).join(', ')})`;
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
        Send to:
      </span>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="btn btn-secondary recipient-trigger-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.45rem 0.85rem',
          fontSize: '0.85rem',
          fontWeight: 700,
          borderRadius: '10px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {isEveryoneSelected ? (
          <Users size={15} style={{ color: 'var(--accent)' }} />
        ) : (
          <UserIcon size={15} style={{ color: '#60a5fa' }} />
        )}

        <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getTriggerLabel()}
        </span>

        <ChevronUp size={14} style={{ color: 'var(--text-muted)', marginLeft: '4px' }} />
      </button>

      {/* Dropdown Menu - Opens UPWARDS above composer */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)', // Opens UPWARDS above the button
            left: '60px',
            zIndex: 9999,
            minWidth: '240px',
            maxHeight: '300px',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            boxShadow: '0 -10px 25px rgba(0, 0, 0, 0.4)',
            padding: '0.4rem',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0.4rem 0.6rem 0.2rem' }}>
            Select Recipients (Multi-Select)
          </div>

          {options.map((opt) => {
            const isChecked = selectedOptions.some((r) => r.id === opt.id);
            const isOnline = opt.type === 'user' && onlineUserIds.has(opt.id);

            return (
              <div
                key={opt.id}
                onClick={() => toggleOption(opt)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: isChecked ? 800 : 600,
                  background: isChecked ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  color: isChecked ? 'var(--accent)' : 'var(--text-primary)',
                  transition: 'background 0.15s ease',
                  marginBottom: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {opt.type === 'everyone' ? (
                    <Users size={16} />
                  ) : (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <UserIcon size={16} />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-1px',
                          right: '-3px',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isOnline ? '#10b981' : '#6b7280',
                          border: '1px solid var(--bg-secondary)',
                        }}
                      />
                    </div>
                  )}

                  <span>{opt.name}</span>

                  {opt.role && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        background: opt.role === 'manager' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: opt.role === 'manager' ? '#eab308' : '#60a5fa',
                      }}
                    >
                      {opt.role}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: isChecked ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                    background: isChecked ? 'var(--accent)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isChecked && <Check size={12} color="white" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
