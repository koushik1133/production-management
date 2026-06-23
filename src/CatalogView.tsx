import React, { useState, useRef } from 'react';
import { Search, Clock, Weight, ChevronRight, LayoutGrid, Plus, Edit, Trash2, Info, MapPin, Download, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PHASES } from './types';
import type { PhaseId, ModelSpec, UserRole, Dealer, CatalogModel, Trailer } from './types';
import { Modal } from './components/Modal';
import Papa from 'papaparse';
import { supabase } from './lib/supabase';
import { triggerFileDownload } from './utils/storage';

interface Props {
  categories: { name: string, models: string[] }[];
  hours: Record<string, Record<PhaseId, number>>;
  specs: Record<string, ModelSpec>;
  templates: Record<string, string>;
  onAddModel: (model: { name: string, category: string, hours: Record<PhaseId, number>, spec: ModelSpec, spec_sheet_template?: string }) => void;
  onEditModel: (name: string, spec: { targetHours?: Record<PhaseId, number>, spec_sheet_template?: string }) => void;
  onDeleteModel: (name: string) => void;
  dealers: Dealer[];
  onAddDealer: (dealer: { name: string, addresses: string[], common_address: string }) => void;
  onEditDealer: (id: string, dealer: { name: string, addresses: string[], common_address: string }) => void;
  onDeleteDealer: (id: string) => void;
  userRole: UserRole;
  trailers?: Trailer[];
}

