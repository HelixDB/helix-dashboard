import { 
    NodesEdgesResponse, 
    SchemaInfo, 
    DataItem, 
    ConnectionData, 
    NodeDetailsResponse 
} from '../types';

const API_BASE = 'http://127.0.0.1:8080';

export const fetchSchema = async (): Promise<SchemaInfo> => {
    const response = await fetch(`${API_BASE}/api/schema`);
    const data: SchemaInfo = await response.json();
    return data;
};

export const fetchNodesByLabel = async (
    label: string, 
    limit?: number
): Promise<{ nodes: DataItem[] }> => {
    const params = new URLSearchParams();
    params.append('label', label);
    if (limit) params.append('limit', limit.toString());
    
    const response = await fetch(`${API_BASE}/nodes-by-label?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchNodesAndEdges = async (limit?: number): Promise<NodesEdgesResponse> => {
    const params = limit ? `?limit=${limit}` : '';
    const response = await fetch(`${API_BASE}/nodes-edges${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchNodeConnections = async (nodeId: string): Promise<ConnectionData> => {
    const response = await fetch(
        `${API_BASE}/node-connections?node_id=${encodeURIComponent(nodeId)}`
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch connections: ${response.status}`);
    }
    const connectionsText = await response.text();
    return JSON.parse(connectionsText);
};

export const fetchNodeDetails = async (nodeId: string): Promise<NodeDetailsResponse> => {
    const response = await fetch(
        `${API_BASE}/node-details?id=${encodeURIComponent(nodeId)}`
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch node details: ${response.status}`);
    }
    return response.json();
};

export const fetchNodeDetailsForNodes = async (
    nodes: Map<string, DataItem>
): Promise<Map<string, DataItem>> => {
    const nodeIds = Array.from(nodes.keys());
    const batchSize = 10;
    const updatedNodes = new Map(nodes);

    for (let i = 0; i < nodeIds.length; i += batchSize) {
        const batch = nodeIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (nodeId) => {
            try {
                const details = await fetchNodeDetails(nodeId);
                return { nodeId, details };
            } catch (error) {
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((result) => {
            if (result && result.details) {
                const existingNode = updatedNodes.get(result.nodeId);
                if (existingNode) {
                    let nodeData = null;

                    if (result.details.found && result.details.node) {
                        nodeData = result.details.node;
                    } else if (result.details.data) {
                        nodeData = result.details.data;
                    } else {
                        nodeData = result.details;
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
};

export const discoverNodeTypesFromData = async (): Promise<SchemaInfo> => {
    try {
        const result = await fetchNodesAndEdges(100);
        const nodes = result.data?.nodes || [];
        const nodeTypes = new Set<string>();

        for (let i = 0; i < Math.min(nodes.length, 20); i++) {
            const node = nodes[i];
            try {
                const details = await fetchNodeDetails(node.id);
                let nodeData = null;

                if (details.found && details.node) {
                    nodeData = details.node;
                } else if (details.data) {
                    nodeData = details.data;
                } else {
                    nodeData = details;
                }

                if (nodeData && nodeData.label) {
                    nodeTypes.add(nodeData.label);
                }
            } catch (error) {
                continue;
            }
        }

        return {
            nodes: Array.from(nodeTypes).map(type => ({ name: type, properties: [] })),
            edges: []
        };
    } catch (error) {
        return { nodes: [], edges: [] };
    }
};