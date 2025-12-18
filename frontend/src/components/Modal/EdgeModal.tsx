import { useEffect } from 'react';
import { useEdgeModal, useEdgeInsights } from '../../hooks/useGraphData';
import { useGraphStore } from '../../stores/graphStore';
import type { Entity } from '../../types';
import styles from './Modal.module.css';

// Helper to get display name for entity
function getEntityDisplayName(entity: Entity | null | undefined): string {
    if (!entity) return 'Unknown';
    const isPaper = entity.type.toLowerCase() === 'paper';
    if (isPaper && entity.metadata?.title) {
        return entity.metadata.title as string;
    }
    return entity.canonical_name;
}

interface EdgeModalProps {
    edgeId: number;
    onClose: () => void;
}

export function EdgeModal({ edgeId, onClose }: EdgeModalProps) {
    const { getRelationshipColor } = useGraphStore();

    const { data: modalData, isLoading: loadingModal } = useEdgeModal(edgeId);
    const { data: insights, isLoading: loadingInsights } = useEdgeInsights(edgeId);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    if (loadingModal) {
        return (
            <div className={styles.modalOverlay} onClick={handleBackdropClick}>
                <div className={styles.modalContainer}>
                    <div className={styles.loadingState}>
                        <div className={styles.loadingSpinner} />
                        <span className={styles.loadingText}>Loading relationship details...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!modalData) {
        return (
            <div className={styles.modalOverlay} onClick={handleBackdropClick}>
                <div className={styles.modalContainer}>
                    <div className={styles.loadingState}>
                        <span className={styles.loadingText}>Relationship not found</span>
                    </div>
                </div>
            </div>
        );
    }

    const { edge, source_node, target_node, source_paper, target_paper } = modalData;
    const relationshipColor = getRelationshipColor(edge.relationship_type);

    return (
        <div className={styles.modalOverlay} onClick={handleBackdropClick}>
            <div className={styles.modalContainer}>
                <button className={styles.closeBtn} onClick={onClose}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Relationship Details</h2>

                    <div className={styles.relationshipDisplay}>
                        <span className={styles.entityName}>
                            {getEntityDisplayName(source_node)}
                        </span>

                        <div className={styles.relationshipArrow}>
                            <div
                                className={styles.arrowLine}
                                style={{ backgroundColor: relationshipColor }}
                            />
                            <div
                                className={styles.arrowHead}
                                style={{ borderLeftColor: relationshipColor }}
                            />
                        </div>

                        <span className={styles.entityName}>
                            {getEntityDisplayName(target_node)}
                        </span>
                    </div>

                    <div style={{ marginTop: 12 }}>
                        <span
                            className={styles.relationshipLabel}
                            style={{ backgroundColor: relationshipColor }}
                        >
                            {edge.relationship_type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                    </div>
                </div>

                <div className={styles.modalContent}>
                    {/* Confidence */}
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Confidence Score
                        </h3>
                        <div className={styles.confidenceDisplay}>
                            <span className={styles.confidenceValue}>
                                {(edge.confidence * 100).toFixed(0)}%
                            </span>
                            <div className={styles.confidenceBar}>
                                <div
                                    className={styles.confidenceFill}
                                    style={{
                                        width: `${edge.confidence * 100}%`,
                                        backgroundColor: relationshipColor,
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Evidence */}
                    {edge.evidence && (
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                Evidence
                            </h3>
                            <div className={styles.evidenceBox}>
                                <p className={styles.evidenceQuote}>"{edge.evidence}"</p>
                                {edge.provenance && (
                                    <div className={styles.evidenceSource}>
                                        <svg className={styles.evidenceSourceIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="12" y1="16" x2="12" y2="12" />
                                            <line x1="12" y1="8" x2="12.01" y2="8" />
                                        </svg>
                                        <span>
                                            {edge.provenance.section_type && `${edge.provenance.section_type} section`}
                                            {edge.provenance.paper_id && ` • Paper ${edge.provenance.paper_id}`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Provenance */}
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Provenance
                        </h3>
                        <div className={styles.provenanceGrid}>
                            {source_paper && (
                                <div className={styles.provenanceItem}>
                                    <div className={styles.provenanceLabel}>Source Paper</div>
                                    <div className={styles.provenanceValue}>
                                        {source_paper.title || source_paper.paper_id}
                                    </div>
                                </div>
                            )}
                            {target_paper && (
                                <div className={styles.provenanceItem}>
                                    <div className={styles.provenanceLabel}>Target Paper</div>
                                    <div className={styles.provenanceValue}>
                                        {target_paper.title || target_paper.paper_id}
                                    </div>
                                </div>
                            )}
                            <div className={styles.provenanceItem}>
                                <div className={styles.provenanceLabel}>Source Entity Type</div>
                                <div className={styles.provenanceValue}>
                                    {source_node?.type || 'Unknown'}
                                </div>
                            </div>
                            <div className={styles.provenanceItem}>
                                <div className={styles.provenanceLabel}>Target Entity Type</div>
                                <div className={styles.provenanceValue}>
                                    {target_node?.type || 'Unknown'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Insights */}
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            Related Insights ({insights?.length || 0})
                        </h3>

                        {loadingInsights ? (
                            <div className={styles.loadingState}>
                                <div className={styles.loadingSpinner} />
                            </div>
                        ) : insights && insights.length > 0 ? (
                            <div className={styles.insightsList}>
                                {insights.map(insight => (
                                    <div key={insight.id} className={styles.insightItem}>
                                        <div className={styles.insightType}>
                                            {insight.insight_type.replace(/_/g, ' ')}
                                        </div>
                                        {insight.reasoning_path?.steps && (
                                            <div className={styles.insightSteps}>
                                                {insight.reasoning_path.steps.map((step, i) => (
                                                    <div key={i} className={styles.insightStep}>{step}</div>
                                                ))}
                                            </div>
                                        )}
                                        <div className={styles.insightContent}>
                                            Confidence: {(insight.confidence * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                No insights available for this relationship
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
