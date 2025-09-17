// ============================================================================
// CORE HELIX TYPES
// ============================================================================

/**
 * HelixDB parameter types - matches backend exactly
 */
const HELIX_PARAM_TYPES = [
  'string', 
  'id',
  'i32', 
  'i64', 
  'u32', 
  'u64', 
  'u128',
  'f64',
  'vec<f64>',
  'array(f64)'
] as const;

export type HelixParamType = typeof HELIX_PARAM_TYPES[number];


// ============================================================================
// SCHEMA TYPES
// ============================================================================

/**
 * Node type definition from schema
 */
export interface NodeType {
  name: string;
  node_type: string;
  properties: Record<string, string>;
}

/**
 * Edge type definition from schema
 */
export interface EdgeType {
  name: string;
  from_node: string;
  to_node: string;
  properties: Record<string, string>;
}

/**
 * Vector type definition from schema
 */
export interface VectorType {
  name: string;
  vector_type: string;
  properties: Record<string, string>;
}

/**
 * Complete schema information
 */
export interface SchemaInfoResponseV1 {
  nodes: NodeType[];
  edges: EdgeType[];
  vectors: VectorType[];
}

// ============================================================================
// ENDPOINT TYPES
// ============================================================================

/**
 * API endpoint parameter definition - raw from backend
 */
export interface ApiParameter {
  name: string;
  param_type: string; // Keep as string for backend compatibility
}

/**
 * Raw API endpoint info from backend
 */
export interface ApiEndpointResponseV1 {
  path: string;
  method: string; // Keep as string for backend compatibility
  query_name: string;
  parameters: ApiParameter[];
}

/**
 * Frontend endpoint parameter configuration
 */
export interface EndpointParameter {
  name: string;
  type: 'query' | 'path' | 'body';
  param_type: HelixParamType;
  required: boolean;
  description: string;
}

// ============================================================================
// VALUE TYPES
// ============================================================================

/**
 * Possible values for Helix parameters
 */
export type HelixValue = 
  | string 
  | number 
  | number[] 
  | boolean 
  | null;

/**
 * Parameter value mapping / Request body for API calls
 */
export type ParameterValues = Record<string, HelixValue>;

/**
 * Frontend endpoint configuration
 */
export interface EndpointConfig {
  name: string;
  method: string;
  url: string;
  description: string;
  params: EndpointParameter[];
  body?: ParameterValues;
}


// ============================================================================
// VISUALIZATION TYPES
// ============================================================================

/**
 * Generic data item for graph nodes and other data structures
 */
export interface DataItem {
  id: string;
  label?: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}


/**
 * Schema item definition
 */
export interface SchemaItem {
  name: string;
  properties: string[];
}

/**
 * Schema information response (visualization variant)
 */
export interface SchemaVisualizationResponseV1 {
  nodes: SchemaItem[];
  edges: SchemaItem[];
}

/**
 * Edge data structure from backend
 */
export interface EdgeData {
  id: string;
  from_node?: string;
  from?: string;
  to_node?: string;
  to?: string;
  label?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Vector data structure from backend
 */
export interface VectorData {
  id: string;
  [key: string]: unknown;
}

/**
 * Nodes and edges response from API
 */
export interface NodesEdgesResponseV1 {
    nodes: DataItem[];
    edges: EdgeData[];
    vectors: VectorData[];
  stats?: {
    num_nodes: number;
    num_edges: number;
    num_vectors: number;
  };
}

export interface NodesByLabelResponseV1 {
  nodes: DataItem[];
}

/**
 * Node connection data
 */
export interface ConnectionDataResponseV1 {
  connected_nodes?: DataItem[];
  incoming_edges?: EdgeData[];
  outgoing_edges?: EdgeData[];
}

/**
 * Node details response from API
 */
export interface NodeDetailsResponseV1 {
  found?: boolean;
  node?: DataItem;
  data?: DataItem;
  [key: string]: unknown;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a valid Helix parameter type
 */
export function isHelixParamType(value: string): value is HelixParamType {
  return HELIX_PARAM_TYPES.includes(value as HelixParamType);
}

