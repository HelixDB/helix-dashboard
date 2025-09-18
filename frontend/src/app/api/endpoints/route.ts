import { NextRequest, NextResponse } from 'next/server';

interface QueryParameter {
  name: string;
  param_type: string;
}

interface ApiEndpointInfo {
  path: string;
  method: string;
  query_name: string;
  parameters: QueryParameter[];
}

const host = process.env.DOCKER_HOST_INTERNAL || process.env.HELIX_HOST || 'localhost';
const port = process.env.HELIX_PORT || 6969;
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

// Helper function to determine HTTP method based on query name
function determineHttpMethod(queryName: string): string {
  if (queryName.startsWith('create') || queryName.startsWith('add') || queryName.startsWith('assign')) {
    return 'POST';
  } else if (queryName.startsWith('update')) {
    return 'PUT';
  } else if (queryName.startsWith('delete') || queryName.startsWith('remove')) {
    return 'DELETE';
  } else {
    return 'GET';
  }
}

// Helper function to map query to endpoint format
function mapQueryToEndpoint(query: any): ApiEndpointInfo {
  const parameters = [];
  
  if (query.parameters && typeof query.parameters === 'object') {
    for (const [name, type] of Object.entries(query.parameters)) {
      parameters.push({
        name,
        param_type: typeof type === 'string' ? type : 'String'
      });
    }
  }

  const method = determineHttpMethod(query.name);

  return {
    path: `/api/query/${query.name}`,
    method,
    query_name: query.name,
    parameters
  };
}

export async function GET(request: NextRequest) {
  try {    
    // Get introspect data to fetch available queries
    const introspectUrl = `${helixUrl}/introspect`;
    const introspectData = await makeHttpRequestWithAuth(introspectUrl);
    
    if (introspectData && introspectData.queries) {
      const endpoints = introspectData.queries.map(mapQueryToEndpoint);
      return NextResponse.json(endpoints);
    }
    
    return NextResponse.json([]);
  } catch (error) {
    console.error('Error fetching endpoints:', error);
    return NextResponse.json([]);
  }
}
