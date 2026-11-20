import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { changedRanges, mutateTargets } from './run-stryker-diff.mjs';

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
