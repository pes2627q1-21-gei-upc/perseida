// Public configuration used by the API client in tests.
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test';

// Tests run in Catalan, whatever language the machine running them uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./src/shared/i18n').default.changeLanguage('ca');

// The timers of TanStack Query (the garbage collection of a query or a mutation lasts 5 minutes,
// and survives `client.clear()` when the screen unmounts after it) must not keep the process
// alive: an unref'd timer still fires, but Jest can exit without waiting for it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { timeoutManager } = require('@tanstack/react-query');

const unref = (timer) => {
  if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
  return timer;
};
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => unref(setTimeout(callback, delay)),
  clearTimeout: (timer) => clearTimeout(timer),
  setInterval: (callback, delay) => unref(setInterval(callback, delay)),
  clearInterval: (timer) => clearInterval(timer),
});
