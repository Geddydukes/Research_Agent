import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useGraphStore } from '../../stores/graphStore';
import type { InferredInsight } from '../../types';
import styles from './Panels.module.css';

interface InsightsPanelProps {
    onClose: () => void;
}

// Map insight types to human-readable labels and colors
const INSIGHT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    transitive_relationship: { label: 'Transitive Relationship', color: '#6366f1' },
    cluster_analysis: { label: 'Cluster Analysis', color: '#8b5cf6' },
    anomaly_detection: { label: 'Anomaly Detection', color: '#f59e0b' },
    gap_identification: { label: 'Research Gap', color: '#10b981' },
    trend_analysis: { label: 'Trend Analysis', color: '#06b6d4' },
};

function getInsightConfig(type: string) {
    return INSIGHT_TYPE_CONFIG[type] || { label: type.replace(/_/g, ' '), color: '#64748b' };
}

export function InsightsPanel({ onClose }: InsightsPanelProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const { graphData, selectEntity } = useGraphStore();

    // Fetch all insights
    const { data, isLoading, error } = useQuery({
        queryKey: ['insights'],
        queryFn: () => apiClient.getAllInsights(1, 100),
        staleTime: 5 * 60 * 1000,
    });

    const insights = data?.data || [];

    // Build node lookup map (id -> name)
    const nodeMap = useMemo(() => {
        if (!graphData) return new Map<number, string>();
        return new Map(graphData.nodes.map(n => [n.id, n.canonical_name]));
    }, [graphData]);

    // Build paper lookup map (paper_id/canonical_name -> title)
    // Papers have type 'paper' and metadata.title
    const paperTitleMap = useMemo(() => {
        if (!graphData) return new Map<string, string>();
        const map = new Map<string, string>();
        graphData.nodes.forEach(node => {
            if (node.type.toLowerCase() === 'paper' && node.metadata?.title) {
                // Map both canonical_name and any variations to the title
                const title = node.metadata.title as string;
                map.set(node.canonical_name, title);
                map.set(node.canonical_name.toLowerCase(), title);
                // Also try without underscores/with underscores for variations
                map.set(node.canonical_name.replace(/_/g, '.'), title);
                map.set(node.canonical_name.replace(/\./g, '_'), title);
            }
        });
        return map;
    }, [graphData]);

    // Helper to replace paper IDs with titles in a text string
    const enrichTextWithTitles = (text: string): string => {
        let enrichedText = text;
        paperTitleMap.forEach((title, paperId) => {
            // Replace paper IDs with titles, wrapped for clarity
            const regex = new RegExp(`\\b${paperId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            enrichedText = enrichedText.replace(regex, `"${title}"`);
        });
        return enrichedText;
    };

    // Get unique insight types
    const insightTypes = useMemo(() => {
        const types = new Set(insights.map(i => i.insight_type));
        return Array.from(types);
    }, [insights]);

    // Filter insights
    const filteredInsights = useMemo(() => {
        return insights.filter(insight => {
            // Type filter
            if (typeFilter && insight.insight_type !== typeFilter) {
                return false;
            }

            // Search filter - search in reasoning path and subject nodes
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const subjectNames = insight.subject_nodes
                    .map(id => nodeMap.get(id) || '')
                    .join(' ')
                    .toLowerCase();
                const reasoning = insight.reasoning_path?.steps?.join(' ').toLowerCase() || '';

                if (!subjectNames.includes(query) && !reasoning.includes(query)) {
                    return false;
                }
            }

            return true;
        });
    }, [insights, typeFilter, searchQuery, nodeMap]);

    // Handle clicking on a subject node
    const handleNodeClick = (nodeId: number) => {
        selectEntity(nodeId);
        onClose();
    };

    return (
        <div className={styles.insightsPanelContainer}>
            <div className={styles.insightsPanelHeader}>
                <h2 className={styles.panelTitle}>Key Insights</h2>
                <button className={styles.closeBtn} onClick={onClose}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Search and Filters */}
            <div className={styles.insightsFilters}>
                <input
                    type="text"
                    placeholder="Search insights..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.insightsSearch}
                />
                <div className={styles.insightsTypeFilters}>
                    <button
                        className={`${styles.insightsTypeBtn} ${!typeFilter ? styles.active : ''}`}
                        onClick={() => setTypeFilter(null)}
                    >
                        All
                    </button>
                    {insightTypes.map(type => {
                        const config = getInsightConfig(type);
                        return (
                            <button
                                key={type}
                                className={`${styles.insightsTypeBtn} ${typeFilter === type ? styles.active : ''}`}
                                onClick={() => setTypeFilter(type)}
                                style={{ '--insight-color': config.color } as React.CSSProperties}
                            >
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Insights List */}
            <div className={styles.insightsList}>
                {isLoading ? (
                    <div className={styles.loadingState}>
                        <div className={styles.loadingSpinner} />
                        <span>Loading insights...</span>
                    </div>
                ) : error ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyText}>Failed to load insights</div>
                    </div>
                ) : filteredInsights.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyText}>
                            {searchQuery || typeFilter ? 'No matching insights' : 'No insights available'}
                        </div>
                    </div>
                ) : (
                    filteredInsights.map((insight) => (
                        <InsightCard
                            key={insight.id}
                            insight={insight}
                            nodeMap={nodeMap}
                            onNodeClick={handleNodeClick}
                            enrichTextWithTitles={enrichTextWithTitles}
                        />
                    ))
                )}
            </div>

            <div className={styles.insightsPanelFooter}>
                <span>{filteredInsights.length} insight{filteredInsights.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
}

// Individual insight card component
interface InsightCardProps {
    insight: InferredInsight;
    nodeMap: Map<number, string>;
    onNodeClick: (nodeId: number) => void;
    enrichTextWithTitles: (text: string) => string;
}

function InsightCard({ insight, nodeMap, onNodeClick, enrichTextWithTitles }: InsightCardProps) {
    const config = getInsightConfig(insight.insight_type);
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={styles.insightCard}>
            <div className={styles.insightCardHeader}>
                <span
                    className={styles.insightType}
                    style={{ backgroundColor: config.color }}
                >
                    {config.label}
                </span>
                <span className={styles.insightConfidence}>
                    {Math.round(insight.confidence * 100)}%
                </span>
            </div>

            {/* Subject Nodes */}
            <div className={styles.insightSubjects}>
                {insight.subject_nodes.map((nodeId, idx) => (
                    <button
                        key={nodeId}
                        className={styles.insightNodeBtn}
                        onClick={() => onNodeClick(nodeId)}
                    >
                        {nodeMap.get(nodeId) || `Node ${nodeId}`}
                        {idx < insight.subject_nodes.length - 1 && (
                            <span className={styles.insightNodeSeparator}>→</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Reasoning Path (collapsible) */}
            {insight.reasoning_path?.steps && insight.reasoning_path.steps.length > 0 && (
                <>
                    <button
                        className={styles.insightExpandBtn}
                        onClick={() => setExpanded(!expanded)}
                        aria-expanded={expanded}
                    >
                        {expanded ? 'Hide' : 'Show'} reasoning ({insight.reasoning_path.steps.length} steps)
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {expanded && (
                        <div className={styles.insightReasoning}>
                            {insight.reasoning_path.steps.map((step, idx) => (
                                <div key={idx} className={styles.insightStep}>
                                    <span className={styles.insightStepNum}>{idx + 1}</span>
                                    <span className={styles.insightStepText}>{enrichTextWithTitles(step)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
