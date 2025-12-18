import type { ReactNode } from 'react';
import styles from './Layout.module.css';

interface AppLayoutProps {
    children: ReactNode;
    sidebar?: ReactNode;
    detailPanel?: ReactNode;
    onSearchClick?: () => void;
}

export function AppLayout({ children, sidebar, detailPanel, onSearchClick }: AppLayoutProps) {
    return (
        <>
            <div className={styles.appLayout}>
                {/* Filters Sidebar */}
                {sidebar}

                {/* Main Content */}
                <div className={styles.mainContent}>
                    {/* Header */}
                    <header className={styles.header}>
                        <div className={styles.logo}>
                            <div className={styles.logoIcon}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                                    <path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                                </svg>
                            </div>
                            <span className={styles.logoText}>
                                Knowledge Graph
                                <span className={styles.logoSubtext}>Research Explorer</span>
                            </span>
                        </div>

                        <div className={styles.headerActions}>
                            <button className={styles.headerBtn} onClick={onSearchClick}>
                                <svg className={styles.headerBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Search
                            </button>
                            <button className={styles.headerBtn}>
                                <svg className={styles.headerBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                                Export
                            </button>
                        </div>
                    </header>

                    {/* Graph Area */}
                    <div className={styles.graphArea}>
                        {children}
                    </div>
                </div>
            </div>

            {/* Detail Panel - rendered OUTSIDE the flex layout so it overlays */}
            {detailPanel}
        </>
    );
}
