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

CSS には口を作らない。当初は空のスタイルシートを同じ仕組みで差し替える案だったが、5件の中身を読んで取り消した（下の「CSSに口を作らない理由」）。

## 23件の割り当て

| 本家ファイル | 行数 | 運ぶ口 |
|---|---|---|
| `reducers/modals.js` | +8 | `modals`。`blockEditorModal` の名前と初期値、open/close を名前の一覧から作る |
| `reducers/project-state.js` | +9 → +7 | `createCancelSecurityLoad`。必要な値を**引数で渡す**。既定はフォーク、ホストが上書き（[scratch-gui#114](https://github.com/kubohiroya/scratch-gui/pull/114)） |
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
| `components/controls/controls.css` | +31 | 口にしない。フォーク独自UIの新クラスなので `controls.jsx` と一緒に移す（段階8） |
| `components/library/library.css` | +24 | 口にしない。同じく新クラスなので library の変更と一緒に移す（段階9） |
| `components/modal/modal.css` | +5 -2 | **口にしない。** モバイルでoverlayがはみ出すのを直す汎用修正。`modal.jsx` と同じ扱い |
| `components/stage/stage.css` | +1 | `@import "./preview-reload.css"` の1行は残す。中身の `preview-reload.css` を差し替え対象にする（段階8） |
| `components/tw-security-manager-modal/data-url.css` | +1 -1 | **口にしない。** textareaの高さを 5rem→10rem にする汎用修正。同上 |
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
| 5 | ~~CSS差し込み口~~ 取り消し。CSSは段階8・9と汎用変更へ振り分けた | — |
| 6 | `alwaysMountedModals` と `TWDocumentEditor` の移送 | 4 |
| 7 | `createCancelSecurityLoad`（値を引数で渡し、既定をホストが上書き） | 4 |
| 8 | `stageControls` / `cameraControls` と `controls.jsx` 2件・`camera-control/*`・`tw-stage-controls.js`・`tw-camera-controls.js` の移送 | 4 |
| 9 | `extensionLibrary` / `extensionGuiApi` / `addons` | 4 |
| 10 | 独自34本の残り（registrar・project-loader・authoring・permission-ui・packager ほか）を1本ずつ | 4〜9 |
| 11 | `package.json` / `package-lock.json` から family 4依存を外す。`prepare-core.ts` のコピーと `verifyHost` の照合を、本リポジトリの lock 基準の確認へ置き換える | 10 |

段階4は6つの口をまとめて足すが、どれも「一覧を受け取って混ぜる」だけで互いに依存しないので、1つのPRで足しても壊れ方が分かれない。段階8と9は実装の移送を伴うので、口を開ける変更と移送を別のPRに分ける。

## 検証

各段階の期待する結果は「何も変わらない」こと。CIの統合E2E（GUIとpackagerのclone、`prepare-core`、`build:pages`、Playwright）とローダーE2Eが以前と同じに通れば、その口は通っている。口を足しただけで実装を載せていない段階では、フォーク側の実装がそのまま使われるので、動作は定義上変わらない。

本リポジトリ側には、各段階で「まだ何も渡さない」または「この口にこれを渡す」ことを固定する単体テストを置く。段階3の `test/plus-integration.test.ts` がその最初の例。

## CSSに口を作らない理由（2026-11-02 訂正）

当初は空の `src/css/tw-plus-integration.css` を置いて差し替える案を書いたが、5件の差分を読んで取り消した。CSSはCSSモジュールで、クラス名はビルド時にハッシュされる。配信側が渡す全域スタイルシートからは、本家モジュールのクラスを狙えない。

実際の5件は3種類だった。

- `controls.css`(+31) と `library.css`(+24) は、`.extension-control` / `.custom-content` / `.custom-library` / `.extended-tags` といった**新しいクラスの追加**で、同じコンポーネントのフォーク独自JSXが `styles.extensionControl` のように参照している。全域スタイルシートではなく、そのコンポーネントの変更と一緒に移すのが正しい。
- `stage.css`(+1) は `@import "./preview-reload.css"` の1行だけ。import文はフォークに残り、差し替えの対象になるのは中身の `preview-reload.css`（259行、フォーク独自）。
- `modal.css`(+5 -2) と `data-url.css`(+1 -1) は Plus固有ではない。前者はモバイルで overlay が viewport からはみ出すのを `width/height: 100vw/100vh` で直すもの、後者は data URL を貼る textarea の高さを 5rem から 10rem にするもの。`modal.jsx` の `hideCloseButton` と `library.jsx` の `busy` と同じ「汎用変更として残すか上流へ送る」扱いにする。

口を作る前に中身を読んだので、使われない仕組みをフォークに足さずに済んだ。残りの段階でも、口を開ける前にその口が運ぶ差分を読む。

## 段階7の取り消しを撤回する（2026-11-02）

下の「段階7を取り消す理由」は誤りだった。ホストがGUI内部の値を **import** できないのは事実だが、**引数で渡せば答えは書ける**。case を次の形にすればよい。

```js
case CANCEL_SECURITY_LOAD:
    return createCancelSecurityLoad(initialState, defaultProjectId, LoadingState, hostIntegration());
```

既定はフォークに置き、ホストが渡したときだけ上書きする。何も渡されなければ既定が走るので、フォークは単体でも今までどおり動く。既定をフォークから出す形も試したが、そちらは既存の取消テストがホストの用意を必要とし、素のフォークから機能が消える。実装は [scratch-gui#114](https://github.com/kubohiroya/scratch-gui/pull/114)。

**この手は他の段階にも効く。** 「GUI内部の値が必要だから運べない」という理由は、値を引数で渡すことで解けるものが多い。残りの段階では、口を諦める前にこの形を先に検討する。段階5（CSS）の取り消しは理由が別（CSSモジュールのクラス名がビルド時にハッシュされ、全域スタイルシートから狙えない）なので変わらない。

以下は撤回した判断の記録。残す理由は、同じ誤りを繰り返さないため。

## 段階7を取り消す理由（2026-11-02、撤回済み）

`reducers/project-state.js` の `CANCEL_SECURITY_LOAD` を口へ出す案も取り消す。case の中身がこれだった。

```js
case CANCEL_SECURITY_LOAD:
    return Object.assign({}, initialState, {
        loadingState: LoadingState.FETCHING_NEW_DEFAULT,
        projectId: defaultProjectId
    });
```

`initialState` も `LoadingState` も `defaultProjectId` もこの reducer の内部で、ホストからは触れない。つまりホストはこの case を書けない。口を開けても渡せるものがない。

唯一の利用者 `lib/tw-extension-security-cancel.js`(35行) も移せない。6つの reducer（project-state / project-title / tw / modals / menus / mode）の action creator を dispatch していて、どれもGUI内部だからだ。呼び出し元は `sb-file-uploader-hoc.jsx` と `vm-manager-hoc.jsx` の2つで、こちらは family を import する改変ファイルなので別の段階で扱う。

そもそも「読み込みを取り消して既定の作品へ戻る」という状態遷移自体に Plus 固有のものはない。Plus 固有なのは**きっかけ**（拡張の読み込みの取消・失敗）だけで、それは上の2つのHOCにある。`modal.jsx` の `hideCloseButton` と同じく、汎用変更として残すか上流へ送る側に分類する。

## 段階1は完了していた（2026-11-02）

`src/containers/tw-custom-extension-modal.jsx` と `src/components/tw-custom-extension-modal/` を本家と比べたところ差分がなかった。カスタム拡張画面の接続外しは済んでいる。

## 取り消した2つの段階から言えること

段階5と段階7は、どちらも「運ぶ対象を読む前に口の形を決めた」ために出てきた取り消しだった。段階8以降では、口を設計する前にその口が運ぶコードと、それがGUI内部の何に触れているかを先に読む。運べない理由はたいてい「GUI内部の値を必要とする」ことに集約される。
