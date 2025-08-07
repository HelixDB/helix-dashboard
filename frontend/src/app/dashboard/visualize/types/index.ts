export interface DataItem {
    id: string;
    label?: string;
    name?: string;
    title?: string;
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
        edges: any[];
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
    incoming_edges?: any[];
    outgoing_edges?: any[];
}

export interface NodeDetailsResponse {
    found?: boolean;
    node?: DataItem;
    data?: DataItem;
    [key: string]: any;
}