import styles from './ReadOnlyBanner.module.css';

interface ReadOnlyBannerProps {
  onSignIn: () => void;
}

export function ReadOnlyBanner({ onSignIn }: ReadOnlyBannerProps) {
  return (
    <div className={styles.banner}>
      <div>
        <strong>Read-only preview</strong> — Sign up to submit papers, manage settings, and review entities.
      </div>
      <button className={styles.cta} type="button" onClick={onSignIn}>
        Sign in / Sign up
      </button>
    </div>
  );
}
