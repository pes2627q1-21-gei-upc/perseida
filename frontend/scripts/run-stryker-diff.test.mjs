import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  changedRanges,
  fetchPrBaseRef,
  mutateTargets,
  parseArgs,
  resolveBaseBranch,
} from './run-stryker-diff.mjs';

const DIFF = `diff --git a/frontend/src/features/events/components/EventSheet.tsx b/frontend/src/features/events/components/EventSheet.tsx
index 1111111..2222222 100644
--- a/frontend/src/features/events/components/EventSheet.tsx
+++ b/frontend/src/features/events/components/EventSheet.tsx
@@ -12,0 +13 @@ import { EventPosts } from './EventPosts';
+import { EventPosts } from '../../posts/components/EventPosts';
@@ -150,2 +151,3 @@ export function EventSheet() {
-      </View>
-    </ScrollView>
+      </View>
+      <EventPosts eventId={event.id} />
+    </ScrollView>
@@ -200,3 +202,0 @@ function gone() {
-  a();
-  b();
-  c();
diff --git a/frontend/src/features/posts/components/PostItem.tsx b/frontend/src/features/posts/components/PostItem.tsx
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/frontend/src/features/posts/components/PostItem.tsx
@@ -0,0 +1,140 @@
+import { useState } from 'react';
`;

test('keeps only the added or changed lines of each file, as 1-based ranges', () => {
  assert.deepEqual(changedRanges(DIFF), {
    'src/features/events/components/EventSheet.tsx': [
      [13, 13],
      [151, 153],
    ],
    'src/features/posts/components/PostItem.tsx': [[1, 140]],
  });
});

test('a hunk that only deletes lines adds no range', () => {
  const ranges = changedRanges(DIFF)['src/features/events/components/EventSheet.tsx'];
  assert.ok(ranges.every(([start]) => start !== 202));
});

test('gives Stryker one file:start-end target per range, only for the files to mutate', () => {
  const ranges = changedRanges(DIFF);
  assert.deepEqual(mutateTargets(['src/features/events/components/EventSheet.tsx'], ranges), [
    'src/features/events/components/EventSheet.tsx:13-13',
    'src/features/events/components/EventSheet.tsx:151-153',
  ]);
});

const STRYKER_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/@stryker-mutator/core/dist/src',
);

/** Les peces reals de Stryker: com llegeix el rang `:inici-final` i com compara un glob amb un fitxer. */
async function strykerParts() {
  const { FileMatcher } = await import(pathToFileURL(`${STRYKER_SRC}/config/file-matcher.js`).href);
  const { MUTATION_RANGE_REGEX } = await import(
    pathToFileURL(`${STRYKER_SRC}/fs/mutate-pattern-constants.js`).href
  );
  return { FileMatcher, MUTATION_RANGE_REGEX };
}

const AWKWARD = [
  'src/app/(app)/chat/[eventId].tsx',
  'src/app/(app)/_layout.tsx',
  'src/app/(app)/outings/[id]/edit.tsx',
  'src/features/chat/hooks/useChatRoom.ts',
];

test('every target matches, with the glob engine of Stryker, exactly its own file and keeps its line range', async () => {
  const { FileMatcher, MUTATION_RANGE_REGEX } = await strykerParts();
  const ranges = Object.fromEntries(AWKWARD.map((file) => [file, [[3, 9]]]));
  const targets = mutateTargets(AWKWARD, ranges);
  assert.equal(targets.length, AWKWARD.length);
  targets.forEach((target, i) => {
    const parsed = MUTATION_RANGE_REGEX.exec(target);
    assert.ok(parsed, `${target} keeps a :from-to range`);
    assert.equal(`${parsed[3]}-${parsed[5]}`, '3-9');
    const matcher = new FileMatcher(parsed[1], false);
    assert.deepEqual(
      AWKWARD.filter((file) => matcher.matches(file)),
      [AWKWARD[i]],
      `${target} must match only ${AWKWARD[i]}`,
    );
  });
});

test('the targets of the real route files match them on disk', async () => {
  const { FileMatcher, MUTATION_RANGE_REGEX } = await strykerParts();
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const routes = AWKWARD.slice(0, 3).filter((file) => fs.existsSync(path.join(frontend, file)));
  assert.ok(routes.length > 0);
  for (const target of mutateTargets(
    routes,
    Object.fromEntries(routes.map((f) => [f, [[1, 2]]])),
  )) {
    const matcher = new FileMatcher(MUTATION_RANGE_REGEX.exec(target)[1], false);
    const cwd = process.cwd();
    process.chdir(frontend);
    try {
      assert.equal(routes.filter((file) => matcher.matches(file)).length, 1, target);
    } finally {
      process.chdir(cwd);
    }
  }
});

