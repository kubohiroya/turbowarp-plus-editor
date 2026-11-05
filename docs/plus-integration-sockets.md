# フォークに残す差し込み口の設計

現在の配置は[GUI追加ファイルの全面移設](gui-integration/README.md)を参照してください。以下の旧パス・GUI側に残す判断は、各時点の履歴です。現在は本家に存在しなかったファイルをGUIからすべて撤去し、接続実装・文書・ツール・テストを本リポジトリが所有します。


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
//   attachToWorkspace?(context): {dispose()}|null       // containers/tw-plus-workspace-attachment.jsx（gui.jsx が常時マウント）
//   shouldIgnoreKeyEvent?(event): boolean               // lib/vm-listener-hoc.jsx
//   reduceProjectState?(state, action): object|null     // reducers/project-state.js
//   stageControls?(vm): ControlsService                 // containers/controls.jsx
//   cameraControls?(vm): ControlsService                // containers/controls.jsx
//   extensionLibrary?: object                           // containers/extension-library.jsx
//   extensionGuiApi?: object                            // lib/tw-extension-gui-api.js
//   addons?: object                                     // addons/api.js, entry.js, hooks.js
// }
```

`attachToWorkspace` の `context` は `{vm, locale, document, getBlockly}`。フォークはVMが替わるたびに前の戻り値を `dispose()` してから呼び直し、戻り値の中は見ない。当初この行には `alwaysMountedModals`（Reactコンポーネントの一覧を `gui.jsx` に常時マウントさせる口）を置いていたが、開けなかった。段階6を参照。

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
| `components/gui/gui.jsx` | +2 | `attachToWorkspace`。描画しないコンテナ `TWPlusWorkspaceAttachment` の常時マウント（当初案は `alwaysMountedModals` で `TWDocumentEditor` を常時マウント） |
| `containers/controls.jsx` | +22 | `stageControls` / `cameraControls` |
| `components/controls/controls.jsx` | +36 | 同上（受け取った service を描く部分） |
| `containers/extension-library.jsx` | +40 -2 | `extensionLibrary` |
| `lib/tw-extension-gui-api.js` | +8 | `extensionGuiApi` |
| `addons/api.js` | +10 -3 | `addons` |
| `addons/entry.js` | +9 | `addons` |
| `addons/hooks.js` | +1 | `addons` |
| `components/controls/controls.css` | +40 | **口にしない。移さない**（下の「いま残っている差分」。当初は段階8で移す予定だった） |
| `components/library/library.css` | +24 | **口にしない。移さない**（同上。当初は段階9で移す予定だった） |
| `components/modal/modal.css` | +5 -2 | **口にしない。** モバイルでoverlayがはみ出すのを直す汎用修正。`modal.jsx` と同じ扱い |
| `components/stage/stage.css` | +1 | `@import` の1行は残り、中身の `preview-reload.css`(259行) は**配信側へ移った**（下の「台帳の訂正」。GUI #136 / [#105](https://github.com/kubohiroya/turbowarp-plus-editor/pull/105)） |
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
| 6 | 文書エディタの結線の移送。開けた口は `attachToWorkspace`（[scratch-gui#113](https://github.com/kubohiroya/scratch-gui/pull/113)）で、結線は本リポジトリの `site/plus-integration.ts` に置いた（[PR #61](https://github.com/kubohiroya/turbowarp-plus-editor/pull/61)）。当初案の `alwaysMountedModals` と `TWDocumentEditor` の移送は取らなかった: 文書エディタはモーダルではなくVM・言語・ScratchBlocksに付くもので、フォークが渡すべきは描画先ではなくそれらだった | 済 |
| 7 | `createCancelSecurityLoad`（値を引数で渡し、既定をホストが上書き） | 4 |
| 8 | `stageControls` / `cameraControls` と `controls.jsx` 2件・`camera-control/*`・`tw-stage-controls.js`・`tw-camera-controls.js` の移送 | 4 |
| 9 | `extensionLibrary` / `extensionGuiApi` / `addons` | 4 |
| 10 | 独自34本の残り（registrar・project-loader・authoring・permission-ui・packager ほか）を1本ずつ | 4〜9 |
| 11 | `package.json` / `package-lock.json` から family 4依存を外す。`prepare-core.ts` のコピーと `verifyHost` の照合を、本リポジトリの lock 基準の確認へ置き換える | 済 |

段階4は6つの口をまとめて足すが、どれも「一覧を受け取って混ぜる」だけで互いに依存しないので、1つのPRで足しても壊れ方が分かれない。段階8と9は実装の移送を伴うので、口を開ける変更と移送を別のPRに分ける。

## 検証

各段階の期待する結果は「何も変わらない」こと。CIの統合E2E（GUIとpackagerのclone、`build:pages`、Playwright）とローダーE2Eが以前と同じに通れば、その口は通っている。口を足しただけで実装を載せていない段階では、フォーク側の実装がそのまま使われるので、動作は定義上変わらない。

本リポジトリ側には、各段階で「まだ何も渡さない」または「この口にこれを渡す」ことを固定する単体テストを置く。段階3の `test/plus-integration.test.ts` がその最初の例。

## CSSに口を作らない理由（2026-11-02 訂正）

当初は空の `src/css/tw-plus-integration.css` を置いて差し替える案を書いたが、5件の差分を読んで取り消した。CSSはCSSモジュールで、クラス名はビルド時にハッシュされる。配信側が渡す全域スタイルシートからは、本家モジュールのクラスを狙えない。

実際の5件は3種類だった。

- `controls.css`(+31) と `library.css`(+24) は、`.extension-control` / `.custom-content` / `.custom-library` / `.extended-tags` といった**新しいクラスの追加**で、同じコンポーネントのフォーク独自JSXが `styles.extensionControl` のように参照している。全域スタイルシートではなく、そのコンポーネントの変更と一緒に移すのが正しい——と当時は書いたが、描く側が本家に残る形に落ち着いたので移さない（下の「いま残っている差分」）。
- `stage.css`(+1) は `@import "./preview-reload.css"` の1行だけ。import文はフォークに残り、中身は配信側の `site/styles/preview-reload.css` へ移った（下の「台帳の訂正」）。
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

`src/lib/tw-plus-trusted-extensions.js`（104行）とそのテスト（60行）をフォークから外し、`site/trusted-extensions.ts` としてこちらで持つようにした。「このカタログに載っている拡張は、TurboWarp が自分のギャラリーを扱うのと同じく、確認なしで非サンドボックスで動かす」という判断は、**配信物についての言明**であってエディタの機能ではない。誰が配信するかで答えが変わるものは、配信する側が持つ。

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
| `tw-plus-extension-host.js` の結線 | 114 | `site/extension-host/host.ts` |
| `tw-plus-extension-registrar.js` | 371 | `site/extension-host/registrar.ts` |
| `tw-plus-project-loader.js` | 202 | `site/extension-host/project-loader.ts` |
| `tw-plus-permission-ui.js` | 139 | `site/extension-host/permission-ui.ts` |

フォークに残るのは `startupPlusExtensionHost`（口を呼ぶ29行）と `isPlusPermissionDenied`（1行）だけになった。ホストを持たないフォークでは拡張の読み込みそのものが無くなる——本家と同じ挙動で、これが「最小限の差分」の意味するところ。

### 「訊ける相手がいるか」を今回も先に確かめた

[信頼カタログの段階](#信頼するカタログを配信側へ移す2026-11-03)で分かった制約をそのまま適用した。単一HTMLに同梱されるランタイム束は差し込み口を差し替えられないので、**束の作り方を変えた**: `scripts/site/build-extension-runtime.cts` のエントリをフォークの `src/lib/tw-plus-extension-host.js` から配信側の `site/extension-host/runtime.ts` へ移した。配信物の中で訊く相手がいないなら、訊かずに済むように作る側を変えればよい。

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
| `containers/tw-plus-library.jsx` | 200 | `site/extension-library/plus-library.tsx` |
| `components/tw-plus-library/` (css + icon) | 57+26 | `site/extension-library/` |
| `lib/tw-plus-extension-authoring.js` | 164 | `site/extension-host/authoring.ts` |
| `lib/tw-plus-catalog-authoring.js` | 57 | `site/extension-library/catalog-settings.ts` |
| `lib/tw-plus-extension-loader.js` | 54 | `site/extension-library/load-extensions.ts` |
| `config/feature-flags.js` | 8 | `site/extension-library/flags.ts` |

### CSSは移せる。移せないのは「本家のクラス名を狙う」場合だけだった

[段階5の取り消し](#cssに口を作らない理由2026-11-02-訂正)は「CSSモジュールのクラス名はビルド時にハッシュされるので、全域スタイルシートから狙えない」という理由だった。これは**本家のクラスを外から狙う**場合の話で、**自分のスタイルシートを連れて出る**場合には当てはまらない。確かめたところ、フォークのwebpack設定のCSS規則には `include` がなく、拡張子だけで一致する。つまり配信側のディレクトリから `import` したスタイルシートも、本家自身のものと同じようにCSSモジュールとして扱われる。

実際のビルドで `plus-library_plus-tag_2NoE7` のようにハッシュされた名前が出ており、その文字列を口（`className`）でGUIへ渡している。GUIはその名前を知らないまま、タグに適用するだけ。画像も同じで、`url-loader` の規則にも `include` がない。JSXだけは本家の規則が `src` に限定されているので、こちらの babel 規則に `@babel/preset-react` を足した。

### ビルドされない束に入れないために、importではなく引数で渡す

`authoring.js`（作品の拡張を追加・設定・削除するコントローラ）を `host.js` が `import` したところ、単一HTML用のランタイム束が 540KB → 640KB に増えた。実行時に `authoring: false` と言っても、静的 importは束に残る。そこで入口を2つに分けた。

- `site/extension-host/editor-host.ts` — 結線＋コントローラ。エディタが使う。
- `site/extension-host/runtime.ts` — 結線のみ。単一HTMLが使う（540KBに戻った）。

**何を渡すかではなく、どの入口が何をimportするかで束の中身が決まる。** 前段階の `vmModules` と同じ「引数で渡す」手が、ここでは束のサイズのために効いた。

### テストは3つに分かれた

- `test/extension-library/` — 移した実装。JSXを扱うため `harness.cjs` が pin した GUI の babel を使い、共有パッケージも GUI のコピーへ向ける（site側webpackのaliasと同じ向き）。レビュー記録の WeakMap はフォークに残るので、そこだけ pin した checkout から読む。
- `test/*.test.ts`（ESM）— 統合の形。`--import ./test/asset-hooks.ts` で `.css`/`.svg`/`.jsx` に代役を返す。node には webpack のローダがないので、ライブラリのタブが統合に加わった時点でここが落ちた。
- フォーク側 — 残した汎用部分。`components/library/library.jsx` が「自分のものでないタグを1つ置ける」ことと、その中の検索がタグから外れないこと。

### 残した理由

- `components/library/library.jsx`(+37/-10) と `library.css`(+24) — 汎用の仕組み。本家へ送る候補。
- `containers/extension-library.jsx`(+44/-2) — タブ1つ分の場所を空ける結線。中身は口の向こうへ出た。
- `lib/tw-plus-extension-permissions.js`(23行) — レビュー記録の WeakMap。`tw-security-manager.jsx` の `getSandboxMode` が読み戻すので、書く側の2関数をタブへ渡す。
- `css/extension-security-dialog.css` — 本家の変数でダイアログパッケージを整えるもの。security-manager も読むので、まだこちら。

## 段階11（依存を手放す）: 文書エディタから（2026-11-03）

当初の段階11は「family の4依存をフォークの package.json / lock から外し、検査を配信側の lock を根拠にする」だった。**4つまとめては無理**で、理由は単純: フォークがまだそれらを import している。import を残したまま依存だけ外すと、フォーク自身の `npm ci` とビルドが壊れる。

| 依存 | フォーク側の import 元 | 外せるか |
| --- | --- | --- |
| `turbowarp-document-editor` | `src/lib/blocks.js` の1行 | **外した** |
| `turbowarp-extension-loader` | `lib/tw-plus-packager.js`、`playground/plus-packager.js`、`lib/tw-packager-integration-hoc.jsx` | Packager一式を移してから |
| `turbowarp-extension-security-dialog` | `containers/tw-security-manager.jsx`、2つのHOC | レビューUIを移してから |
| `turbowarp-extension-data-editor` | ブロックエディタ一式（7ファイル） | ブロックエディタを移してから |

### 文書エディタ: 1行のためにパッケージ1つ

import は `registerDocumentSourceRootHatShape(ScratchBlocks)` の1行で、**そのすぐ下に `registerHostBlockShapes` の口があった**。段階3で開けた口が、使われずに隣に座っていた。ホストが文書エディタを供給するのだから、その形状を登録するのもホストの仕事。

- フォーク: import 1行、`webpack.config.js` の `withDocumentEditorWebpack4`、依存と lock の53エントリ（865行）が消えた（**+2 / -870**）
- 配信側: `withDocumentEditorWebpack4` を自分の設定で適用し、`registerBlockShapes` を口へ渡す

**パッケージを import する側が、そのパッケージを設定する側。** webpack ヘルパは自分を提供したコピーを基準に alias を張るので、どちらが適用するかで束に入るコピーが変わる。

### cwd に依存する解決で一度間違えた

`createRequire(path.resolve('package.json'))` と書いたところ、**site のビルドは GUI チェックアウトを cwd にして走る**ため、配信側ではなくフォークの install からヘルパを取ってしまった。ビルドは成功し、バンドルにはフォークのコピーが入る——気づけたのは stats でモジュールの解決先を見たからで、テストでは出ない。`__dirname` 基準に直した。この設定ファイルの他の箇所は元から `__dirname` 基準だった。

### 検査は片側だけになった

`verifyHost` がフォークの manifest と lock を見ていた分（`verifyDocumentEditorDependency`）は消え、配信側が**自分の install に対して同じ検査を続ける**（`build.ts` は以前からそれも呼んでいた）。保証は弱まらず、二重に書いていた方だけが消えた形。

残り3つの依存も同じ順序になる: **機能を移す → import が消える → 依存と検査の片側が消える。** 依存だけを先に外す道はない。

## Packager: 本家のものと配信固有の結線を分ける（2026-11-03）

「Packager」と呼んでいたものは3層あり、**動かせるのは1層だけ**だった。

| 層 | 実体 | 扱い |
| --- | --- | --- |
| 本家の Packager | TurboWarp/packager。`source.json` で `packagerRevision` として固定し、ビルド時にチェックアウト。`@turbowarp/packager-web` はその `src/packager/web/export.js` へ alias | **上流依存のまま。動かさない** |
| `lib/tw-packager-integration-hoc.jsx` | **本家 scratch-gui のファイル**（`git cat-file` で確認）。+51/-4 の改変 | **移せない。足された分岐だけ口へ** |
| `playground/plus-packager.js`(109行) と `lib/tw-plus-packager.js`(94行) | フォークにしかない Plus 固有のファイル | **配信側へ移した** |

### 移した2ファイル

組み立て画面は、HTML（`site/plus-packager.html`）もビルド設定（`build-plus-packager.cts`）も以前から配信側にあり、**入口だけがフォークに残っていた**。移して `build-plus-packager.cts` のエントリをこちらへ向けた結果、あの束にフォークのコードが1行も入らなくなり、差し込み口を埋める `plus-integration.packager.js` そのものが不要になった。

`tw-plus-packager.js`（単一HTMLを書き出す側）は、本家の Packager インスタンスを**引数で受け取る**形だったので、上流への依存を持たずに移せた。設定だけを決めていて、Packager 自体は import していない。

### 本家のファイルに足した分岐の口

```js
export const hostProjectPackager = integration => integration?.projectPackager || null;
```

`{open, claim, handleMessage}` の3つ。境界の引き方はこうした。

- **窓を開けるのはフォーク**（ユーザー操作の最中でなければ popup がブロックされる）。開いた窓をホストに渡す。
- **p4 プロトコルはフォーク**。`cancel-import` の送信は上流の規約なので、ホストには「送る関数」を渡して呼ばせる。
- **どの作品を引き取るか、どこへ送るか、バイト列をどう渡すかはホスト**。

改変は +51/-4 → **+28/-6**。何も渡されなければ、あのファイルは上流とまったく同じ経路だけを通る。

### import する側が設定する側（2度目）

loader 依存が外れたので `withExtensionLoaderWebpack4` の適用も配信側へ移った。文書エディタと同じ話だが、ここでは**罠が1つ**あった。ヘルパの babel 規則は `include: [__dirname]`、つまり**自分を提供したコピーだけ**を対象にする。一方で単一HTML用ランタイム束と組み立て画面の設定は `resolve.modules` でホストの `node_modules` を先に見る。ローカルにはフォークの古いコピーが残っているので、**解決先と babel 規則の対象がずれ、未変換のまま束に入りうる**（CIではフォークにコピーが無いので起きない）。両方の設定で loader を配信側のコピーへ alias して固定した。

**ローカルとCIで解決先が変わる設定は、それ自体がバグの温床。** cwd 依存の `path.resolve` と同じ種類の間違いで、どちらも「ビルドは成功するが中身が違う」形で現れる。

### family 依存の2つ目、そして検査の移し忘れ

固定の検証も片側だけになる——はずだったが、**loader の分を移し忘れてCIが落ちた**。`verifyHost` はホストの package.json と lock に loader の固定を要求しており、GUIがその依存を手放した時点で `Host must pin the exact npm loader version: undefined` になる。文書エディタのときと同じ移動（`verifyLoaderDependency(directory, pins)` を配信側の install に向ける）を loader にも適用した。

**機能・import・依存・検査の4つが動く。** 4つめを忘れるとCIが落ちるので、そこは安全側に倒れている。

残りは security-dialog（レビューUI）と extension-data-editor（ブロックエディタ）。どちらも「機能を移す → import が消える → 依存が消える → 検査を移す」の順で、機能の側が大きい。

## レビューUIを配信側へ（2026-11-03）

本家は未知の拡張を1つずつ尋ねる。この配信物は全部をまとめて尋ね、それぞれが何かを見せ、その読み込みの間だけ選択を覚えるレビューを持っている——`@kubohiroya/turbowarp-extension-security-dialog` パッケージで、あれは配信物のもの。

**関係する3ファイルはいずれも本家のもの**（`tw-security-manager.jsx`、`vm-manager-hoc.jsx`、`sb-file-uploader-hoc.jsx`）。移さず、足されていた分だけを口へ出した。

| | 改変 |
| --- | --- |
| `tw-security-manager.jsx` | +82/-7 → +77/-7 |
| `sb-file-uploader-hoc.jsx` | +23/-3 → +22/-3 |
| `vm-manager-hoc.jsx` | +13/-1 → +12/-1 |

**行数はほとんど減らない。この段階で動いたのは所有である。** パッケージ由来のものがフォークから無くなり、依存も外れた（family の3つ目）。口の数が増えても行数が減らない段階はこの先もある。

境界はこう引いた。

- **ホスト** — VMへの差し込み、ダイアログ、そのCSS、「そもそも尋ねる必要がないものの判断」（カタログに載っているものは確認なし）
- **フォーク** — モーダル、その排他、生存期間、`isTrustedExtension` が既に信頼している拡張、アイコンの出所。`render` には `DialogFrame` としてフォークの `Modal` を渡す

2つのHOCでは、パッケージの `isExtensionSecurityCancelled` を `isPlusPermissionDenied` に統合した。**ホストのレビューが取り消されたことはホストしか判定できない**ので、そこだけ訊く形にした。

### 検査の移動は3つめにしてようやく型になった

文書エディタ・loader・security-dialog と、同じ移動を3回やった。`verifyHost` がホストの manifest / lock / 実体を見ていた分を、`verify〇〇Dependency(directory, pins)` として配信側の install に向ける。`verifyHost` に残るのは GUI 自身の依存（scratch-vm の git 固定、コアの build-info）だけになった。

**依存を外す作業は4つ動く: 機能・import・依存・検査。** 4つめを忘れるとCIが落ちる(#86)ので、気づけるようにはなっている。

## ブロックエディタ: family 依存が全て外れた（2026-11-03）

拡張がブロックにスキーマを宣言したとき、それをフォームにして見せるのは配信物の仕事。`@kubohiroya/turbowarp-extension-data-editor` の入口3つ（サービス生成・ワークスペースへの接続・ダイアログ）を `site/block-editor/editor.ts` に移した。フォークは **+65 / -1904行**、79ファイル/+3,383 まで下がり、lock の差分も +644 になった。

**これで family の4依存が全て外れ、フォークは配信物のパッケージを1つも install しない。**

### 翻訳文は動かせない

ライブラリのタブは自前の2言語テーブルを持っていたので連れて出せた。ここは逆で、`tw.blockEditor.*` のidが**本家の翻訳抽出パイプライン**に乗っており、コミュニティ訳も付いている。フォークの2つのラッパー（127行）のうち83行がその文で、**文はフォークに残し、パッケージの入口だけを移す**のが正しい切り分けだった。配色（`block-editor.css`）も本家の `css/colors.css` の変数をビルド時に展開するので、本家のビルドでしか解決できない。

### core を外すと配信側の仕組みが減る

他の3依存と違い、これは `source.ts` の `corePackage` そのもので、`prepare-core.ts`(110行) が**GUIの node_modules の中身を差し替えていた**（フォークが `^0.5.0`、配信物が 0.7.0）。依存が無くなれば差し替える対象も無いので、`verifyInstalledCore` を配信側の install に向け、CIの「Copy the pinned root core」段階を外した。`prepare-core.ts` 自体の撤去は段階B（この文書の末尾）。

### Reactが2つあると、何を試しているのか分からなくなる

移した `modal.test.mjs`（599行）が `activeElement.attachEvent is not a function` で落ちた。原因は**Reactが2つ**: 配信側には（他のパッケージ経由で）React 18 が入っており、パッケージの `react.js` がそれを読む一方、テストは pin した本家の React 16 を読んでいた。site側webpackが `react$` を alias しているのと同じ問題が、Nodeのテストで再現した形。

`test/asset-hooks.ts` に **resolve フック**を足し、`react` / `react-dom` / `prop-types` / `lodash.bindall` を pin した checkout へ向けた——ビルドの alias と同じ向き。**テストはビルドと同じ解決をする**のが原則で、これで揃った。

同じファイルで `.css` の代役も直した。全てのプロパティに名前を返す Proxy を返していたため `styles.なんでも` が真になり、ブラウザでは通らない分岐に入っていた。ESM側は空オブジェクトを返し、クラス名を見たいテストは require フックのハーネスを使う。

### テストは「何を試しているか」で分けた

| | 件数 | |
| --- | --- | --- |
| 配信側 | 38 | パッケージの挙動（host / source-host / icon / appearance / bridge / descendant-host / modal と共有フィクスチャ） |
| フォーク | 12 | フォークのラッパーと翻訳、VMごとのサービス、起動待ち、プレビューVM |

移すかどうかは import 元ではなく**主題**で決まる。`preview-vm.test.mjs` はパッケージを1行も参照していないのでフォークに残り、`modal.test.mjs` はフォークのラッパーを**pin した checkout から読んで**配信側の実物と組み合わせる。

### スタイルシートが境界を越えると、同点の規則の勝敗が変わる（2026-11-03）

ブロックエディタ段のあと、配信側のe2eでダイアログの Cancel が押せなくなった。要素は可視・有効・安定で、`element is outside of the viewport` だけが出る。

原因はCSSの**注入順**だった。フォークの `block-editor.css` とパッケージ側のスタイルシートが、同じ要素の枠を**それぞれクラス1つ**で指定している。詳細度が同じなので勝敗は注入順で決まり、その順はモジュールグラフに従う。パッケージが配信側へ移ったことで、そのスタイルシートを import するモジュールが「遅く読まれるコンテナ」から「早く読まれる統合」に変わり、順が入れ替わった。

| | 本家のmodal規則 | パッケージの規則 | 上余白 |
| --- | --- | --- | --- |
| 移す前 | 先 | 後 | 60px |
| 移した後 | 後 | 先 | 100px |

40px 下がった分、900px の viewport でダイアログの操作ボタンが画面外に出る。直しは詳細度で決めること（`.theme.commonLayout` の2クラス）で、kubohiroya/scratch-gui#130。

**突き止め方も記録しておく。** 推測を重ねずに済んだのは、両方のビルドを作って比べたから。

1. 本家のe2eは落ちるがローカルのユニットテストは通る → **実ビルドでしか出ない**と判断
2. `main` 側を同じ手順でビルドして同じspecを走らせ、**通ることを確認**（これで「自分の変更が原因」が確定）
3. 両方の trace を取り、CSSの規則テキストを比較 → **同一**
4. 規則の**出現位置**をバイト単位で比較 → 入れ替わりを発見

3で「同じ」と分かった時点で原因を順序に絞れた。**同じものが違う結果を出すなら、違うのは順序か文脈。**

## 段階B: 差し替える機構を撤去する（2026-11-03）

段階Aで `@kubohiroya/turbowarp-extension-data-editor` がフォークの依存から外れた時点で、`scripts/site/prepare-core.ts`(110行) は**差し替える相手を失っていた**。CIからその段階を外したあとも、呼び出し元は自分のCLIエントリだけで、他には `family-notices.ts` のコメント1行しか残っていなかった。段階Bで、そのスクリプトと `test/prepare-core.test.ts`(107行) を撤去した。

残したのは `verifyInstalledCore` だけ。コピーも入れ替えも検証も要らなくなり、**「導入された core が固定値か」を読むだけ**になって、`build.ts` が毎回それを呼ぶ。撤去したテストが唯一押さえていたその拒否（`/core version/`）は、同じ固定値を組み立てている `test/security-source.test.ts` へ移し、合格側と revision 不一致も足した。

**消す前に、消すものが押さえていた検査を数える。** 110行のうち100行は「GUIの node_modules を安全に入れ替える」ための手順で、依存が無くなれば意味も無い。残る10行分の意味——固定値との照合——だけが他所へ移る。

## いま残っている差分（2026-11-03 実測）

段階11が終わったので、上流 `TurboWarp/scratch-gui` の tip と突き合わせて数え直した。

| | ファイル | 行 |
| --- | --- | --- |
| 全体 | 82 | +3,937 / -57 |
| lockfile を除く | 81 | +3,292 / -52 |
| うち本家ファイルへの改変 | 33 | — |

`git diff upstream/develop origin/develop` の実測で、[kubohiroya/scratch-gui#132](https://github.com/kubohiroya/scratch-gui/pull/132)（`develop` の `a98d56cd9`）のあとの値。**この数は上流が動くだけでも変わる**——いまフォークは上流より20コミット遅れており、`package.json` / `webpack.config.js` / `addons/api.js` / `tw-security-manager.jsx` の4件は上流側の変更も混ざっている。数そのものより、下の内訳を見ること。

**「23件の割り当て」の本家ファイルは、すべて口の呼び出しだけになった。** 読んで確かめた: `reducers/modals.js`・`lib/themes/gui/light.js`・`lib/blocks.js`・`lib/vm-listener-hoc.jsx`・`containers/extension-library.jsx`・`containers/controls.jsx`・`addons/api.js`・`lib/tw-extension-gui-api.js` のどれも、足されている行は `hostIntegration()` と口の関数を import して呼ぶ数行である。つまり残っている33件の改変は、**設計どおり残すもの**で、消す対象ではない。

### CSSを「あとで一緒に移す」計画は取り消す

段階8・9の行には `controls.css`(+40)・`library.css`(+24)・`preview-reload.css`(259行) を実装と一緒に移すと書いてあったが、移さない。理由は2つある。

1. **これらが装飾するのはフォークが描く要素**である。口の設計は「サービスを受け取って描く部分は本家側に残す」形になった（`controls.jsx` の表の行がそう書いてある）。描く側が本家なら、そのクラス名も本家のものになる。
2. **本家の変数に依存している。** `controls.css` は `@import "../../css/colors.css"`、`library.css` は `$library-header-height` を使う。配信側から渡せる形にならない。

これは「CSSに口を作らない理由（2026-11-02 訂正）」と同じ結論で、[kubohiroya/scratch-gui#130](https://github.com/kubohiroya/scratch-gui/pull/130) の注入順の件が、境界をまたぐ移送のほうが**危険**だと示した後でもある。

### 残っている本当の取りこぼし2件

| | 内容 | 進められる条件 |
| --- | --- | --- |
| レビューUIのクラス名 | `lib/vm-listener-hoc.jsx:205` が `.twextsec-modal` を直書きしている。口（`shouldIgnoreKeyEvent`）は開いているが、**配信側が何も渡していない**。`src/css/extension-security-dialog.css`(14行) も同じパッケージのグローバルクラスを狙っている | [#92](https://github.com/kubohiroya/turbowarp-plus-editor/pull/92) がレビューUIを `ExtensionReview` に書き換え中で、**その markup のクラス名が変わりうる**。#92 のマージ後に、配信側が `shouldIgnoreKeyEvent` を埋め、フォークの直書きを外す |
| 死んだプレビュー導線 | `scripts/local-plus-preview.cjs`(47行) が `@kubohiroya/turbowarp-extension-security-dialog` をフォークのビルドに alias する。フォークはもうその依存を持たないので、alias 先を import するモジュールが無く、素のGUIが出るだけ。フォークで family に触れている最後の1ファイル | [kubohiroya/scratch-gui#132](https://github.com/kubohiroya/scratch-gui/pull/132) で撤去（文書と合わせて160行減、`develop` 向け） |

### 残りの内訳（移す対象ではないもの）

| 区分 | 例 |
| --- | --- |
| 口そのもの | `lib/tw-plus-integration-points.js`(231行)、`lib/tw-plus-integration.js`(20行、空) |
| フォーク側に残す判断をした実装 | ダイジェストの照合（`tw-plus-extension-host.js`)、レビューの記録（`tw-plus-extension-permissions.js`)、作品エラーの巻き戻し（`tw-extension-security-cancel.js`)、`tw.blockEditor.*` の翻訳文 |
| フォークが描く要素のCSS | `controls.css`・`library.css`（`preview-reload.css` と `block-editor.css` は移った。下の「台帳の訂正」） |
| 汎用変更（上流へ出せる形） | `modal.jsx` の `hideCloseButton`、`library.jsx` の `busy`、`modal.css` のモバイル修正、`data-url.css` の高さ |
| インフラ | `webpack.config.js`・CI workflow・README・.gitignore |
| 独自の道具・例・文書・テスト | `scripts/local-security-preview.cts`(273行)、`src/examples/extensions/*`、`docs/*`、`test/unit/*` |

**この一覧がこの文書の現在の結論である。** フォークの差分を「まだ移せるもの」と読んではいけない。移せるものは上の取りこぼし2件だけで、他は口の呼び出しか、本家側に残すと決めたものである。

## GUI #136によるCSS境界の更新（2026-11-03）

既存文書の「preview-reload.cssも移さない」という結論は、GUI #136で変更する。
GUIは `[data-gui-stage]` 上に配置情報をCSS変数として提供し、固有IDのスタイルは
`site/styles/preview-reload.css` が所有する。色はGUIが既に公開するテーマ変数を参照する。
ハッシュ済みクラス名、複製したGUI寸法、本家のビルド時変数には依存しない。
旧レビュー専用の `extension-security-dialog.css` は、先行した0.7.1の新UI移行で参照先がなくなったため移管しない。
キー操作は新UIの `.twextsec-review` をホストが判定する。旧Runtimeの互換表示は維持する。

## 台帳の訂正（2026-11-03、同日の後刻）

半日のあいだに、上の台帳の数と結論の両方が動いた。数え直すと **69ファイル・+3,095 / -57**（lockfile除外で **68・+2,545 / -52**）で、13ファイル・700行ほど減っている。`origin/develop` は `cb0972665`、上流より20コミット遅れという条件は同じ。

### 取りこぼし2件は両方とも解消した

| | どこで |
| --- | --- |
| レビューUIのクラス名の直書き | [kubohiroya/scratch-gui#143](https://github.com/kubohiroya/scratch-gui/pull/143) が `vm-listener-hoc.jsx` の直書き・`extension-security-dialog.css`・その import の3件を削除。`git grep twextsec origin/develop -- src test` は0件。配信側は [#106](https://github.com/kubohiroya/turbowarp-plus-editor/pull/106) が口 `shouldIgnoreKeyEvent` を埋め、[#111](https://github.com/kubohiroya/turbowarp-plus-editor/pull/111) が [#105](https://github.com/kubohiroya/turbowarp-plus-editor/pull/105) との重複を1つに戻した |
| 死んだプレビュー導線 | [kubohiroya/scratch-gui#132](https://github.com/kubohiroya/scratch-gui/pull/132) |

### この文書の結論2つが覆された

**1. 「CSSは移さない」は、2件について間違いだった。** `preview-reload.css`(259行) と `block-editor.css`(38行) はフォークから出た。通った理由は、配信側が本家のハッシュ済みクラス名を狙うのを諦め、**本家が値を渡す**形に替えたこと——GUI #136 が `[data-gui-stage]` に配置情報をCSS変数として出し、固有IDのスタイルは `site/styles/preview-reload.css` が持つ。色は本家が既に公開しているテーマ変数を読む。

つまり移送の条件は「CSSかどうか」ではなく、**本家が必要な値を安定した属性セレクタ上の変数として公開できるか**である。残るのは `controls.css`(+40) と `library.css`(+24) で、こちらは本家のJSXが `styles.extensionControl` のようにハッシュ済みクラスを参照しているので、同じ手を使うには描く側も動かすことになる。

**2. 「翻訳文は動かせない」も、形を変えれば動いた。** ブロックエディタの `tw-translations/block-editor.json`(40行) と theme tokens は [kubohiroya/scratch-gui#145](https://github.com/kubohiroya/scratch-gui/pull/145) でフォークから出た。文を移したのではなく、**フォークが自分の `intl` を口に渡す**形に替えた（`tw-block-editor-modal.jsx` が `intl` / `nodeAppearances` / `nodeLabels` を渡し、配信側が描く）。整形は本家の `intl` を通る。idと日英の文そのものは配信側の `site/block-editor/translations.json` が持ち、既存の `translations` の口から本家のIntlへ登録される——次の節がその仕組みを書いている。

### 読み方

**「移せない」と書いた結論のうち2つが、半日で覆った。** どちらも同じ替え方で通っている——配信側が本家のものを狙う形を捨て、本家が値を渡す形にする。この文書に「移さない」と書いてあっても、その替え方が見つかれば覆る。数も結論も、見た日付とともに読むこと。

## GUI #137によるフォーム表示の所有更新（2026-11-03）

旧結論「翻訳文は動かせない」を変更する。既存IDと日英翻訳を
`site/block-editor/translations.json` に保持し、既存の `translations` 差し込み口でGUIのIntlへ登録する。
GUIは現在のIntlコンテキストを渡し、配信側が文言を組み立てる。
色はGUIが公開済みのCSS変数を参照するため、GUIのビルド時ファイルを移管先からimportしない。
フォーム固有の追加色は既存の `themeTokens` で渡す。枠の2クラス詳細度は維持する。
GUIのサービスはVM単位の同一性と現在のIntlへの接続を保持する。
