import { useMemo } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import type { ClusterMode } from '../../stores/graphStore';
import type { EntityType, RelationshipType } from '../../types';
import styles from './Filters.module.css';

export function FilterPanel() {
    const {
        graphData,
        activeEntityTypes,
        activeRelationshipTypes,
        hideUnconnectedNodes,
        clusterMode,
        toggleEntityType,
        toggleRelationshipType,
        setAllEntityTypes,
        setAllRelationshipTypes,
        toggleHideUnconnectedNodes,
        setClusterMode,
        getEntityTypeColor,
        getRelationshipColor,
    } = useGraphStore();

    // Count entities by type
    const entityTypeCounts = useMemo(() => {
        if (!graphData) return new Map<string, number>();
        const counts = new Map<string, number>();
        graphData.nodes.forEach(node => {
            const type = node.type.toLowerCase();
            counts.set(type, (counts.get(type) || 0) + 1);
        });
        return counts;
    }, [graphData]);

    // Count relationships by type
    const relationshipTypeCounts = useMemo(() => {
        if (!graphData) return new Map<string, number>();
        const counts = new Map<string, number>();
        graphData.edges.forEach(edge => {
            const type = edge.relationship_type.toLowerCase();
            counts.set(type, (counts.get(type) || 0) + 1);
        });
        return counts;
    }, [graphData]);

    // Get unique types
    const entityTypes = useMemo(() =>
        Array.from(entityTypeCounts.keys()).sort()
        , [entityTypeCounts]);

    const relationshipTypes = useMemo(() =>
        Array.from(relationshipTypeCounts.keys()).sort()
        , [relationshipTypeCounts]);

    const allEntityTypesActive = entityTypes.every(t => activeEntityTypes.has(t as EntityType));
    const allRelationshipTypesActive = relationshipTypes.every(t => activeRelationshipTypes.has(t as RelationshipType));

    const clusterOptions: { mode: ClusterMode; label: string; description: string }[] = [
        { mode: 'type', label: 'By Entity Type', description: 'Group entities by their type' },
        { mode: 'relationship', label: 'By Connections', description: 'Cluster connected entities' },
        { mode: 'none', label: 'No Clustering', description: 'Free-form layout' },
    ];

    return (
        <div className={styles.filtersContainer}>
            {/* Entity Type Filters */}
            <div className={styles.filterSection}>
                <div className={styles.filterHeader}>
                    <span className={styles.filterTitle}>Entity Types</span>
                    <button
                        className={styles.selectAllBtn}
                        onClick={() => setAllEntityTypes(!allEntityTypesActive)}
                    >
                        {allEntityTypesActive ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
                <div className={styles.filterList}>
                    {entityTypes.map(type => {
                        const isActive = activeEntityTypes.has(type as EntityType);
                        const color = getEntityTypeColor(type as EntityType);
                        const count = entityTypeCounts.get(type) || 0;

                        return (
                            <div
                                key={type}
                                className={`${styles.filterItem} ${isActive ? styles.active : ''}`}
                                style={{ '--filter-color': color } as React.CSSProperties}
                                onClick={() => toggleEntityType(type as EntityType)}
                            >
                                <div className={styles.filterCheckbox} />
                                <div className={styles.filterColorDot} style={{ backgroundColor: color }} />
                                <span className={styles.filterLabel}>{type}</span>
                                <span className={styles.filterCount}>{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.divider} />

            {/* Relationship Type Filters */}
            <div className={styles.filterSection}>
                <div className={styles.filterHeader}>
                    <span className={styles.filterTitle}>Relationship Types</span>
                    <button
                        className={styles.selectAllBtn}
                        onClick={() => setAllRelationshipTypes(!allRelationshipTypesActive)}
                    >
                        {allRelationshipTypesActive ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
                <div className={styles.filterList}>
                    {relationshipTypes.map(type => {
                        const isActive = activeRelationshipTypes.has(type as RelationshipType);
                        const color = getRelationshipColor(type as RelationshipType);
                        const count = relationshipTypeCounts.get(type) || 0;

                        return (
                            <div
                                key={type}
                                className={`${styles.filterItem} ${isActive ? styles.active : ''}`}
                                style={{ '--filter-color': color } as React.CSSProperties}
                                onClick={() => toggleRelationshipType(type as RelationshipType)}
                            >
                                <div className={styles.filterCheckbox} />
                                <div className={styles.filterColorDot} style={{ backgroundColor: color }} />
                                <span className={styles.filterLabel}>{type.replace(/_/g, ' ')}</span>
                                <span className={styles.filterCount}>{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.divider} />

            {/* Show Unconnected Nodes Toggle */}
            <div className={styles.filterSection}>
                <div
                    className={`${styles.filterItem} ${!hideUnconnectedNodes ? styles.active : ''}`}
                    onClick={toggleHideUnconnectedNodes}
                >
                    <div className={styles.filterCheckbox} />
                    <span className={styles.filterLabel}>Show Unconnected Nodes</span>
                </div>
            </div>

            <div className={styles.divider} />

            {/* Cluster Mode */}
            <div className={`${styles.filterSection} ${styles.clusterSection}`}>
                <div className={styles.filterHeader}>
                    <span className={styles.filterTitle}>Cluster Mode</span>
                </div>
                <div className={styles.clusterOptions}>
                    {clusterOptions.map(option => (
                        <div
                            key={option.mode}
                            className={`${styles.clusterOption} ${clusterMode === option.mode ? styles.active : ''}`}
                            onClick={() => setClusterMode(option.mode)}
                        >
                            <div className={styles.clusterRadio} />
                            <div>
                                <div className={styles.clusterLabel}>{option.label}</div>
                                <div className={styles.clusterDescription}>{option.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className={`${styles.filterSection} ${styles.legendSection}`}>
                <span className={styles.legendTitle}>Legend</span>
                <div className={styles.legendItem}>
                    <div className={styles.legendIcon}>
                        <svg width="14" height="14" viewBox="0 0 14 14">
                            <circle cx="7" cy="7" r="6" fill="#6366f1" />
                        </svg>
                    </div>
                    <span className={styles.legendText}>Entity Node</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={styles.legendLine} style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                    <span className={styles.legendText}>Relationship</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={styles.legendIcon}>
                        <svg width="14" height="14" viewBox="0 0 14 14">
                            <polygon points="7,1 13,7 7,13 1,7" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                        </svg>
                    </div>
                    <span className={styles.legendText}>Click for Details</span>
                </div>
            </div>
        </div>
    );
}
