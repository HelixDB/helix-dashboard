import { DataItem, SchemaVisualizationResponseV1, NodeDetailsResponseV1 } from '@/lib/api-client/types';
import { fetchNodeDetails, fetchNodesAndEdges } from '@/lib/api-client/requests';


/**
 * Graph node with visualization properties
 */
export interface GraphNode {
    id: string;
    originalData: DataItem;
    color: string;
    x: number;
    y: number;
    fx?: number;
    fy?: number;
    __hitType?: 'circle' | 'rect';
    __hitSize?: number;
    __hitDimensions?: [number, number];
    __cardDimensions?: [number, number];
    __moreBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    __expandBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }
  
  /**
   * Graph link between nodes
   */
  export interface GraphLink {
    source: string;
    target: string;
    label: string;
    isVirtual: boolean;
  }
  
export const getNodeColor = (item: DataItem): string => {
    const label = item.label || 'Entity';

    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        const char = label.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
        '#ec4899', '#f97316', '#14b8a6', '#a855f7', '#eab308',
        '#ef4444', '#22c55e', '#f472b6', '#84cc16', '#0ea5e9',
        '#d946ef', '#6366f1', '#22d3ee', '#fb7185', '#fbbf24',
        '#34d399', '#c084fc', '#38bdf8', '#fde047', '#fb923c',
        '#4ade80', '#60a5fa', '#facc15', '#f87171', '#a78bfa',
        '#fdba74', '#86efac', '#7dd3fc', '#fef08a', '#fca5a5', '#6ee7b7'
    ];

    return colors[Math.abs(hash) % colors.length];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatFieldType = (key: string, value: any): string => {
    if (key === 'id' || key.endsWith('_id')) return 'ID';
    if (typeof value === 'number') return Number.isInteger(value) ? 'I32' : 'F64';
    if (typeof value === 'string') return 'String';
    if (typeof value === 'boolean') return 'Bool';
    if (Array.isArray(value)) return '[F64]';
    return 'String';
};

export const getInitialNodePosition = (item: DataItem, index: number, totalNodes: number) => {
    let hash = 0;
    for (let i = 0; i < item.id.length; i++) {
        hash = ((hash << 5) - hash) + item.id.charCodeAt(i);
        hash = hash & hash;
    }

    const angle = (index * 137.5 + hash % 360) * Math.PI / 180;
    
    let baseRadius, radiusIncrement;
    if (totalNodes <= 100) {
        baseRadius = 200;
        radiusIncrement = 20;
    } else if (totalNodes <= 500) {
        baseRadius = 300;
        radiusIncrement = 15;
    } else if (totalNodes <= 1000) {
        baseRadius = 500;
        radiusIncrement = 10;
    } else if (totalNodes <= 3000) {
        baseRadius = 800;
        radiusIncrement = 8;
    } else {
        baseRadius = 1200;
        radiusIncrement = 6;
    }
    
    const radiusVariation = (hash % 100);
    const radius = baseRadius + (index * radiusIncrement) + radiusVariation;

    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
    };
};

export const isNodeInViewport = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    graph2ScreenCoords: (x: number, y: number) => { x: number; y: number }
): boolean => {
    const viewportWidth = ctx.canvas.width;
    const viewportHeight = ctx.canvas.height;
    const screenCoords = graph2ScreenCoords(node.x, node.y);
    // Reduce padding to only render nodes that are actually visible
    const padding = 50;

    return screenCoords.x >= -padding &&
        screenCoords.x <= viewportWidth + padding &&
        screenCoords.y >= -padding &&
        screenCoords.y <= viewportHeight + padding;
};

export const getRenderMode = (
    globalScale: number,
    nodeCount: number,
    isInViewport: boolean
): { mode: 'simple' | 'detailed' | 'transition'; detailOpacity: number } => {
    // Adjust thresholds based on node count for better performance
    const thresholdLow = nodeCount > 1000 ? 1.5 : nodeCount > 500 ? 1.2 : 0.8;
    const thresholdHigh = nodeCount > 1000 ? 2.0 : nodeCount > 500 ? 1.7 : 1.3;
    
    // For ANY node count, only show details when BOTH zoomed in AND in viewport
    if (!isInViewport) {
        return { mode: 'simple', detailOpacity: 0 };
    }
    
    // Only show detailed view when sufficiently zoomed in
    if (globalScale > thresholdHigh) {
        return { mode: 'detailed', detailOpacity: 1 };
    } else if (globalScale > thresholdLow) {
        const progress = (globalScale - thresholdLow) / (thresholdHigh - thresholdLow);
        return { mode: 'transition', detailOpacity: Math.pow(progress, 2) };
    } else {
        return { mode: 'simple', detailOpacity: 0 };
    }
};

// ============================================================================
// DATA MUTATION FUNCTIONS
// ============================================================================

/**
 * Fetches details for multiple nodes in batches and merges with existing data
 */
export async function fetchNodeDetailsForNodes(
    nodes: Map<string, DataItem>
): Promise<Map<string, DataItem>> {
    const nodeIds = Array.from(nodes.keys());
    const batchSize = 10;
    const updatedNodes = new Map(nodes);

    for (let i = 0; i < nodeIds.length; i += batchSize) {
        const batch = nodeIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (nodeId) => {
            try {
                const details = await fetchNodeDetails(nodeId);
                return { nodeId, details };
            } catch {
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((result) => {
            if (result && result.details) {
                const existingNode = updatedNodes.get(result.nodeId);
                if (existingNode) {
                    let nodeData = null;

                    if (result.details.data?.found && result.details.data?.node) {
                        nodeData = result.details.data.node;
                    } else if (result.details.data) {
                        nodeData = result.details.data.data;
                    } else {
                        nodeData = result.details.data;
                    }

                    if (nodeData && typeof nodeData === 'object') {
                        updatedNodes.set(result.nodeId, {
                            ...existingNode,
                            ...nodeData,
                            id: result.nodeId
                        });
                    }
                }
            }
        });
    }

    return updatedNodes;
}

/**
 * Discovers node types from existing data when schema is not available
 */
export async function discoverNodeTypesFromData(): Promise<SchemaVisualizationResponseV1> {
    try {
            const result = await fetchNodesAndEdges(100);
            const nodes = result.data?.nodes || [];
        const nodeTypes = new Set<string>();

        for (let i = 0; i < Math.min(nodes.length, 20); i++) {
            const node = nodes[i];
            try {
                const details = await fetchNodeDetails(node.id);
                let nodeData = null;

                if (details.data?.found && details.data?.node) {
                    nodeData = details.data.node;
                } else if (details.data) {
                    nodeData = details.data.data;
                } else {
                    nodeData = details.data;
                }

                if (nodeData && typeof nodeData === 'object' && 'label' in nodeData && typeof nodeData.label === 'string') {
                    nodeTypes.add(nodeData.label);
                }
            } catch {
                continue;
            }
        }

        return {
            nodes: Array.from(nodeTypes).map(type => ({ name: type, properties: [] })),
            edges: []
        };
    } catch {
        return { nodes: [], edges: [] };
    }
}