export const CatalogView: React.FC<Props> = ({ categories, hours, specs, templates, onAddModel, onEditModel, onDeleteModel, dealers, onAddDealer, onEditDealer, onDeleteDealer, userRole, trailers }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'models' | 'dealers'>('models');
  const [isAddingDealer, setIsAddingDealer] = useState(false);
  const [editingDealerId, setEditingDealerId] = useState<string | null>(null);
  const [showDealerDeleteConfirm, setShowDealerDeleteConfirm] = useState<string | null>(null);
  const [dealerForm, setDealerForm] = useState({ name: '', common_address: '', addresses: [''] });
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
    spec: { steelWeight: '0 lbs', description: '', axles: 'Standard' },
    spec_sheet_template: undefined as string | undefined
  });

  const fileInputRefDealers = useRef<HTMLInputElement>(null);
  const fileInputRefModels = useRef<HTMLInputElement>(null);

  const handleExportDealers = () => {
    const csvData = dealers.map(d => ({
      id: d.id,
      name: d.name,
      common_address: d.common_address || '',
      addresses: d.addresses ? d.addresses.join(' | ') : ''
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'dealers_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportDealers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const records = results.data as any[];
        const upserts = records.map(r => ({
          id: r.id || crypto.randomUUID(),
          name: r.name,
          common_address: r.common_address || null,
          addresses: r.addresses ? r.addresses.split('|').map((a: string) => a.trim()).filter((a: string) => a !== '') : []
        }));

        const { error } = await supabase.from('dealers').upsert(upserts);
        if (error) {
          alert('Failed to import dealers: ' + error.message);
        } else {
          alert(`Successfully imported ${upserts.length} dealers!`);
        }
        if (fileInputRefDealers.current) fileInputRefDealers.current.value = '';
      }
    });
  };

  const handleExportModels = () => {
    const csvData = categories.flatMap(cat => cat.models.map(modelName => {
      const modelHours = hours[modelName] || {};
      const modelSpec = specs[modelName] || {};
      const template = templates[modelName] || '';
      return {
        name: modelName,
        category: cat.name,
        steelWeight: modelSpec.steelWeight || '',
        axles: modelSpec.axles || '',
        description: modelSpec.description || '',
        spec_sheet_template: template,
        prefab_hours: modelHours.prefab || 0,
        build_hours: modelHours.build || 0,
        paint_hours: modelHours.paint || 0,
        outsource_hours: modelHours.outsource || 0,
        trim_hours: modelHours.trim || 0,
        shipping_hours: modelHours.shipping || 0
      };
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'trailer_models_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportModels = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const records = results.data as any[];
        const upserts: CatalogModel[] = records.map(r => ({
          id: crypto.randomUUID(),
          name: r.name,
          category: r.category || 'Uncategorized',
          target_hours: {
            quote: 0,
            backlog: 0,
            prefab: parseFloat(r.prefab_hours) || 0,
            build: parseFloat(r.build_hours) || 0,
            paint: parseFloat(r.paint_hours) || 0,
            outsource: parseFloat(r.outsource_hours) || 0,
            trim: parseFloat(r.trim_hours) || 0,
            shipping: parseFloat(r.shipping_hours) || 0
          },
          specs: {
            steelWeight: r.steelWeight || '',
            axles: r.axles || '',
            description: r.description || ''
          },
          spec_sheet_template: r.spec_sheet_template || undefined
        }));

        const names = upserts.map(u => u.name);
        await supabase.from('production_models').delete().in('name', names);
        
        const { error } = await supabase.from('production_models').insert(upserts);
        if (error) {
          alert('Failed to import models: ' + error.message);
        } else {
          alert(`Successfully imported ${upserts.length} models!`);
        }
        if (fileInputRefModels.current) fileInputRefModels.current.value = '';
      }
    });
  };

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
      spec: { steelWeight: '0 lbs', description: '', axles: 'Standard' },
      spec_sheet_template: undefined
    });
  };

  return (
    <div className="catalog-container" style={{ width: '100%', padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ borderRadius: '12px', padding: '0.85rem' }}>
            <LayoutGrid size={22} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: '0.15rem' }}>Production Catalog</h1>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setActiveTab('models')}
                style={{ background: 'none', border: 'none', fontSize: '0.9rem', fontWeight: activeTab === 'models' ? 800 : 500, color: activeTab === 'models' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
              >
                Trailer Models
              </button>
              <button 
                onClick={() => setActiveTab('dealers')}
                style={{ background: 'none', border: 'none', fontSize: '0.9rem', fontWeight: activeTab === 'dealers' ? 800 : 500, color: activeTab === 'dealers' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
              >
                Dealers Directory
              </button>
            </div>
          </div>
        </div>
        {userRole === 'manager' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input 
              type="file" 
              accept=".csv" 
              style={{ display: 'none' }} 
              ref={activeTab === 'models' ? fileInputRefModels : fileInputRefDealers} 
              onChange={activeTab === 'models' ? handleImportModels : handleImportDealers} 
            />
            <button 
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '10px' }}
              onClick={() => activeTab === 'models' ? fileInputRefModels.current?.click() : fileInputRefDealers.current?.click()}
              title={`Import ${activeTab === 'models' ? 'Models' : 'Dealers'} from CSV`}
            >
              <Upload size={18} /> Import
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '10px' }}
              onClick={activeTab === 'models' ? handleExportModels : handleExportDealers}
              title={`Export ${activeTab === 'models' ? 'Models' : 'Dealers'} to CSV`}
            >
              <Download size={18} /> Export
            </button>
            <button 
              className="btn btn-primary shimmer" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.75rem', borderRadius: '14px', fontWeight: 800, fontSize: '0.95rem' }}
              onClick={() => {
                if (activeTab === 'models') {
                  setIsAddingModel(true);
                } else {
                  setDealerForm({ name: '', common_address: '', addresses: [''] });
                  setEditingDealerId(null);
                  setIsAddingDealer(true);
                }
              }}
            >
              <Plus size={20} strokeWidth={3} /> {activeTab === 'models' ? 'Define New Model' : 'Add Dealer'}
            </button>
          </div>
        )}
      </header>

      {activeTab === 'models' && (
        <>
          <div style={{ position: 'relative', marginBottom: '3rem' }}>
        <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={22} />
        <input 
          type="text" 
          placeholder="Search models, categories, or specifications..." 
          className="form-input"
          style={{ paddingLeft: '3.5rem', height: '3rem', fontSize: '0.9rem', borderRadius: '12px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600 }}
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
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '2rem' }}>
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
                      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem', letterSpacing: '-0.01em' }}>{model}</h3>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '99px' }}>{specs[model]?.axles}</span>
                      </div>
                    </div>
                    {userRole === 'manager' && (
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
                    )}
                  </div>

                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {specs[model]?.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.65rem', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        <Weight size={12} /> Steel Usage
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>{specs[model]?.steelWeight}</div>
                    </div>
                    <div style={{ background: 'var(--glass-bg)', padding: '0.65rem', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        <Clock size={12} /> Build Time
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)' }}>{calculateTotalHours(model)}h</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}></div>
                    <ChevronRight size={18} style={{ margin: '0 0.75rem', transform: selectedModel === model ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s ease' }} />
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}></div>
                  </div>

                  {selectedModel === model && (
                    <div style={{ marginTop: '1.25rem', animation: 'slideDown 0.3s ease-out' }}>
                      <div style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <h4 style={{ fontSize: '0.65rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Spec Sheet Template</h4>
                        {templates[model] ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>Template Attached</span>
                            <button 
                              className="btn btn-sm btn-secondary" 
                              onClick={async () => {
                                let tpl = templates[model];
                                if (tpl === 'EXISTS') {
                                  try {
                                    const { data, error } = await supabase.from('production_models').select('spec_sheet_template').eq('name', model).single();
                                    if (error) throw error;
                                    tpl = data.spec_sheet_template;
                                  } catch (err) {
                                    console.error(err);
                                    alert('Failed to download template.');
                                    return;
                                  }
                                }
                                if (tpl) {
                                  await triggerFileDownload(tpl, `${model}_Template.xlsx`);
                                }
                              }}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            >
                              Download
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No template uploaded.</span>
                        )}
                        {userRole === 'manager' && (
                          <div style={{ display: 'block', marginTop: '0.75rem' }}>
                            <label 
                              style={{ display: 'inline-block', cursor: 'pointer' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span 
                                className="btn btn-sm btn-primary" 
                                style={{ display: 'inline-block', padding: '0.3rem 0.6rem', fontSize: '0.7rem', pointerEvents: 'none' }}
                              >
                                {templates[model] ? 'Replace Template' : 'Upload Template'}
                              </span>
                              <input 
                                type="file" 
                                accept=".xlsx" 
                                style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }} 
                                onChange={(e) => {
                                  const inputTarget = e.target as HTMLInputElement;
                                  const file = inputTarget.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      if (evt.target?.result) {
                                        onEditModel(model, { spec_sheet_template: evt.target.result as string });
                                      }
                                    };
                                    reader.onloadend = () => {
                                      inputTarget.value = '';
                                    };
                                    reader.readAsDataURL(file);
                                  } else {
                                    inputTarget.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <h4 style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Phase Target Metrics
                        <Info size={11} color="var(--text-muted)" />
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{p.title}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-primary)' }}>{hours[model]?.[p.id] || 0}h</span>
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
      </>
      )}

      {activeTab === 'dealers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '2rem' }}>
          {dealers.map(dealer => (
            <div 
              key={dealer.id} 
              className="catalog-card hover-lift"
              style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '1.75rem', border: '1px solid var(--border-default)', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{dealer.name}</h3>
                {userRole === 'manager' && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button 
                      className="btn-icon" 
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '6px', borderRadius: '8px' }}
                      onClick={() => {
                        setEditingDealerId(dealer.id);
                        setDealerForm({ name: dealer.name, common_address: dealer.common_address || '', addresses: dealer.addresses || [] });
                        setIsAddingDealer(true);
                      }}
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      className="btn-icon" 
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '6px', borderRadius: '8px' }}
                      onClick={() => setShowDealerDeleteConfirm(dealer.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-default)', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <MapPin size={16} color="var(--accent)" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>HQ / Common Address</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{dealer.common_address || 'Not specified'}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Branch Locations</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '99px' }}>
                  {dealer.addresses?.length || 0}
                </span>
              </div>
            </div>
          ))}
          {dealers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: '20px', border: '1px dashed var(--border-default)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>No dealers found. Click "Add Dealer" to create one.</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isAddingModel} onClose={() => setIsAddingModel(false)} title="Define New Trailer Model">
        <form onSubmit={handleManualAdd} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}>
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
                <option value="" disabled>Select a Category...</option>
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

          <div style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <label className="form-label" style={{ marginBottom: '0.75rem', color: '#1d4ed8', fontWeight: 800 }}>Spec Sheet Template (Excel)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label>
                <span className="btn btn-sm btn-primary" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                  {newModelForm.spec_sheet_template ? 'Replace Template' : 'Upload Template'}
                </span>
                <input 
                  type="file" 
                  accept=".xlsx" 
                  style={{ display: 'none' }} 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (evt.target?.result) {
                          setNewModelForm({...newModelForm, spec_sheet_template: evt.target.result as string});
                        }
                      };
                      reader.onloadend = () => {
                        e.target.value = '';
                      };
                      reader.readAsDataURL(file);
                    } else {
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              {newModelForm.spec_sheet_template && <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>Template Attached</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" onClick={(e) => { e.preventDefault(); handleManualAdd(e as any); }} className="btn btn-primary shimmer" style={{ flex: 1 }}>Create Model</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAddingModel(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '20px', maxWidth: '400px', width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Delete Model</h2>
              <button className="btn-icon" onClick={() => setShowDeleteConfirm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {trailers && trailers.some(t => t.model === showDeleteConfirm && !t.isArchived) ? (
                <div>
                  <p style={{ color: '#ef4444', marginBottom: '1rem' }}>
                    <strong>Cannot delete {showDeleteConfirm}!</strong>
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>There are active trailers in the pipeline currently using this model. Deleting it will break their time tracking and phase targets.</p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Close</button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Are you sure you want to delete <strong>{showDeleteConfirm}</strong>? This action cannot be undone.</p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
                    <button 
                      className="btn btn-primary" 
                      style={{ background: '#ef4444', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', color: 'white', fontWeight: 700 }}
                      onClick={() => {
                        onDeleteModel(showDeleteConfirm);
                        setShowDeleteConfirm(null);
                      }}
                    >
                      Yes, Delete Model
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dealer Add/Edit Modal */}
      <Modal isOpen={isAddingDealer} onClose={() => setIsAddingDealer(false)} title={editingDealerId ? "Edit Dealer" : "Add New Dealer"}>
        <form onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }} onSubmit={(e) => {
          e.preventDefault();
          if (editingDealerId) {
            onEditDealer(editingDealerId, { name: dealerForm.name, common_address: dealerForm.common_address, addresses: dealerForm.addresses.filter(a => a.trim() !== '') });
          } else {
            onAddDealer({ name: dealerForm.name, common_address: dealerForm.common_address, addresses: dealerForm.addresses.filter(a => a.trim() !== '') });
          }
          setIsAddingDealer(false);
          setEditingDealerId(null);
        }}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Dealer Name</label>
            <input 
              className="form-input" 
              required 
              placeholder="e.g., Midwest Trailers LLC"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              value={dealerForm.name}
              onChange={e => setDealerForm({...dealerForm, name: e.target.value})}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)' }}>HQ / Common Address</label>
            <input 
              className="form-input" 
              required 
              placeholder="e.g., 123 Main St, Springfield, IL"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              value={dealerForm.common_address}
              onChange={e => setDealerForm({...dealerForm, common_address: e.target.value})}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Used as the default fallback or headquarters address.</p>
          </div>

          <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Branch Locations</span>
              <span 
                style={{ color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                onClick={() => setDealerForm({...dealerForm, addresses: [...dealerForm.addresses, '']})}
              >
                + Add Another
              </span>
            </label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              {dealerForm.addresses.map((addr, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    className="form-input" 
                    placeholder={`Branch ${index + 1} Address`}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', flex: 1 }}
                    value={addr}
                    onChange={e => {
                      const newAddresses = [...dealerForm.addresses];
                      newAddresses[index] = e.target.value;
                      setDealerForm({...dealerForm, addresses: newAddresses});
                    }}
                  />
                  {dealerForm.addresses.length > 1 && (
                    <button 
                      type="button"
                      className="btn-icon" 
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0 10px', borderRadius: '8px' }}
                      onClick={() => {
                        const newAddresses = dealerForm.addresses.filter((_, i) => i !== index);
                        setDealerForm({...dealerForm, addresses: newAddresses});
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" onClick={(e) => {
              e.preventDefault();
              if (editingDealerId) {
                onEditDealer(editingDealerId, { name: dealerForm.name, common_address: dealerForm.common_address, addresses: dealerForm.addresses.filter(a => a.trim() !== '') });
              } else {
                onAddDealer({ name: dealerForm.name, common_address: dealerForm.common_address, addresses: dealerForm.addresses.filter(a => a.trim() !== '') });
              }
              setIsAddingDealer(false);
              setEditingDealerId(null);
            }} className="btn btn-primary shimmer" style={{ flex: 1 }}>{editingDealerId ? "Save Changes" : "Create Dealer"}</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsAddingDealer(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete Dealer Confirmation Modal */}
      <Modal isOpen={!!showDealerDeleteConfirm} onClose={() => setShowDealerDeleteConfirm(null)} title="Confirm Dealer Deletion">
        <div style={{ padding: '0.5rem' }}>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Are you sure you want to delete this dealer? This will remove them from all registration dropdowns but will NOT affect past trailers.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn btn-danger" 
              style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700 }}
              onClick={() => {
                onDeleteDealer(showDealerDeleteConfirm!);
                setShowDealerDeleteConfirm(null);
              }}
            >
              Delete Dealer
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDealerDeleteConfirm(null)}>Cancel</button>
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
