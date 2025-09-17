import { error, info, debug as loggerDebug, success, warn } from './logger';
import type { Result } from './try-catch';

// Type for path parameters in URL
// Represents path parameters used to replace placeholders in URL paths.
type Params = Record<string, unknown>;

// Type for query parameters in URL
// Represents query string parameters to be appended to URLs.
type SearchParams = Record<string, unknown>;

// HTTP error details
// Represents an HTTP error with status code and message.
export type HttpError = {
  status: number;
  message: string;
};

// Extended options for fetch with additional features
// Extends the standard RequestInit interface from fetch, adding type-safe
// support for URL manipulation, content handling, and debugging features.
export type FetchOptions<
  TBody = unknown,
  TSearchParams extends SearchParams = SearchParams,
  TParams extends Params = Params,
> = Omit<RequestInit, 'body' | 'signal'> & {
  searchParams?: TSearchParams;
  params?: TParams;
  body?: TBody;
  baseUrl?: string;
  credentials?: 'include' | 'same-origin';
  debug?: boolean; // Enable request/response debugging
};

// Default config that can be overridden globally
export const defaultFetchConfig = {
  includeCookies: true,
  headers: {},
  debug: false,
};

// Configure global defaults for all swiftFetch requests
export function configureFetch(
  config: Partial<typeof defaultFetchConfig>,
): void {
  Object.assign(defaultFetchConfig, config);
}

//=============================================================================
// PUBLIC API
//=============================================================================

// Performs a network request with enhanced features and typed responses.
export async function swiftFetch<
  TData,
  TBody = unknown,
  TSearchParams extends SearchParams = SearchParams,
  TParams extends Params = Params,
>(
  input: RequestInfo | URL,
  options?: FetchOptions<TBody, TSearchParams, TParams>,
): Promise<Result<TData, HttpError>> {
  // Prepare URL
  const targetUrl = typeof input !== 'string' || input.startsWith('http')
    ? input
    : buildUrl(input, options?.searchParams, options?.params, options?.baseUrl);
  
  // Prepare fetch options
  const fetchOptions = prepareFetchOptions<TBody>(options);
  const debug = options?.debug ?? defaultFetchConfig.debug;

  try {
    if (debug) {
      const urlString = typeof targetUrl === 'string' ? targetUrl : targetUrl.toString();
      info(`🚀 Request: ${urlString}`, {
        prefix: 'Fetch',
        tags: ['request', options?.method || 'GET'],
      });
      
      const bodyData = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined;
      loggerDebug({
        method: fetchOptions.method || 'GET',
        headers: fetchOptions.headers,
        body: bodyData,
      }, { prefix: 'Fetch Details' });
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (response.ok) {
      const data = await processResponse<TData>(response);
      return { data, error: null };
    }

    const contentType = response.headers.get('content-type');
    const httpError = contentType?.includes('application/json')
      ? await handleJsonErrorResponse(response, response.status)
      : handleNonJsonErrorResponse(response, response.status);

    const result = { data: null, error: httpError };

    if (debug) {
      if (result.data) {
        success('Response received', { prefix: 'Fetch', tags: ['response'] });
        loggerDebug(result.data, { prefix: 'Response Data' });
      } else if (result.error) {
        error(`Error: ${result.error.message} (Status: ${result.error.status})`, {
          prefix: 'Fetch',
          tags: ['error'],
        });
      }
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      error: { status: 0, message },
    };
  }
}

//=============================================================================
// URL HANDLING
//=============================================================================

// Prepare the target URL for a fetch request
function buildUrl(
  endpoint: string,
  searchParams?: SearchParams,
  params?: Params,
  customBaseUrl?: string,
): string {
  const baseUrl = customBaseUrl ?? 'http://localhost:3000';
  
  // Replace path parameters
  const processedEndpoint = params
    ? Object.entries(params).reduce((acc, [key, value]) => {
        const encodedValue = encodeURIComponent(String(value));
        return acc
          .replace(`[[...${key}]]`, encodedValue)
          .replace(`[...${key}]`, encodedValue)
          .replace(`[${key}]`, encodedValue)
          .replace(`:${key}`, encodedValue)
          .replace(`{${key}}`, encodedValue);
      }, endpoint)
    : endpoint;
  
  if (!searchParams) {
    return `${baseUrl}${processedEndpoint}`;
  }

  const queryString = buildQueryString(searchParams);
  if (!queryString) {
    return `${baseUrl}${processedEndpoint}`;
  }

  const connector = processedEndpoint.includes('?') ? '&' : '?';
  return `${baseUrl}${processedEndpoint}${connector}${queryString}`;
}


function buildQueryString(params: SearchParams): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    
    if (typeof value !== 'object' || value === null) {
      searchParams.append(key, String(value));
    } else if (Array.isArray(value)) {
      const allPrimitives = value.every(item => item === null || typeof item !== 'object');
      if (allPrimitives) {
        searchParams.append(key, value.join(','));
      } else {
        searchParams.append(key, JSON.stringify(value));
      }
    } else if (value.toString !== Object.prototype.toString) {
      searchParams.append(key, value.toString());
    } else {
      try {
        searchParams.append(key, JSON.stringify(value));
      } catch (err) {
        warn(`Could not serialize object for param ${key}`, { prefix: 'URL Params' });
        loggerDebug(err instanceof Error ? err.message : String(err));
      }
    }
  }

  return searchParams.toString();
}



//=============================================================================
// REQUEST PREPARATION
//=============================================================================

// Prepares standardized fetch options by merging defaults and provided options.
function prepareFetchOptions<TBody>(options?: FetchOptions<TBody>): RequestInit {
  if (!options) return {};

  const { searchParams, params, baseUrl, body, debug, ...standardOptions } = options;
  const headers = new Headers();

  headers.set('Content-Type', 'application/json');

  for (const [key, value] of Object.entries(defaultFetchConfig.headers)) {
    headers.set(key, value as string);
  }

  if (standardOptions?.headers) {
    if (standardOptions.headers instanceof Headers) {
      for (const [key, value] of standardOptions.headers.entries()) {
        headers.delete(key);
        headers.append(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(standardOptions.headers)) {
        headers.set(key, value as string);
      }
    }
  }

  const fetchOptions: RequestInit = {
    ...standardOptions,
    credentials: options.credentials ?? 'same-origin',
    headers,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  return fetchOptions;
}

//=============================================================================
// RESPONSE HANDLING
//=============================================================================

async function processResponse<TData>(response: Response): Promise<TData> {
  if (response.status === 204) {
    return null as unknown as TData;
  }

  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    const result = await response.json();
    return (result?.data !== undefined ? result.data : result) as TData;
  }

  if (contentType?.includes('text/')) {
    return (await response.text()) as unknown as TData;
  }

  return (await response.blob()) as unknown as TData;
}


async function handleJsonErrorResponse(
  response: Response,
  status: number,
): Promise<HttpError> {
  try {
    const errorPayload = await response.json();
    const fallbackMessage = response.statusText || `HTTP error ${status}`;

    if (
      errorPayload &&
      typeof errorPayload === 'object' &&
      errorPayload.error &&
      typeof errorPayload.error === 'object'
    ) {
      const message = typeof errorPayload.error.message === 'string'
        ? errorPayload.error.message
        : fallbackMessage;
      
      return { status, message };
    }

    return { status, message: fallbackMessage };
  } catch {
    return {
      status,
      message: response.statusText || `HTTP error ${status}`,
    };
  }
}

function handleNonJsonErrorResponse(
  response: Response,
  status: number,
): HttpError {
  const message = response.statusText || `HTTP error ${status}`;
  return { status, message };
}
