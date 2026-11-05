# #151 段階4 バックパックのアプリ内ウィンドウ

Web 版を `?twPlusWindowLayout=1&twPlusInternalWindows=1` で起動し、⚓ を押してアンドックボタンを表示する。バックパックの「別画面で開く」操作でアプリ内ウィンドウを表示する。ブラウザーの別ウィンドウにも移せるようにする場合は、`twPlusBackpackPopout=1` も指定する。

`@kubohiroya/turbowarp-editor-windows` がウィンドウの配置、前面化、操作ボタンと一覧を担当する。未公開のため、この検証ブランチでは独立パッケージのコミット `15ac7c2` から作成した `0.4.0` の npm アーカイブをロックファイルで固定する。Editor は表示先を接続し、バックパックは段階2の surfaces・transfer と段階3の表示切り替えを再利用する。

タブ行の右端には「別画面で開く」が1つ表示され、選択中のコード・コスチューム／背景・音をアプリ内に移す。既存の検索欄を同じ行に使う。表示先を変えても同じ編集 DOM を維持し、別のタブを選んでも開いた基本画面を保持する。対象別の編集権・共有履歴・独立した追加ビューは #177 の範囲。

## 全画面とウィンドウ操作

「エディター全体を全画面表示」は、⚓ の状態にかかわらず、メニュー・ダイアログ・アプリ内ウィンドウを含むエディター全体に適用する。全画面解除後の通常サイズや、外枠のリサイズで作業領域が狭くなったときは、ウィンドウをその範囲に収めて表示する。

- **最小化**では同じ画面を一時的に隠す。ウィンドウ一覧で名前を選ぶと再表示する。
- **閉じる（ドックに戻す）**では基本画面を元のドックへ戻す。「ここに戻す」も同じ基本画面を戻す。追加ビューの終了と基本ドック先への引き継ぎは #177 の受け入れ範囲とする。
- **画面内に戻す**では、一覧にあるウィンドウの位置・サイズを現在の作業領域に合わせる。最小化は維持する。位置・サイズは Editor のセッション内で保持し、作品には保存しない。
- **別ウィンドウへ移す／アプリ内に戻す**では、同じバックパックの表示先を切り替える。アプリ内へ戻ると直前の位置とサイズを使う。

## ローカル検証

段階3と同じ scratch-gui 作業ツリーから、段階4の設定で Web ビルドを生成する。

```sh
# scratch-gui 作業ツリー
CI=1 E2E_GUI_ROOT="$PWD" DISABLE_V8_COMPILE_CACHE=1 node node_modules/webpack/bin/webpack.js \
  --config ../editor-stage4/scripts/site/webpack.config.cts \
  --output-path /private/tmp/tw151-stage4-workarea-final-web --bail

# Editor 作業ツリー
TW151_STAGE4_BUILD=/private/tmp/tw151-stage4-workarea-final-web \
  TW151_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node test/stage4/check.ts
```

- アプリ内でのマウス移動、キーボードでの移動とサイズ変更、最大化と復元、最小化とウィンドウ一覧からの復元を確認する。
- 実バックパックの保存済みスクリプトをコード画面に1回コピーし、バックパックにも残ることを確認する。ドラッグには Chrome の自動操作を使う。
- ポップアップ拒否、別ウィンドウとの反復往復と位置の保持、ドック復帰、⚓ でアンドックボタンを非表示にした際のウィンドウの維持、アプリ内のみでの利用を確認する。
- 一覧での前面化、全画面切替と拒否時の保持、画面内への位置補正と最小化状態の維持を確認する。

## Desktop ローカルコピー

公式 TurboWarp Desktop 1.17.1 のコピーを `scripts/desktop/README.md` に沿ってこのブランチの Webpack 設定で作成する。起動時に `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1 TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1` を指定すると、⚓ からアプリ内ウィンドウを利用できる。署名済み試験用コピーでは次を実行する。

```sh
TW_PLUS_NATIVE_INPUT=1 node test/stage3/check-desktop.ts /private/tmp/tw151-stage4-workarea-final.app --internal
```

実バックパックの開閉には macOS のマウス入力を使う。タブ行の操作と画面の DOM 確認には Playwright を使う。段階3の外部ウィンドウ経路を回帰確認する場合は `--internal` を外す。

## 切り戻し

タイトルバーの「閉じる」またはドックの「ここに戻す」で元に戻す。アプリ内ウィンドウだけを無効にする場合は URL の `twPlusInternalWindows` を外して Editor を再起動する。コピー済みのスクリプトは作品に残る。

Desktop は `TW_PLUS_DESKTOP_INTERNAL_WINDOWS` を外して再起動する。

## スプリッターとアンドックボタン

区切り線は通常の編集レイアウトで既定有効。⚓ を押す前も、押してアンドックボタンを表示した後も、マウスやキーボードで幅と高さを調整できる。⚓ でボタンを非表示にしても開いているウィンドウは維持し、閉じる操作やドックの「ここに戻す」で復帰できる。

区切り線だけを無効にするには、Web 版の起動 URL に `twPlusSplitter=0` を指定するか、Desktop を `TW_PLUS_DESKTOP_SPLITTER=0` で起動する。保存済みの幅・高さの比率は次に有効にしたときに復元する。
