import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useGraphStore } from '../../stores/graphStore';
import type { GraphNode, GraphLink } from '../../types';
import styles from './Graph.module.css';

interface TooltipData {
    x: number;
    y: number;
    node?: GraphNode;
    link?: GraphLink;
}

export function KnowledgeGraph() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graphRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Use window size as initial dimensions - will be updated by ResizeObserver
    const [dimensions, setDimensions] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth - 300 : 1000,
        height: typeof window !== 'undefined' ? window.innerHeight - 100 : 700
    });
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    const {
        isLoading,
        error,
        clusterMode,
        selectedEntityId,
        hoveredEntityId,
        getFilteredForceGraphData,
        selectEntity,
        selectEdge,
        hoverEntity,
        getEntityTypeColor,
        getRelationshipColor,
    } = useGraphStore();

    const graphData = getFilteredForceGraphData();

    // Handle container resize with multiple fallbacks for reliable sizing
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateDimensions = () => {
            const width = container.clientWidth || container.offsetWidth;
            const height = container.clientHeight || container.offsetHeight;
            if (width > 0 && height > 0) {
                setDimensions({ width, height });
            }
        };

        // Try multiple approaches to ensure dimensions are captured
        updateDimensions();  // Immediate
        requestAnimationFrame(updateDimensions);  // After browser paint
        const timeoutId1 = setTimeout(updateDimensions, 50);  // Short delay
        const timeoutId2 = setTimeout(updateDimensions, 200); // Longer delay
        const timeoutId3 = setTimeout(updateDimensions, 500); // Even longer

        // Use ResizeObserver for reliable dimension tracking
        const resizeObserver = new ResizeObserver(() => {
            updateDimensions();
        });
        resizeObserver.observe(container);

        // Also listen for window resize
        window.addEventListener('resize', updateDimensions);

        return () => {
            clearTimeout(timeoutId1);
            clearTimeout(timeoutId2);
            clearTimeout(timeoutId3);
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateDimensions);
        };
    }, []);

    // Card dimensions for paper-like nodes
    const CARD_WIDTH = 140;
    const CARD_HEIGHT = 50;
    const CARD_RADIUS = 8;

    // Configure force simulation for better spacing
    useEffect(() => {
        if (!graphRef.current) return;
        const fg = graphRef.current;

        // Scale force parameters based on number of nodes for better spacing
        const nodeCount = graphData?.nodes?.length || 100;
        const scaleFactor = Math.max(1, nodeCount / 50);  // Scale up for large graphs

        // Force configuration for good spacing
        fg.d3Force('link')?.distance(200 * scaleFactor);  // Scale with node count
        fg.d3Force('charge')?.strength(-1500 * scaleFactor);  // Stronger repulsion for more nodes
        fg.d3Force('center')?.strength(0.005);  // Very weak center force

        // Use d3's collision force if available
        const d3 = (window as any).d3;
        if (d3 && d3.forceCollide) {
            fg.d3Force('collide', d3.forceCollide(80));
        }

        fg.d3ReheatSimulation();
    }, [dimensions, graphData]);

    // Cluster force based on cluster mode
    useEffect(() => {
        if (!graphRef.current || !graphData) return;

        const fg = graphRef.current;

        // First, remove any existing cluster force
        fg.d3Force('cluster', null);

        // Always unfix all node positions when cluster mode changes
        // This allows nodes to reposition according to the new clustering
        graphData.nodes.forEach((node) => {
            node.fx = undefined;
            node.fy = undefined;
        });

        if (clusterMode === 'none') {
            // No clustering - just reheat to let nodes settle naturally
            fg.d3ReheatSimulation();
            return;
        }

        if (clusterMode === 'type') {
            // Cluster by entity type - arrange in a circle by type
            const types = [...new Set(graphData.nodes.map(n => n.entity.type.toLowerCase()))];
            const angleStep = (2 * Math.PI) / types.length;
            const clusterRadius = Math.min(dimensions.width, dimensions.height) * 0.35;

            const typePositions = new Map<string, { x: number; y: number }>();
            types.forEach((type, i) => {
                typePositions.set(type, {
                    x: Math.cos(i * angleStep) * clusterRadius,
                    y: Math.sin(i * angleStep) * clusterRadius,
                });
            });

            // Apply cluster force
            fg.d3Force('cluster', (alpha: number) => {
                graphData.nodes.forEach((node) => {
                    const target = typePositions.get(node.entity.type.toLowerCase());
                    if (target && node.x !== undefined && node.y !== undefined) {
                        const k = alpha * 0.3;  // Increased strength
                        node.vx = (node.vx || 0) + (target.x - node.x) * k;
                        node.vy = (node.vy || 0) + (target.y - node.y) * k;
                    }
                });
            });
        }

        if (clusterMode === 'relationship') {
            // Cluster by connections - nodes with more connections cluster together
            // Calculate degree for each node from edges
            const degreeMap = new Map<string, number>();
            graphData.nodes.forEach(n => degreeMap.set(n.id, 0));

            // Count degrees from links in graphData
            graphData.links.forEach(link => {
                const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
                const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
                degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
                degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
            });

            const maxDegree = Math.max(...Array.from(degreeMap.values()), 1);

            // High-degree nodes cluster in center, low-degree on periphery
            fg.d3Force('cluster', (alpha: number) => {
                graphData.nodes.forEach((node) => {
                    if (node.x !== undefined && node.y !== undefined) {
                        const degree = degreeMap.get(node.id) || 0;

                        // Pull high-degree nodes toward center
                        const pullStrength = (degree / maxDegree) * alpha * 0.15;
                        node.vx = (node.vx || 0) + (0 - node.x) * pullStrength;
                        node.vy = (node.vy || 0) + (0 - node.y) * pullStrength;
                    }
                });
            });
        }

        fg.d3ReheatSimulation();
    }, [graphData, clusterMode, dimensions]);

    // Node canvas renderer - Paper card style
    const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, _globalScale: number) => {
        // Guard against undefined/NaN coordinates during initial layout
        if (node.x === undefined || node.y === undefined || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
            return;
        }

        const { entity } = node;
        const isSelected = selectedEntityId === entity.id;
        const isHovered = hoveredEntityId === entity.id;
        const color = getEntityTypeColor(entity.type);

        const x = node.x;
        const y = node.y;
        const width = CARD_WIDTH;
        const height = CARD_HEIGHT;
        const radius = CARD_RADIUS;

        // Card position (centered on node)
        const cardX = x - width / 2;
        const cardY = y - height / 2;

        // Draw shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = isSelected ? 20 : isHovered ? 15 : 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = isSelected ? 6 : 4;

        // Draw card background (rounded rectangle)
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, width, height, radius);

        // Card fill - dark with slight transparency for glass effect
        const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + height);
        cardGradient.addColorStop(0, 'rgba(30, 30, 40, 0.95)');
        cardGradient.addColorStop(1, 'rgba(20, 20, 30, 0.95)');
        ctx.fillStyle = cardGradient;
        ctx.fill();

        // Reset shadow for other elements
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw colored accent bar on left side
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, 5, height, [radius, 0, 0, radius]);
        ctx.fillStyle = color;
        ctx.fill();

        // Draw border
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, width, height, radius);
        ctx.strokeStyle = isSelected ? '#fff' : isHovered ? color : 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Draw entity name - use metadata.title for papers if available
        const isPaper = entity.type.toLowerCase() === 'paper';
        const metadataTitle = entity.metadata?.title as string | undefined;
        const label = (isPaper && metadataTitle) ? metadataTitle : entity.canonical_name;
        const maxWidth = width - 20;
        ctx.font = `600 12px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';

        // Truncate text if too long
        let displayLabel = label;
        if (ctx.measureText(label).width > maxWidth) {
            while (ctx.measureText(displayLabel + '...').width > maxWidth && displayLabel.length > 0) {
                displayLabel = displayLabel.slice(0, -1);
            }
            displayLabel += '...';
        }
        ctx.fillText(displayLabel, cardX + 12, y - 6);

        // Draw entity type badge
        const typeLabel = entity.type.toUpperCase();
        ctx.font = `500 9px Inter, system-ui, sans-serif`;
        const typeWidth = ctx.measureText(typeLabel).width + 8;

        // Type badge background
        ctx.beginPath();
        ctx.roundRect(cardX + 12, y + 4, typeWidth, 16, 3);
        ctx.fillStyle = `${color}30`;
        ctx.fill();

        // Type badge text
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(typeLabel, cardX + 16, y + 12);

        // Draw selection/hover glow
        if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.roundRect(cardX - 3, cardY - 3, width + 6, height + 6, radius + 2);
            ctx.strokeStyle = `${color}60`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }, [selectedEntityId, hoveredEntityId, getEntityTypeColor, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS]);

    // Link canvas renderer - with proper edge connections and arrows
    const linkCanvasObject = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, _globalScale: number) => {
        const { edge } = link;
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;

        if (!source.x || !source.y || !target.x || !target.y) return;
        if (!Number.isFinite(source.x) || !Number.isFinite(target.x)) return;

        const color = getRelationshipColor(edge.relationship_type);
        const confidence = edge.confidence || 0.5;


        // Calculate intersection points with card edges - add padding for arrows
        const halfWidth = CARD_WIDTH / 2 + 8;  // Add padding for arrow visibility
        const halfHeight = CARD_HEIGHT / 2 + 8;

        // Get exit point from source card
        const sourceEdge = getCardEdgePoint(source.x, source.y, target.x, target.y, halfWidth, halfHeight);
        // Get entry point to target card  
        const targetEdge = getCardEdgePoint(target.x, target.y, source.x, source.y, halfWidth, halfHeight);

        // Always draw lines - even if cards are close

        // Draw the connection line
        ctx.beginPath();
        ctx.moveTo(sourceEdge.x, sourceEdge.y);
        ctx.lineTo(targetEdge.x, targetEdge.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 + confidence * 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Draw arrowhead at target - larger and more visible
        const arrowLength = 14;
        const arrowAngle = Math.atan2(targetEdge.y - sourceEdge.y, targetEdge.x - sourceEdge.x);

        // Back up the arrow tip slightly from the target edge
        const arrowTipX = targetEdge.x - Math.cos(arrowAngle) * 2;
        const arrowTipY = targetEdge.y - Math.sin(arrowAngle) * 2;

        ctx.beginPath();
        ctx.moveTo(arrowTipX, arrowTipY);
        ctx.lineTo(
            arrowTipX - arrowLength * Math.cos(arrowAngle - Math.PI / 6),
            arrowTipY - arrowLength * Math.sin(arrowAngle - Math.PI / 6)
        );
        ctx.lineTo(
            arrowTipX - arrowLength * 0.5 * Math.cos(arrowAngle),
            arrowTipY - arrowLength * 0.5 * Math.sin(arrowAngle)
        );
        ctx.lineTo(
            arrowTipX - arrowLength * Math.cos(arrowAngle + Math.PI / 6),
            arrowTipY - arrowLength * Math.sin(arrowAngle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Draw relationship label on the line - always visible
        const midX = (sourceEdge.x + targetEdge.x) / 2;
        const midY = (sourceEdge.y + targetEdge.y) / 2;

        const label = edge.relationship_type.replace(/_/g, ' ').toUpperCase();
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        const labelWidth = ctx.measureText(label).width + 12;
        const labelHeight = 18;

        // Label background - more opaque
        ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
        ctx.beginPath();
        ctx.roundRect(midX - labelWidth / 2, midY - labelHeight / 2, labelWidth, labelHeight, 4);
        ctx.fill();

        // Label border - brighter
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
    }, [getRelationshipColor, CARD_WIDTH, CARD_HEIGHT]);

    // Helper function to calculate where a line from inside a card exits the card boundary
    function getCardEdgePoint(
        cardX: number, cardY: number,
        targetX: number, targetY: number,
        halfWidth: number, halfHeight: number
    ): { x: number; y: number } {
        const dx = targetX - cardX;
        const dy = targetY - cardY;

        if (dx === 0 && dy === 0) {
            return { x: cardX, y: cardY };
        }

        // Calculate intersection with each edge
        const slopes = [
            halfWidth / Math.abs(dx),   // right/left edge
            halfHeight / Math.abs(dy)   // top/bottom edge
        ].filter(s => isFinite(s));

        const t = Math.min(...slopes);

        return {
            x: cardX + dx * t,
            y: cardY + dy * t
        };
    }

    // Handle node click - freeze simulation to prevent movement
    const handleNodeClick = useCallback((node: GraphNode) => {
        // Fix node position so it doesn't move
        node.fx = node.x;
        node.fy = node.y;

        // Pause simulation briefly to prevent jitter
        if (graphRef.current) {
            graphRef.current.pauseAnimation();
            setTimeout(() => {
                if (graphRef.current) {
                    graphRef.current.resumeAnimation();
                }
            }, 100);
        }

        selectEntity(node.entity.id);
    }, [selectEntity]);

    // Handle link click
    const handleLinkClick = useCallback((link: GraphLink) => {
        selectEdge(link.edge.id);
    }, [selectEdge]);

    // Handle node hover
    const handleNodeHover = useCallback((node: GraphNode | null, _prevNode: GraphNode | null) => {
        hoverEntity(node?.entity.id ?? null);

        if (node) {
            setTooltip({
                x: (node.x ?? 0) + dimensions.width / 2,
                y: (node.y ?? 0) + dimensions.height / 2,
                node,
            });
        } else {
            setTooltip(null);
        }
    }, [hoverEntity, dimensions]);

    // Handle background click
    const handleBackgroundClick = useCallback(() => {
        selectEntity(null);
        selectEdge(null);
    }, [selectEntity, selectEdge]);

    // Memoize graph data to prevent unnecessary rerenders
    const stableGraphData = useMemo(() => graphData || { nodes: [], links: [] }, [graphData]);

    if (isLoading) {
        return (
            <div className={styles.graphContainer}>
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingSpinner} />
                    <span className={styles.loadingText}>Loading knowledge graph...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.graphContainer}>
                <div className={styles.errorOverlay}>
                    <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className={styles.errorText}>{error}</span>
                    <button className={styles.retryButton} onClick={() => window.location.reload()}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!graphData || graphData.nodes.length === 0) {
        return (
            <div className={styles.graphContainer}>
                <div className={styles.emptyOverlay}>
                    <span className={styles.emptyText}>No entities to display. Try adjusting your filters.</span>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={styles.graphContainer}>
            <ForceGraph2D
                ref={graphRef}
                graphData={stableGraphData}
                width={dimensions.width}
                height={dimensions.height}
                nodeId="id"
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => 'replace'}
                nodePointerAreaPaint={(node, color, ctx) => {
                    if (node.x === undefined || node.y === undefined) return;
                    // Match the card dimensions for click area
                    ctx.beginPath();
                    ctx.roundRect(node.x - CARD_WIDTH / 2, node.y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
                    ctx.fillStyle = color;
                    ctx.fill();
                }}
                linkCanvasObject={linkCanvasObject}
                linkCanvasObjectMode={() => 'replace'}
                linkDirectionalArrowLength={10}
                linkDirectionalArrowRelPos={1}
                linkWidth={2}
                linkColor={() => 'rgba(100, 100, 150, 0.5)'}
                linkPointerAreaPaint={(link, color, ctx) => {
                    const source = link.source as GraphNode;
                    const target = link.target as GraphNode;
                    if (!source.x || !source.y || !target.x || !target.y) return;

                    ctx.beginPath();
                    ctx.moveTo(source.x, source.y);
                    ctx.lineTo(target.x, target.y);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 12;
                    ctx.stroke();
                }}
                onNodeClick={handleNodeClick}
                onLinkClick={handleLinkClick}
                onNodeHover={handleNodeHover}
                onBackgroundClick={handleBackgroundClick}
                onEngineStop={() => {
                    // Freeze all node positions after simulation settles
                    if (stableGraphData?.nodes) {
                        stableGraphData.nodes.forEach((node: GraphNode) => {
                            node.fx = node.x;
                            node.fy = node.y;
                        });
                    }
                }}
                cooldownTicks={100}
                warmupTicks={graphData.nodes.length > 200 ? 50 : 0}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                enableNodeDrag={true}
                enableZoomInteraction={true}
                enablePanInteraction={true}
            />

            {/* Graph stats */}
            <div className={styles.graphStats}>
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{graphData.nodes.length}</span>
                    <span className={styles.statLabel}>Entities</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{graphData.links.length}</span>
                    <span className={styles.statLabel}>Relationships</span>
                </div>
            </div>

            {/* Controls hint */}
            <div className={styles.controlsHint}>
                <kbd>Scroll</kbd> to zoom • <kbd>Drag</kbd> to pan • Click entity for details
            </div>

            {/* Tooltip */}
            {tooltip?.node && (
                <div
                    className={styles.tooltip}
                    style={{
                        left: tooltip.x + 15,
                        top: tooltip.y - 15,
                    }}
                >
                    <div className={styles.tooltipTitle}>{tooltip.node.entity.canonical_name}</div>
                    <span
                        className={styles.tooltipType}
                        style={{
                            backgroundColor: `${getEntityTypeColor(tooltip.node.entity.type)}30`,
                            color: getEntityTypeColor(tooltip.node.entity.type),
                        }}
                    >
                        {tooltip.node.entity.type}
                    </span>
                    {tooltip.node.entity.adjusted_confidence && (
                        <div className={styles.tooltipConfidence}>
                            Confidence: {(tooltip.node.entity.adjusted_confidence * 100).toFixed(0)}%
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
