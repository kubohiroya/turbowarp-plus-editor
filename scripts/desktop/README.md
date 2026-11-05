# #151 段階3の Desktop 接続

公式 TurboWarp Desktop 1.17.1（`6e7bc5934f27cd658d17bf8742db4357ae057657`）を基準に、Editor と同じ GUI、バックパック、転送パッケージを実 Desktop レンダラーに接続する。公式のレンダラー入口、DesktopHOC、main、preload、カスタムプロトコルを使用する。Plus Desktop リポジトリの初期実装がまだ存在しないため、公式アプリのコピーを使用する。

## 起動と権限

- 既定の起動では Plus 標準配置を使用する。従来の配置で起動するには `TW_PLUS_DESKTOP_STANDARD_LAYOUT=0` を指定する。従来の検証用のローカルコピーでは `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1` と `TW_PLUS_DESKTOP_BACKPACK_POPOUT=1` の両方を明示し、⚓ を押すとバックパックのアンドックボタンが出る。両フラグの既定は OFF。
- main は予約したフレーム名と `about:blank` の組を検査し、起動時に許可した画面の種類ごとに1枚だけ開く。初期化が完了した子ウィンドウに固定のパッケージ内 URL をロードする。子は sandbox と context isolation を有効にする。Plus 標準配置の子は、最大化・最小化・通常サイズへの復帰に限定した preload を使う。main は送信元と対象 URL を照合する。
- レンダラーが同一オリジン・起動チケット・接続元を検証して MessagePort を確立した後、子の `opener` を切る。表示は親から同一オリジンの固定資産へ React Portal で渡す。

## ローカル検証

公式 Desktop の固定ソースと、Editor の `site/source.json` が指す scratch-gui の作業ツリーおよび依存を用意する。

```sh
# scratch-gui 作業ツリー
CI=1 NODE_ENV=production ROOT= E2E_GUI_ROOT="$PWD" \
  TW_PLUS_DESKTOP_SOURCE=/private/tmp/tw151-desktop23-official \
  node --openssl-legacy-provider node_modules/webpack/bin/webpack.js \
  --config ../editor-desktop23/scripts/desktop/webpack.config.cjs \
  --output-path /private/tmp/tw151-desktop23-build --bail

# Editor 作業ツリー
python3 scripts/desktop/prepare-app.py /private/tmp/tw151-desktop23/TurboWarp-Plus-Backpack-verified.app \
  --build /private/tmp/tw151-desktop23-build --test-control
TW_PLUS_NATIVE_INPUT=1 \
  node test/stage3/check-desktop.mjs /private/tmp/tw151-desktop23/TurboWarp-Plus-Backpack-verified.app
```

再パッケージ時は元の ASAR の整合性とコピーのアドホック署名を検証する。テスト時は別プロファイルを使い、CoreGraphics の HID で ⚓・バックパックの展開・別窓を開く操作・別窓からのドラッグ・ドック操作を行う。テスト専用制御はウィンドウの配置・フォーカス・観測・終了だけを受け付け、`--test-control` を指定したコピーに限って組み込まれる。CDP は実ストレージへの試験データ登録、選択切り替え、DOMとVMの検証に使う。

## 検証結果

- macOS 上の TurboWarp Desktop 1.17.1 / Electron 43.8.4（Chromium 150.0.7871.250）で4シナリオ通過。ログは `/private/tmp/tw151-desktop23-native-verified.log`。
- 既定 OFF で予約した別窓要求を拒否する。ON ではネイティブクリックで実バックパックを開き、子の sandbox・context isolation、preload／Node／opener なし、許可外の新規窓・ページ遷移の拒否を確認した。
- OS マウスの trusted dragstart／drop により、読み込み中に選択を切り替えても、ドロップ時のスプライトだけにスクリプトが1回コピーされた。ネイティブクリックで元のバックパックへ戻り、SB3 の再読込後もコピーが残った。

## 切り戻し

⚓ でアンドックボタンを非表示にしても、開いているウィンドウはそのまま使える。ドック操作で元に戻し、保留の読込を取り消す。Desktop の別窓機能を切り戻す場合は `TW_PLUS_DESKTOP_BACKPACK_POPOUT` を外して再起動する。確定した作品内のスクリプトは維持する。

検証対象は macOS のローカルアプリでの実バックパックからメインコード画面への、対応する組み込みスクリプトの一方向コピーとドック復帰。正式配布、Windows／Linux、外部コード画面、逆方向、他のアイテムと依存付きスクリプトは後続。
