# Plan: Bridge 経由の写真から EXIF を解析して位置情報を記録する

Status: design / discussion. **Document-only**, no code changes yet.

関連 issue: [#1222](https://github.com/receptron/mulmoclaude/issues/1222)

## ゴール

Bridge (Telegram / Slack / LINE) から受信した写真を、受信時に **自動で EXIF パース**して位置 (GPS) + 撮影日時 + カメラ情報を sidecar JSON に永続化する。
このデータレイヤーを土台に、後続の UI (タイムライン / 地図 / 旅行記 wiki 自動生成) を組み立てる。

## ユーザとの会話で確定した4点

issue #1222 の決定セクションそのまま:

| # | 項目 | 決定 |
|---|---|---|
| 1 | 用途 | (a) タイムライン + (b) 地図 + (c) 旅行記 wiki 自動生成 — **3つすべて** |
| 2 | 自動 vs オンデマンド | **default-on + Settings で opt-out 可能** |
| 3 | 対応 bridge | **Telegram / Slack / LINE** — bridge 共通実装、LINE は parse.ts 拡張 |
| 4 | EXIF 範囲 | **位置 + 撮影日時 + カメラ (make / model / lens)** — フル EXIF は将来拡張 |

3 用途すべてが蓄積データ前提なので **案 C ハイブリッド** (auto-hook + tool 公開) が必然。

## Why MulmoClaude

ファイルベースのワークスペース設計が、この機能の自然な置き場所を提供する:

- **写真は既に `data/attachments/YYYY/MM/<id>.<ext>` に物理保存されている** — bridge 経由でも UI ペースト経由でも同じ場所
- 位置情報の sidecar (`data/locations/...`) を **同じ workspace の隣ディレクトリ**に置けば、Obsidian / Finder 経由でも一覧できる
- 旅行記 wiki 自動生成は既存の wiki プラグイン (`data/wiki/pages/`) にそのまま markdown を書くだけ
- "AI に整理を任せる" 哲学と一致 (= ユーザが exif tools を覚える必要なし)

## アーキテクチャ

### データの流れ

```
[Bridge側]                 [Server側]                              [永続化]
Telegram / Slack /
  LINE 受信                                                          
   │                                                                
   ▼                                                                
msg.photo[] →            
  Attachment(mime,base64) ──▶ chat-service/socket.ts                 
                                 │ parseAttachments()                
                                 ▼                                   
                              saveAttachment() ────────▶ data/attachments/YYYY/MM/<id>.jpg
                                 │                                   
                                 ▼                                   
                              ★ NEW: post-save hook                  
                                 │ if (mime.startsWith("image/"))    
                                 │   await extractExif(filePath)     
                                 ▼                                   
                                                       data/locations/YYYY/MM/<id>.json
```

### 新規データ構造

#### `data/locations/<YYYY>/<MM>/<id>.json` (sidecar)

```json
{
  "photoPath": "data/attachments/2026/05/abc123.jpg",
  "photoId": "abc123",
  "extractedAt": "2026-05-08T07:14:32Z",
  "schemaVersion": 1,
  "exif": {
    "datetimeOriginal": "2026-04-15T13:22:08+09:00",
    "gps": {
      "latitude": 43.0642,
      "longitude": 141.3469,
      "altitude": 12.5
    },
    "camera": {
      "make": "SONY",
      "model": "ILCE-7CM2",
      "lens": "FE 24-70mm F2.8 GM"
    }
  }
}
```

設計判断:

- **`photoId` を file-name と一致させる** — `<id>.json` ⇔ `<id>.jpg` で 1:1 リレーション、後続クエリ簡単
- **`photoPath` を workspace-relative で保存** — 将来 wiki rebalance 等でパスが変わってもこちらは sidecar 単独で完結 (= 将来の絶対パス転送にも対応しやすい)
- **`gps` / `camera` は optional** — EXIF が無い画像 (スクリーンショット等) でも落ちずに `extractedAt` だけ書く
- **`schemaVersion: 1`** — 将来フル EXIF (絞り / SS / ISO) 拡張時の migrate 用

#### `WORKSPACE_DIRS.locations` の追加

```ts
// server/workspace/paths.ts
locations: "data/locations",
```

`EAGER_WORKSPACE_DIRS` には入れない (lazy create — 写真受信が無いユーザでは作らない)。

#### `AppSettings` に opt-out フラグ

```ts
// server/system/config.ts
export interface AppSettings {
  extraAllowedTools: string[];
  photoExif?: {
    /** デフォルト true。false にすると post-save hook で EXIF 抽出をスキップ。
     *  既に保存済みの sidecar は触らない (再 ON 時に自動再走査もしない、
     *  必要なら photo plugin の `kind: "rescan"` で手動キック)。 */
    autoCapture: boolean;
  };
}
```

## 実装レイヤ

### Layer 1: EXIF 抽出ライブラリ + post-save hook

新規ファイル: `server/utils/exif.ts`

```ts
import exifr from "exifr";

export interface ExifResult {
  datetimeOriginal?: string;
  gps?: { latitude: number; longitude: number; altitude?: number };
  camera?: { make?: string; model?: string; lens?: string };
}

export async function extractExif(absolutePath: string): Promise<ExifResult | null> {
  // exifr.parse は HEIC/JPEG/TIFF/RAW を網羅、deps ゼロ。
  // 失敗時は null を返してフォールバック扱い、throw しない。
}
```

**post-save hook** は `attachment-store.ts:115` の `saveAttachment` 末尾に追加:

```ts
// 新しく export する関数の追加 (= hook を集約)
const postSaveHooks: PostSaveHook[] = [];
export function registerPostSaveHook(hook: PostSaveHook) { postSaveHooks.push(hook); }

// saveAttachment の return 直前で fire-and-forget で hook を発火
// hook 失敗が attachment 保存自体を巻き戻さないこと (= best-effort)
// log は出すが throw しない
```

写真用 hook 実装は `server/workspace/photo-locations/hook.ts`:

```ts
registerPostSaveHook(async ({ relativePath, mimeType }) => {
  if (!mimeType.startsWith("image/")) return;
  if (loadSettings().photoExif?.autoCapture === false) return;
  await persistExifSidecar(relativePath);
});
```

### Layer 2: Runtime plugin (`@mulmoclaude/photo-plugin`)

[`extension-mechanisms.md`](../docs/extension-mechanisms.md) §3.3 の runtime plugin として実装。
Spotify / Recipe-book の雛形を踏襲。

提供する actions (= LLM が呼べる tool kinds):

- `kind: "extractExif"` — 単発: 写真パスを受けて EXIF を返す (即時、sidecar が無くても fs から都度読む)
- `kind: "lookupLocation"` — 写真パス → sidecar JSON の中身を返す
- `kind: "listLocations"` — `data/locations/` を全列挙、日付 / 範囲フィルタあり (タイムライン / 地図のデータ源)
- `kind: "rescan"` — `data/attachments/` を全走査して未処理写真の sidecar を再生成 (auto-capture を後で ON にした人向け、または既存写真の遡及処理)

View / Preview は最小限 — 簡易リストと地図表示プレースホルダ。本格的な UI は別 PR。

### Layer 3: bridge ごとの写真受信対応

#### Telegram (既に対応済み)

`packages/bridges/telegram/src/router.ts:113-160` で `msg.photo[]` の最大解像度を取得、`api.downloadFile()` で base64 → `Attachment` 化。**変更不要**。

#### Slack

`packages/bridges/slack/` で `event.files[]` を `slack.api.files.info` 経由で取得 → 既存の Attachment 形式に変換。
Slack は file 認証が要るので bot token を流用。実装はあるはずだが薄いので確認 + 必要なら拡張。

#### LINE

現在 `packages/bridges/line/src/parse.ts` の `extractIncomingLineMessage()` は **text only**:

```ts
if (event.message?.type !== "text") return null;
```

写真対応するには:

1. `event.message.type === "image"` の分岐を追加
2. LINE Messaging API の content 取得: `GET https://api-data.line.me/v2/bot/message/{messageId}/content` (要 channel access token)
3. 取得した binary を `Attachment{mimeType: "image/jpeg", data: base64}` に変換
4. `parseLineWebhookBody` の戻り値型に `IncomingLineMessage` の attachments フィールドを追加 (今は text 専用)

LINE API のレート制限 (data API は通常 API と別枠) も考慮要。

## Phased rollout

### PR-A: EXIF 抽出 + post-save hook + 永続化 (土台)

**何が入る**:
- `exifr` 依存追加 (root + spotify-plugin と並列の plugin 配置)
- `server/utils/exif.ts` (薄い wrapper)
- `server/utils/files/attachment-store.ts` に post-save hook 機構追加
- `server/workspace/photo-locations/` (hook 実装 + sidecar 永続化 IO)
- `WORKSPACE_DIRS.locations` 追加
- `AppSettings.photoExif.autoCapture` 追加 (default true)
- ユニットテスト: EXIF 抽出 (GPS あり / なし / HEIC / 壊れた JPEG)、hook の opt-out 挙動
- 統合テスト: ペースト経由で JPEG 上げて sidecar が生成される

**まだ無い**: tool / 別 bridge / UI

**ユーザ視点**: UI ペースト or Telegram (既に対応) 経由で写真送ると、裏で sidecar が生成される。手で `data/locations/` を見ると JSON が増えてる。

### PR-B: Runtime plugin (`@mulmoclaude/photo-plugin`) + Settings の opt-out スイッチ

**何が入る**:
- `packages/photo-plugin/` (Spotify と同形)
- 4 つの kind (`extractExif` / `lookupLocation` / `listLocations` / `rescan`)
- 簡易 View.vue (リストとカウント表示、地図はプレースホルダ)
- Settings に「写真の自動位置記録 (Auto-capture photo location)」トグル
- `server/plugins/preset-list.ts` に追加
- LLM 経由で「先週の写真の場所」みたいな質問が動く

**ユーザ視点**: chat で「最近の写真の位置情報を教えて」が動く。Settings から OFF にできる。

### PR-C: LINE bridge の写真受信対応 + 3 bridge の e2e 確認

**何が入る**:
- `packages/bridges/line/src/parse.ts` を拡張: image 型 event をハンドル
- LINE content 取得 API の wrapper (新規)
- Slack 側の files 経路の動作確認 + 必要なら拡張
- e2e: Telegram / Slack / LINE 各々で写真送信 → sidecar 生成までを smoke 検証
- docs: [`docs/extension-mechanisms.md`](../docs/extension-mechanisms.md) §3.7 に bridge ごとの写真対応マトリクス追記

**ユーザ視点**: Telegram / Slack / LINE どこからでも写真を送ると位置記録される。

## 依存関係 / 順序

PR-A → PR-B → PR-C の直列。
- PR-A は土台 (= データレイヤー)、これ単独でもユーザ価値あり (UI ペーストで動く)
- PR-B は土台に乗る tool 層、LLM ドリブン
- PR-C は外周の bridge 拡張、LINE の API 触るのが一番手間

UI レイヤー (タイムライン / 地図 / 旅行記 wiki 自動生成) は PR-A〜C の後に **別 plan** で扱う。
データが先に蓄積されないと UI 開発のテストデータが用意できないので、順序的にもこれが正しい。

## 安全性 (リスクと緩和策)

### リスク 1: プライバシー (GPS という機密データ)

**リスク**: GPS は機密情報。default-on にしているが、ユーザが認識していないと不快に感じる可能性。

**緩和**:
- 初回起動時に「写真の位置情報を自動記録します (Settings からオフにできます)」notification を出す
- Settings の項目に "**自動記録**" の説明文を明示
- データはすべてローカル `~/mulmoclaude/data/locations/` に留まる (= ネットワーク送信ゼロ)
- workspace ごとに有効/無効 (= 別 workspace で実験できる)

### リスク 2: 大量写真の同期処理がブロックする

**リスク**: 旅行から帰って 200 枚一気に送ったら post-save hook が同期で走って bridge を詰まらせる。

**緩和**:
- post-save hook は **fire-and-forget** で発火 (await しない、Promise を catch して log)
- attachment 保存の return path を遅らせない
- 並列度は exifr 自体が軽量なので CPU バウンド、I/O は細い

### リスク 3: EXIF 無し画像 (スクリーンショット等)

**リスク**: 一部の画像は EXIF が剥がされていたり最初から無い (スクショ、SNS ダウンロード)。

**緩和**:
- `extractExif()` が null を返す場合は sidecar を作らない (or `extractedAt` だけの空 sidecar を作る — どちらが良いか議論)
- 推奨: **作らない** (sidecar = 「位置情報がある」のシグナル、`data/locations/` の存在自体が "位置記録のある写真" を意味する設計)

### リスク 4: HEIC 対応 (iPhone のデフォルト)

**リスク**: iPhone は HEIC で送ってくるが Telegram は JPEG に変換してから送る (= 場合による)。

**緩和**:
- `exifr` は HEIC を含めて 5 形式対応済み
- bridge 側で mime を正しく伝搬すること (`image/heic` を Attachment.mimeType に入れる)

### リスク 5: bridge レート制限 (特に LINE Data API)

**リスク**: LINE は webhook 経由で来た messageId の content 取得は 60秒以内 + レート制限あり。

**緩和**:
- content 取得失敗時は warn ログ + Attachment は text-only 扱いで先に進む (写真は失われる)
- 失敗 attempt はリトライしない (= ユーザに「届かなかった」と伝わる方が良い)

### リスク 6: sidecar が attachment より先に消されると孤児

**リスク**: ユーザが手で `data/attachments/2026/05/abc.jpg` を削除したら sidecar `data/locations/2026/05/abc.json` が孤児に。

**緩和**:
- PR-B の `rescan` action に **孤児クリーンアップ** を含める (= sidecar の `photoPath` が存在しなければ削除)
- または別 lazy 処理: sidecar 読み出し時に `photoPath` 不在を検知して削除

## Open questions

1. **EXIF 無し画像の sidecar をどうするか** — リスク 3 で「作らない」と書いたが、「写真 ID が `data/locations/` に無い = 未処理 or 位置情報無し」の区別が要るかも。`status: "no-exif"` の空 sidecar を作る案もある。要決定。
2. **タイムゾーン** — EXIF の `DateTimeOriginal` には TZ が入らないことが多い (= ローカル時刻のみ)。GPS 座標から推定する? それとも UTC として扱う? 旅行記用途を考えると「撮影地のローカル時刻」が自然なので前者推し。
3. **バッチ処理 (rescan) のレート制御** — 1万枚一気に処理するときの並列度上限は? 当面 10 並列の Promise pool でよさそうだが要試運転。
4. **wiki への自動転記タイミング** — 旅行記 wiki 自動生成は本 plan のスコープ外だが、データレイヤーとしては「日付クラスタリング → 場所クラスタリング → wiki page 提案」の前段がここで揃う。次の plan で扱う。

## 参考実装

- `packages/bridges/telegram/src/router.ts:113-160` — bridge で写真受信して Attachment 化する完成形
- `server/utils/files/attachment-store.ts:115` — `saveAttachment` の choke point (post-save hook 追加先)
- `server/system/config.ts:20-29` — `AppSettings` の拡張先
- `packages/spotify-plugin/` — runtime plugin の reference (PR-B の雛形)
- `server/workspace/wiki-history/provision.ts` — workspace への自動 provision 処理 (auto-on のパターン参考)
- [`docs/extension-mechanisms.md`](../docs/extension-mechanisms.md) §3.3 — runtime plugin のフルパス
- [`docs/migrating-from-claude-code.md`](../docs/migrating-from-claude-code.md) §6.2 — hook 機構の現状 (Claude CLI 経由のもの、本 plan の post-save hook はそれとは別)