test('the base branch defaults to origin/develop and --pr-number is optional', () => {
  assert.deepEqual(parseArgs([]), { baseBranch: 'origin/develop', prNumber: null });
  assert.deepEqual(parseArgs(['--base-branch', 'origin/main']), {
    baseBranch: 'origin/main',
    prNumber: null,
  });
  assert.deepEqual(parseArgs(['--base-branch', 'origin/develop', '--pr-number', '130']), {
    baseBranch: 'origin/develop',
    prNumber: 130,
  });
});

test('a --pr-number that is not a positive integer is ignored', () => {
  for (const bad of ['', 'abc', '0', '-3', '1.5', '12; rm -rf /']) {
    assert.equal(parseArgs(['--pr-number', bad]).prNumber, null, bad);
  }
});

const exists =
  (...refs) =>
  (ref) =>
    refs.includes(ref);

test('a stacked PR mutates against its parent branch, not against the trunk github.base_ref reports', () => {
  assert.deepEqual(
    resolveBaseBranch({
      fallback: 'origin/develop',
      prBaseRef: 'feature/TG-64-peces-sala',
      refExists: exists('origin/develop', 'origin/feature/TG-64-peces-sala'),
    }),
    { baseBranch: 'origin/feature/TG-64-peces-sala', source: 'api' },
  );
});

test('an ordinary PR keeps its base when the API reports the same branch', () => {
  assert.deepEqual(
    resolveBaseBranch({
      fallback: 'origin/develop',
      prBaseRef: 'develop',
      refExists: exists('origin/develop'),
    }),
    { baseBranch: 'origin/develop', source: 'api' },
  );
});

test('it falls back to the given base when the API gave nothing', () => {
  for (const prBaseRef of [null, undefined, '']) {
    assert.deepEqual(
      resolveBaseBranch({ fallback: 'origin/develop', prBaseRef, refExists: exists() }),
      { baseBranch: 'origin/develop', source: 'fallback' },
    );
  }
});

test('it falls back when the parent branch was not fetched', () => {
  assert.deepEqual(
    resolveBaseBranch({
      fallback: 'origin/develop',
      prBaseRef: 'feature/gone',
      refExists: exists('origin/develop'),
    }),
    { baseBranch: 'origin/develop', source: 'fallback' },
  );
});

test('it never takes a base that could be read as an option or that has blanks', () => {
  for (const prBaseRef of ['--output=x', '-x', 'a b', 'a\nb']) {
    assert.equal(
      resolveBaseBranch({
        fallback: 'origin/develop',
        prBaseRef,
        refExists: () => true,
      }).source,
      'fallback',
      prBaseRef,
    );
  }
});

function fakeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  fn.calls = calls;
  return fn;
}

const ok = (body) => ({ ok: true, json: async () => body });

test('it asks the REST API for the PR and returns its real base branch', async () => {
  const fetchImpl = fakeFetch(ok({ base: { ref: 'feature/TG-64-peces-sala' } }));
  const ref = await fetchPrBaseRef({
    repository: 'org/repo',
    prNumber: 130,
    token: 'secret-token',
    fetchImpl,
  });
  assert.equal(ref, 'feature/TG-64-peces-sala');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://api.github.com/repos/org/repo/pulls/130');
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.ok(fetchImpl.calls[0].init.signal, 'the call has a timeout');
});

test('it uses GITHUB_API_URL and sends no Authorization header without a token', async () => {
  const fetchImpl = fakeFetch(ok({ base: { ref: 'develop' } }));
  await fetchPrBaseRef({
    repository: 'org/repo',
    prNumber: 7,
    apiUrl: 'https://ghe.example/api/v3',
    fetchImpl,
  });
  assert.equal(fetchImpl.calls[0].url, 'https://ghe.example/api/v3/repos/org/repo/pulls/7');
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, undefined);
});

test('every failure to read the real base gives null, so the caller keeps the fallback', async () => {
  const args = { repository: 'org/repo', prNumber: 130, token: 't' };
  for (const response of [
    new Error('network down'),
    { ok: false, status: 403, json: async () => ({ message: 'rate limit' }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ base: { ref: 42 } }) },
    {
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    },
  ]) {
    assert.equal(await fetchPrBaseRef({ ...args, fetchImpl: fakeFetch(response) }), null);
  }
});

test('it does not call the API without a repository or a PR number', async () => {
  const fetchImpl = fakeFetch(ok({ base: { ref: 'develop' } }));
  assert.equal(await fetchPrBaseRef({ repository: '', prNumber: 1, fetchImpl }), null);
  assert.equal(await fetchPrBaseRef({ repository: 'org/repo', prNumber: null, fetchImpl }), null);
  assert.equal(fetchImpl.calls.length, 0);
});
