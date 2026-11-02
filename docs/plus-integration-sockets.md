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

## 信頼するカタログを配信側へ移す（2026-11-03）

`src/lib/tw-plus-trusted-extensions.js`（104行）とそのテスト（60行）をフォークから外し、`site/trusted-extensions.js` としてこちらで持つようにした。「このカタログに載っている拡張は、TurboWarp が自分のギャラリーを扱うのと同じく、確認なしで非サンドボックスで動かす」という判断は、**配信物についての言明**であってエディタの機能ではない。誰が配信するかで答えが変わるものは、配信する側が持つ。

フォークに残るのは口が2つだけになった。

```js
export const hostTrustedCatalog = integration => integration?.trustedExtensions?.catalog || trustsNothing;
export const hostTrustedDigests = async (manifest, integration) =>
    (await integration?.trustedExtensions?.listDigests?.(manifest)) || [];
```

既定は「何も信頼しない」。素のフォークでは全ての拡張がレビュー画面を通るだけで、壊れはしない。利用者3箇所（`containers/tw-security-manager.jsx`、`lib/tw-plus-extension-host.js`、`playground/plus-packager.js`）はこの口を1行で呼ぶ形になった。

### ダイジェストの照合はフォークに残した

当初は `createDigestTrustedCatalog`（単一HTMLが埋め込みダイジェストで信頼を決める部分）も一緒に移し、`forDigests` という3つめの口を開けた。これは**誤りで、テストが落ちて気づいた**。単一HTMLに埋め込まれるランタイムは `scripts/site/build-extension-runtime.cts` が `src/lib/tw-plus-extension-host.js` から作るが、この束だけは差し込み口を差し替えていない（差し替える必要がない: 配信物の中では誰にも訊けない）。だから移した先のホストには訊けず、配信されたHTMLでダイジェスト照合が全て失敗する——つまり受け取った人が毎回レビューを求められる回帰になる。

境界はこう引いた。

- **どのダイジェストを埋め込むか**（カタログに載っているものを選ぶ）= 配信側。`listDigests` の口で訊く。
- **埋め込まれたダイジェストと実バイト列を照合するか**= フォーク。HTMLは誰にも訊けないので、判断は作った時点でダイジェストとして同梱され、照合だけがフォークで走る。

**訊ける相手がいるかどうかが、口を開けられるかどうかを決める。** 段階7で「GUI内部の値は引数で渡せる」と分かったのと対になる制約で、残りの段階でも、口を開ける前に「その口を呼ぶコードは、どの束に入って誰に訊くのか」を先に確かめる。

## 拡張ホスト一式を配信側へ移す（2026-11-03）

フォークから出したもの（計830行）と、その先を分けた理由。

| 移したもの | 行数 | 置き場所 |
| --- | --- | --- |
| `tw-plus-extension-host.js` の結線 | 114 | `site/extension-host/host.js` |
| `tw-plus-extension-registrar.js` | 371 | `site/extension-host/registrar.js` |
| `tw-plus-project-loader.js` | 202 | `site/extension-host/project-loader.js` |
| `tw-plus-permission-ui.js` | 139 | `site/extension-host/permission-ui.js` |

フォークに残るのは `startupPlusExtensionHost`（口を呼ぶ29行）と `isPlusPermissionDenied`（1行）だけになった。ホストを持たないフォークでは拡張の読み込みそのものが無くなる——本家と同じ挙動で、これが「最小限の差分」の意味するところ。

### 「訊ける相手がいるか」を今回も先に確かめた

