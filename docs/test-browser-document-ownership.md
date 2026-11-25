# 文書・YAML・復元のブラウザーテスト（#823）

この一覧は、機能の単独検証と、配布済み Editor でしか確かめられない経路を区別する。各検証は生成したローカルの SB3 と headless Chromium を使う。実機の VS Code、OS 入力、画面付き Desktop は実行しない。起動を試みた場合に失敗する代替を復元テストにも渡す。通常の Editor CI では下記ブラウザー本体を実行しない。

| Editorテスト | 保持する接続 |
| --- | --- |
| `document-source` | 4つの実パッケージ、VM の停止、外部保存の作業ファイル、標準 SB3 の実保存と再読込。 |
| `document-save` | 実ダイアログが不正な作業ファイルを拒否し、正しい作業ファイルだけを取り込み、閉じる／キャンセルでは取り込まず、どれも勝手に SB3 をダウンロードしない。 |
| `document-views` | source から実 Blockly への往復と、標準 SB3 内のコメント・アセット・別文書の維持。 |
| `yaml-blocks-workspace` | 実 Blockly の値の修正、最適化保存後のブロック ID 変更、実 SB3 再読込。 |
| `yaml-multiline-workspace` | 実テキスト欄で改行を維持して操作できること、コメントや空行を壊さず最適化保存・再読込できること。 |
| `yaml-roundtrip` | 実GUIから外部作業ファイルを編集し、不正内容を拒否・再試行。保存後のアセットと作品差し替え時の古いセッションの終了。 |
| `yaml-multi-document` | 同名の別文書を provider/ID・スキーマ・作業ファイルで区別し、2件の変更だけがアーカイブに入る。 |
| `yaml-dockview` | 実タブを移動／分割しても下書きが残り、元の作品を保存して変更済み表示が消え、再読込と旧表示モードでも開ける。 |
| `dockview-restore` | ブラウザープロファイル再起動後の実文書・プレビュー・VM 対象・幾何の復元と、別窓が自動で開かないこと。 |
| `extension-review` | 実の配布 host と固定された確認ダイアログの結線。ローカル作品の別タブ、取り消し／再試行、個別の最終承認や意図しない実行の抑止を個別に検証。 |
| `representation-preview` | 実VM・実 Blockly の表現ごとの描画、閲覧専用ワークスペース、プレビューが元作品・メインワークスペースを変更しないこと。 |
| `typescript-block-test-loop` | 実作品・ローダー・テスト用VM／フレームにつなぎ、修正前と修正後の結果・以前の許可の非再利用を確認。 |

文書ダイアログで旧ボタンを表示しないことは [Document Editor 0.2.1 のCI](https://github.com/kubohiroya/turbowarp-document-editor/actions/runs/45114921120) の実ブラウザーケースに委ねる。標準 SB3 保存とアセット比較は `document-source` と `document-views` に残し、`document-save` では繰り返さない。YAML codec の BOM／CRLF・コメント・バイト保存は上流の [YAML JSON](https://github.com/kubohiroya/turbowarp-yaml-json) が検証するが、実 Blockly と最適化 SB3 は別の境界である。

描画中の非表示、キャンセル時の後片付け、完成時の配置とメインワークスペースの維持は、[Document Editor #24 のCI](https://github.com/kubohiroya/turbowarp-document-editor/actions/runs/45724268054) で固定版の実 ScratchBlocks を使い直接検証する。Editor では `representation-preview` に、実作品の VM、元のワークスペース、プレビュー定義が元に戻ることの検証を残す。

固定 Editor `07b7ccb` で移管前の文書・プレビュー6件と YAML・復元7件、移管後の `representation-preview` を確認。拡張レビュー10件は別のハッシュ検証済みローカルプレビュー（GUI `60b87e2`、Security 0.14.0）で実行し成功。すべて skip 0。古い承認UIの操作はローカル生成 fixture 専用の共通 helper に置き換えた。設定や承認の省略は行わない。変更の切り戻しは Editor の該当PRを revert する。通常CIの時間短縮には計上しない。
