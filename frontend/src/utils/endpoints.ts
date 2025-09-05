interface ApiEndpointInfo {
    path: string;
    method: string;
    query_name: string;
    parameters: Array<{
        name: string;
        param_type: string;
    }>;
}

interface EndpointConfig {
    name: string;
    method: string;
    url: string;
    description: string;
    params: Array<{
        name: string;
        type: string;
        param_type: string;
        required: boolean;
        description: string;
    }>;
    body?: any;
}

function convertToFrontendFormat(apiEndpoint: ApiEndpointInfo): EndpointConfig {
    const name = apiEndpoint.query_name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();

    let description = '';
    if (apiEndpoint.query_name.startsWith('create')) {
        description = `Create a new ${extractEntityName(apiEndpoint.query_name)}`;
    } else if (apiEndpoint.query_name.startsWith('get')) {
        description = `Retrieve ${extractEntityName(apiEndpoint.query_name)} data`;
    } else if (apiEndpoint.query_name.startsWith('update')) {
        description = `Update existing ${extractEntityName(apiEndpoint.query_name)}`;
    } else if (apiEndpoint.query_name.startsWith('delete')) {
        description = `Delete ${extractEntityName(apiEndpoint.query_name)} from database`;
    } else {
        description = `Execute ${apiEndpoint.query_name} query`;
    }

    const params = apiEndpoint.parameters.map(param => ({
        name: param.name,
        type: 'query',
        param_type: param.param_type,
        required: true,
        description: generateParamDescription(param.name, param.param_type)
    }));

    let body: any = undefined;
    if (apiEndpoint.method === 'POST' || apiEndpoint.method === 'PUT') {
        body = {};
        apiEndpoint.parameters
            .filter(p => !p.name.endsWith('_id') && p.name !== 'id')
            .forEach(param => {
                body[param.name] = getDefaultValueForType(param.param_type);
            });
    }

    const url = `http://localhost:8080/api/query/${apiEndpoint.query_name}`;

    return {
        name,
        method: apiEndpoint.method,
        url,
        description,
        params,
        body
    };
}

function extractEntityName(queryName: string): string {
    const withoutPrefix = queryName
        .replace(/^(create|get|update|delete|add|remove|assign|link)/, '')
        .replace(/^(All|By)/, '');

    return withoutPrefix
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim()
        .replace(/s$/, '') || 'entity';
}

function generateParamDescription(paramName: string, paramType: string): string {
    if (paramName.endsWith('_id') || paramName === 'id') {
        const entityName = paramName.replace('_id', '').replace(/([A-Z])/g, ' $1').toLowerCase();
        return `${entityName.charAt(0).toUpperCase()}${entityName.slice(1)} identifier`;
    }

    const readable = paramName
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();

    return `${readable.charAt(0).toUpperCase()}${readable.slice(1)} value`;
}

function getDefaultValueForType(paramType: string): any {
    const normalizedType = paramType.toLowerCase();

    switch (normalizedType) {
        case 'string':
            return '';
        case 'id':
            return '';
        case 'i32':
        case 'i64':
        case 'u32':
        case 'u64':
        case 'u128':
            return 0;
        case 'f64':
            return 0.0;
        case 'vec<f64>':
        case 'array(f64)':
            return [];
        default:
            return '';
    }
}

export function convertParamValue(value: string, paramType: string): any {
    if (!value.trim()) {
        return getDefaultValueForType(paramType);
    }

    const normalizedType = paramType.toLowerCase();

    switch (normalizedType) {
        case 'string':
            return value;
        case 'id':
            return value;
        case 'i32':
        case 'i64':
        case 'u32':
        case 'u64':
        case 'u128':
            const intVal = parseInt(value, 10);
            return isNaN(intVal) ? 0 : intVal;
        case 'f64':
            const floatVal = parseFloat(value);
            return isNaN(floatVal) ? 0.0 : floatVal;
        case 'vec<f64>':
        case 'array(f64)':
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed.map(v => {
                        const num = parseFloat(v);
                        return isNaN(num) ? 0.0 : num;
                    });
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

function generateEndpointKey(queryName: string): string {
    return queryName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
}

export async function fetchEndpoints(): Promise<Record<string, EndpointConfig>> {
    try {
        const response = await fetch('http://localhost:8080/api/endpoints');
        if (!response.ok) {
            throw new Error(`Failed to fetch endpoints: ${response.status}`);
        }

        const apiEndpoints: ApiEndpointInfo[] = await response.json();
        const endpoints: Record<string, EndpointConfig> = {};

        apiEndpoints.forEach(apiEndpoint => {
            const key = generateEndpointKey(apiEndpoint.query_name);
            endpoints[key] = convertToFrontendFormat(apiEndpoint);
        });

        return endpoints;
    } catch (error) {
        console.error('Failed to fetch endpoints from backend:', error);
        return {};
    }
}

let endpointsCache: Record<string, EndpointConfig> | null = null;

export async function getEndpoints(): Promise<Record<string, EndpointConfig>> {
    if (endpointsCache) {
        return endpointsCache;
    }

    endpointsCache = await fetchEndpoints();
    return endpointsCache;
}


export function clearEndpointsCache(): void {
    endpointsCache = null;
}