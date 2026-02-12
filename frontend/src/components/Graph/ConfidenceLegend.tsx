import styles from './ConfidenceLegend.module.css';

export function ConfidenceLegend() {
  return (
    <div className={styles.legend}>
      <div className={styles.label}>Confidence</div>
      <div className={styles.bar} />
      <div className={styles.scale}>
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
