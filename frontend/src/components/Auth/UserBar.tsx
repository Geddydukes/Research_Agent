import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import type { TenantMembership } from '../../types';
import styles from './UserBar.module.css';

interface UserBarProps {
  onSettingsClick: () => void;
  onReviewClick: () => void;
  onRunClick: () => void;
}

export function UserBar({ onSettingsClick, onReviewClick, onRunClick }: UserBarProps) {
  const { tenantId, setActiveTenant, signOut } = useAuth();
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getTenants()
      .then((data) => {
        if (!isMounted) return;
        setTenants(data);
        if (!tenantId && data.length > 0) {
          setActiveTenant(data[0]!.tenant.id);
        }
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load tenants', error);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tenantId, setActiveTenant]);

  const handleTenantChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveTenant(event.target.value);
  };

  return (
    <div className={styles.container}>
      <div className={styles.tenantBlock}>
        <label className={styles.label}>Workspace</label>
        <select
          className={styles.select}
          value={tenantId || ''}
          onChange={handleTenantChange}
          disabled={isLoading || tenants.length === 0}
        >
          {isLoading && <option value="">Loading...</option>}
          {!isLoading && tenants.length === 0 && <option value="">No tenant</option>}
          {tenants.map((membership) => (
            <option key={membership.tenant.id} value={membership.tenant.id}>
              {membership.tenant.name}
            </option>
          ))}
        </select>
      </div>
      <button className={styles.button} type="button" onClick={onSettingsClick}>
        Settings
      </button>
      <button className={styles.button} type="button" onClick={onReviewClick}>
        Review
      </button>
      <button className={styles.button} type="button" onClick={onRunClick}>
        Run
      </button>
      <button className={styles.buttonSecondary} type="button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
