import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import modalStyles from '../components/Modal/Modal.module.css';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<'hosted' | 'byo_key'>('hosted');
  const [depth, setDepth] = useState<number>(2);
  const [semanticThreshold, setSemanticThreshold] = useState<number>(0.7);
  const [allowSpeculative, setAllowSpeculative] = useState(false);
  const [depthPreset, setDepthPreset] = useState<'quick' | 'standard' | 'deep' | 'rigorous' | 'custom'>('standard');
  const [monthlyCostLimit, setMonthlyCostLimit] = useState('');
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState('');
  const [dailyCostLimit, setDailyCostLimit] = useState('');
  const [dailyTokenLimit, setDailyTokenLimit] = useState('');
  const [enabledRelationshipTypes, setEnabledRelationshipTypes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getSettings()
      .then((data) => {
        if (!isMounted) return;
        setSettings(data);
        setExecutionMode((data.execution_mode as 'hosted' | 'byo_key') || 'hosted');
        setDepth(Number(data.max_reasoning_depth ?? 2));
        setSemanticThreshold(Number(data.semantic_gating_threshold ?? 0.7));
        setAllowSpeculative(Boolean(data.allow_speculative_edges ?? false));
        const inferredPreset = inferPreset(
          Number(data.max_reasoning_depth ?? 2),
          Number(data.semantic_gating_threshold ?? 0.7),
          Boolean(data.allow_speculative_edges ?? false)
        );
        setDepthPreset(inferredPreset);
        setMonthlyCostLimit(data.monthly_cost_limit?.toString?.() || '');
        setMonthlyTokenLimit(data.monthly_token_limit?.toString?.() || '');
        setDailyCostLimit(data.daily_cost_limit?.toString?.() || '');
        setDailyTokenLimit(data.daily_token_limit?.toString?.() || '');
        const initialRelationships = Array.isArray(data.enabled_relationship_types)
          ? data.enabled_relationship_types
          : [];
        setEnabledRelationshipTypes(initialRelationships.length > 0 ? initialRelationships : []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const applyPreset = (preset: 'quick' | 'standard' | 'deep' | 'rigorous') => {
    const config = presetConfig[preset];
    setDepth(config.depth);
    setSemanticThreshold(config.semanticThreshold);
    setAllowSpeculative(config.allowSpeculative);
    setDepthPreset(preset);
  };

  useEffect(() => {
    const inferredPreset = inferPreset(depth, semanticThreshold, allowSpeculative);
    setDepthPreset(inferredPreset);
  }, [depth, semanticThreshold, allowSpeculative]);

  const panelRef = useRef<HTMLDivElement>(null);
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        execution_mode: executionMode,
        max_reasoning_depth: depth,
        semantic_gating_threshold: semanticThreshold,
        allow_speculative_edges: allowSpeculative,
      };
      payload.enabled_relationship_types = enabledRelationshipTypes;
      payload.monthly_cost_limit = monthlyCostLimit ? Number(monthlyCostLimit) : null;
      payload.monthly_token_limit = monthlyTokenLimit ? Number(monthlyTokenLimit) : null;
      payload.daily_cost_limit = dailyCostLimit ? Number(dailyCostLimit) : null;
      payload.daily_token_limit = dailyTokenLimit ? Number(dailyTokenLimit) : null;
      if (apiKey) {
        payload.api_key = apiKey;
      }
      if (clearKey) {
        payload.clear_api_key = true;
      }
      const updated = await apiClient.updateSettings(payload);
      setSettings(updated);
      setApiKey('');
      setClearKey(false);
      setKeyStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateKey = async () => {
    if (!apiKey) {
      setKeyStatus('Enter a key to validate.');
      return;
    }
    setKeyStatus('Validating...');
    try {
      const result = await apiClient.validateApiKey(apiKey);
      setKeyStatus(result.valid ? 'Key is valid.' : result.message || 'Key validation failed.');
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : 'Key validation failed.');
    }
  };

  return (
    <div
      className={modalStyles.modalOverlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div ref={panelRef} className={modalStyles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalPanelHeader}>
          <h2 id="settings-title" className={modalStyles.modalPanelTitle}>Workspace Settings</h2>
          <button className={modalStyles.modalPanelClose} onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>
        <div className={modalStyles.modalPanelBody}>
          {error && <div className={styles.error}>{error}</div>}
          {!settings && !error && <div className={styles.loading}>Loading settings…</div>}
          {settings && (
          <>
            <div className={styles.grid}>
              <div>
                <span className={styles.label}>Execution mode</span>
                <div className={styles.toggleRow}>
                  <button
                    className={`${styles.toggleButton} ${executionMode === 'hosted' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => setExecutionMode('hosted')}
                  >
                    Hosted
                  </button>
                  <button
                    className={`${styles.toggleButton} ${executionMode === 'byo_key' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => setExecutionMode('byo_key')}
                  >
                    BYO Key
                  </button>
                </div>
              </div>
              <div>
                <span className={styles.label}>API key configured</span>
                <div className={styles.value}>{String(settings.api_key_configured ?? false)}</div>
              </div>
              <div>
                <span className={styles.label}>Max reasoning depth</span>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={20}
                  value={depth}
                  onChange={(event) => setDepth(Number(event.target.value))}
                  aria-label="Max reasoning depth (1–20)"
                />
              </div>
              <div>
                <span className={styles.label}>Semantic gating threshold</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={semanticThreshold}
                  onChange={(event) => setSemanticThreshold(Number(event.target.value))}
                />
              </div>
              <div className={styles.presetBlock}>
                <span className={styles.label}>Depth presets</span>
                <div className={styles.toggleRow}>
                  <button
                    className={`${styles.toggleButton} ${depthPreset === 'quick' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => applyPreset('quick')}
                  >
                    Quick
                  </button>
                  <button
                    className={`${styles.toggleButton} ${depthPreset === 'standard' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => applyPreset('standard')}
                  >
                    Standard
                  </button>
                  <button
                    className={`${styles.toggleButton} ${depthPreset === 'deep' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => applyPreset('deep')}
                  >
                    Deep
                  </button>
                  <button
                    className={`${styles.toggleButton} ${depthPreset === 'rigorous' ? styles.toggleActive : ''}`}
                    type="button"
                    onClick={() => applyPreset('rigorous')}
                  >
                    Rigorous
                  </button>
                </div>
                <div className={styles.presetHint}>
                  {depthPreset === 'custom' ? 'Custom settings' : presetDescriptions[depthPreset]}
                </div>
              </div>
              <div>
                <span className={styles.label}>Speculative edges</span>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={allowSpeculative}
                    onChange={(event) => setAllowSpeculative(event.target.checked)}
                  />
                  Enable
                </label>
              </div>
              <div>
                <span className={styles.label}>Monthly cost limit (USD)</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1}
                  value={monthlyCostLimit}
                  onChange={(event) => setMonthlyCostLimit(event.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div>
                <span className={styles.label}>Monthly token limit</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1000}
                  value={monthlyTokenLimit}
                  onChange={(event) => setMonthlyTokenLimit(event.target.value)}
                  placeholder="e.g. 1000000"
                  autoComplete="off"
                  inputMode="numeric"
                  aria-label="Monthly token limit (numeric)"
                />
              </div>
              <div>
                <span className={styles.label}>Daily cost limit (USD)</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1}
                  value={dailyCostLimit}
                  onChange={(event) => setDailyCostLimit(event.target.value)}
                  placeholder="e.g. 25"
                />
              </div>
              <div>
                <span className={styles.label}>Daily token limit</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1000}
                  value={dailyTokenLimit}
                  onChange={(event) => setDailyTokenLimit(event.target.value)}
                  placeholder="e.g. 200000"
                  autoComplete="off"
                  inputMode="numeric"
                  aria-label="Daily token limit (numeric)"
                />
              </div>
              <div className={styles.relationships}>
                <span className={styles.label}>Relationship types</span>
                <div className={styles.relationshipGrid}>
                  {RELATIONSHIP_TYPES.map((rel) => {
                    const isActive = enabledRelationshipTypes.includes(rel);
                    return (
                      <button
                        key={rel}
                        className={`${styles.relationshipChip} ${isActive ? styles.relationshipActive : ''}`}
                        type="button"
                        onClick={() => {
                          setEnabledRelationshipTypes((prev) =>
                            prev.includes(rel) ? prev.filter((r) => r !== rel) : [...prev, rel]
                          );
                        }}
                      >
                        {rel.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.presetHint}>
                  Leave empty to allow all relationship types.
                </div>
              </div>
              <div>
                <span className={styles.label}>BYO API key</span>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Paste your Google API key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <div className={styles.inlineActions}>
                  <button className={styles.secondary} type="button" onClick={handleValidateKey}>
                    Validate key
                  </button>
                  {keyStatus && <span className={styles.keyStatus}>{keyStatus}</span>}
                </div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(event) => setClearKey(event.target.checked)}
                  />
                  Clear stored key
                </label>
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.save} type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </>
        )}
          <div className={styles.note}>
            Key validation and depth presets will be added next.
          </div>
        </div>
      </div>
    </div>
  );
}

const presetConfig = {
  quick: {
    depth: 1,
    semanticThreshold: 0.6,
    allowSpeculative: false,
  },
  standard: {
    depth: 5,
    semanticThreshold: 0.7,
    allowSpeculative: false,
  },
  deep: {
    depth: 10,
    semanticThreshold: 0.8,
    allowSpeculative: true,
  },
  rigorous: {
    depth: 20,
    semanticThreshold: 0.85,
    allowSpeculative: true,
  },
} as const;

const presetDescriptions: Record<'quick' | 'standard' | 'deep' | 'rigorous', string> = {
  quick: 'Depth 1 – fast pass with shallow reasoning and lower gating.',
  standard: 'Depth 5 – balanced default for most runs.',
  deep: 'Depth 10 – deeper reasoning with higher gating and speculative edges.',
  rigorous: 'Depth 20 – maximum reasoning depth for thorough analysis.',
};

const RELATIONSHIP_TYPES = [
  'introduces',
  'uses',
  'evaluates',
  'improves_on',
  'improves',
  'extends',
  'compares_to',
  'implements',
  'based_on',
];

function inferPreset(depth: number, semantic: number, speculative: boolean): 'quick' | 'standard' | 'deep' | 'rigorous' | 'custom' {
  if (depth === 1 && semantic <= 0.65 && !speculative) return 'quick';
  if (depth === 5 && semantic >= 0.65 && semantic <= 0.75 && !speculative) return 'standard';
  if (depth === 10 && semantic >= 0.78 && speculative) return 'deep';
  if (depth === 20 && semantic >= 0.82 && speculative) return 'rigorous';
  return 'custom';
}
