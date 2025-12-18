declare module 'react-force-graph-2d' {
    import { Component, RefObject } from 'react';
    import { ForceGraphMethods as Methods } from 'react-force-graph-2d';

    export interface NodeObject {
        id?: string | number;
        x?: number;
        y?: number;
        vx?: number;
        vy?: number;
        fx?: number | null;
        fy?: number | null;
        [key: string]: any;
    }

    export interface LinkObject {
        source?: string | number | NodeObject;
        target?: string | number | NodeObject;
        [key: string]: any;
    }

    export interface GraphData {
        nodes: NodeObject[];
        links: LinkObject[];
    }

    export interface ForceGraphMethods<N = NodeObject, L = LinkObject> {
        // Simulation
        d3Force: (forceName: string, force?: any) => any;
        d3ReheatSimulation: () => void;

        // Zoom
        zoom: (k?: number, duration?: number) => number;
        centerAt: (x?: number, y?: number, duration?: number) => { x: number; y: number };

        // Screen coords
        screen2GraphCoords: (x: number, y: number) => { x: number; y: number };
        graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };

        // Refresh
        refresh: () => void;

        // Pause
        pauseAnimation: () => void;
        resumeAnimation: () => void;
    }

    export interface ForceGraphProps<N extends NodeObject = NodeObject, L extends LinkObject = LinkObject> {
        // Data
        graphData: GraphData;

        // Node
        nodeId?: string;
        nodeLabel?: string | ((node: N) => string);
        nodeVal?: string | number | ((node: N) => number);
        nodeColor?: string | ((node: N) => string);
        nodeAutoColorBy?: string | ((node: N) => string | null);
        nodeCanvasObject?: (node: N, ctx: CanvasRenderingContext2D, globalScale: number) => void;
        nodeCanvasObjectMode?: string | ((node: N) => string);
        nodePointerAreaPaint?: (node: N, color: string, ctx: CanvasRenderingContext2D) => void;

        // Link
        linkSource?: string;
        linkTarget?: string;
        linkLabel?: string | ((link: L) => string);
        linkColor?: string | ((link: L) => string);
        linkAutoColorBy?: string | ((link: L) => string | null);
        linkWidth?: number | string | ((link: L) => number);
        linkCurvature?: number | string | ((link: L) => number);
        linkCanvasObject?: (link: L, ctx: CanvasRenderingContext2D, globalScale: number) => void;
        linkCanvasObjectMode?: string | ((link: L) => string);
        linkPointerAreaPaint?: (link: L, color: string, ctx: CanvasRenderingContext2D) => void;
        linkDirectionalArrowLength?: number | string | ((link: L) => number);
        linkDirectionalArrowColor?: string | ((link: L) => string);
        linkDirectionalArrowRelPos?: number | string | ((link: L) => number);
        linkDirectionalParticles?: number | string | ((link: L) => number);
        linkDirectionalParticleSpeed?: number | string | ((link: L) => number);
        linkDirectionalParticleWidth?: number | string | ((link: L) => number);
        linkDirectionalParticleColor?: string | ((link: L) => string);

        // Dimensions
        width?: number;
        height?: number;

        // Background
        backgroundColor?: string;

        // Force engine
        d3AlphaMin?: number;
        d3AlphaDecay?: number;
        d3VelocityDecay?: number;
        warmupTicks?: number;
        cooldownTicks?: number;
        cooldownTime?: number;

        // Interaction
        enableNodeDrag?: boolean;
        enableZoomInteraction?: boolean;
        enablePanInteraction?: boolean;
        enablePointerInteraction?: boolean;

        // Events
        onNodeClick?: (node: N, event: MouseEvent) => void;
        onNodeRightClick?: (node: N, event: MouseEvent) => void;
        onNodeHover?: (node: N | null, previousNode: N | null) => void;
        onNodeDrag?: (node: N, translate: { x: number; y: number }) => void;
        onNodeDragEnd?: (node: N, translate: { x: number; y: number }) => void;
        onLinkClick?: (link: L, event: MouseEvent) => void;
        onLinkRightClick?: (link: L, event: MouseEvent) => void;
        onLinkHover?: (link: L | null, previousLink: L | null) => void;
        onBackgroundClick?: (event: MouseEvent) => void;
        onBackgroundRightClick?: (event: MouseEvent) => void;
        onZoom?: (transform: { k: number; x: number; y: number }) => void;
        onZoomEnd?: (transform: { k: number; x: number; y: number }) => void;
        onEngineStop?: () => void;
    }

    const ForceGraph2D: React.ForwardRefExoticComponent<
        ForceGraphProps<any, any> & React.RefAttributes<ForceGraphMethods<any, any>>
    >;

    export default ForceGraph2D;
    export type { ForceGraphMethods };
}
