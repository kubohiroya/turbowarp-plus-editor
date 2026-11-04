# #151 段階2のローカル試作

段階1のマージ済み main を基点とする。試作は独立した2つのローカルパッケージと検証ページで動く。scratch-gui、通常の Editor 起動、splitter の製品接続はそのまま使える。検証ページで実際に移すのはテキストの試験パネルで、バックパックとコード画面の製品接続は段階3以降に扱う。

## 接続契約

| 所有先 | 責務と境界 |
| --- | --- |
| `@kubohiroya/turbowarp-editor-surfaces` | ドック・初期化中・外部表示の遷移。ホストの `open(request)` をユーザー操作の中で同期的に呼ぶ。戻り値は拒否の `null`、または準備完了の Promise、切断通知、閉じる操作を持つ接続。準備完了まではドックを維持し、切断やエラーで表示を戻す。遅れて届いた初期化結果は無視する。型にブラウザー・Electron・GUIへの依存を持たない |
| ホストアダプター | `window.open` やDesktopの許可設定、同一オリジン・開いたウィンドウ・URL・起動チケットの照合、`MessagePort` の準備と解除、閉鎖・再読込・タイムアウトの通知。DOMの配置や製品の権限は呼び出し側が決める |
| `@kubohiroya/turbowarp-editor-transfer` | コピーの転送参照を作り、型・版・Editorセッション・転送ID・期限を照合する。非同期読込の前に1回だけIDを取得し、drop時点の対象を固定する。受理後の再送・期限切れ・取消・セッション終了で適用を抑止する。公開MIMEの参照にはデータ本体や読み込みURLを入れない |
| 転送の利用側 | `dragstart` と `drop` の同期区間で DataTransfer を書き、読む。ドロップ先の作品セッション・対象IDを渡し、適用コールバックで対象の存続と書き込み可否を再確認する。副作用の確定は同期的な1操作とし、読込には AbortSignal を渡す |

2パッケージ間に依存はない。試験ページでは #155 のバックパックと同様に、親が転送参照を管理する。同じパネル要素を同一オリジンの外部documentへ移すため、両documentで同じ親のレジストリを使う。別のJavaScript領域で初期化したコード画面からの転送要求は、次段階で親へ中継する。公開ライブラリの選定、正式な配布形式・依存固定は後続で行う。

## 再現

Editor作業ツリーから実行する。macOSのGUIセッションとOSマウスイベントを送信する権限が必要。ドラッグの自動操作はCoreGraphicsのHIDイベントを使い、CDPはページの観測・配置・ライフサイクル検証に使う。

```sh
node --test test/stage2/contracts.test.ts
node test/stage2/build.mjs
node test/stage2/check-browser.mjs

# #155 のローカルブランチにある再パッケージ用スクリプトを利用
python3 ../gui-155/scripts/issue-155-code-popout/prepare-desktop.py \
  /private/tmp/tw151-stage2/TurboWarp.app --build /private/tmp/tw151-stage2/build
TW151_DESKTOP_APP=/private/tmp/tw151-stage2/TurboWarp.app node test/stage2/check-browser.mjs
```

Desktopでは公式TurboWarp Desktop 1.17.1のアドホック署名したローカルコピーを用い、#155の製品のmain・preload・許可経路を通す。rendererのGUIエントリーにはこの試験パネルを載せる。通常のDesktopエディターや段階3のバックパックがこのビルドに組み込まれたことを示す試験とは区別する。

## 切り戻し

試験パネルをドックへ戻し、接続と一時的な転送セッションを閉じる。検証ページ／Desktopコピーの起動をやめると通常のEditorと段階1のsplitterを利用できる。試作から利用者のプロファイル、作品、バックパックのストレージへ書き込まない。

## 結果（2026-11-04 JST）

- 契約テスト6項目と対象ファイルの TypeScript strict チェックが通過。既存 splitter の unit 3項目も通過。
- macOS の Chrome 156 と、TurboWarp Desktop 1.17.1／Electron 43.8.4 のローカルコピーで各3シナリオが通過。拒否・準備失敗でのドック保持、OS入力での双方向コピー、明示ドック・子再読込・子閉鎖・親再読込後の単一表示を確認した。
- 製品のバックパック、複数のコード画面、Windows／Linux、その他のブラウザーは今回の検証範囲外。段階3ではこの契約を既存のローカルバックパックとスクリプトコピーへつなぐ。
