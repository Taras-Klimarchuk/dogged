import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  circuitBreaker,
  handleAll,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';

export interface RetryTimeoutPolicyOptions {
  timeoutMs?: number;
  maxAttempts?: number;
}

export function createRetryTimeoutPolicy(options: RetryTimeoutPolicyOptions = {}) {
  const { timeoutMs = 2000, maxAttempts = 3 } = options;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(handleAll, {
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
  } = options;

  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const retryPolicy = retry(handleAll, {
    maxAttempts,
    backoff: new ExponentialBackoff(),
  });
  const breakerPolicy = circuitBreaker(handleAll, {
    halfOpenAfter: halfOpenAfterMs,
    breaker: new ConsecutiveBreaker(consecutiveFailuresToOpen),
  });

  // retry (outer) -> circuit breaker -> timeout (inner), per attempt.
  return wrap(retryPolicy, breakerPolicy, timeoutPolicy);
}
