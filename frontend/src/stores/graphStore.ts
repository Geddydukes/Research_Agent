import { create } from 'zustand';
import type { EntityType, RelationshipType, GraphData, ForceGraphData, GraphNode, GraphLink } from '../types';

// Entity type colors
export const ENTITY_TYPE_COLORS: Record<string, string> = {
    method: '#6366f1',      // Indigo
    dataset: '#8b5cf6',     // Purple
    metric: '#f59e0b',      // Amber
    concept: '#06b6d4',     // Cyan
    task: '#10b981',        // Emerald
    model: '#ec4899',       // Pink
    default: '#64748b',     // Slate
};

// Relationship type colors
export const RELATIONSHIP_COLORS: Record<string, string> = {
    extends: '#3b82f6',     // Blue
    improves: '#10b981',    // Emerald
    uses: '#8b5cf6',        // Purple
    evaluates: '#f59e0b',   // Amber
    compares_to: '#06b6d4', // Cyan
    implements: '#ec4899',  // Pink
    based_on: '#6366f1',    // Indigo
    default: '#64748b',     // Slate
};

export type ClusterMode = 'type' | 'relationship' | 'none';

interface GraphStore {
    // Data
    graphData: GraphData | null;
    forceGraphData: ForceGraphData | null;
    isLoading: boolean;
    error: string | null;

    // Filters
    activeEntityTypes: Set<EntityType>;
    activeRelationshipTypes: Set<RelationshipType>;
    hideUnconnectedNodes: boolean;
    confidenceThreshold: number;  // 0-1, minimum confidence to show
    yearRange: { min: number | null; max: number | null };  // null means no limit

    // Clustering
    clusterMode: ClusterMode;

    // Selection
    selectedEntityId: number | null;
    selectedEdgeId: number | null;
    hoveredEntityId: number | null;
    hoveredEdgeId: number | null;

    // Search
    searchQuery: string;

    // Actions
    setGraphData: (data: GraphData) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Filter actions
    toggleEntityType: (type: EntityType) => void;
    toggleRelationshipType: (type: RelationshipType) => void;
    setAllEntityTypes: (active: boolean) => void;
    setAllRelationshipTypes: (active: boolean) => void;
    toggleHideUnconnectedNodes: () => void;
    setConfidenceThreshold: (threshold: number) => void;
    setYearRange: (min: number | null, max: number | null) => void;

    // Cluster actions
    setClusterMode: (mode: ClusterMode) => void;

    // Selection actions
    selectEntity: (id: number | null) => void;
    selectEdge: (id: number | null) => void;
    hoverEntity: (id: number | null) => void;
    hoverEdge: (id: number | null) => void;

    // Search actions
    setSearchQuery: (query: string) => void;

    // Computed
    getFilteredForceGraphData: () => ForceGraphData | null;
    getEntityTypeColor: (type: EntityType) => string;
    getRelationshipColor: (type: RelationshipType) => string;
}

// Transform backend data to force graph format
function transformToForceGraph(data: GraphData): ForceGraphData {
    // Group nodes by type for initial positioning
    const typeGroups = new Map<string, number>();
    data.nodes.forEach(entity => {
        const type = entity.type.toLowerCase();
        typeGroups.set(type, (typeGroups.get(type) || 0) + 1);
    });

    const types = Array.from(typeGroups.keys());
    const typeIndex = new Map<string, number>();
    types.forEach((type, i) => typeIndex.set(type, i));
    const typeCount = new Map<string, number>();

    // Create nodes with initial positions spread out in a radial pattern
    const nodes: GraphNode[] = data.nodes.map((entity) => {
        const type = entity.type.toLowerCase();
        const typeIdx = typeIndex.get(type) || 0;
        const count = typeCount.get(type) || 0;
        typeCount.set(type, count + 1);

        // Radial position based on type
        const angleOffset = (2 * Math.PI * typeIdx) / types.length;
        const radius = 200 + Math.random() * 150; // Random radius between 200-350
        const spreadAngle = angleOffset + ((count - (typeGroups.get(type) || 1) / 2) * 0.3);

        return {
            id: entity.id.toString(),
            entity,
            // Initial spread positions - will be refined by force simulation
            x: Math.cos(spreadAngle) * radius,
            y: Math.sin(spreadAngle) * radius,
        };
    });

    const nodeIds = new Set(nodes.map(n => n.id));

    const links: GraphLink[] = data.edges
        .filter(edge =>
            nodeIds.has(edge.source_node_id.toString()) &&
            nodeIds.has(edge.target_node_id.toString())
        )
        .map(edge => ({
            id: edge.id.toString(),
            source: edge.source_node_id.toString(),
            target: edge.target_node_id.toString(),
            edge,
        }));

    return { nodes, links };
}

