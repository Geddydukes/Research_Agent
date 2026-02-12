import { useMemo, useEffect, useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { apiClient } from '../../api/client';
import type { Entity, Paper } from '../../types';
import styles from './Panels.module.css';

function getPaperUrl(paper: Paper): string | null {
    const metadata = paper.metadata as Record<string, unknown> | null;
    if (metadata?.url && typeof metadata.url === 'string') return metadata.url;
    if (!metadata?.externalIds) return null;
    const ids = metadata.externalIds as Record<string, string>;
    if (ids.ArXiv) return `https://arxiv.org/abs/${ids.ArXiv}`;
    if (ids.DOI) return `https://doi.org/${ids.DOI}`;
    if (ids.CorpusId) return `https://www.semanticscholar.org/paper/${ids.CorpusId}`;
    return null;
}

// Helper to get display name for entity
function getEntityDisplayName(entity: Entity | undefined): string {
    if (!entity) return 'Unknown';
    const isPaper = entity.type.toLowerCase() === 'paper';
    if (isPaper && entity.metadata?.title) {
        return entity.metadata.title as string;
    }
    return entity.canonical_name;
}

interface EntityDetailPanelProps {
    entity: Entity;
    onClose: () => void;
    onEdgeClick: (edgeId: number) => void;
}

export function EntityDetailPanel({ entity, onClose, onEdgeClick }: EntityDetailPanelProps) {
    const { graphData, getEntityTypeColor, getRelationshipColor } = useGraphStore();
    const [papers, setPapers] = useState<Paper[]>([]);
    const [papersLoading, setPapersLoading] = useState(true);
    const [papersError, setPapersError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPapersLoading(true);
        setPapersError(null);
        apiClient
            .getPapersForNode(entity.id)
            .then((data) => {
                if (!cancelled) setPapers(data || []);
            })
            .catch((err) => {
                if (!cancelled) setPapersError(err instanceof Error ? err.message : 'Failed to load papers');
            })
            .finally(() => {
                if (!cancelled) setPapersLoading(false);
            });
        return () => { cancelled = true; };
    }, [entity.id]);

    const color = getEntityTypeColor(entity.type);
    const confidence = entity.adjusted_confidence ?? entity.original_confidence ?? 0;

    const edges = useMemo(() => {
        if (!graphData) return [];
        return graphData.edges.filter(
            e => e.source_node_id === entity.id || e.target_node_id === entity.id
        );
    }, [graphData, entity.id]);

    const relatedEntities = useMemo(() => {
        if (!graphData || edges.length === 0) return [];

        const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));

        return edges.map(edge => {
            const isSource = edge.source_node_id === entity.id;
            const relatedId = isSource ? edge.target_node_id : edge.source_node_id;
            const relatedNode = nodeMap.get(relatedId);

            return {
                edge,
                direction: isSource ? 'outgoing' : 'incoming',
                relatedEntity: relatedNode,
            };
        }).filter(r => r.relatedEntity);
    }, [graphData, edges, entity.id]);

    const papersFromProvenance = useMemo(() => {
        if (!graphData) return new Map<string, { paper_id: string; title?: string }>();
        const paperIds = new Set<string>();
        edges.forEach((e) => {
            const p = e.provenance as { paper_id?: string; meta?: { source_paper_id?: string; target_paper_id?: string } } | null;
            if (p?.paper_id) paperIds.add(p.paper_id);
            if (p?.meta?.source_paper_id) paperIds.add(p.meta.source_paper_id);
            if (p?.meta?.target_paper_id) paperIds.add(p.meta.target_paper_id);
        });
        const map = new Map<string, { paper_id: string; title?: string }>();
        paperIds.forEach((id) => map.set(id, { paper_id: id }));
        graphData.nodes.forEach((n) => {
            if (n.type?.toLowerCase() === 'paper' && n.canonical_name) {
                const id = n.canonical_name;
                if (paperIds.has(id)) map.set(id, { paper_id: id, title: (n.metadata?.title as string) || undefined });
            }
        });
        return map;
    }, [graphData, edges]);

    const allPapers = useMemo(() => {
        const byId = new Map<string, Paper>();
        papers.forEach((p) => byId.set(p.paper_id, p));
        papersFromProvenance.forEach((info, id) => {
            if (!byId.has(id)) {
                byId.set(id, {
                    paper_id: id,
                    title: info.title ?? null,
                    abstract: null,
                    year: null,
                    metadata: null,
                    created_at: '',
                });
            }
        });
        return Array.from(byId.values());
    }, [papers, papersFromProvenance]);

    const isPaper = entity.type.toLowerCase() === 'paper';
    const metadataTitle = entity.metadata?.title as string | undefined;
    const displayName = (isPaper && metadataTitle) ? metadataTitle : entity.canonical_name;

    const contextSnippet = useMemo(() => {
        const edgeWithEvidence = edges.find((e) => e.evidence?.trim());
        if (!edgeWithEvidence?.evidence) return null;
        const text = edgeWithEvidence.evidence.trim();
        return text.length > 140 ? `${text.slice(0, 137)}…` : text;
    }, [edges]);

    return (
        <div className={styles.panelContainer}>
            <div className={styles.panelHeader}>
                <div>
                    <h2 className={styles.panelTitle}>{displayName}</h2>
                    {contextSnippet && (
                        <p className={styles.contextSnippet} title={contextSnippet}>
                            In context: {contextSnippet}
                        </p>
                    )}
                    <div
                        className={styles.entityType}
                        style={{
                            backgroundColor: `${color}20`,
                            color: color,
                        }}
                    >
                        <span className={styles.typeDot} style={{ backgroundColor: color }} />
                        {entity.type}
                    </div>
                </div>
                <button className={styles.closeBtn} onClick={onClose}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className={styles.panelContent}>
                {/* Metadata */}
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Details
                    </h3>
                    <div className={styles.metadataGrid}>
                        <div className={styles.metadataItem}>
                            <div className={styles.metadataLabel}>Confidence</div>
                            <div className={styles.metadataValue}>{(confidence * 100).toFixed(0)}%</div>
                            <div className={styles.confidenceBar}>
                                <div
                                    className={styles.confidenceFill}
                                    style={{
                                        width: `${confidence * 100}%`,
                                        backgroundColor: color,
                                    }}
                                />
                            </div>
                        </div>
                        <div className={styles.metadataItem}>
                            <div className={styles.metadataLabel}>Connections</div>
                            <div className={styles.metadataValue}>{edges?.length || 0}</div>
                        </div>
                    </div>
                </div>

                {/* Papers */}
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Papers ({allPapers.length})
                    </h3>

                    {papersLoading ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyText}>Loading papers…</div>
                        </div>
                    ) : papersError ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyText}>{papersError}</div>
                        </div>
                    ) : allPapers.length > 0 ? (
                        <div className={styles.papersList}>
                            {allPapers.map((paper) => {
                                const paperTitle = paper.title || paper.paper_id;
                                const paperUrl = getPaperUrl(paper);
                                const year = paper.year ?? (paper.metadata?.year as number | undefined);

                                return (
                                    <div key={paper.paper_id} className={styles.paperItem}>
                                        {paperUrl ? (
                                            <a
                                                href={paperUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.paperTitle}
                                            >
                                                {paperTitle}
                                            </a>
                                        ) : (
                                            <div className={styles.paperTitle}>
                                                {paperTitle}
                                            </div>
                                        )}
                                        {year && (
                                            <div className={styles.paperMeta}>
                                                <span className={styles.paperYear}>{year}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyText}>No papers found</div>
                        </div>
                    )}
                </div>

                {/* Relationships */}
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        Relationships ({relatedEntities.length})
                    </h3>

                    {relatedEntities.length > 0 ? (
                        <div className={styles.relationshipsList}>
                            {relatedEntities.map(({ edge, direction, relatedEntity }) => {
                                const relColor = getRelationshipColor(edge.relationship_type);
                                return (
                                    <div
                                        key={edge.id}
                                        className={styles.relationshipItem}
                                        onClick={() => onEdgeClick(edge.id)}
                                    >
                                        <span className={styles.relationshipDirection}>
                                            {direction === 'outgoing' ? '→' : '←'}
                                        </span>
                                        <span
                                            className={styles.relationshipType}
                                            style={{ backgroundColor: relColor }}
                                        >
                                            {edge.relationship_type.replace(/_/g, ' ')}
                                        </span>
                                        <span className={styles.relationshipTarget}>
                                            {getEntityDisplayName(relatedEntity)}
                                        </span>
                                        <span className={styles.relationshipConfidence}>
                                            {(edge.confidence * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyText}>No relationships found</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
