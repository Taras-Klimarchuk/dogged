import {
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

export interface RetryTimeoutPolicyOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  /** Return false for errors that should never be retried (e.g. a 4xx that will fail again). Defaults to retrying everything. */
  isRetryable?: (error: unknown) => boolean;
}

export function createRetryTimeoutPolicy(options: RetryTimeoutPolicyOptions = {}) {
  const { timeoutMs = 2000, maxAttempts = 3, isRetryable } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(errorFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff(),
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
    consecutiveFailuresToOpen = 3,
    halfOpenAfterMs = 30_000,
    isRetryable,
  } = options;
  const errorFilter = isRetryable ? handleWhen(isRetryable) : handleAll;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(errorFilter, {
    maxAttempts,
    backoff: new ExponentialBackoff(),
  });
  const breakerPolicy = circuitBreaker(errorFilter, {
    halfOpenAfter: halfOpenAfterMs,
    breaker: new ConsecutiveBreaker(consecutiveFailuresToOpen),
  });

  // retry (outer) -> circuit breaker -> timeout (inner), per attempt.
  return wrap(retryPolicy, breakerPolicy, timeoutPolicy);
}
