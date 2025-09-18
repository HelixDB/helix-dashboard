import { NextRequest, NextResponse } from 'next/server';

const host = process.env.DOCKER_HOST_INTERNAL || 'localhost';
const port = process.env.HELIX_PORT || 6969;
const cloudUrl = process.env.HELIX_CLOUD_URL;

const helixUrl = cloudUrl ? cloudUrl : `http://${host}:${port}`;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    // Build the request URL for the HelixDB instance
    const requestUrl = `${helixUrl}/node-details?id=${encodeURIComponent(id)}`;
    
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
    console.error('Error with node-details request:', error);
    return NextResponse.json({
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data: {}
    });
  }
}
