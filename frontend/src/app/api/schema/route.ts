import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_PORT = 6969;
const MAX_LIMIT = 300;

const host = process.env.DOCKER_HOST_INTERNAL || 'localhost';
const port = process.env.HELIX_PORT || DEFAULT_PORT;
const cloudUrl = process.env.HELIX_CLOUD_URL;

const helixUrl = cloudUrl ? cloudUrl : `http://${host}:${port}`;

// Helper function to make HTTP requests with optional API key
async function makeHttpRequestWithAuth(url: string): Promise<any> {
  const headers: HeadersInit = {};
  
  if (process.env.HELIX_API_KEY) {
    headers['x-api-key'] = process.env.HELIX_API_KEY;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  
  return response.json();
}

// Helper function to create empty schema
function createEmptySchema() {
  return {
    nodes: [],
    edges: [],
    vectors: []
  };
}

export async function GET(request: NextRequest) {
  try {
    // Try to get schema from introspect endpoint
    const introspectUrl = `${helixUrl}/introspect`;
    const introspectData = await makeHttpRequestWithAuth(introspectUrl);
    
    if (introspectData && introspectData.schema) {
      const schema = introspectData.schema;
      
      // Transform schema to match Rust backend format
      const transformedSchema = {
        nodes: schema.nodes?.map((node: any) => ({
          name: node.name,
          node_type: node.node_type || "N", // Add missing node_type
          properties: node.properties
        })) || [],
        edges: schema.edges?.map((edge: any) => ({
          name: edge.name,
          from_node: edge.from_node || edge.from, // Handle both formats
          to_node: edge.to_node || edge.to,       // Handle both formats
          properties: edge.properties
        })) || [],
        vectors: schema.vectors?.map((vector: any) => ({
          name: vector.name,
          vector_type: vector.vector_type || "V", // Add missing vector_type
          properties: vector.properties
        })) || []
      };
      
      return NextResponse.json(transformedSchema);
    }
    
    return NextResponse.json(createEmptySchema());
  } catch (error) {
    console.error('Error fetching schema:', error);
    return NextResponse.json(createEmptySchema());
  }
}
