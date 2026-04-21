import React, { useState } from 'react';
import { Search, Clock, Weight, ChevronRight, LayoutGrid, Plus, Edit, Trash2, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PHASES } from './types';
import type { PhaseId, ModelSpec } from './types';
import { Modal } from './components/Modal';

interface Props {
  categories: { name: string, models: string[] }[];
  hours: Record<string, Record<PhaseId, number>>;
  specs: Record<string, ModelSpec>;
  onAddModel: (model: { name: string, category: string, hours: Record<PhaseId, number>, spec: ModelSpec }) => void;
  onEditModel: (name: string, spec: { targetHours: Record<PhaseId, number> }) => void;
  onDeleteModel: (name: string) => void;
}

export const CatalogView: React.FC<Props> = ({ categories, hours, specs, onAddModel, onEditModel, onDeleteModel }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');

  const [newModelForm, setNewModelForm] = useState({
    name: '',
    category: categories[0]?.name || '',
    hours: {} as Record<PhaseId, number>,
    spec: { steelWeight: '0 lbs', description: '', axles: 'Standard' }
  });

  const calculateTotalHours = (model: string) => {
    const modelHours = hours[model] || {};
    return Object.entries(modelHours)
      .filter(([phase]) => !['backlog', 'shipping'].includes(phase))
      .reduce((sum, [_, h]) => sum + (h as number), 0);
  };

  const filteredCategories = categories.map(cat => ({
    ...cat,
    models: cat.models.filter(m => 
      m.toLowerCase().includes(searchTerm.toLowerCase()) || 
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.models.length > 0);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = isNewCategory ? customCategoryName : newModelForm.category;
    onAddModel({ ...newModelForm, category: finalCategory });
    setIsAddingModel(false);
    setIsNewCategory(false);
    setCustomCategoryName('');
    setNewModelForm({
      name: '',
      category: categories[0]?.name || '',
      hours: {} as Record<PhaseId, number>,
      spec: { steelWeight: '0 lbs', description: '', axles: 'Standard' }
    });
  };

  return (
    <div className="catalog-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ borderRadius: '12px', padding: '0.75rem' }}>
            <LayoutGrid size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>Production Catalog</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Master library of all trailer models and production specifications.</p>
          </div>
        </div>
        <button 
          className="btn btn-primary shimmer" 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 700 }}
          onClick={() => setIsAddingModel(true)}
        >
          <Plus size={20} /> Define New Model
        </button>
      </header>

      <div style={{ position: 'relative', marginBottom: '3rem' }}>
        <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={22} />
        <input 
          type="text" 
          placeholder="Search models, categories, or specifications..." 
          className="form-input"
          style={{ paddingLeft: '3.5rem', height: '4rem', fontSize: '1.1rem', borderRadius: '16px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600 }}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gap: '4rem' }}>
        {filteredCategories.map(cat => (
          <section key={cat.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.75rem' }}>
             <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {cat.name}
            </h2>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>{cat.models.length} Models</span>
          </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {cat.models.map(model => (
                <div 
                  key={model} 
                  className={`catalog-card hover-lift ${selectedModel === model ? 'active' : ''}`}
                  style={{ 
                    background: 'var(--bg-card)', 
                    borderRadius: '20px', 
                    padding: '1.75rem', 
                    border: '1px solid var(--border-default)', 
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  onClick={() => setSelectedModel(selectedModel === model ? null : model)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.35rem', letterSpacing: '-0.01em' }}>{model}</h3>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 800, background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '99px' }}>{specs[model]?.axles}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button 
                          className="btn-icon" 
                          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', transition: 'all 0.2s', padding: '6px', borderRadius: '8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditModel(model, { targetHours: hours[model] });
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          className="btn-icon" 
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', transition: 'all 0.2s', padding: '6px', borderRadius: '8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(model);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {specs[model]?.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        <Weight size={14} /> Steel Usage
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>{specs[model]?.steelWeight}</div>
                    </div>
                    <div style={{ background: 'var(--glass-bg)', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        <Clock size={14} /> Build Time
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--accent)' }}>{calculateTotalHours(model)}h</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}></div>
                    <ChevronRight size={18} style={{ margin: '0 0.75rem', transform: selectedModel === model ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s ease' }} />
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}></div>
                  </div>

                  {selectedModel === model && (
                    <div style={{ marginTop: '1.5rem', animation: 'slideDown 0.3s ease-out' }}>
                      <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Phase Target Metrics
                        <Info size={12} color="var(--text-muted)" />
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{p.title}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-primary)' }}>{hours[model]?.[p.id] || 0}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Modal isOpen={isAddingModel} onClose={() => setIsAddingModel(false)} title="Define New Trailer Model">
        <form onSubmit={handleManualAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Model Name</label>
              <input 
                className="form-input" 
                required 
                placeholder="e.g., LRG 1010-HD"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                value={newModelForm.name}
                onChange={e => setNewModelForm({...newModelForm, name: e.target.value})}
              />
            </div>
            <div className="form-group" style={{ gridColumn: isNewCategory ? 'span 1' : 'span 2' }}>
              <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Category</label>
              <select 
                className="form-input"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                value={isNewCategory ? "NEW" : newModelForm.category}
                onChange={e => {
                  if (e.target.value === "NEW") {
                    setIsNewCategory(true);
                  } else {
                    setIsNewCategory(false);
                    setNewModelForm({...newModelForm, category: e.target.value});
                  }
                }}
              >
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="NEW">+ ADD NEW CATEGORY...</option>
              </select>
            </div>
            
            {isNewCategory && (
              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-secondary)' }}>New Category Name</label>
                <input 
                  className="form-input" 
                  required={isNewCategory}
                  placeholder="e.g., Mega Trailers"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                  value={customCategoryName}
                  onChange={e => setCustomCategoryName(e.target.value)}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Steel Weight</label>
              <input 
                className="form-input" 
                placeholder="e.g., 2,450 lbs"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                value={newModelForm.spec.steelWeight}
                onChange={e => setNewModelForm({...newModelForm, spec: {...newModelForm.spec, steelWeight: e.target.value}})}
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Axle Configuration</label>
              <input 
                className="form-input" 
                placeholder="e.g., Tandem 7k"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                value={newModelForm.spec.axles}
                onChange={e => setNewModelForm({...newModelForm, spec: {...newModelForm.spec, axles: e.target.value}})}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Target Hours Breakdown</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(p => (
                <div key={p.id}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{p.title}</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                    value={newModelForm.hours[p.id] || ''}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10) || 0;
                      setNewModelForm({
                        ...newModelForm,
                        hours: { ...newModelForm.hours, [p.id]: v }
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary shimmer" style={{ flex: 1 }}>Create Model</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAddingModel(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Confirm Model Deletion">
        <div style={{ padding: '0.5rem' }}>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Are you sure you want to delete the <strong>{showDeleteConfirm}</strong> model? This will remove it from all registration dropdowns.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn btn-danger" 
              style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700 }}
              onClick={() => {
                onDeleteModel(showDeleteConfirm!);
                setShowDeleteConfirm(null);
              }}
            >
              Delete Model
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .btn-icon:hover {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};
