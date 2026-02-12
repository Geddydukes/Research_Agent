import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useGraphStore } from '../../stores/graphStore';
import styles from './Modal.module.css';

interface SearchModalProps {
    onClose: () => void;
}

type SearchMode = 'text' | 'semantic';

export function SearchModal({ onClose }: SearchModalProps) {
    const [query, setQuery] = useState('');
    const [searchMode, setSearchMode] = useState<SearchMode>('text');
    const { selectEntity, getEntityTypeColor, graphData } = useGraphStore();

    // Build a map from paper_id to entity id for navigation
    const paperIdToEntityId = new Map<string, number>();
    graphData?.nodes.forEach(node => {
        if (node.type.toLowerCase() === 'paper') {
            paperIdToEntityId.set(node.canonical_name, node.id);
        }
    });

    // Text search query
    const {
        data: textResults,
        isLoading: isTextLoading
    } = useQuery({
        queryKey: ['search', 'text', query],
        queryFn: () => apiClient.search(query),
        enabled: searchMode === 'text' && query.length >= 2,
        staleTime: 30 * 1000,
    });

    // Semantic search query
    const {
        data: semanticResults,
        isLoading: isSemanticLoading,
        isError: isSemanticError,
        error: semanticError,
    } = useQuery({
        queryKey: ['search', 'semantic', query],
        queryFn: () => apiClient.semanticSearch(query, 20, 0.3),
        enabled: searchMode === 'semantic' && query.length >= 3,
        staleTime: 60 * 1000, // Cache semantic results longer
        retry: 1, // Only retry once for semantic (API call is expensive)
    });

    const isLoading = searchMode === 'text' ? isTextLoading : isSemanticLoading;

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

    // Handle paper click (for semantic results that might not be entities)
    const handlePaperClick = useCallback((paperId: string) => {
        const entityId = paperIdToEntityId.get(paperId);
        if (entityId) {
            selectEntity(entityId);
            onClose();
        }
    }, [paperIdToEntityId, selectEntity, onClose]);

    const hasTextResults = textResults && (textResults.nodes.length > 0 || textResults.papers.length > 0);
    const hasSemanticResults = semanticResults && semanticResults.papers.length > 0;
    const minChars = searchMode === 'semantic' ? 3 : 2;

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
                        placeholder={searchMode === 'semantic'
                            ? "Describe what you're looking for..."
                            : "Search entities, papers..."
                        }
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close search">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Search Mode Toggle */}
                <div className={styles.searchModeToggle}>
                    <button
                        className={`${styles.searchModeBtn} ${searchMode === 'text' ? styles.active : ''}`}
                        onClick={() => setSearchMode('text')}
                        aria-pressed={searchMode === 'text'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Text Search
                    </button>
                    <button
                        className={`${styles.searchModeBtn} ${searchMode === 'semantic' ? styles.active : ''}`}
                        onClick={() => setSearchMode('semantic')}
                        aria-pressed={searchMode === 'semantic'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4M12 8h.01" />
                        </svg>
                        Semantic Search
                    </button>
                </div>

                <div className={styles.searchResults}>
                    {query.length < minChars ? (
                        <div className={styles.searchHint}>
                            {searchMode === 'semantic'
                                ? "Type at least 3 characters for semantic search..."
                                : "Type at least 2 characters to search..."
                            }
                        </div>
                    ) : isLoading ? (
                        <div className={styles.loadingState}>
                            <div className={styles.loadingSpinner} />
                            <span className={styles.loadingText}>
                                {searchMode === 'semantic' ? 'Finding similar papers...' : 'Searching...'}
                            </span>
                        </div>
                    ) : searchMode === 'text' && hasTextResults ? (
                        <>
                            {textResults.nodes.length > 0 && (
                                <div className={styles.resultSection}>
                                    <h3 className={styles.resultSectionTitle}>
                                        Entities ({textResults.nodes.length})
                                    </h3>
                                    {textResults.nodes.slice(0, 10).map(node => {
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
                                    {textResults.nodes.length > 10 && (
                                        <div className={styles.moreResults}>
                                            +{textResults.nodes.length - 10} more results
                                        </div>
                                    )}
                                </div>
                            )}

                            {textResults.papers.length > 0 && (
                                <div className={styles.resultSection}>
                                    <h3 className={styles.resultSectionTitle}>
                                        Papers ({textResults.papers.length})
                                    </h3>
                                    {textResults.papers.slice(0, 5).map(paper => (
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
                    ) : searchMode === 'semantic' && isSemanticError ? (
                        <div className={styles.emptyState}>
                            <span className={styles.errorText}>
                                {(semanticError as Error)?.message || 'Failed to perform semantic search'}
                            </span>
                        </div>
                    ) : searchMode === 'semantic' && hasSemanticResults ? (
                        <div className={styles.resultSection}>
                            <h3 className={styles.resultSectionTitle}>
                                Similar Papers ({semanticResults.count})
                            </h3>
                            {semanticResults.papers.map(({ paper, similarity }) => {
                                const isInGraph = paperIdToEntityId.has(paper.paper_id);
                                return (
                                    <div
                                        key={paper.paper_id}
                                        className={`${styles.resultItem} ${isInGraph ? styles.clickable : styles.disabled}`}
                                        onClick={() => isInGraph && handlePaperClick(paper.paper_id)}
                                    >
                                        <span className={styles.resultType} style={{ backgroundColor: '#8b5cf6' }}>
                                            Paper
                                        </span>
                                        <div className={styles.resultContent}>
                                            <span className={styles.resultName}>
                                                {paper.title || paper.paper_id}
                                            </span>
                                            <div className={styles.resultDetails}>
                                                {paper.year && (
                                                    <span className={styles.resultMeta}>{paper.year}</span>
                                                )}
                                                <span className={styles.similarityScore}>
                                                    {(similarity * 100).toFixed(0)}% match
                                                </span>
                                                {!isInGraph && (
                                                    <span className={styles.notInGraph}>Not in graph</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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
