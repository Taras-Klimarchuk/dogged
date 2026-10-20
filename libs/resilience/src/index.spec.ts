import { BrokenCircuitError } from 'cockatiel';
import {
  createRetryTimeoutBreakerPolicy,
  createRetryTimeoutPolicy,
} from './index.js';
import type { BreakerState } from './index.js';

const fail = () => Promise.reject(new Error('down'));

describe('resilience hooks', () => {
  it('reports each retry and the final give-up', async () => {
    const onRetry = vi.fn();
    const onGiveUp = vi.fn();
    const policy = createRetryTimeoutPolicy({
      maxAttempts: 2,
      initialDelayMs: 1,
      onRetry,
      onGiveUp,
    });

    await expect(policy.execute(fail)).rejects.toThrow('down');

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('reports the initial closed state, then open once the breaker trips', async () => {
    const states: BreakerState[] = [];
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 1,
      initialDelayMs: 1,
      consecutiveFailuresToOpen: 2,
      onBreakerStateChange: (state) => states.push(state),
    });

    expect(states).toEqual(['closed']);

    await expect(policy.execute(fail)).rejects.toThrow();
    await expect(policy.execute(fail)).rejects.toThrow();

    expect(states).toContain('open');
  });

  it('reports half-open and closed again after the breaker recovers', async () => {
    const states: BreakerState[] = [];
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 0,
      consecutiveFailuresToOpen: 1,
      halfOpenAfterMs: 10,
      onBreakerStateChange: (state) => states.push(state),
    });

    await expect(policy.execute(fail)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await policy.execute(() => Promise.resolve('ok'));

    expect(states).toEqual(['closed', 'open', 'half-open', 'closed']);
  });

  it('reports calls rejected by an open breaker, without retrying them', async () => {
    const onRetry = vi.fn();
    const onReject = vi.fn();
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 0,
      consecutiveFailuresToOpen: 1,
      onRetry,
      onReject,
    });

    await expect(policy.execute(fail)).rejects.toThrow('down');
    expect(onReject).not.toHaveBeenCalled();

    await expect(policy.execute(fail)).rejects.toBeInstanceOf(BrokenCircuitError);
    await expect(policy.execute(fail)).rejects.toBeInstanceOf(BrokenCircuitError);

    expect(onReject).toHaveBeenCalledTimes(2);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('works without any hooks', async () => {
    const policy = createRetryTimeoutBreakerPolicy({ maxAttempts: 0 });

    await expect(policy.execute(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
