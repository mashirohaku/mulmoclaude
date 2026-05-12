# Plan: function-stringify インラインスクリプトのリント / テスト網羅 (#1244)

`src/utils/image/imageRepairInlineScript.ts` と `src/utils/html/iframeHeightReporterScript.ts` は、iframe 内で動く JS を template-literal 文字列で保持しているため ESLint / typecheck / 挙動テストが全部素通りになっている。これを **function-stringify パターン** で解消する。

## このPR (PR 1) のスコープ

`imageRepairInlineScript.ts` で形を固める。`iframeHeightReporterScript.ts` への適用は別 PR。

## 設計

### Before

```ts
export const IMAGE_REPAIR_INLINE_SCRIPT = `
  document.addEventListener("error", function (event) {
    const target = event.target;
    if (!target) return;
    const pattern = ${IMAGE_REPAIR_PATTERN.toString()};
    // ...60 行ぶんのロジック...
  }, true);
`.trim();
```

### After

```ts
// 実関数 — ESLint / typecheck / 直接 import してテスト可能
export function repairImageErrorTarget(
  target: EventTarget | null,
  pattern: RegExp,
  patternEncoded: RegExp,
): void {
  if (!target) return;
  // ...同じロジック、TS の型で守られる...
}

// インラインスクリプト = 関数を toString して IIFE で包む
export const IMAGE_REPAIR_INLINE_SCRIPT = [
  "(function () {",
  `  var handler = ${repairImageErrorTarget.toString()};`,
  '  document.addEventListener("error", function (e) {',
  `    handler(e.target, ${IMAGE_REPAIR_PATTERN.toString()}, ${IMAGE_REPAIR_PATTERN_ENCODED.toString()});`,
  "  }, true);",
  "})();",
].join("\n");
```

### 不変条件

- `IMAGE_REPAIR_INLINE_SCRIPT` 文字列の **public な shape は維持** (server splicer / composable がそのまま使える)
- `injectImageRepairScript` の API は変更なし
- `findRepairTarget` は composable から使われているので残す (新関数とロジック共有しても良いが、本 PR では単に `repairImageErrorTarget` 内で同等処理を持つ独立実装にする — 必要なら follow-up で重複排除)

## 実装ステップ

1. `imageRepairInlineScript.ts` を refactor:
   - `repairImageErrorTarget(target, pattern, patternEncoded)` を新規 export
   - `IMAGE_REPAIR_INLINE_SCRIPT` をその `.toString()` から組み立てる
2. テスト追加 (`test/utils/image/test_imageRepairInlineScript.ts` に追記):
   - mock `<img>` (`{ tagName: "IMG", dataset: {}, src: "/wrong/prefix/artifacts/images/foo.png" }`) を渡して `img.src === "/artifacts/images/foo.png"` になることを assert
   - 同 `<source>`、`<picture>` 内の `<source>`、`<audio>`/`<video>` の `<source>` 子要素も同様
   - `dataset.imageRepairTried` が立つ / 二度目は no-op
   - encoded 形 (`artifacts%2Fimages%2Ffoo.png`) のリペア
   - `src` に target なしの場合は no-op
   - 不正 `decodeURIComponent` 入力時は throw せず no-op
   - 既存の string-level invariant テストはそのまま温存
3. `yarn typecheck` / `yarn lint` / `yarn test` 全部緑

## アウトオブスコープ

- `iframeHeightReporterScript.ts` への適用 — 別 PR
- `findRepairTarget` と新 `repairImageErrorTarget` のロジック重複排除 — 別 PR (本 PR は最小変更)
- E2E テストの追加 — 既存 e2e-live のカバレッジで十分 (`fix-l-w-s-04-image-repair-encoded` で実装済み)

## ノート

- `Function.toString()` は tsc 通過後の JS を返す。プロジェクト の `target` は `ES2022` 想定なのでソース原型のままで通る (関数宣言は `function` のまま、`for..of` も `for..of` のまま)
- iframe の null-origin sandbox 内では `decodeURIComponent` などのグローバルは普通に使える
- 関数引数で patterns を受けるので、関数本体は patterns を closure 経由で参照しない (= testable)
