export interface DataItem {
    id: string;
    label?: string;
    name?: string;
    title?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export interface SchemaNode {
    name: string;
    properties: string[];
}

export interface SchemaEdge {
    name: string;
    properties: string[];
}

export interface SchemaInfo {
    nodes: SchemaNode[];
    edges: SchemaEdge[];
}

export interface NodesEdgesResponse {
    data: {
        nodes: DataItem[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vectors: any[];
    };
    stats?: {
        num_nodes: number;
        num_edges: number;
        num_vectors: number;
    };
    error?: string;
}

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

export interface GraphLink {
    source: string;
    target: string;
    label: string;
    isVirtual: boolean;
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export interface ConnectionData {
    connected_nodes?: DataItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incoming_edges?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outgoing_edges?: any[];
}

export interface NodeDetailsResponse {
    found?: boolean;
    node?: DataItem;
    data?: DataItem;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}