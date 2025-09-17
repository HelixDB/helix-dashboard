import { describe, expect, it } from 'vitest';
import type { HttpError } from './fetch';
import { isFailure, isSuccess, asyncTryCatch, tryCatch } from './try-catch';

describe('Try-Catch Module', () => {
  describe('Synchronous functionality', () => {
    it('should return data for successful sync function', () => {
      const result = tryCatch(() => 'sync success');

      expect(isSuccess(result)).toBe(true);
      expect(result.data).toBe('sync success');
      expect(result.error).toBeNull();
    });

    it('should return error for failed sync function', () => {
      const result = tryCatch(() => {
        throw new Error('sync failure');
      });

      expect(isFailure(result)).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBe('sync failure');
    });

    it('should handle JSON parsing with sync version', () => {
      const validJson = '{"name": "test"}';
      const invalidJson = '{"name": test}'; // missing quotes

      const successResult = tryCatch(() => JSON.parse(validJson));
      expect(isSuccess(successResult)).toBe(true);
      expect(successResult.data).toEqual({ name: 'test' });

      const failureResult = tryCatch(() => JSON.parse(invalidJson));
      expect(isFailure(failureResult)).toBe(true);
      expect(failureResult.error).toContain('Unexpected token');
    });

    it('should work with custom error transformer for sync', () => {
      const errorTransformer = (err: unknown) => ({
        type: 'SYNC_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });

      const result = tryCatch(
        () => {
          throw new Error('sync error');
        },
        errorTransformer,
      );

      expect(isFailure(result)).toBe(true);
      expect(result.error).toEqual({
        type: 'SYNC_ERROR',
        message: 'sync error',
      });
    });

    it('should rethrow errors when shouldRethrow returns true for sync', () => {
      const shouldRethrow = (err: unknown) => {
        return err instanceof Error && err.message.includes('critical');
      };

      // This should not rethrow
      const result1 = tryCatch(
        () => {
          throw new Error('normal error');
        },
        undefined,
        shouldRethrow,
      );
      expect(isFailure(result1)).toBe(true);

      // This should rethrow
      expect(() =>
        tryCatch(
          () => {
            throw new Error('critical error');
          },
          undefined,
          shouldRethrow,
        ),
      ).toThrow('critical error');
    });
  });

  describe('Asynchronous functionality', () => {
    it('should return data for successful promise', async () => {
      const result = await asyncTryCatch(Promise.resolve('success'));

      expect(isSuccess(result)).toBe(true);
      expect(result.data).toBe('success');
      expect(result.error).toBeNull();
    });

    it('should return error for failed promise', async () => {
      const result = await asyncTryCatch(Promise.reject(new Error('failure')));

      expect(isFailure(result)).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBe('failure');
    });

    it('should handle async functions', async () => {
      const asyncFunc = async () => 'async success';
      const result = await asyncTryCatch(asyncFunc());

      expect(isSuccess(result)).toBe(true);
      expect(result.data).toBe('async success');
    });
  });

  describe('Custom error handling', () => {
    // Define a custom error type for HTTP errors
    interface ApiError {
      status: number;
      message: string;
      code?: string;
    }

    // Error transformer function
    const errorToApiError = (err: unknown): ApiError => {
      if (err instanceof Error) {
        return {
          status: 500,
          message: err.message,
        };
      }
      return {
        status: 500,
        message: String(err),
      };
    };

    it('should transform errors with a custom transformer', async () => {
      const result = await asyncTryCatch<string, ApiError>(
        Promise.reject(new Error('API error')),
        errorToApiError,
      );

      expect(isFailure(result)).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        status: 500,
        message: 'API error',
      });
    });

    it('should work with complex error objects', async () => {
      // Simulate an HTTP error object
      const httpError = {
        status: 404,
        message: 'Resource not found',
        code: 'NOT_FOUND',
      };

      const customErrorTransformer = (err: unknown): ApiError => {
        if (typeof err === 'object' && err !== null && 'status' in err) {
          return err as ApiError;
        }
        return errorToApiError(err);
      };

      const result = await asyncTryCatch<string, ApiError>(
        Promise.reject(httpError),
        customErrorTransformer,
      );

      expect(isFailure(result)).toBe(true);
      expect(result.error).toEqual(httpError);
    });

    it('should handle HTTP status code errors', async () => {
      // Mock function that simulates fetch with error
      async function mockHttpRequest(): Promise<string> {
        throw {
          status: 403,
          message: 'Forbidden',
        };
      }

      // Use HTTP error transformer
      const httpErrorTransformer = (err: unknown): HttpError => {
        if (typeof err === 'object' && err !== null && 'status' in err) {
          const httpErr = err as { status: number; message: string };
          return {
            status: httpErr.status,
            message: httpErr.message,
          };
        }
        return {
          status: 0,
          message: err instanceof Error ? err.message : String(err),
        };
      };

      const result = await asyncTryCatch<string, HttpError>(
        mockHttpRequest(),
        httpErrorTransformer,
      );

      expect(isFailure(result)).toBe(true);
      expect(result.error).toEqual({
        status: 403,
        message: 'Forbidden',
      });
    });
  });

  describe('Error rethrow functionality', () => {
    it('should rethrow errors when shouldRethrow returns true', async () => {
      const shouldRethrow = (err: unknown) => {
        return err instanceof Error && err.message.includes('critical');
      };

      // This should not rethrow
      const result1 = await asyncTryCatch(
        Promise.reject(new Error('normal error')),
        undefined,
        shouldRethrow,
      );
      expect(isFailure(result1)).toBe(true);

      // This should rethrow
      await expect(
        asyncTryCatch(
          Promise.reject(new Error('critical error')),
          undefined,
          shouldRethrow,
        ),
      ).rejects.toThrow('critical error');
    });

    it('should work with custom error types and rethrow', async () => {
      const errorTransformer = (err: unknown): HttpError => {
        return {
          status: err instanceof Error ? 500 : 0,
          message: err instanceof Error ? err.message : String(err),
        };
      };

      const shouldRethrow = (err: unknown) => {
        return err instanceof Error && err.message.includes('security');
      };

      // This should be transformed but not rethrown
      const result = await asyncTryCatch<string, HttpError>(
        Promise.reject(new Error('regular error')),
        errorTransformer,
        shouldRethrow,
      );

      expect(isFailure(result)).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect((result.error as HttpError).status).toBe(500);

      // This should be rethrown
      await expect(
        asyncTryCatch<string, HttpError>(
          Promise.reject(new Error('security violation')),
          errorTransformer,
          shouldRethrow,
        ),
      ).rejects.toThrow('security violation');
    });
  });
});
