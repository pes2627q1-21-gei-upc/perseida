// Responses a test leaves for later (TG-469). Every request of shared/api runs under a timeout, a
// timer that only stops when the request settles: a `new Promise(() => undefined)` that is never
// answered keeps it alive after the test and Jest cannot exit ("A worker process has failed to
// exit gracefully"). A test that needs a request to stay on its way (to see a screen while it
// loads) takes it from here and answers it once it is done.

import { cleanup } from '@testing-library/react-native';

import { problemResponse } from './apod';

/** A response that arrives when `answer` is called, so the test decides when. */
export function deferredResponse() {
  let answer!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => (answer = resolve));
  return { response, answer };
}

/**
 * The requests a test leaves on their way. `release()` goes in its `afterEach`: it unmounts what
 * the test rendered (so nothing reads the answers) and answers every request still open with a
 * 503, as many rounds as a retry needs, so no timer outlives the test.
 */
export function pendingResponses() {
  let open: ((response: Response) => void)[] = [];
  return {
    /** A request that stays on its way until `release()`. Use it as the answer of a mock. */
    neverAnswered(): Promise<Response> {
      const { response, answer } = deferredResponse();
      open.push(answer);
      return response;
    },
    async release(): Promise<void> {
      await cleanup();
      // A request that fails may be asked for again (a retry): answer those too.
      for (let round = 0; round < 5 && open.length > 0; round += 1) {
        const answers = open;
        open = [];
        answers.forEach((answer) => answer(problemResponse(503, 'SERVICE_UNAVAILABLE')));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}
