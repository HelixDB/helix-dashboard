import { NextRequest, NextResponse } from 'next/server';

const MAX_LIMIT = 300;

const host = process.env.DOCKER_HOST_INTERNAL || 'localhost';
const port = process.env.HELIX_PORT || 6969;
const cloudUrl = process.env.HELIX_CLOUD_URL;

const helixUrl = cloudUrl ? cloudUrl : `http://${host}:${port}`;

function validateLimit(limit?: string): number | undefined {
  if (!limit) return undefined;
  const numLimit = parseInt(limit, 10);
  return isNaN(numLimit) ? undefined : Math.min(numLimit, MAX_LIMIT);
}

function createDefaultErrorData() {
  return {
    nodes: [],
    edges: [],
    vectors: []
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const nodeLabel = url.searchParams.get('node_label');
    
    // Build the request URL for the HelixDB instance
    const queryParams = new URLSearchParams();
    
    const limit = validateLimit(limitParam || undefined);
    if (limit) {
      queryParams.append('limit', limit.toString());
    }
    
    if (nodeLabel) {
      queryParams.append('node_label', nodeLabel);
    }
    
    const requestUrl = `${helixUrl}/nodes-edges${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
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

    console.log(data);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error with nodes-edges request:', error);
    return NextResponse.json({
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data: createDefaultErrorData()
    });
  }
}
