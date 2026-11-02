# フォークに残す差し込み口の設計

親仕様: scratch-gui の差し込み口は [kubohiroya/scratch-gui#111](https://github.com/kubohiroya/scratch-gui/pull/111) で開いた。この文書は、残る本家ファイルの改変を**すべて**差し込み口へ置き換えるための設計と段階順を定める。

## 測った差分（2026-11-02）

`TurboWarp/scratch-gui` との merge-base は `06b2edf2`。`kubohiroya/scratch-gui` の `develop` との差分は **125ファイル・+10,208 / -120**（追加90、改変35）。

改変35件の内訳:

| 区分 | 件数 | 扱い |
|---|---|---|
| インフラ・メタ | 6 | `package.json` / `package-lock.json` / `webpack.config.js` / CI workflow / README / .gitignore |
| family を import する本家ファイル | 6 | 差し込み口が運ぶ |
| その他の本家ファイルへの改変 | 23 | 差し込み口が運ぶ、または本家相当の汎用変更として残す |

追加90件のうちソースは約34本（最大は `tw-plus-extension-registrar.js` 371行）、残りはテスト・docs・CSS。これらはフォーク独自なので、差し込み口が通れば本リポジトリへ移せる。

## 差し込み口の形

`src/lib/tw-plus-integration.js` の `plusIntegration()` が返す1つのオブジェクトに、名前の付いた口を並べる。口はすべて**任意**で、無ければフォークは今の本家の動作に落ちる。これは #111 が開いた形の素直な拡張で、口を増やしてもフォーク側に増えるのは「その口を参照する数行」だけになる。

```js
/** @returns {PlusIntegration|null} */
export const plusIntegration = () => null;

// PlusIntegration
// {
//   installExtensionHost?(vm, settings): unknown        // #111 で開いた口
//   modals?: readonly string[]                          // reducers/modals.js
//   securityModals?: Readonly<Record<string, string>>   // tw-security-manager-constants.js
//   themeTokens?: {light?: object, dark?: object}       // lib/themes/gui/*.js
//   translations?: Readonly<Record<string, object>>     // lib/tw-translations/index.js
//   registerBlockShapes?(ScratchBlocks): void           // lib/blocks.js
//   alwaysMountedModals?: readonly React.ComponentType[] // components/gui/gui.jsx
//   shouldIgnoreKeyEvent?(event): boolean               // lib/vm-listener-hoc.jsx
//   reduceProjectState?(state, action): object|null     // reducers/project-state.js
//   stageControls?(vm): ControlsService                 // containers/controls.jsx
//   cameraControls?(vm): ControlsService                // containers/controls.jsx
//   extensionLibrary?: object                           // containers/extension-library.jsx
//   extensionGuiApi?: object                            // lib/tw-extension-gui-api.js
//   addons?: object                                     // addons/api.js, entry.js, hooks.js
// }
```

CSS はモジュールではないので、同じ仕組みでは運べない。空の `src/css/tw-plus-integration.css` をフォークに置き、配信側が `NormalModuleReplacementPlugin` で自分のスタイルシートへ差し替える。JSと同じく、置き換えはバンドル構築時に解決される。

## 23件の割り当て

| 本家ファイル | 行数 | 運ぶ口 |
|---|---|---|
| `reducers/modals.js` | +8 | `modals`。`blockEditorModal` の名前と初期値、open/close を名前の一覧から作る |
| `reducers/project-state.js` | +9 | `reduceProjectState`。`CANCEL_SECURITY_LOAD` の case を口へ出す |
| `lib/tw-security-manager-constants.js` | +1 | `securityModals`。`LoadExtensions` を追加する |
| `lib/themes/gui/light.js` | +4 | `themeTokens.light`。`block-editor-*` の3色 |
| `lib/themes/gui/dark.js` | +4 | `themeTokens.dark`。同上 |
| `lib/tw-translations/index.js` | +2 | `translations`。`block-editor.json` の読み込みを口へ |
| `lib/blocks.js` | +2 | `registerBlockShapes`。文書ソースのハット形状の登録 |
| `lib/vm-listener-hoc.jsx` | +2 | `shouldIgnoreKeyEvent`。`.twextsec-modal` 内のキー操作を本家に渡さない判定 |
| `components/gui/gui.jsx` | +2 | `alwaysMountedModals`。`TWDocumentEditor` の常時マウント |
| `containers/controls.jsx` | +22 | `stageControls` / `cameraControls` |
| `components/controls/controls.jsx` | +36 | 同上（受け取った service を描く部分） |
| `containers/extension-library.jsx` | +40 -2 | `extensionLibrary` |
| `lib/tw-extension-gui-api.js` | +8 | `extensionGuiApi` |
| `addons/api.js` | +10 -3 | `addons` |
| `addons/entry.js` | +9 | `addons` |
| `addons/hooks.js` | +1 | `addons` |
| `components/controls/controls.css` | +31 | CSS差し込み口 |
| `components/library/library.css` | +24 | CSS差し込み口 |
| `components/modal/modal.css` | +5 -2 | CSS差し込み口 |
| `components/stage/stage.css` | +1 | CSS差し込み口 |
| `components/tw-security-manager-modal/data-url.css` | +1 -1 | CSS差し込み口 |
| `components/modal/modal.jsx` | +3 -2 | **口にしない。** `hideCloseButton` はPlus固有でない汎用prop。本家に出せる形なので、汎用変更として残すか上流へ送る |
| `components/library/library.jsx` | +27 -10 | **口にしない。** `busy` 中の操作を抑える汎用変更。同上 |

`test/unit/components/controls.test.jsx` は `controls.jsx` の口と同時に移す。

## 残すものと残さないもの

**残す**: 上の表の「運ぶ口」を参照する数行ずつ、`modal.jsx` と `library.jsx` の汎用変更2件、そしてインフラ6件のうち `webpack.config.js`・CI workflow・README・.gitignore。

**残さない**: `package.json` と `package-lock.json` の family 4依存。これが最後の段階になる。両ファイルは本家もフォークも触るので、上流からのマージで毎回衝突する。衝突が消えることが、この作業全体の目的のひとつ。

## 段階順

1つの段階は「口を1つ開ける」「その口にフォークの実装を載せ替える」「統合E2Eで動作が変わらないことを確かめる」の3つで閉じる。壊れたらその段階だけを戻せる。

| 段階 | 内容 | 依存 |
|---|---|---|
| 3 | `installExtensionHost` の口（#111）と、配信側の空モジュール差し替え | 済・[PR #57](https://github.com/kubohiroya/turbowarp-plus-editor/pull/57) |
| 4 | 表の口を一覧で足す: `modals` / `securityModals` / `themeTokens` / `translations` / `registerBlockShapes` / `shouldIgnoreKeyEvent`。いずれも数行で、互いに依存しない | 3 |
| 5 | CSS差し込み口と、CSS 5件の移送 | 3 |
| 6 | `alwaysMountedModals` と `TWDocumentEditor` の移送 | 4 |
| 7 | `reduceProjectState` と `CANCEL_SECURITY_LOAD` | 4 |
| 8 | `stageControls` / `cameraControls` と `controls.jsx` 2件・`camera-control/*`・`tw-stage-controls.js`・`tw-camera-controls.js` の移送 | 4 |
| 9 | `extensionLibrary` / `extensionGuiApi` / `addons` | 4 |
| 10 | 独自34本の残り（registrar・project-loader・authoring・permission-ui・packager ほか）を1本ずつ | 4〜9 |
| 11 | `package.json` / `package-lock.json` から family 4依存を外す。`prepare-core.ts` のコピーと `verifyHost` の照合を、本リポジトリの lock 基準の確認へ置き換える | 10 |

段階4は6つの口をまとめて足すが、どれも「一覧を受け取って混ぜる」だけで互いに依存しないので、1つのPRで足しても壊れ方が分かれない。段階8と9は実装の移送を伴うので、口を開ける変更と移送を別のPRに分ける。

## 検証

各段階の期待する結果は「何も変わらない」こと。CIの統合E2E（GUIとpackagerのclone、`prepare-core`、`build:pages`、Playwright）とローダーE2Eが以前と同じに通れば、その口は通っている。口を足しただけで実装を載せていない段階では、フォーク側の実装がそのまま使われるので、動作は定義上変わらない。

本リポジトリ側には、各段階で「まだ何も渡さない」または「この口にこれを渡す」ことを固定する単体テストを置く。段階3の `test/plus-integration.test.ts` がその最初の例。
