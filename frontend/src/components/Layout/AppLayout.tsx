import { type ReactNode, useState, useRef, useEffect } from 'react';
import styles from './Layout.module.css';
import { apiClient } from '../../api/client';

type ExportFormat = 'graphml' | 'gexf' | 'csv-bundle' | 'json';

const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
    { format: 'graphml', label: 'GraphML' },
    { format: 'gexf', label: 'GEXF' },
    { format: 'csv-bundle', label: 'CSV Bundle (ZIP)' },
    { format: 'json', label: 'JSON' },
];

interface AppLayoutProps {
    children: ReactNode;
    sidebar?: ReactNode;
    detailPanel?: ReactNode;
    onSearchClick?: () => void;
    onInsightsClick?: () => void;
    userBar?: ReactNode;
}

function HeaderActions({
    onSearchClick,
    onInsightsClick,
    onItemClick,
    className,
    exportDropdownOpen,
    onExportToggle,
    onExportClose,
}: {
    onSearchClick?: () => void;
    onInsightsClick?: () => void;
    onItemClick?: () => void;
    className?: string;
    exportDropdownOpen?: boolean;
    onExportToggle?: () => void;
    onExportClose?: () => void;
}) {
    const handleSearch = () => {
        onSearchClick?.();
        onItemClick?.();
    };
    const handleInsights = () => {
        onInsightsClick?.();
        onItemClick?.();
    };
    const handleExportOption = async (format: ExportFormat) => {
        onExportClose?.();
        try {
            await apiClient.downloadExport(format);
        } catch (err) {
            console.error('Export failed:', err);
            alert(err instanceof Error ? err.message : 'Export failed');
        }
    };
    return (
        <div className={className ?? styles.headerActions}>
            <button className={styles.headerBtn} onClick={handleSearch} aria-label="Search">
                <svg className={styles.headerBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search
            </button>
            <button className={styles.headerBtn} onClick={handleInsights} aria-label="View Insights">
                <svg className={styles.headerBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Insights
            </button>
            <div className={styles.exportWrapper}>
                <button
                    type="button"
                    className={styles.headerBtn}
                    onClick={onExportToggle}
                    aria-label="Export"
                    aria-expanded={exportDropdownOpen}
                    aria-haspopup="true"
                >
                    <svg className={styles.headerBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                    </svg>
                    Export
                    <svg className={styles.exportCaret} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
                {exportDropdownOpen && (
                    <div className={styles.exportDropdown} role="menu">
                        {EXPORT_OPTIONS.map(({ format, label }) => (
                            <button
                                key={format}
                                type="button"
                                role="menuitem"
                                className={styles.exportOption}
                                onClick={() => handleExportOption(format)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function AppLayout({ children, sidebar, detailPanel, onSearchClick, onInsightsClick, userBar }: AppLayoutProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const exportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [menuOpen]);

    useEffect(() => {
        if (!exportDropdownOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
                setExportDropdownOpen(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [exportDropdownOpen]);

    return (
        <>
            <div className={styles.appLayout}>
                {sidebar}

                <div className={styles.mainContent}>
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

                        <div className={styles.headerRight} ref={exportRef}>
                            <HeaderActions
                                onSearchClick={onSearchClick}
                                onInsightsClick={onInsightsClick}
                                exportDropdownOpen={exportDropdownOpen}
                                onExportToggle={() => setExportDropdownOpen((o) => !o)}
                                onExportClose={() => setExportDropdownOpen(false)}
                            />
                            {userBar}
                        </div>

                        <div className={styles.menuWrapper} ref={menuRef}>
                            <button
                                type="button"
                                className={styles.menuButton}
                                onClick={() => setMenuOpen((o) => !o)}
                                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                                aria-expanded={menuOpen}
                            >
                                {menuOpen ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="3" y1="6" x2="21" y2="6" />
                                        <line x1="3" y1="12" x2="21" y2="12" />
                                        <line x1="3" y1="18" x2="21" y2="18" />
                                    </svg>
                                )}
                            </button>
                            {menuOpen && (
                                <div className={styles.dropdown}>
                                    <HeaderActions
                                        onSearchClick={onSearchClick}
                                        onInsightsClick={onInsightsClick}
                                        onItemClick={() => setMenuOpen(false)}
                                        className={styles.dropdownActions}
                                        exportDropdownOpen={exportDropdownOpen}
                                        onExportToggle={() => setExportDropdownOpen((o) => !o)}
                                        onExportClose={() => setExportDropdownOpen(false)}
                                    />
                                    {userBar && <div className={styles.dropdownUserBar}>{userBar}</div>}
                                </div>
                            )}
                        </div>
                    </header>

                    <div className={styles.graphArea}>
                        {children}
                    </div>
                </div>
            </div>

            {detailPanel}
        </>
    );
}
