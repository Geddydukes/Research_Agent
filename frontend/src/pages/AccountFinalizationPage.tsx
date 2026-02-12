import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { apiClient } from '../api/client';
import styles from './AccountFinalizationPage.module.css';

type Choice = 'hosted' | 'byo_key';

export function AccountFinalizationPage() {
  const { setOnboardingComplete } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async (mode: Choice) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.updateSettings({ execution_mode: mode });
      setOnboardingComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Finish setting up your account</h1>
        <p className={styles.subtitle}>
          Choose how you want to run the research pipeline.
        </p>

        <div className={styles.options}>
          <button
            type="button"
            className={styles.option}
            onClick={() => handleContinue('hosted')}
            disabled={isSubmitting}
          >
            <span className={styles.optionTitle}>Use our hosted service</span>
            <span className={styles.optionDesc}>
              We run the pipeline for you. No API key needed.
            </span>
          </button>
          <button
            type="button"
            className={styles.option}
            onClick={() => handleContinue('byo_key')}
            disabled={isSubmitting}
          >
            <span className={styles.optionTitle}>Bring your own API key</span>
            <span className={styles.optionDesc}>
              Use your own key in Settings after you continue.
            </span>
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {isSubmitting && <p className={styles.working}>Saving…</p>}
      </div>
    </div>
  );
}