[信頼カタログの段階](#信頼するカタログを配信側へ移す2026-11-03)で分かった制約をそのまま適用した。単一HTMLに同梱されるランタイム束は差し込み口を差し替えられないので、**束の作り方を変えた**: `scripts/site/build-extension-runtime.cts` のエントリをフォークの `src/lib/tw-plus-extension-host.js` から配信側の `site/extension-host/runtime.js` へ移した。配信物の中で訊く相手がいないなら、訊かずに済むように作る側を変えればよい。

### VMのモジュールは引数で渡す

`registrar.js` は `central-dispatch` を使う。これは**シングルトン**で、`dispatch.services.runtime !== vm.runtime` という検査が入っている。配信側で `import` すると解決先が別コピーになり、この検査が落ちて全ての拡張登録が失敗しうる。webpackのaliasで1コピーに寄せる手もあるが、**フォークが自分のインスタンスを引数で渡す**形にした。

```js
vmModules: {ScratchCommon, createTranslate, staticFetch, dispatch}
```

これで同一性が構造的に保証される。aliasの設定ミスという失敗モードが消え、Nodeのテストでも配信側のモジュールが（scratch-vm抜きで）そのまま読める。段階7の「GUI内部の値は引数で渡せる」と同じ手が、逆向き（ホスト→フォークではなくフォーク→ホスト）に効いた。

共有パッケージについては別の証拠が出た。`@kubohiroya/turbowarp-extension-loader` が2コピーあると `isAuthorizedCode` が「別コピーが発行した許可記録」を拒否する——移したテストがまさにこれで落ちた。site側のwebpackで `react` と同じように1コピーへ寄せ、`@turbowarp/jszip` と security-dialog も揃えた。

### テストはVMのある場所で動かす

移した8ファイル（約1,250行）は配信側の `test/extension-host/` へ移し、`pinned-host.mjs` 経由で pin された `.host/scratch-gui` から VM・DOM・GUI自身のモジュールを取る。CIでは host を用意した直後の段階で `npm run test:extension-host` が走る。**skipはしない**: 黙って何もしないテストは、移行が検証済みに見えてしまう。

フォークに残したものはフォークで試す。`startupPlusExtensionHost` には第3引数として integration を取らせ（`tw-plus-integration-points.js` の他の口と同じ作法）、「何を渡しているか」を `test/unit/plus/extension-host.test.mjs` で確かめる。

### 残した理由

- `tw-plus-extension-authoring.js`(162行) — 拡張ライブラリのUIが `getExtensionAuthoringHost` で読み戻す。作るのは配信側、持つのはフォーク。
- `tw-plus-extension-load-failure.js`(45行) — 2つのHOCと取消経路が読む。印を付ける関数を口に渡す。
- `src/config/` の2つ(14行) — `tw-packager-integration-hoc.jsx` と `feature-flags.js` が同じ値を読む。定義を1つに保つため、フォークが値を渡す側に回った（単一HTMLへはbootstrapが運ぶ）。

## 拡張ライブラリの連鎖を配信側へ移す（2026-11-03）

フォークの差分は **104ファイル/+6,196 → 95ファイル/+5,302**（本家 develop の最新との比較）。

| 移したもの | 行数 | 置き場所 |
| --- | --- | --- |
| `containers/tw-plus-library.jsx` | 200 | `site/extension-library/plus-library.jsx` |
| `components/tw-plus-library/` (css + icon) | 57+26 | `site/extension-library/` |
| `lib/tw-plus-extension-authoring.js` | 164 | `site/extension-host/authoring.js` |
| `lib/tw-plus-catalog-authoring.js` | 57 | `site/extension-library/catalog-settings.js` |
| `lib/tw-plus-extension-loader.js` | 54 | `site/extension-library/load-extensions.js` |
| `config/feature-flags.js` | 8 | `site/extension-library/flags.js` |

### CSSは移せる。移せないのは「本家のクラス名を狙う」場合だけだった

[段階5の取り消し](#cssに口を作らない理由2026-11-02-訂正)は「CSSモジュールのクラス名はビルド時にハッシュされるので、全域スタイルシートから狙えない」という理由だった。これは**本家のクラスを外から狙う**場合の話で、**自分のスタイルシートを連れて出る**場合には当てはまらない。確かめたところ、フォークのwebpack設定のCSS規則には `include` がなく、拡張子だけで一致する。つまり配信側のディレクトリから `import` したスタイルシートも、本家自身のものと同じようにCSSモジュールとして扱われる。

実際のビルドで `plus-library_plus-tag_2NoE7` のようにハッシュされた名前が出ており、その文字列を口（`className`）でGUIへ渡している。GUIはその名前を知らないまま、タグに適用するだけ。画像も同じで、`url-loader` の規則にも `include` がない。JSXだけは本家の規則が `src` に限定されているので、こちらの babel 規則に `@babel/preset-react` を足した。

### ビルドされない束に入れないために、importではなく引数で渡す

`authoring.js`（作品の拡張を追加・設定・削除するコントローラ）を `host.js` が `import` したところ、単一HTML用のランタイム束が 540KB → 640KB に増えた。実行時に `authoring: false` と言っても、静的 importは束に残る。そこで入口を2つに分けた。

- `site/extension-host/editor-host.js` — 結線＋コントローラ。エディタが使う。
- `site/extension-host/runtime.js` — 結線のみ。単一HTMLが使う（540KBに戻った）。

**何を渡すかではなく、どの入口が何をimportするかで束の中身が決まる。** 前段階の `vmModules` と同じ「引数で渡す」手が、ここでは束のサイズのために効いた。

### テストは3つに分かれた

- `test/extension-library/` — 移した実装。JSXを扱うため `harness.cjs` が pin した GUI の babel を使い、共有パッケージも GUI のコピーへ向ける（site側webpackのaliasと同じ向き）。レビュー記録の WeakMap はフォークに残るので、そこだけ pin した checkout から読む。
- `test/*.test.ts`（ESM）— 統合の形。`--import ./test/asset-hooks.mjs` で `.css`/`.svg`/`.jsx` に代役を返す。node には webpack のローダがないので、ライブラリのタブが統合に加わった時点でここが落ちた。
- フォーク側 — 残した汎用部分。`components/library/library.jsx` が「自分のものでないタグを1つ置ける」ことと、その中の検索がタグから外れないこと。

### 残した理由

- `components/library/library.jsx`(+37/-10) と `library.css`(+24) — 汎用の仕組み。本家へ送る候補。
- `containers/extension-library.jsx`(+44/-2) — タブ1つ分の場所を空ける結線。中身は口の向こうへ出た。
- `lib/tw-plus-extension-permissions.js`(23行) — レビュー記録の WeakMap。`tw-security-manager.jsx` の `getSandboxMode` が読み戻すので、書く側の2関数をタブへ渡す。
- `css/extension-security-dialog.css` — 本家の変数でダイアログパッケージを整えるもの。security-manager も読むので、まだこちら。
