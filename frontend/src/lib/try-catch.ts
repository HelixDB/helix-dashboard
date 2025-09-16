/**
 * Represents a successful result containing data and no error
 * @template T The type of the data
 */
export type Success<T> = {
  data: T;
  error: null;
};

/**
 * Represents a failed result containing an error and no data
 * @template E The type of the error
 */
export type Failure<E = string> = {
  data: null;
  error: E;
};

/**
 * A discriminated union type representing either a successful or failed result
 * @template T The type of the data in case of success
 * @template E The type of the error in case of failure
 */
export type Result<T, E = string> = Success<T> | Failure<E>;

/**
 * Type guard to check if a Result is successful
 * @template T The type of the data in the Result
 * @template E The type of the error in the Result
 * @param result The Result to check
 * @returns True if the Result is successful (contains data), false otherwise
 */
export const isSuccess = <T, E = string>(
  result: Result<T, E>,
): result is Success<T> => result.error === null;

/**
 * Type guard to check if a Result is a failure
 * @template T The type of the data in the Result
 * @template E The type of the error in the Result
 * @param result The Result to check
 * @returns True if the Result is a failure (contains error), false otherwise
 */
export const isFailure = <T, E = string>(
  result: Result<T, E>,
): result is Failure<E> => result.error !== null;

/**
 * Wraps a synchronous function in a try-catch block and returns a Result
 * @template T The type of the data returned by the function
 * @template E The type of the error in case of failure
 * @param fn The synchronous function to execute
 * @param errorTransformer Optional function to transform caught errors into a desired format
 * @param shouldRethrow Optional predicate function that determines if an error should be rethrown
 * @returns A Result containing either the data or an error
 * @throws Will rethrow if shouldRethrow returns true for the error
 */
export function tryCatch<T, E = string>(
  fn: () => T,
  errorTransformer?: (error: unknown) => E,
  shouldRethrow?: (error: unknown) => boolean,
): Result<T, E> {
  try {
    const data = fn();
    return { data, error: null };
  } catch (error) {
    if (shouldRethrow?.(error)) {
      throw error;
    }

    if (errorTransformer) {
      return { data: null, error: errorTransformer(error) };
    }

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return { data: null, error: errorMessage as E };
  }
}

/**
 * Wraps a Promise or async function in a try-catch block and returns a Result
 * @template T The type of the data returned by the Promise
 * @template E The type of the error in case of failure
 * @param promise The Promise or async function to execute
 * @param errorTransformer Optional function to transform caught errors into a desired format
 * @param shouldRethrow Optional predicate function that determines if an error should be rethrown
 * @returns A Promise that resolves to a Result containing either the data or an error
 * @throws Will rethrow if shouldRethrow returns true for the error
 */
export async function asyncTryCatch<T, E = string>(
  promise: Promise<T> | (() => Promise<T>),
  errorTransformer?: (error: unknown) => E,
  shouldRethrow?: (error: unknown) => boolean,
): Promise<Result<T, E>> {
  try {
    const data = await (typeof promise === 'function' ? promise() : promise);
    return { data, error: null };
  } catch (error) {
    if (shouldRethrow?.(error)) {
      throw error;
    }

    if (errorTransformer) {
      return { data: null, error: errorTransformer(error) };
    }

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return { data: null, error: errorMessage as E };
  }
}

