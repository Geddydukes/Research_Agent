import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useGraphStore } from '../../stores/graphStore';
import styles from './Modal.module.css';

interface SearchModalProps {
    onClose: () => void;
}

export function SearchModal({ onClose }: SearchModalProps) {
    const [query, setQuery] = useState('');
    const { selectEntity, getEntityTypeColor } = useGraphStore();

    // Search query with debounce
    const { data: searchResults, isLoading } = useQuery({
        queryKey: ['search', query],
        queryFn: () => apiClient.search(query),
        enabled: query.length >= 2,
        staleTime: 30 * 1000,
    });

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    // Handle result click
    const handleResultClick = useCallback((entityId: number) => {
        selectEntity(entityId);
        onClose();
    }, [selectEntity, onClose]);

    const hasResults = searchResults && (searchResults.nodes.length > 0 || searchResults.papers.length > 0);

    return (
        <div className={styles.modalOverlay} onClick={handleBackdropClick}>
            <div className={styles.searchContainer}>
                <div className={styles.searchHeader}>
                    <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search entities, papers..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <button className={styles.closeBtn} onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className={styles.searchResults}>
                    {query.length < 2 ? (
                        <div className={styles.searchHint}>
                            Type at least 2 characters to search...
                        </div>
                    ) : isLoading ? (
                        <div className={styles.loadingState}>
                            <div className={styles.loadingSpinner} />
                            <span className={styles.loadingText}>Searching...</span>
                        </div>
                    ) : hasResults ? (
                        <>
                            {searchResults.nodes.length > 0 && (
                                <div className={styles.resultSection}>
                                    <h3 className={styles.resultSectionTitle}>
                                        Entities ({searchResults.nodes.length})
                                    </h3>
                                    {searchResults.nodes.slice(0, 10).map(node => {
                                        const color = getEntityTypeColor(node.type);
                                        const isPaper = node.type.toLowerCase() === 'paper';
                                        const displayName = (isPaper && node.metadata?.title)
                                            ? (node.metadata.title as string)
                                            : node.canonical_name;

                                        return (
                                            <div
                                                key={node.id}
                                                className={styles.resultItem}
                                                onClick={() => handleResultClick(node.id)}
                                            >
                                                <span
                                                    className={styles.resultType}
                                                    style={{ backgroundColor: color }}
                                                >
                                                    {node.type}
                                                </span>
                                                <span className={styles.resultName}>{displayName}</span>
                                            </div>
                                        );
                                    })}
                                    {searchResults.nodes.length > 10 && (
                                        <div className={styles.moreResults}>
                                            +{searchResults.nodes.length - 10} more results
                                        </div>
                                    )}
                                </div>
                            )}

                            {searchResults.papers.length > 0 && (
                                <div className={styles.resultSection}>
                                    <h3 className={styles.resultSectionTitle}>
                                        Papers ({searchResults.papers.length})
                                    </h3>
                                    {searchResults.papers.slice(0, 5).map(paper => (
                                        <div key={paper.paper_id} className={styles.resultItem}>
                                            <span className={styles.resultType} style={{ backgroundColor: '#8b5cf6' }}>
                                                Paper
                                            </span>
                                            <span className={styles.resultName}>
                                                {paper.title || paper.paper_id}
                                            </span>
                                            {paper.year && (
                                                <span className={styles.resultMeta}>{paper.year}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            No results found for "{query}"
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
