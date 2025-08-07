import { GraphNode } from '../types';

interface GraphEventHandlers {
    onNodeClick: (
        node: GraphNode,
        event: MouseEvent,
        options: {
            fgRef: any;
            expandedNodes: Set<string>;
            setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
            expandNodeConnections: (nodeId: string) => void;
            setFocusedNodeId: (id: string) => void;
            pendingFocusRef: React.RefObject<{
                nodeId: string;
                position: { x: number; y: number }
            } | null>;
            setShouldZoomToFocus: (value: boolean) => void;
        }
    ) => void;

    onNodeDrag: (
        node: GraphNode,
        options: {
            fgRef: any;
            isDraggingRef: React.RefObject<boolean>;
        }
    ) => void;

    onNodeDragEnd: (
        node: GraphNode,
        options: {
            fgRef: any;
            isDraggingRef: React.RefObject<boolean>;
        }
    ) => void;

    onBackgroundClick: (
        options: {
            setFocusedNodeId: (id: string | null) => void;
            pendingFocusRef: React.RefObject<any>;
            fgRef: any;
        }
    ) => void;

    onZoom: (
        zoomEvent: { k: number },
        options: {
            zoomTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
            lastZoomRef: React.RefObject<number>;
        }
    ) => void;
}

export const graphEventHandlers: GraphEventHandlers = {
    onNodeClick: (node, event, options) => {
        const { fgRef, expandedNodes, setExpandedNodes, expandNodeConnections, setFocusedNodeId, pendingFocusRef, setShouldZoomToFocus } = options;

        const canvas = event.target as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        const graphCoords = fgRef.current?.screen2GraphCoords(canvasX, canvasY);

        if (graphCoords) {
            // Check if clicking on "More/Less" toggle
            if (node.__moreBounds) {
                const moreBounds = node.__moreBounds;
                const relX = graphCoords.x - node.x;
                const relY = graphCoords.y - node.y;

                if (relX >= moreBounds.x && relX <= moreBounds.x + moreBounds.width &&
                    relY >= moreBounds.y && relY <= moreBounds.y + moreBounds.height) {
                    event.preventDefault();
                    event.stopPropagation();
                    setExpandedNodes(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(node.id)) {
                            newSet.delete(node.id);
                        } else {
                            newSet.add(node.id);
                        }
                        return newSet;
                    });
                    return;
                }
            }

            // Check if clicking on expand connections button
            if (node.__expandBounds) {
                const expandBounds = node.__expandBounds;
                const relX = graphCoords.x - node.x;
                const relY = graphCoords.y - node.y;

                if (relX >= expandBounds.x && relX <= expandBounds.x + expandBounds.width &&
                    relY >= expandBounds.y && relY <= expandBounds.y + expandBounds.height) {
                    event.preventDefault();
                    event.stopPropagation();
                    // Expand connections WITHOUT zooming
                    expandNodeConnections(node.id);
                    return;
                }
            }
        }

        // Regular node click - set focus AND enable zoom
        setShouldZoomToFocus(true);
        setFocusedNodeId(node.id);
    },

    onNodeDrag: (node, options) => {
        const { fgRef, isDraggingRef } = options;

        if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            fgRef.current.d3Force('link').strength(0.8);
            fgRef.current.d3Force('charge').strength(-150);
        }
        node.fx = node.x;
        node.fy = node.y;
    },

    onNodeDragEnd: (node, options) => {
        const { fgRef, isDraggingRef } = options;

        isDraggingRef.current = false;
        fgRef.current.d3Force('link').strength(0.8);
        fgRef.current.d3Force('charge').strength(-400);
        node.fx = node.x;
        node.fy = node.y;
        fgRef.current.pauseAnimation();
        setTimeout(() => fgRef.current.resumeAnimation(), 50);
    },

    onBackgroundClick: (options) => {
        const { setFocusedNodeId, pendingFocusRef, fgRef } = options;

        setFocusedNodeId(null);
        pendingFocusRef.current = null;

        if (fgRef.current) {
            fgRef.current.pauseAnimation();
            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.resumeAnimation();
                }
            }, 100);
        }
    },

    onZoom: (zoomEvent, options) => {
        const { zoomTimeoutRef, lastZoomRef } = options;

        if (zoomTimeoutRef.current) {
            clearTimeout(zoomTimeoutRef.current);
        }

        zoomTimeoutRef.current = setTimeout(() => {
            lastZoomRef.current = zoomEvent.k;
        }, 50);
    }
};

export const nodePointerAreaPaint = (
    node: GraphNode,
    color: string,
    ctx: CanvasRenderingContext2D
) => {
    if (node.__hitType === 'circle' && node.__hitSize) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.__hitSize, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
    } else if (node.__hitType === 'rect' && node.__hitDimensions) {
        const [w, h] = node.__hitDimensions;
        ctx.fillStyle = color;
        ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);

        if (node.__expandBounds) {
            const expandBounds = node.__expandBounds;
            ctx.fillRect(
                node.x + expandBounds.x,
                node.y + expandBounds.y,
                expandBounds.width,
                expandBounds.height
            );
        }
    } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
    }
};