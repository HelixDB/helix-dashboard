import { NextRequest, NextResponse } from 'next/server';
import HelixDB from 'helix-ts';

// Helper function to create HelixDB client
function createHelixClient(): HelixDB {
    const host = process.env.DOCKER_HOST_INTERNAL || process.env.HELIX_HOST || 'localhost';
    const port = process.env.HELIX_PORT || 6969;
    const cloudUrl = process.env.HELIX_CLOUD_URL;

    if (cloudUrl) {
        return new HelixDB(cloudUrl);
    }

    return new HelixDB(`http://${host}:${port}`);
}

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

// Helper function to convert string values to appropriate types
function convertStringToType(value: string, paramType: string): any {
    switch (paramType) {
        case 'String':
        case 'ID':
            return value;
        case 'Date':
            return value;
        case 'Boolean':
        case 'Bool':
            if (typeof value === 'boolean') return value;
            const lowerValue = value.toLowerCase().trim();
            return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
        case 'I8':
        case 'I16':
        case 'I32':
        case 'I64':
        case 'U8':
        case 'U16':
        case 'U32':
        case 'U64':
        case 'U128':
            const intVal = parseInt(value, 10);
            return isNaN(intVal) ? 0 : intVal;
        case 'F32':
        case 'F64':
            const floatVal = parseFloat(value);
            return isNaN(floatVal) ? 0.0 : floatVal;
        case 'Array(F64)':
        case '[F64]':
            try {
                if (value.startsWith('[') && value.endsWith(']')) {
                    return JSON.parse(value);
                }
                return value.split(',').map(v => {
                    const num = parseFloat(v.trim());
                    return isNaN(num) ? 0.0 : num;
                });
            } catch {
                return value.split(',').map(v => {
                    const num = parseFloat(v.trim());
                    return isNaN(num) ? 0.0 : num;
                });
            }
        default:
            return value;
    }
}

// Helper function to get parameter types from introspect data
async function getQueryParamTypes(client: HelixDB, queryName: string): Promise<Record<string, string>> {
    try {
        const introspectUrl = `${client.url}/introspect`;
        const introspectData = await makeHttpRequestWithAuth(introspectUrl);
        const paramTypes: Record<string, string> = {};

        if (introspectData && introspectData.queries) {
            const query = introspectData.queries.find((q: any) => q.name === queryName);
            if (query && query.parameters && typeof query.parameters === 'object') {
                for (const [paramName, paramType] of Object.entries(query.parameters)) {
                    if (typeof paramType === 'string') {
                        paramTypes[paramName] = paramType;
                    }
                }
            }
        }

        return paramTypes;
    } catch (error) {
        console.warn('Could not fetch parameter types:', error);
        return {};
    }
}

// Helper function to sort JSON objects (replicating Rust backend behavior)
function sortJsonObject(value: any): any {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: any = {};

        // Separate numeric keys, id key, and other keys
        const numericKeys: [string, any][] = [];
        let idKey: [string, any] | null = null;
        const otherKeys: [string, any][] = [];

        for (const [key, val] of Object.entries(value)) {
            const sortedVal = sortJsonObject(val);

            if (/^\d+$/.test(key)) {
                numericKeys.push([key, sortedVal]);
            } else if (key === 'id') {
                idKey = [key, sortedVal];
            } else {
                otherKeys.push([key, sortedVal]);
            }
        }

        // Sort numeric keys by numeric value
        numericKeys.sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

        // Add in order: numeric keys, id key, other keys
        for (const [k, v] of numericKeys) {
            sorted[k] = v;
        }
        if (idKey) {
            sorted[idKey[0]] = idKey[1];
        }
        for (const [k, v] of otherKeys) {
            sorted[k] = v;
        }

        return sorted;
    } else if (Array.isArray(value)) {
        return value.map(sortJsonObject);
    }

    return value;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ queryName: string }> }
) {
    const { queryName } = await params;
    return await handleQueryExecution(request, queryName);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ queryName: string }> }
) {
    const { queryName } = await params;
    return await handleQueryExecution(request, queryName);
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ queryName: string }> }
) {
    const { queryName } = await params;
    return await handleQueryExecution(request, queryName);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ queryName: string }> }
) {
    const { queryName } = await params;
    return await handleQueryExecution(request, queryName);
}

async function handleQueryExecution(request: NextRequest, queryName: string) {
    try {
        const client = createHelixClient();

        // Get query parameters from URL
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());

        // Get body parameters for POST/PUT requests
        let bodyParams: any = {};
        if (request.method === 'POST' || request.method === 'PUT') {
            try {
                const body = await request.json();
                if (typeof body === 'object' && body !== null) {
                    bodyParams = body;
                }
            } catch {
                // No JSON body or invalid JSON
            }
        }

        // Merge parameters (body parameters take precedence)
        const allParams = { ...queryParams, ...bodyParams };

        // Get parameter types and convert values appropriately
        const paramTypes = await getQueryParamTypes(client, queryName);
        const convertedParams: any = {};

        for (const [key, value] of Object.entries(allParams)) {
            if (typeof value === 'string' && paramTypes[key]) {
                convertedParams[key] = convertStringToType(value, paramTypes[key]);
            } else {
                convertedParams[key] = value;
            }
        }

        // Execute the query
        const result = await client.query(queryName, convertedParams);

        // Sort the result to match Rust backend behavior
        const sortedResult = sortJsonObject(result);

        return NextResponse.json(sortedResult);
    } catch (error) {
        console.error(`Error executing query '${queryName}':`, error);
        return NextResponse.json(
            {
                error: `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`,
                query: queryName
            },
            { status: 500 }
        );
    }
}