export const useGraphStore = create<GraphStore>((set, get) => ({
    // Initial state
    graphData: null,
    forceGraphData: null,
    isLoading: false,
    error: null,

    activeEntityTypes: new Set(['method', 'dataset', 'metric', 'concept', 'task', 'model']),
    activeRelationshipTypes: new Set(['extends', 'improves', 'uses', 'evaluates', 'compares_to', 'implements', 'based_on']),
    hideUnconnectedNodes: true,  // Default to hiding unconnected nodes
    confidenceThreshold: 0,  // Default: show all confidence levels
    yearRange: { min: null, max: null },  // Default: show all years

    clusterMode: 'type',

    selectedEntityId: null,
    selectedEdgeId: null,
    hoveredEntityId: null,
    hoveredEdgeId: null,

    searchQuery: '',

    // Actions
    setGraphData: (data) => {
        const forceGraphData = transformToForceGraph(data);

        // Extract unique types
        const entityTypes = new Set(data.nodes.map(n => n.type.toLowerCase()));
        const relationshipTypes = new Set(data.edges.map(e => e.relationship_type.toLowerCase()));

        set({
            graphData: data,
            forceGraphData,
            activeEntityTypes: entityTypes as Set<EntityType>,
            activeRelationshipTypes: relationshipTypes as Set<RelationshipType>,
        });
    },

    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),

    // Filter actions
    toggleEntityType: (type) => {
        const { activeEntityTypes } = get();
        const newTypes = new Set(activeEntityTypes);
        if (newTypes.has(type)) {
            newTypes.delete(type);
        } else {
            newTypes.add(type);
        }
        set({ activeEntityTypes: newTypes });
    },

    toggleRelationshipType: (type) => {
        const { activeRelationshipTypes } = get();
        const newTypes = new Set(activeRelationshipTypes);
        if (newTypes.has(type)) {
            newTypes.delete(type);
        } else {
            newTypes.add(type);
        }
        set({ activeRelationshipTypes: newTypes });
    },

    setAllEntityTypes: (active) => {
        const { graphData } = get();
        if (!graphData) return;

        if (active) {
            const allTypes = new Set(graphData.nodes.map(n => n.type.toLowerCase()));
            set({ activeEntityTypes: allTypes as Set<EntityType> });
        } else {
            set({ activeEntityTypes: new Set() });
        }
    },

    setAllRelationshipTypes: (active) => {
        const { graphData } = get();
        if (!graphData) return;

        if (active) {
            const allTypes = new Set(graphData.edges.map(e => e.relationship_type.toLowerCase()));
            set({ activeRelationshipTypes: allTypes as Set<RelationshipType> });
        } else {
            set({ activeRelationshipTypes: new Set() });
        }
    },

    toggleHideUnconnectedNodes: () => {
        const { hideUnconnectedNodes } = get();
        set({ hideUnconnectedNodes: !hideUnconnectedNodes });
    },

    setConfidenceThreshold: (threshold) => set({ confidenceThreshold: threshold }),

    setYearRange: (min, max) => set({ yearRange: { min, max } }),

    // Cluster actions
    setClusterMode: (mode) => set({ clusterMode: mode }),

    // Selection actions
    selectEntity: (id) => set({ selectedEntityId: id, selectedEdgeId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedEntityId: null }),
    hoverEntity: (id) => set({ hoveredEntityId: id }),
    hoverEdge: (id) => set({ hoveredEdgeId: id }),

    // Search actions
    setSearchQuery: (query) => set({ searchQuery: query }),

    // Computed
    getFilteredForceGraphData: () => {
        const { forceGraphData, activeEntityTypes, activeRelationshipTypes, hideUnconnectedNodes, confidenceThreshold, yearRange } = get();
        if (!forceGraphData) return null;

        // Filter nodes by active entity types, confidence threshold, AND year range (for papers)
        let filteredNodes = forceGraphData.nodes.filter(node => {
            const nodeConfidence = node.entity.adjusted_confidence ?? node.entity.original_confidence ?? 1;

            // Check entity type
            if (!activeEntityTypes.has(node.entity.type.toLowerCase() as EntityType)) {
                return false;
            }

            // Check confidence
            if (nodeConfidence < confidenceThreshold) {
                return false;
            }

            // Check year range (only for Paper entities with year metadata)
            if (node.entity.type.toLowerCase() === 'paper' && node.entity.metadata?.year) {
                const year = node.entity.metadata.year as number;
                if (yearRange.min !== null && year < yearRange.min) return false;
                if (yearRange.max !== null && year > yearRange.max) return false;
            }

            return true;
        });

        const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

        // Filter links by active relationship types, valid nodes, AND confidence threshold
        const filteredLinks = forceGraphData.links.filter(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;

            return (
                activeRelationshipTypes.has(link.edge.relationship_type.toLowerCase() as RelationshipType) &&
                filteredNodeIds.has(sourceId) &&
                filteredNodeIds.has(targetId) &&
                link.edge.confidence >= confidenceThreshold
            );
        });

        // Optionally hide nodes that have no connections
        if (hideUnconnectedNodes) {
            const connectedNodeIds = new Set<string>();
            filteredLinks.forEach(link => {
                const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
                const targetId = typeof link.target === 'string' ? link.target : link.target.id;
                connectedNodeIds.add(sourceId);
                connectedNodeIds.add(targetId);
            });
            filteredNodes = filteredNodes.filter(node => connectedNodeIds.has(node.id));
        }

        return { nodes: filteredNodes, links: filteredLinks };
    },

    getEntityTypeColor: (type) => {
        return ENTITY_TYPE_COLORS[type.toLowerCase()] || ENTITY_TYPE_COLORS.default;
    },

    getRelationshipColor: (type) => {
        return RELATIONSHIP_COLORS[type.toLowerCase()] || RELATIONSHIP_COLORS.default;
    },
}));
