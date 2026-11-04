# #151 段階4 バックパックのアプリ内ウィンドウ

Web 版を `?twPlusWindowLayout=1&twPlusInternalWindows=1` で起動し、⚓ で自由配置モードに入る。バックパックの「別画面で開く」操作でアプリ内ウィンドウを表示する。ブラウザーの別ウィンドウにも移せるようにする場合は、`twPlusBackpackPopout=1` も指定する。

`@kubohiroya/turbowarp-editor-windows` がウィンドウの配置、前面化、操作ボタンと一覧を担当する。未公開のため、この検証ブランチでは独立パッケージのコミット `d604993` から作成した `0.3.0` の npm アーカイブをロックファイルで固定する。Editor は表示先を接続し、バックパックは段階2の surfaces・transfer と段階3の表示切り替えを再利用する。

タブ行の右端には「別画面で開く」が1つ表示され、選択中のコード・コスチューム／背景・音をアプリ内に移す。既存の検索欄を同じ行に使う。表示先を変えても同じ編集 DOM を維持し、別のタブを選んでも開いた基本画面を保持する。対象別の編集権・共有履歴・独立した追加ビューは #177 の範囲。

## ローカル検証

段階3と同じ scratch-gui 作業ツリーから、段階4の設定で Web ビルドを生成する。

```sh
# scratch-gui 作業ツリー
CI=1 E2E_GUI_ROOT="$PWD" node node_modules/webpack/bin/webpack.js \
  --config ../editor-stage4/scripts/site/webpack.config.cts \
  --output-path /private/tmp/tw151-stage4-build --bail

# Editor 作業ツリー
TW151_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node test/stage4/check.mjs
```

- アプリ内でのマウス移動、キーボードでの移動とサイズ変更、最大化と復元、最小化とウィンドウ一覧からの復元を確認する。
- 実バックパックの保存済みスクリプトをコード画面に1回コピーし、バックパックにも残ることを確認する。ドラッグには Chrome の自動操作を使う。
- ポップアップ拒否、別ウィンドウとの往復、タイトルバーや元の位置からのドック復帰、⚓ の解除、アプリ内のみでの利用を確認する。

## Desktop ローカルコピー

公式 TurboWarp Desktop 1.17.1 のコピーを `scripts/desktop/README.md` に沿ってこのブランチの Webpack 設定で作成する。起動時に `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1 TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1` を指定すると、⚓ からアプリ内ウィンドウを利用できる。署名済み試験用コピーでは次を実行する。

```sh
node test/stage3/check-desktop.mjs /private/tmp/tw151-desktop4-final.app --internal
```

実バックパックの開閉には macOS のマウス入力を使う。タブ行の操作と画面の DOM 確認には Playwright を使う。段階3の外部ウィンドウ経路を回帰確認する場合は `--internal` を外す。

## 切り戻し

⚓ の解除で表示をドックに戻す。アプリ内ウィンドウだけを無効にする場合は URL の `twPlusInternalWindows` を外して Editor を再起動する。コピー済みのスクリプトは作品に残る。

Desktop は `TW_PLUS_DESKTOP_INTERNAL_WINDOWS` を外して再起動する。
