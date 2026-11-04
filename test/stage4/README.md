# #151 段階4 バックパックのアプリ内ウィンドウ

Web 版を `?twPlusWindowLayout=1&twPlusInternalWindows=1` で起動し、⚓ で自由配置モードに入る。バックパックの「別画面で開く」操作でアプリ内ウィンドウを表示する。ブラウザーの別ウィンドウにも移せるようにする場合は、`twPlusBackpackPopout=1` も指定する。

`@kubohiroya/turbowarp-editor-windows` がウィンドウの配置、前面化、操作ボタンと一覧を担当する。未公開のため、この検証ブランチでは独立パッケージのコミット `bc2e253` から作成した `0.2.0` の npm アーカイブをロックファイルで固定する。Editor は表示先を接続し、バックパックは段階2の surfaces・transfer と段階3の表示切り替えを再利用する。

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

## 切り戻し

⚓ の解除で表示をドックに戻す。アプリ内ウィンドウだけを無効にする場合は URL の `twPlusInternalWindows` を外して Editor を再起動する。コピー済みのスクリプトは作品に残る。
