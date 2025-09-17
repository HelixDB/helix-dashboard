import { 
    ApiEndpointResponseV1, 
    SchemaInfoResponseV1,
    NodesEdgesResponseV1,
    SchemaVisualizationResponseV1,
    ConnectionDataResponseV1,
    NodesByLabelResponseV1,
    NodeDetailsResponseV1
} from './types';
import { swiftFetch } from '../fetch';

const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

/**
 * Fetches all available API endpoints from the backend
 */
export async function getEndpoints() {
    return await swiftFetch<ApiEndpointResponseV1[]>('/api/endpoints', {
        baseUrl
    });
}

/**
 * Fetches schema information from the backend
 */
export async function getSchema() {
    return await swiftFetch<SchemaInfoResponseV1>('/api/schema', {
        baseUrl
    });
}

/**
 * Executes a query by name and returns typed result
 */
export async function executeQuery(queryName: string) {
    return await swiftFetch<unknown>(`/api/query/${queryName}`, {
        baseUrl
    });
}


/**
 * Fetches schema information for visualization
 */
export async function fetchSchema() {
    return await swiftFetch<SchemaVisualizationResponseV1>('/api/schema', {
        baseUrl
    });
    
}

/**
 * Fetches nodes by label with optional limit
 */
export async function fetchNodesByLabel(
    label: string, 
    limit?: number
) {
    const searchParams: Record<string, unknown> = { label };
    if (limit) searchParams.limit = limit;
    
    return await swiftFetch<NodesByLabelResponseV1>('/nodes-by-label', {
        baseUrl,
        searchParams
    });
    
}

/**
 * Fetches nodes and edges with optional limit
 */
export async function fetchNodesAndEdges(limit?: number) {
    const searchParams = limit ? { limit } : undefined;
    
    return await swiftFetch<NodesEdgesResponseV1>('/nodes-edges', {
        method: 'POST',
        baseUrl,
        searchParams
    });
    
}

/**
 * Fetches connections for a specific node
 */
export async function fetchNodeConnections(nodeId: string) {
    return await swiftFetch<ConnectionDataResponseV1>('/node-connections', {
        baseUrl,
        searchParams: { node_id: nodeId }
    });
    
}

/**
 * Fetches details for a specific node
 */
export async function fetchNodeDetails(nodeId: string) {
    return await swiftFetch<NodeDetailsResponseV1>('/node-details', {
        baseUrl,
        searchParams: { id: nodeId }
    });
}

