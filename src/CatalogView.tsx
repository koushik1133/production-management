import React from 'react';
import { Search, Clock, Weight, ChevronRight, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MODEL_CATEGORIES, MODEL_TARGET_HOURS, MODEL_SPECS, PHASES } from './types';

export const CatalogView: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);

  const filteredCategories = MODEL_CATEGORIES.map(cat => ({
    ...cat,
    models: cat.models.filter(m => 
      m.toLowerCase().includes(searchTerm.toLowerCase()) || 
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.models.length > 0);

  const calculateTotalHours = (model: string) => {
    const hours = MODEL_TARGET_HOURS[model] || {};
    return Object.entries(hours)
      .filter(([phase]) => !['backlog', 'shipping'].includes(phase))
      .reduce((sum, [_, h]) => sum + (h as number), 0);
  };

  return (
    <div className="catalog-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>Production Catalog</h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Master library of all trailer models and production specifications.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LayoutGrid size={18} /> Back to Dashboard
        </button>
      </header>

      <div style={{ position: 'relative', marginBottom: '3rem' }}>
        <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
        <input 
          type="text" 
          placeholder="Search models, categories, or specifications..." 
          className="form-input"
          style={{ paddingLeft: '3rem', height: '3.5rem', fontSize: '1.1rem', borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gap: '4rem' }}>
        {filteredCategories.map(cat => (
          <section key={cat.name}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: '4px', height: '24px', background: '#3b82f6', borderRadius: '4px' }}></span>
              {cat.name}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {cat.models.map(model => (
                <div 
                  key={model} 
                  className={`catalog-card ${selectedModel === model ? 'active' : ''}`}
                  style={{ 
                    background: 'white', 
                    borderRadius: '16px', 
                    padding: '1.5rem', 
                    border: '1px solid #e2e8f0', 
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onClick={() => setSelectedModel(selectedModel === model ? null : model)}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>{model}</h3>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>{MODEL_SPECS[model].description}</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        <Weight size={12} /> Steel
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{MODEL_SPECS[model].steelWeight}</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        <Clock size={12} /> Target Hours
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{calculateTotalHours(model)}h</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 800 }}>{MODEL_SPECS[model].axles}</span>
                    <ChevronRight size={18} style={{ color: '#cbd5e1', transform: selectedModel === model ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>

                  {selectedModel === model && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed #e2e8f0' }}>
                      <h4 style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Production Breakdown</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>{p.title}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0f172a' }}>{MODEL_TARGET_HOURS[model][p.id]}h</span>
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

      <style>{`
        .catalog-card:hover {
          transform: translateY(-4px);
          border-color: #3b82f6;
          box-shadow: 0 12px 20px -8px rgba(59, 130, 246, 0.15);
        }
        .catalog-card.active {
          border-color: #3b82f6;
          ring: 2px solid #3b82f6;
        }
      `}</style>
    </div>
  );
};
