import assert from 'node:assert/strict';
import { test } from 'node:test';

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
