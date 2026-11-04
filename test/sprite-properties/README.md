# #176 領域 (2) スプライト設定

段階4のウィンドウ基盤に #175 の独立パッケージを接続する。scratch-gui は #175 の任意接続口と既存の VM 更新経路を使用する。Editor は同じフォームをアプリ内の表示先へ移し、編集中の DOM と対象選択を引き継ぐ。

Web 版を `?twPlusWindowLayout=1&twPlusInternalWindows=1&twPlusSpriteProperties=1` で起動し、⚓ を押す。「スプライト」見出しの右端から開く。タイトルバーの「閉じる」か空き領域の「ここに戻す」でドックへ戻す。

## ローカル検証

scratch-gui の固定リビジョンを用意して Editor 側で配信ビルドを行う。生成済み micro:bit 資産、固定 Packager ソース、依存が必要。

```sh
export E2E_GUI_ROOT="$(cd ../gui-stage5 && pwd)"
export TW_PLUS_PACKAGER_ROOT="$(cd ../../packager-issue4 && pwd)"
npm run build:pages
EXPECTED_REVISION=$(git rev-parse HEAD) node scripts/site/check-artifact.ts "$E2E_GUI_ROOT/build"
```

プレフィックスなしの開発用 Webpack 出力を用意し、実エディターを起動する。

```sh
SPRITE_PROPERTIES_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node test/sprite-properties/dock.mjs /private/tmp/tw151-stage5-web
```

- 従来フォームへの復帰、対象選択と変更の反映、最小ドックのスクロールを確認する。
- アプリ内へ移したフォームから同じ VM を編集し、縦長の1列、横長の1行、⚓ でアンドックボタンを隠してもウィンドウが維持され、閉じる操作で復帰することを確認する。
- 配信検査で `sprite-properties` と `windows` のソースアーカイブ、および先行するローカルパッケージの GPL ライセンスとソース情報を確認する。

## Desktop のローカルコピー

`scripts/desktop/README.md` の手順でこのブランチの設定を使って公式アプリのコピーを作成する。Desktop の起動設定は `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1 TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1 TW_PLUS_DESKTOP_SPRITE_PROPERTIES=1`。

```sh
node test/stage3/check-desktop.mjs /private/tmp/tw151-stage5-desktop.app --sprite-properties
```

## 切り戻し

タイトルバーの「閉じる」またはドックの「ここに戻す」で設定を戻す。設定パネルの独立機能を切り戻す場合は `twPlusSpriteProperties` を外して再起動し、従来の `SpriteInfo` に戻す。確定済みの変更は作品に保持する。

Desktop では `TW_PLUS_DESKTOP_SPRITE_PROPERTIES` を外して再起動する。
