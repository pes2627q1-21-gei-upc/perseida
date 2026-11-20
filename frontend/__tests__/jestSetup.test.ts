import { timeoutManager } from '@tanstack/react-query';

// TG-469: a mutation that was on screen leaves a 5 minute garbage-collection timer behind when
// the screen goes away (and `client.clear()` does not cancel it). Left as it is, it keeps Jest
// from exiting ("A worker process has failed to exit gracefully"), so jest.setup.js makes every
// timer of TanStack Query one that does not keep the process alive.
describe('jest.setup: the timers of TanStack Query', () => {
  it('do not keep the process alive', () => {
    const timer = timeoutManager.setTimeout(() => undefined, 300_000) as unknown as {
      hasRef(): boolean;
    };

    try {
      expect(timer.hasRef()).toBe(false);
    } finally {
      timeoutManager.clearTimeout(timer as never);
    }
  });

  it('still fire when their time comes', async () => {
    const fired = jest.fn();
    timeoutManager.setTimeout(fired, 5);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled', async () => {
    const fired = jest.fn();
    const timer = timeoutManager.setTimeout(fired, 5);
    timeoutManager.clearTimeout(timer);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fired).not.toHaveBeenCalled();
  });
});
