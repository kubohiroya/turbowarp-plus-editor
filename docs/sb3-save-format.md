# Issue #45: 「形式を指定して保存」の語彙の置き場所

親仕様: https://github.com/kubohiroya/turbowarp-plus-editor/issues/45

Issue #45 のDoD 1件目「語彙と変換を共通パッケージへ切り出すか、置き場所を決める」に対する決定とその根拠。紙芝居App側のrc問題（[kamishibai-app#1110](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1110)）と独立に決められる範囲だけを扱う。

## 対象の語彙

紙芝居App の PR [#1109](https://github.com/kubohiroya/turbowarp-kamishibai-app/pull/1109) ブランチ `feat/sb3/plus-extension-loader` の `src/builder/sb3-save-format.ts`。import文を1つも持たない。

| export | 種別 |
|---|---|
| `Sb3SavePayload` = `extensions` \| `source` \| `assets` | 語彙 |
| `Sb3SaveFormat` = `remote` \| `cached` \| `embedded-file` \| `embedded-data` | 語彙 |
| `sb3SavePayloads` / `sb3SaveFormats` | 語彙 |
| `Sb3SaveSelection` / `Sb3SaveFormatSupport` | 語彙 |
| `normalizeSb3SaveSelection` | 形の検証（共通）＋対応可否の拒否（実装固有） |
| `sb3SaveFormatSupport` / `sb3SupportedSaveFormats` / `describeSb3SaveFormats` | 実装固有の表に依存 |
| `unsupported` 表・`projectAssetReason`（非export） | 実装固有 |

## 決定1: 共有できるのは語彙と形の検証だけで、対応可否の表は共有しない

`unsupported` 表の理由文は紙芝居AppのCLIを指している（`--source` を省く、`build-dsl4 --asset-config`、`convert-dsl4-assets --to project`、`saveProjectSb3DontZip` がVM経由で落とす話）。本Editorの保存UIの対応可否はこれと一致しない。

- `extensions: cached` は拡張ローダー 0.2.0 の `cached` source形で初めて可能になった。配信中は 0.2.1（#44、#46、#48）。
- `source` の形式変換は `@kubohiroya/turbowarp-document-source` が所有する。
- `assets` の形式変換はアセット所有側（[#1113](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1113)）。

表をそのまま共有すると、保存UIが「`--source` を省いてください」のようなCLIの理由で拒否することになる。したがって共通パッケージは対応可否を**注入で受け取る**。

```ts
// 共通パッケージが持つもの
export type Sb3SavePayload = 'extensions' | 'source' | 'assets';
export type Sb3SaveFormat = 'remote' | 'cached' | 'embedded-file' | 'embedded-data';
export const sb3SavePayloads: readonly Sb3SavePayload[];
export const sb3SaveFormats: readonly Sb3SaveFormat[];
export interface Sb3SaveSelection { /* 既存のまま */ }
export interface Sb3SaveFormatSupport { readonly supported: boolean; readonly reason?: string; }

/** 各実装が自分の対応可否を渡す。拒否には何が足りないかを必ず書かせる。 */
export interface Sb3SaveCapabilities {
  readonly format: (payload: Sb3SavePayload, format: Sb3SaveFormat) => Sb3SaveFormatSupport;
  readonly projectAssets: () => Sb3SaveFormatSupport;
}

/** 既存の拒否表（`payload:format` → 理由）からcapabilitiesを組み立てる。 */
export function sb3SaveCapabilities(refusals?: Sb3SaveRefusals): Sb3SaveCapabilities;

export function sb3SaveFormatSupport(
  payload: Sb3SavePayload, format: Sb3SaveFormat, capabilities: Sb3SaveCapabilities,
): Sb3SaveFormatSupport;
export function sb3SupportedSaveFormats(
  payload: Sb3SavePayload, capabilities: Sb3SaveCapabilities): readonly Sb3SaveFormat[];
export function normalizeSb3SaveSelection(
  input: unknown, capabilities: Sb3SaveCapabilities): Sb3SaveSelection;
export function describeSb3SaveFormats(capabilities: Sb3SaveCapabilities): string;
```

`assetsAsProjectAssets` の拒否も実装固有（移植元の理由文は `convert-dsl4-assets --to project` を指す）なので、`projectAssets()` として同じ注入に載せる。

紙芝居App側は現在の表をそのまま `support` として渡せば、CLIの振る舞いと診断文は変わらない。本Editorの保存UIは自分の表を渡す。

## 決定2: 置き場所は新しい依存なしパッケージとする

利用者は5箇所になる: 紙芝居AppのCLI（Node）、保存UI（`turbowarp-document-editor`、ブラウザ）、`turbowarp-extension-loader`（extensions変換）、`turbowarp-document-source`（source変換）、アセット所有側（assets変換）。既存パッケージを調べた結果、どれも層が合わない。

| 候補 | 却下の理由 |
|---|---|
| `@kubohiroya/turbowarp-document-source` | AppとUIの両方が既に依存しているが、所有するのは**文書**の参照種別。extensionsとassetsは文書ではない。ローダーがこのパッケージへ依存することになり依存方向が逆。`embedded-file` が別の意味で衝突する（決定3）。 |
| `@kubohiroya/turbowarp-extension-loader` | `cached` source形を所有するが拡張専用。document-sourceとアセット所有側がローダーへ依存することになる。 |
| `@kubohiroya/sb3-toolchain` | SB3の層で、Appは既に依存している。しかしexportはroot1つだけで、`rolldown` / `music-metadata` / `yaml` に依存し `engines.node >= 24`。ブラウザの保存UIから読めない。 |
| `@kubohiroya/turbowarp-extension-manifest` | 依存なしの契約パッケージだが、名前と目的が拡張manifest専用。 |

新パッケージ（候補名 `@kubohiroya/turbowarp-sb3-save-format`）は、SB3を保存する境界で3つのpayloadの格納形を言うという実際の層に一致し、5つの利用者すべてから読めて、どれにも依存しない。中身は上記のexportだけで、依存ゼロ・ランタイムなし。

## 実装の状況（2026-11-02）

ユーザーの指示により、このパッケージを作成し、[kubohiroya/turbowarp-sb3-save-format](https://github.com/kubohiroya/turbowarp-sb3-save-format) へpushした（初回コミット `65ba6d2`、`main`）。他の同族パッケージと同じくpublic。作成時はpublicでの作成がこのセッションの権限で拒否されたため一度privateで作り、ユーザーが `gh repo edit --visibility public` でpublicへ変更した。`@kubohiroya/turbowarp-extension-manifest` と同じ構成（MPL-2.0、pnpm、vitest、`dist` と `src` を同梱、英語README.mdと日本語README.ja.md）。

- `pnpm run typecheck` 成功、`vitest run` 19件成功、`tsc -p tsconfig.build.json` 成功、`pnpm pack --dry-run` 成功。
- テストには移植元の拒否表を要約したfixtureを置き、`describeSb3SaveFormats` が切り出し前と同じ `extensions: remote|cached|embedded-file|embedded-data; source: kept as built; assets: kept as built` を返すことを確認している。
- 依存はdevDependenciesの `typescript` と `vitest` だけで、実行時依存はゼロ。

新しいremote repositoryの作成とnpm公開は未実施で、ユーザーの明示承認を待つ。それまで語彙の正本は紙芝居App の `sb3-save-format.ts` に置いたままにし、本Editorからは参照しない。紙芝居App側の差し替え（現在の `unsupported` 表と `projectAssetReason` を `sb3SaveCapabilities` へ渡す）も、公開後の別作業とする。

## 決定3: `embedded-file` の二つの意味を混ぜない

`@kubohiroya/turbowarp-document-source` の `DocumentSourceKind` は `embedded-file` / `url` / `yaml-blocks` / `schema-blocks` で、`normalizeDocumentSource` が `location`（`sb3` \| `https`）と `representation`（`source` \| `yaml-blocks` \| `schema-blocks`）を独立に導出する。

保存形式の `Sb3SaveFormat` は `location` を細かくしたもので、`representation` とは直交する。

| `Sb3SaveFormat`（`source` payload） | document-source 側 |
|---|---|
| `remote` | `location: https`、SB3には何も残さない |
| `cached` | `location: https` ＋ 検証済みバイト列をSB3に保持。対応する種別は今はない（[#1112](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1112)） |
| `embedded-file` | `location: sb3`、ZIP内のファイル |
| `embedded-data` | `location: sb3`、`project.json` の中 |

document-source は `sb3` と `https` を区別するが、`sb3` のバイト列を**どう**格納するかは区別しない。その区別がまさに保存形式の語彙が足すものなので、`DocumentSourceKind` と `Sb3SaveFormat` は別の型のままにし、片方をもう片方のaliasにしない。

## 本パッケージでの作業

この決定の記録だけ。保存UIは `@kubohiroya/turbowarp-document-editor`、payloadごとの変換は各所有パッケージに置く方針（Issue #45 の範囲）を変えない。
