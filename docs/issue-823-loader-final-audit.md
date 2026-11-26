# #823 Loader全体と最終照合

2026-11-26。基準は配信済みEditor main `70d4aefb6292b3ee2a9a7488aeb14bb6a804fbd6`（[#864](https://github.com/kubohiroya/turbowarp-plus-editor/pull/864)）。製品コード・固定依存・GUI・CI設定は変更しない。下表は現在登録されている12 spec・60ケースを個別に照合した保持判断であり、過去の実行数の合算ではない。

## 実行と公開の照合

- 最新の公開EditorをヘッドレスChromium・2 workers・retries 0で実行し、**60成功・失敗0・skip 0**（120.7秒）。通常のCIがこの60件を実行したという意味ではない。公開リビジョンを明示し、共通fixtureの対象では各ケースの前後にも固定値を照合した。
- 旧SB/SB2は固定VM `88a2c06e` のfixtureを取得し、Git blob `dfa87ce1ae32fadd201da40ee748c1bb54869f3c` / `cc3341aa54349145058f98fa14dd91332eaca590` を照合。OPFS内のテスト用ハンドルで別タブへ渡し、OSピッカーは起動していない。
- 公開配布2件は `@kubohiroya/turbowarp-extension-template@0.13.0` と同リポジトリの `v0.13.0`（commit `b4cd60ecf9f2a3094dc446bf1b99dabaeb89517a`）を使用。実際の取得・承認・sandbox iframe・VMブロック実行を確認した。
- Packagerの3ケースは、公開された `plus-packager.html` とその資産からHTMLを生成し、ダウンロードした実HTMLをオフラインで開いた。ローカルの古いHTMLへ置き換えていない。生成時と配布後の承認を区別した。
- この公開実行のネットワーク異常は制御したrouteによる結線確認。実HTTPS・CORS・リダイレクト・CSPの低層境界は、同じLoader 0.16.1の[実ブラウザーCI](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/45591120258)の成功を別の証拠として保持する。OS入力・ユーザーの作品・GitHub認証やリポジトリ作成は使わない。
- #864の[main CI](https://github.com/kubohiroya/turbowarp-plus-editor/actions/runs/45811987935)・[通常Pages](https://github.com/kubohiroya/turbowarp-plus-editor/actions/runs/45812344821)が成功。公開build-infoは同じ `70d4aef`、GUI `60b87e2f`、VM `88a2c06e`、Packager `d690225b`、Loader 0.16.1・Security Dialog 0.14.2・Workbench 0.40.1を示す。

## 最後に縮小した重複

[Security Dialog 0.14.2のCI](https://github.com/kubohiroya/turbowarp-extension-security-dialog/actions/runs/45807432453)で、`adding lists the catalog, and ticking one row pulls in what it needs`、依存の説明・選択の単体、`a wait that lasts takes the middle of a page that styles nothing itself`、`the wait offers no way out and nothing underneath it can be reached` の実行成功をログで確認した。

Editorから依存行の表示・disabled等の3アサーションと、待機画面の中央座標・style数・ボタン不在の詳細を除く。実カタログの選択・登録・保存、再試行からの復旧・実VM・診断は保持する。待機画面が `position: fixed` であることは、JavaScriptだけで作る配布物へのCSS同梱の結線として残す。変更した2ケースは同じ公開リビジョンで再実行し、**2成功・失敗0・skip 0**。残る58件の入力は変更せず、上記60件の結果を再利用する。ケースの削除・skip追加はない。

リソース表示の本文・条件・未申告の規則はSecurity Dialogのadd/open・日英の単体で検証済み。Editorには実カタログ/SB3のdigest照合、locale、実GUIの幅・スクロール・CSSの取り込み、取消からデバイス未実行への接続を残す。jsdomのコンポーネント検証だけで実GUIの配置が正しいとは扱わない。分類しただけの追加削除は行わない。

## 60ケースの保持理由

下表の「所有先」は機能詳細を検証する場所、「Editorの境界」は実アプリに残す理由。テスト名は実装上の識別子をそのまま記す。

| ID | ファイル・ケース | 所有先 | Editorの境界 |
| --- | --- | --- | --- |
| L01 | [catalog-authoring.spec.cts:21](../test/e2e/extension-loader/catalog-authoring.spec.cts#L21) — catalog checkboxes alone exclude packages, dependencies stay selected, and nothing asks how they run | Security Dialog / Loader | 実カタログ選択から依存を含むVM登録・保存Manifestへ届き、未選択を実行しない |
| L02 | [catalog-authoring.spec.cts:81](../test/e2e/extension-loader/catalog-authoring.spec.cts#L81) — catalog writes all four loading forms, restores them, and packages one offline HTML | Security Dialog / Loader | 実GUIの4形式の設定・SB3往復・形式変更を通し、配布HTMLを生成して実行する |
| L03 | [catalog-authoring.spec.cts:271](../test/e2e/extension-loader/catalog-authoring.spec.cts#L271) — catalog keeps distribution controls off when the Loader startup flag is explicitly disabled | Security Dialog / Loader | Editor起動フラグOFFでカタログ操作を公開しない |
| L04 | [catalog-authoring.spec.cts:282](../test/e2e/extension-loader/catalog-authoring.spec.cts#L282) — the File menu changes a loaded extension form with the same digest and asks nobody | Security Dialog / Loader | Fileメニューの形式変更を実際の保存・再読込へ渡し、digestと実行回数を保持する |
| L05 | [catalog-authoring.spec.cts:311](../test/e2e/extension-loader/catalog-authoring.spec.cts#L311) — catalog adopts a previously native-loaded extension, runs it as a catalog extension and leaves no old iframe | Security Dialog / Loader | 旧ネイティブ登録からカタログ登録へ切替え、実VMとiframeの残留を確認する |
| L06 | [catalog-authoring.spec.cts:359](../test/e2e/extension-loader/catalog-authoring.spec.cts#L359) — a fetch that keeps failing offers to try again, and trying again adds with the same answer | Security Dialog / Loader | 実カタログの失敗・同じ選択の再試行・登録を結線する |
| L07 | [catalog-authoring.spec.cts:401](../test/e2e/extension-loader/catalog-authoring.spec.cts#L401) — a missing file is stated with its code and message, and nothing offers to repeat it | Security Dialog / Loader | 欠損ファイルの失敗をGUIに示し、再試行を勝手に提供しない |
| L08 | [catalog-authoring.spec.cts:401](../test/e2e/extension-loader/catalog-authoring.spec.cts#L401) — code the catalog did not pin, once declined is stated with its code and message, and nothing offers to repeat it | Security Dialog / Loader | 未固定コードの拒否をGUIに返し、実行を開始しない |
| L09 | [editor.spec.cts:64](../test/e2e/extension-loader/editor.spec.cts#L64) — embedded-file requests approval at startup and preserves exact source/digest across SB3 save and reopen | Loader / Security Dialog / VM | URL起動の埋め込み拡張を実承認・登録し、SB3再保存の正確なコードを確認する |
| L10 | [editor.spec.cts:64](../test/e2e/extension-loader/editor.spec.cts#L64) — remote-cacheable requests approval at startup and preserves exact source/digest across SB3 save and reopen | Loader / Security Dialog / VM | URL起動の取得型拡張を実承認・登録し、SB3再保存のURLとdigestを確認する |
| L11 | [editor.spec.cts:88](../test/e2e/extension-loader/editor.spec.cts#L88) — denial and dialog cancellation never evaluate project code or fall through to legacy URLs | Loader / Security Dialog / VM | 拒否・取消を実VMへ渡し、旧URL経路への迂回実行を防ぐ |
| L12 | [editor.spec.cts:105](../test/e2e/extension-loader/editor.spec.cts#L105) — digest mismatch, unknown schema and a forged trust field fail before evaluation | Loader / Security Dialog / VM | 不正なプロジェクト入力の失敗を実GUIの診断へ渡し、VMを実行しない |
| L13 | [editor.spec.cts:143](../test/e2e/extension-loader/editor.spec.cts#L143) — an extension that fails while registering is reported without crashing the Editor | Loader / Security Dialog / VM | 登録例外を実GUIの失敗画面へ渡し、Editorの操作を維持する |
| L14 | [editor.spec.cts:148](../test/e2e/extension-loader/editor.spec.cts#L148) — remote cache reopens offline after approval; an uncached digest never executes offline | Loader / Security Dialog / VM | 取得・承認・実VM登録をIndexedDBとオフラインへ接続する |
| L15 | [editor.spec.cts:178](../test/e2e/extension-loader/editor.spec.cts#L178) — the opener may decline the copy of a remote-cacheable extension, and then nothing is kept | Loader / Security Dialog / VM | 実承認画面でキャッシュ拒否を渡し、作品の元の形式を保存する |
| L16 | [editor.spec.cts:211](../test/e2e/extension-loader/editor.spec.cts#L211) — a remote-non-cacheable extension opens as its author recorded it, with no copy to decline | Loader / Security Dialog / VM | 毎回取得型を実承認画面へ渡し、VMに登録する |
| L17 | [editor.spec.cts:211](../test/e2e/extension-loader/editor.spec.cts#L211) — a embedded-file extension opens as its author recorded it, with no copy to decline | Loader / Security Dialog / VM | ファイル埋め込み型を実承認画面へ渡し、VMに登録する |
| L18 | [editor.spec.cts:211](../test/e2e/extension-loader/editor.spec.cts#L211) — a embedded-data extension opens as its author recorded it, with no copy to decline | Loader / Security Dialog / VM | data埋め込み型を実承認画面へ渡し、VMに登録する |
| L19 | [editor.spec.cts:233](../test/e2e/extension-loader/editor.spec.cts#L233) — HTTPS redirects and CORS refusal never execute JavaScript, even once the review allowed it | Loader / Security Dialog / VM | 公開Editorで拒否を診断へ渡し、実VMを実行しない。実TLS/CORSはLoader CIで別証明 |
| L20 | [editor.spec.cts:280](../test/e2e/extension-loader/editor.spec.cts#L280) — a transient failure shows the current attempt and remains in Project Diagnostics | Loader / Security Dialog / VM | 実Editorの再試行表示・復旧・診断・VM実行を結線し、同梱CSSを確認する |
| L21 | [editor.spec.cts:344](../test/e2e/extension-loader/editor.spec.cts#L344) — CSP forbidding dynamic evaluation rejects approved execution without registering it | Loader / Security Dialog / VM | EditorページのCSP拒否後に実VMへ登録しない |
| L22 | [editor.spec.cts:359](../test/e2e/extension-loader/editor.spec.cts#L359) — explicit opt-out does not activate Plus bootstrap for a self-declared trusted project | Loader / Security Dialog / VM | 起動フラグOFFがプロジェクト内の自称信頼情報より優先する |
| L23 | [editor.spec.cts:369](../test/e2e/extension-loader/editor.spec.cts#L369) — builtin and official gallery loaders retain their existing behavior with Plus flag false | Loader / Security Dialog / VM | Loader OFFでも固定GUIの組み込み・公式ギャラリーを使える |
| L24 | [editor.spec.cts:369](../test/e2e/extension-loader/editor.spec.cts#L369) — builtin and official gallery loaders retain their existing behavior with Plus flag true | Loader / Security Dialog / VM | Loader ONでも固定GUIの組み込み・公式ギャラリーを使える |
| L25 | [editor.spec.cts:388](../test/e2e/extension-loader/editor.spec.cts#L388) — local SB3 import reaches the same permission and real VM registration path | Loader / Security Dialog / VM | File入力で開く実受信タブの承認からVM登録へ接続する |
| L26 | [editor.spec.cts:395](../test/e2e/extension-loader/editor.spec.cts#L395) — a local SB3 whose extension fails while registering is reported without crashing the Editor | Loader / Security Dialog / VM | File入力で開く実受信タブの登録例外から失敗表示へ接続する |
| L27 | [file-menu.spec.cts:16](../test/e2e/extension-loader/file-menu.spec.cts#L16) — Save Project without a target assigns the overwrite destination, and Save a Copy keeps it | Workbench / VM | 実Fileメニューの保存・コピーから書き込み先と上書き先へ届く |
| L28 | [file-menu.spec.cts:78](../test/e2e/extension-loader/file-menu.spec.cts#L78) — downloads produce an editable SB3 and leave the project without a writable handle | Workbench / VM | ダウンロード経路で編集可能なSB3を出力し、上書き先を勝手に付けない |
| L29 | [file-menu.spec.cts:97](../test/e2e/extension-loader/file-menu.spec.cts#L97) — opens legacy single_sound.sb through the SB3 picker without making it an overwrite target | Workbench / VM | 固定VMのSBを別タブで開いてSB3へ保存し、元ファイルを上書きしない |
| L30 | [file-menu.spec.cts:97](../test/e2e/extension-loader/file-menu.spec.cts#L97) — opens legacy unknown-opcode.sb2 through the SB3 picker without making it an overwrite target | Workbench / VM | 固定VMのSB2を別タブで開いてSB3へ保存し、元ファイルを上書きしない |
| L31 | [four-formats.spec.cts:34](../test/e2e/extension-loader/four-formats.spec.cts#L34) — remote-non-cacheable: chosen on the add screen, saved in the SB3, and shown again after reopening it | Loader / Manifest / Security Dialog | 毎回取得型の実選択・SB3・別タブ再開・取得の接続 |
| L32 | [four-formats.spec.cts:34](../test/e2e/extension-loader/four-formats.spec.cts#L34) — remote-cacheable: chosen on the add screen, saved in the SB3, and shown again after reopening it | Loader / Manifest / Security Dialog | キャッシュ型の実選択・SB3・別タブ再開・永続キャッシュの接続 |
| L33 | [four-formats.spec.cts:34](../test/e2e/extension-loader/four-formats.spec.cts#L34) — embedded-file: chosen on the add screen, saved in the SB3, and shown again after reopening it | Loader / Manifest / Security Dialog | ファイル埋め込み型の実選択・SB3・別タブ再開の接続 |
| L34 | [four-formats.spec.cts:34](../test/e2e/extension-loader/four-formats.spec.cts#L34) — embedded-data: chosen on the add screen, saved in the SB3, and shown again after reopening it | Loader / Manifest / Security Dialog | data埋め込み型の実選択・SB3・別タブ再開の接続 |
| L35 | [four-formats.spec.cts:119](../test/e2e/extension-loader/four-formats.spec.cts#L119) — opening a remote-cacheable project and choosing to fetch every time keeps nothing in the cache | Loader / Manifest / Security Dialog | 開く人のキャッシュ拒否が実保存へ届き、二度目のロードが取得を必要とする |
| L36 | [four-formats.spec.cts:119](../test/e2e/extension-loader/four-formats.spec.cts#L119) — opening a remote-cacheable project and keeping the copy lets it reopen without the network | Loader / Manifest / Security Dialog | 開く人のキャッシュ許可が実保存へ届き、二度目のロードをネットワークなしで通す |
| L37 | [four-formats.spec.cts:166](../test/e2e/extension-loader/four-formats.spec.cts#L166) — an SB3 whose Manifest uses a retired spelling fails to open with INVALID_SOURCE | Loader / Manifest / Security Dialog | 旧Manifest綴りの拒否を実GUI診断へ渡し、承認や実行へ進めない |
| L38 | [four-formats.spec.cts:184](../test/e2e/extension-loader/four-formats.spec.cts#L184) — the add screen and the open review are worded in Japanese | Loader / Manifest / Security Dialog | 日本語localeを実追加画面・承認・取消の各ポートへ渡す |
| L39 | [four-formats.spec.cts:184](../test/e2e/extension-loader/four-formats.spec.cts#L184) — the add screen and the open review are worded in English | Loader / Manifest / Security Dialog | 英語localeを実追加画面・承認・取消の各ポートへ渡す |
| L40 | [manual-project-uri.spec.cts:39](../test/e2e/extension-loader/manual-project-uri.spec.cts#L39) — a regular project saves an explicitly chosen URI and shows it after reopening the SB3 | Loader / Workbench | GUIから指定したURIを実VMの保存・再読込へ渡す |
| L41 | [manual-project-uri.spec.cts:78](../test/e2e/extension-loader/manual-project-uri.spec.cts#L78) — changing the URI preserves the embedded extension and its contents when saving and reopening | Loader / Workbench | GUIでURIを変更しても埋め込みコードを保持する |
| L42 | [manual-project-uri.spec.cts:110](../test/e2e/extension-loader/manual-project-uri.spec.cts#L110) — explicit opt-out hides the URI field in project properties | Loader / Workbench | 起動時のURI無効化が実作品プロパティへ届く |
| L43 | [packaged.spec.cts:37](../test/e2e/extension-loader/packaged.spec.cts#L37) — official Packager single HTML prompts before unsandboxed execution and runs offline | Packager / Loader | 公開Packagerの実HTMLを生成し、オフラインで明示承認後にだけVMを実行する |
| L44 | [packaged.spec.cts:52](../test/e2e/extension-loader/packaged.spec.cts#L52) — generation-time consent does not grant execution permission in a distributed HTML | Packager / Loader | 生成時の承認を配布後に持ち越さず、実HTMLで拒否を適用する |
| L45 | [packager-builder.spec.cts:8](../test/e2e/extension-loader/packager-builder.spec.cts#L8) — local Packager asks permission, downloads one HTML and executes it offline only after approval, asking again each time it is opened | Packager / Loader / Workbench | 公開ビルダーの入力・生成・ダウンロードから実オフラインHTMLへ接続し、再起動時に再承認する |
| L46 | [persistent-cache.spec.cts:70](../test/e2e/extension-loader/persistent-cache.spec.cts#L70) — a kept copy survives a reload under the project address, and saving and reopening keeps the address | Loader | 実ブラウザーのIndexedDBへ作品URIとdigestを保存し、再ロード・SB3往復で照合する |
| L47 | [persistent-cache.spec.cts:93](../test/e2e/extension-loader/persistent-cache.spec.cts#L93) — choosing to fetch every time records nothing, and a reload then needs the network | Loader | キャッシュ拒否で実IndexedDBに何も保存せず、再ロード時の取得拒否を伝える |
| L48 | [project-load-progress.spec.cts:9](../test/e2e/extension-loader/project-load-progress.spec.cts#L9) — local SB3 shows timed progress and clears it after completion | Workbench / GUI | 実受信タブの解析・承認・VM実行・完了と表示解除を接続し、元作品を保つ |
| L49 | [project-load-progress.spec.cts:9](../test/e2e/extension-loader/project-load-progress.spec.cts#L9) — local SB3 shows timed progress and clears it after cancel | Workbench / GUI | 実受信タブの解析・承認取消・タブ終了を接続し、元作品を保つ |
| L50 | [project-payload-formats.spec.cts:81](../test/e2e/extension-loader/project-payload-formats.spec.cts#L81) — embedded-file stores and reopens source, bundled assets and native assets | Workbench / Loader / Manifest / VM | ファイル埋め込みを実設定画面・SB3・別タブ再開・VMの文書と素材へ渡す |
| L51 | [project-payload-formats.spec.cts:81](../test/e2e/extension-loader/project-payload-formats.spec.cts#L81) — embedded-data stores and reopens source, bundled assets and native assets | Workbench / Loader / Manifest / VM | data埋め込みを実設定画面・SB3・別タブ再開・VMの文書と素材へ渡す |
| L52 | [project-payload-formats.spec.cts:81](../test/e2e/extension-loader/project-payload-formats.spec.cts#L81) — remote-non-cacheable stores and reopens source, bundled assets and native assets | Workbench / Loader / Manifest / VM | 毎回取得型を実設定画面・作品データの承認・別タブ・VMの素材へ渡す |
| L53 | [project-payload-formats.spec.cts:81](../test/e2e/extension-loader/project-payload-formats.spec.cts#L81) — remote-cacheable stores and reopens source, bundled assets and native assets | Workbench / Loader / Manifest / VM | キャッシュ型を実設定画面・作品データの承認・別タブ・VMの素材へ渡す |
| L54 | [project-payload-formats.spec.cts:184](../test/e2e/extension-loader/project-payload-formats.spec.cts#L184) — adds bundled images and sound as native project assets that work after reopening | Workbench / Loader / Manifest / VM | 実メニューの素材追加をVMのコスチューム・背景・音声とSB3再開へ接続する |
| L55 | [published-distribution.spec.cts:11](../test/e2e/extension-loader/published-distribution.spec.cts#L11) — loads a published extension from npm and runs its Scratch block | Template / Loader / Security Dialog | 固定npm成果物を実公開追加画面からsandbox iframeとVMのブロック実行へ渡す |
| L56 | [published-distribution.spec.cts:11](../test/e2e/extension-loader/published-distribution.spec.cts#L11) — loads a published extension from GitHub Release and runs its Scratch block | Template / Loader / Security Dialog | 固定GitHub Release成果物を実公開追加画面からsandbox iframeとVMのブロック実行へ渡す |
| L57 | [resources.spec.cts:59](../test/e2e/extension-loader/resources.spec.cts#L59) — ja: the Plus add screen displays package resource declarations and preserves cancellation | Security Dialog / Manifest | 日本語の実カタログ宣言をGUIへ渡し、狭い画面で説明と取消を保ち、デバイスを起動しない |
| L58 | [resources.spec.cts:59](../test/e2e/extension-loader/resources.spec.cts#L59) — en: the Plus add screen displays package resource declarations and preserves cancellation | Security Dialog / Manifest | 英語の実カタログ宣言をGUIへ渡し、狭い画面で説明と取消を保ち、デバイスを起動しない |
| L59 | [resources.spec.cts:99](../test/e2e/extension-loader/resources.spec.cts#L99) — opening an embedded project resolves declarations before approval and starts nothing on cancel | Security Dialog / Manifest | 実SB3の宣言照合から承認前の表示・取消へ接続し、未知拡張やデバイスを実行しない |
| L60 | [resources.spec.cts:124](../test/e2e/extension-loader/resources.spec.cts#L124) — an embedded extension with a different digest does not inherit another version's resource declaration | Security Dialog / Manifest | 実SB3の異なるdigestへ他版の申告を流用しない |

## Git・WebKitの最後の境界

#862で実行したWebKit1件・Chromium3件の[正式依存の記録](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823#issuecomment-7189266559)を保持する。基準mainまで、`site/project-folder-host.ts` と `test/project-repository-creation.browser.ts`、Git 0.32.1・Project Folder 0.22.1の固定内容は変わっていない。Workbench 0.40.1で追加された表示通知は受信Fileの分岐だけで、`browser-project` IDによるOPFS再開の分岐を変更しない。#863時点のWorkbench実タブ境界はChromium・WebKit各10件が成功している。これらを当該経路の証拠として再利用し、今回のLoader Chromium60件をWebKitの代替証明にはしない。

## #462からの引き継ぎと最小runtime

| 引き継ぎ条件 | 最終判断・証拠 |
| --- | --- |
| ケースごとの所有先とEditorの最小結線 | 上の60件と、[作品/Git](test-browser-project-git-ownership.md)、[Document/YAML](test-browser-document-ownership.md)、[単体/GUI](editor-unit-test-classification.md)、[layout](editor-layout-test-classification.md) の台帳。今回移管する表示詳細は所有先CIの成功後にのみ縮小 |
| 最小runtimeと実EditorのVM/Blockly/host契約 | Test Runtime 0.3.3の[CI](https://github.com/kubohiroya/turbowarp-plus-editor-test-runtime/actions/runs/45807478118)でbuild3・browser5成功、skip 0。実Editorの共通host契約1件成功は[最終結線記録](issue-823-final-integration.md)と実行ログで照合。実行元 `3ef36875` と基準 `70d4aef` の差は同文書だけで、製品・固定値・契約テスト入力は同一 |
| runtimeにない能力 | GUI画面、sandbox worker、OPFSの別タブ、Desktopを最小runtimeで代替しない。今回の実sandboxはL55/L56、実別タブはL31等と進捗、WebKit保管は[#862の記録](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823#issuecomment-7189266559)。存在しない能力を試験済みに数えず、今回のためのruntime拡張も不要 |
| 上流CI・最小範囲・CI時間 | Loader 0.16.1: Node230/browser5、Security Dialog 0.14.2: Node153/browser28、Runtime 0.3.3: build3/browser5が成功。Workbench 0.40.1: Node262/browser34成功・既存8skipで、新規進捗6件は実行成功。各詳細は既存の公開記録を参照し、skipを移管の証拠にしない |

RuntimeのGUI pin `60b87e2f`、VM `88a2c06e`、Blocks `4113c534`、renderer `655edeb5`、storage 2.0.0、SVG renderer 1.1.0、host 0.1.1をGUIのlockfile・Editorのlockfileと照合した。新しいパッケージは作らない。sandboxを使う将来の試験は、能力を個別に整え実行成功を確認してから移す。

## Desktop・OS境界の扱い

[既存の最終結線記録](issue-823-final-integration.md#desktopの承認された1回の検証)と成功ログの `status: passed` を照合した。純正Desktopは埋め込みコードを自動実行せず、専用ウィンドウで配布HTMLを明示承認した後に1回実行し、reporterが42・外部HTTP(S)通信0件だった。

この実機結果は、記録されたHTML SHA-256 `9328dd23a03d4d15f673b0bdec45cebd11c2520e5923e7b82cd3af5b51628b36` とその既存の正式依存照合に対して再利用する。今回生成した別のHTMLを実Electronで再実行したとは扱わない。アプリを起動せずplistを読み、Desktop 1.17.1・Electron 43.8.4が記録と同じことを確認した。今回は画面付きのアプリ・実ピッカー・OSクリップボードを動かしていない。

純正DesktopのEditorはPlus manifest・埋め込みJSを再保存で保持しない。これは製品仕様の境界であり、Plus Editorや配布HTMLの統合成功と混同しない。OSピッカー・OSクリップボード自体の実機確認はこのテスト移管の完了条件へ追加せず、ブラウザー内の入力や別タブの成功を代用証明にもしない。

## CI時間と完了判定

[既存の同条件3回ずつの測定](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823#issuecomment-7177184281)を保持する。ubuntu image・Node26・npm/GUI cache hitを揃えた適格mainジョブの中央値は131→109秒。これは成功済みPRの7工程を再利用できた変更に限る観測で、全PR・製品変更への一律短縮ではない。手動browser/E2Eの削減は通常CIの追加短縮へ計上しない。

Loaderの実行・所有先・保持理由と、Git/WebKit・最小runtime・配布HTML・CI比較の引き継ぎ条件を照合した。旧文書の「未完」はその時点の履歴として区別する。本監査の公開前に残るのは、このテスト/文書だけのPRのCI・マージ・通常配信の結果記録と、Issue #823の最終チェック更新・close。これらはユーザー承認後に実行し、実際のURLとSHAをIssueへ記録する。

Workbenchの重複候補[#163](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/163)はclosed・未マージであることを確認した。採用済み#162・0.40.1の証拠へ集約する。

切り戻しは本PRのテスト2ファイルと監査文書だけをrevertする。製品・依存・GUI・起動フラグは変えない。既存の実行証拠、ユーザー作品、Git履歴、OPFS、承認情報を削除しない。
