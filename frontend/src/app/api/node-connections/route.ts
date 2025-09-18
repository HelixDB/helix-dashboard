import { NextRequest, NextResponse } from 'next/server';

const host = process.env.DOCKER_HOST_INTERNAL || 'localhost';
const port = process.env.HELIX_PORT || 6969;
const cloudUrl = process.env.HELIX_CLOUD_URL;

const helixUrl = cloudUrl ? cloudUrl : `http://${host}:${port}`;

function createNodeConnectionsErrorData() {
  return {
    connected_nodes: { values: [] },
    incoming_edges: { values: [] },
    outgoing_edges: { values: [] }
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get('node_id');
    
    if (!nodeId) {
      return NextResponse.json(
        { error: 'node_id parameter is required' },
        { status: 400 }
      );
    }
    
    // Build the request URL for the HelixDB instance
    const requestUrl = `${helixUrl}/node-connections?node_id=${encodeURIComponent(nodeId)}`;
    
    // Make direct HTTP request to the HelixDB instance
    const response = await fetch(requestUrl, {
      headers: process.env.HELIX_API_KEY ? {
        'x-api-key': process.env.HELIX_API_KEY
      } : {}
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error with node-connections request:', error);
    
    const errorResponse = {
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ...createNodeConnectionsErrorData()
    };
    
    return NextResponse.json(errorResponse);
  }
}
