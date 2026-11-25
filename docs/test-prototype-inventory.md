# 試作・補助テストの棚卸し

[Editor #823 の第5節](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823)の記録。Editor `5b6c900` を基準とする。表中の `stage*`・`sprite-properties`・`vscode-edit-driver` は `test/` 以下。旧段階の受け入れ記録は現行の製品・OSを再検証した結果とは区別する。

| ファイル・入口 | 到達経路と分類 | 実行区分 / 保持根拠 |
| --- | --- | --- |
| stage2/README.md | #151 段階2の契約・手順・2026-11-04のログ | 歴史資料。無効な Editor 契約テストコマンドのみ所有先へ誘導 |
| stage2/build.ts | READMEの直接コマンド。esbuild で同ディレクトリ editor.ts と製品の site/editor-backpack/child.ts を束ね、HTMLを出力 | 手動 fixture build、通常CIの検証対象ではない。Desktop #155 が要求する別名出力を保持 |
| stage2/editor.ts | build.ts の入口。windows /surfaces、/transfer と試験 DOM だけを使用 | 重複試作候補だが製品の作業データを書き換えない最小ホスト。DOM の isTrusted・ownerDocument・双方向 DataTransfer を実測するため owner の Node 契約と等価でない |
| stage2/editor.html | build.ts が editor.html / gui.html にコピー。Chrome は前者、Desktop 子ルート付きの親は後者 | 上記の最小ホストのドック、選択、drop fixture |
| stage2/code-popout.html | build.ts が code-popout.html / backpack-popout.html にコピー。child.js は production と共用の子を試験用に束ねる | 本命と旧 Desktop 梱包の要求ファイル。旧バンドラーの除去は別件 |
| stage2/check-browser.ts | READMEの直接コマンド。CDPで監視し同じ native-mouse.py を起動 | macOS実入力必須のChrome・旧Desktop試験。通常CIでは実行されない、契約移管で消さない |
| stage2/native-mouse.py | stage2/check-browser.ts、stage3/check.ts、stage3/check-desktop.ts から python3 subprocess | 実入力共通。通常実行しないが削除は3入口の機能を破壊 |
| stage3/README.md | 初回製品接続の受け入れ基準。段階4への前提 | 歴史資料。存在しない段階2契約・作品プロパティのコマンドを所有先へ誘導 |
| stage3/check.ts | README直接。版検査・layout-menu fixture、Save/Reload、headless lifecycle と native 成功経路を分離 | 実エディタのWorkbench backpack/Windows/GUI、スプライト選択の統合。headless既定で native branchは明示env |
| stage3/check-desktop.ts | 各 README、AGENTS、docs/architecture、scripts/desktop/README、editor-revision.test.tsから。版検査・layout-menu・stage6拡張2本・native-mouse。 | パッケージ化したホストの外部window、focus/reload、コード・backpack・stage・対象などの実体。npm testが不正ASAR版のpreflightだけ実行、Electron起動はしない。nativeフラグなしでも画面を開くので今回不可 |
| stage3/desktop-control.cts | scripts/desktop/prepare-app.py --test-control が型を消して試験用ASARに組み込む。Desktop runnerと標準入出力で応答 | 試験用の Electron BrowserWindow 操作。npm build/test-driverや一般配布との混同不可 |
| stage4/README.md / check.ts | README直接、版検査と layout-menu | Workbench + windows + GUI 実体: in-app basic tabs、backpack、fullscreen・ワークスペース縮小、最小化・復元。headless、通常CIの実行なし |
| stage5/README.md / stage.ts / targets.ts | 各 README直コマンド、版検査・layout-menu | Workbench stageとsprite-panesをGUI・実VMに結線。stageはcanvas同一性・表示、targetsは選択同期・設定の連動を担う。headless手動 |
| stage5/stage-popout-desktop.md | scripts/desktop/webpack.config.ctsと stage3/check-desktop.ts --stage-popoutの記録 | 関連する実機の受け入れと rollback を保持 |
| stage6/README.md | 公開機能ページ index.html / index.en.html からリンク。stage3 Desktop各分岐、css-animation-fields.ts、専用webpackの手順 | 外部公開中の検証範囲、サポートしていない入力の条件と実機記録。歴史資料としても消さない |
| stage6/code-popouts.webpack.config.cts | READMEが scratch-gui webpack --config で指定。共通 configを呼び、editor + real site/editor-views/code-popout.tsx に entry を縮小して HTML生成 | フィクスチャの専用ビルド入口。通常の build:pages の重複として消せない |
| stage6/code-windows.ts / sprite-code-windows.md | MD直接コマンド、版検査・layout-menu、editor-revision.test.ts | 追加コードウィンドウの対象/VM同期・編集・共有履歴のheadless統合。npm testは欠損・不一致・期待版欠損のpreflightだけ実行 |
| stage6/css-animation-fields.ts | README に一般、--programmatic-promise、--async-commit、--delayed-set-value、--attached-set-value、--collect-before-save、--layout、--resources の呼出。版検査、esbuild、code-views、windows、拡張fixture | headlessでブラウザー描画・Promise/commit、収集・保存、外部窓のCSSとリソースを実測。owner内の DOM/契約とは別。全体を捨てる等価性なし |
| stage6/fixtures/native-extension.ts / programmatic-extension.ts | css-animation-fields.ts と stage3/check-desktop.ts が動的に読む。code-views の公開型を import | 共有なので同名テストの片方と一緒に消せない |
| sprite-properties/README.md / dock.ts | README直接コマンドと stage3/check-desktop.ts --sprite-properties。版検査、layout-menu | sprite-panes の所有テストはフォーム自体を証明、dock.ts は同一DOM/実VM更新・アプリ内配置・GUIフラグ/fallbackを実測。既定headless、実機コマンドは別 |
| vscode-edit-driver/{README.md,package.json,tsconfig.json,extension.cts} | README英日からリンク、root build:test-driver -> 専用tsconfig -> dist/extension.cjs -> extension manifest main。helperが --extensionDevelopmentPath で指定 | 通常 Editor build の一部ではない、公式VSCodeの検証を行う手動機能。@types/vscodeも残す。ビルド成功はVSCode実行成功ではない |
| test/yaml-native-launch.ts / test/native-dialog-save.ts | 前者は後者がimport、ドライバーREADMEのAPI。後者は独立した native YAML/save 検証スクリプト、標準 npm test のglob外 | VSCode本体の拡張起動/VSC schema/ファイル編集を実証する唯一の接続。CLI/モックには還元不可 |
| test/e2e/turbowarp/native-picker.cts / native-picker.swift | editor.spec.cts が require、CTSがSWIFT runnerを起動。package test:e2e:nativeで指定された chrome-macos-native 経路のみOS入力 | headless E2E と分ける。通常版は import のみの可能性、Swift実行なし。OS権限の実測は今回不可 |
| test/fixtures/layout-menu.ts / select-backdrop.ts | stage3–6 + sprite-propertiesでlayout-menu、文書・YAML・Git・Playwright・native系でも利用（select-backdropは文書/YAML/browser refs） | active。残る Editor の結線確認で共有 |
| test/fixtures/git-native-project.ts | git-connection.browser.ts / git-remote.browser.ts | active。stageからは未参照だが §5 の整理で消さない |
| test/fixtures/document-source/runtime.ts / yaml-editor/{base-project.ts,settings-extension.ts} | scripts/yaml-editor/build-{document-source,settings}-fixture.ts がesbuild入力、base-projectは Playwright settings-project.cts が実行 | active。通常 TypeScript checking と fixture生成・E2E実行を区別 |

段階2〜6の実行コード・フィクスチャは17ファイル、5,415行。段階ごとの Markdown はこの数に含まない。tsconfig.jsonが test/**/*.ts + test/**/*.cts を含むため、通常のCI typecheckが全TS/CTSを読む。一方 tsconfig.build.jsonはsrc/config + 指定CLIのみ、stage runner・VSCode・補助fixtureを製品へ出力しない。stage2 build/test driver/専用webpackは明示した時にだけビルドする。

## 削減と切り戻し

- 既に移管・削除された `test/stage2/contracts.test.ts`（Editor #606・#753）と `test/project-tools/properties.test.ts`（Editor #790）を呼ぶ古いコマンド3参照を、所有先で実行する案内に更新した。
- 実行ファイルは削除しない。単体テストと検証項目が重なるランナーでも、実ブラウザーの別窓・転送、実VMを含むGUI結線、OSレベルの入力などを別に確認している。同じ機能名だけでは検証の同等性を示せない。また手順が現在も公開ページから参照される、または他のランナー・ビルドに共有されるものがある。
- 切り戻しはこの文書変更のrevert。版固定、試験用プロファイル、OS入力ガード、既存の実機メモに変更はない。

## 通常実行と実機確認の分離

通常のローカル検証では画面を出さない。今回の棚卸しに用いた実行は以下のとおり。

| 所有先 | 実行 | 結果 |
| --- | --- | --- |
| Editor | `npm run typecheck`、`npm run build:test-driver`、`node --test test/editor-revision.test.ts`、`node --test --import ./test/asset-hooks.ts test/extension-loader.test.ts` | 型・ビルド成功、版検査2件と結線30件が成功。ブラウザー／Desktopを起動しない |
| Editor | `node test/stage2/build.ts <出力先>` | 試験HTML・JSの生成のみ成功 |
| windows 0.2.3 | `npm test` | 27件が成功、skipなし。表示先・転送・ブラウザー境界のNode/DOM契約 |
| workbench 0.39.0 | `npm test`、`node --test test/layout.browser.ts` | 250件＋ローカルfixtureでのheadless 5件が成功、skipなし |
| sprite-panes 0.11.3 | `npm test`、`node --test test/sprite-properties.browser.ts` | 89件＋ローカルfixtureでのheadless 4件が成功、skipなし |
| code-views 0.26.5 | `npm test` | 178件が成功、skipなし |

上の表はローカル実行結果。GitHub Actions のログでは、Editor が固定する各版について以下を確認した。

| 所有パッケージ | GitHub Actionsでの実行 |
| --- | --- |
| windows 0.2.3 | [CI: b0b510c](https://github.com/kubohiroya/turbowarp-plus-editor-windows/actions/runs/45184961682)。Node 27件成功、skipなし |
| workbench 0.39.0 | [CI: 694a58e](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45715128082)。Node 250件成功、skipなし。ブラウザーテスト28件中20件成功、8件skip |
| sprite-panes 0.11.3 | [CI: 7f0e65c](https://github.com/kubohiroya/turbowarp-plus-editor-sprite-panes/actions/runs/45131755031)。Node 89件、ブラウザー18件成功、skipなし |
| code-views 0.26.5 | [CI: 57084d8](https://github.com/kubohiroya/turbowarp-plus-editor-code-views/actions/runs/45495163888)。Node 178件、ブラウザー87件成功、skipなし |

workbenchのビルド済みEditorを使うブラウザーテストには `TW_PLUS_LAYOUT_EDITOR_URL` 等を設定しないとskipになるものがある。standalone fixtureの成功やCI全体の成功とは別に扱う。

[AGENTS.md](../AGENTS.md) に従い、`TW_PLUS_NATIVE_INPUT=1`、`E2E_NATIVE=1`、`E2E_HEADED=1`、画面付きの Electron、公式VSCode本体、Swift picker その他の実入力は、その操作について今回の明示依頼があるときだけ実行する。とくに `test/stage3/check-desktop.ts` は実入力フラグなしでも画面付き。今回、これらは実行していない。過去の結果を再利用する場合は、版・OS・権限・入力・ウィンドウ接続条件を照合する。ビルドが成功しただけのものを実機検証済みとはしない。
