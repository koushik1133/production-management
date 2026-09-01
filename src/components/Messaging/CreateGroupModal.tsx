import React, { useState } from 'react';
import { X, Users, Shield, Plus, Check } from 'lucide-react';
import type { UserProfile, ChatGroup } from '../../types/messaging';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  allProfiles: UserProfile[];
  currentProfile: UserProfile | null;
  onCreateGroup: (params: {
    name: string;
    description?: string;
    adminIds: string[];
    memberIds: string[];
  }) => Promise<ChatGroup>;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  allProfiles,
  currentProfile,
  onCreateGroup,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>(
    currentProfile?.id ? [currentProfile.id] : []
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const managers = allProfiles.filter((p) => p.role === 'manager');
  const workers = allProfiles.filter((p) => p.role === 'worker');

  const toggleAdmin = (id: string) => {
    setSelectedAdminIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllWorkers = () => {
    if (selectedMemberIds.length === workers.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(workers.map((w) => w.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please provide a group name.');
      return;
    }

    try {
      setLoading(true);
      const admins = selectedAdminIds.length > 0 ? selectedAdminIds : (currentProfile?.id ? [currentProfile.id] : []);

      await onCreateGroup({
        name: trimmedName,
        description: description.trim() || undefined,
        adminIds: admins,
        memberIds: selectedMemberIds,
      });

      setName('');
      setDescription('');
      setSelectedMemberIds([]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Create Group Channel
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Create a dedicated team channel with assigned admins & members
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {error && (
            <div
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {/* Group Name */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Group / Channel Name *
            </label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Quality Assurance, Frame Assembly"
              required
              autoFocus
            />
          </div>

          {/* Topic / Description */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Topic / Purpose (Optional)
            </label>
            <input
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Engineering inquiries, CAD specs, and technical support"
            />
          </div>

          {/* Admins Selector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <Shield size={14} color="#eab308" />
              <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                Group Admins (Managers)
              </label>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
              Admins can reply with authority, resolve questions, and manage channel details.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '0.4rem',
                maxHeight: '110px',
                overflowY: 'auto',
                padding: '0.4rem',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
              }}
            >
              {managers.map((m) => {
                const isSelected = selectedAdminIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    onClick={() => toggleAdmin(m.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.55rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                      color: isSelected ? '#eab308' : 'var(--text-primary)',
                      border: isSelected ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '3px',
                        border: isSelected ? '1px solid #eab308' : '1px solid var(--border-default)',
                        background: isSelected ? '#eab308' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={10} color="#000" strokeWidth={3} />}
                    </div>
                    <span>{m.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Members Selector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                Members (Employees & Stations)
              </label>
              <button
                type="button"
                onClick={handleSelectAllWorkers}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#3b82f6',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {selectedMemberIds.length === workers.length ? 'Clear All' : 'Select All Employees'}
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
              Select specific workers or include everyone in the group.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '0.4rem',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '0.4rem',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
              }}
            >
              {workers.map((w) => {
                const isSelected = selectedMemberIds.includes(w.id);
                return (
                  <div
                    key={w.id}
                    onClick={() => toggleMember(w.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.55rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                      color: isSelected ? '#60a5fa' : 'var(--text-primary)',
                      border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '3px',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-default)',
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <span>{w.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '0.5rem 1rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !name.trim()}
              style={{
                background: 'var(--accent-gradient)',
                color: 'white',
                padding: '0.5rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Plus size={16} />
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
