import { isAxiosError } from 'axios';
import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  ExponentialBackoff,
  circuitBreaker,
  handleAll,
  handleWhen,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';

// A 4xx means the server rejected this specific request and will reject it
// again on retry, so it must not be retried or count against a breaker.
// Network errors, timeouts, and 5xx are all genuinely worth retrying.
export function isRetryableHttpError(error: unknown): boolean {
  if (isAxiosError(error) && error.response) {
    return error.response.status >= 500;
  }
  return true;
}

export interface RetryTimeoutPolicyOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that should never be retried (e.g. a 4xx that will fail again). Defaults to retrying everything. */
  isRetryable?: (error: unknown) => boolean;
}

export function createRetryTimeoutPolicy(options: RetryTimeoutPolicyOptions = {}) {
  const {
    timeoutMs = 2000,
    maxAttempts = 3,
    initialDelayMs = 128,
    maxDelayMs = 30_000,
    isRetryable,
  } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(errorFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff({
      initialDelay: initialDelayMs,
      maxDelay: maxDelayMs,
    }),
  });

  return wrap(retryPolicy, timeoutPolicy);
}

export interface RetryTimeoutBreakerPolicyOptions extends RetryTimeoutPolicyOptions {
  consecutiveFailuresToOpen?: number;
  halfOpenAfterMs?: number;
}

export function createRetryTimeoutBreakerPolicy(
  options: RetryTimeoutBreakerPolicyOptions = {},
) {
  const {
    timeoutMs = 2000,
    maxAttempts = 3,
    initialDelayMs = 128,
    maxDelayMs = 30_000,
    consecutiveFailuresToOpen = 3,
    halfOpenAfterMs = 30_000,
    isRetryable,
  } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;
  // An open breaker rejects instantly; retrying that would only sleep through
  // the backoff schedule against a breaker that can't close yet.
  const retryFilter = handleWhen(
    (error) =>
      !(error instanceof BrokenCircuitError) && (isRetryable?.(error) ?? true),
  );

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(retryFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff({
      initialDelay: initialDelayMs,
      maxDelay: maxDelayMs,
    }),
  });
  const breakerPolicy = circuitBreaker(errorFilter, {
    halfOpenAfter: halfOpenAfterMs,
    breaker: new ConsecutiveBreaker(consecutiveFailuresToOpen),
  });

  // retry (outer) -> circuit breaker -> timeout (inner), per attempt.
  return wrap(retryPolicy, breakerPolicy, timeoutPolicy);
}
