# Editor の作品フォルダー・Git のブラウザーテスト

[#823 §2](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823) の分類。Editor 固定ビルドは
`6aaafd77de7b9e2a9ed03010c58df1160c6d9e71`、Git 認証フィクスチャは mock BFF 設定を持つ `9285d2e20e22fbf7056f92555af2c67fbbac1e28`、GUI は `60b87e2f2503206847f509285aa4de3cee3670c7`。
使ったリポジトリ、プロジェクトファイル、認証プロキシは使い捨てまたはテスト用で、実 GitHub 認証や OS 入力は行っていない。

| テスト | Editor 側に残す境界・分離先 |
| --- | --- |
| `project-folder` | File メニューから別タブでフォルダーを開き、実 VM、ブラウザーとファイルシステム、Editor の保存・Git の差分・履歴・監視を結ぶ。テキスト表示や行の装飾などコンポーネント内部は Project Folder。 |
| `project-folder-save` | 既存フォルダーと作品を保護する取り消し、既存リポジトリへの接続と無関係なファイルを含めない実コミット。 |
| `project-url`、`project-catalog-editor` | 別タブ、固定ローカル URL とカタログ追加・継続。外部作品の読み込みと実拡張動作はこの棚卸しの結果に含めない。 |
| `git-connection` | File メニュー、Editor の設定再読込、Desktop preload と Cloudflare の実行経路、アカウントと許可の引き継ぎ。純粋な表示・入力制御は Git。 |
| `git-remote`、`git-pull-request` | Editor 未保存変更による pull 拒否、Smart HTTP による実通信、同一操作 ID の再試行、別タブのフォーカスやマークの保持。物理ファイルの変更を検出する pull 判定と、変更済み head のマーク除去は Git。 |
| `project-publication` | Editor が現在のソース・ブランチをダイアログへ渡す。各公開モードの規則、既定選択やリンク文言は Git。 |
| `project-repository-creation` | 実 VM の最初の保存と Git コミット、作成結果から別タブを開く。Chromium で Desktop 接続と Cloudflare 接続のデバイス保存、Cloudflare 接続のブラウザー保存の3経路を確認。WebKit の完了は未検証。 |

Project Folder 0.22.0 の [固定版 CI](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/actions/runs/44949433556/job/136983876411) は単体82件とブラウザー24件成功。明示 skip 1件は根拠にしない。Git 0.32.0 の [固定版 CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45581094320) で公開ポリシーと実 Smart HTTP の物理ファイル変更時の保護を、[Git #85 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45724587063) では設定の復元、接続先固定と認証フォームの3件を確認した。 [Git #84 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45721385184) が実行した確認済み件数の即時反映は繰り返さず、Editor では画面切り替えと別タブ再開でも件数が保持されることを確認する。

固定ビルドのヘッドレス実行は、現行フォルダー7件、フォルダー保存1件、Git の接続・同期2件、公開4件、リポジトリ作成の Chromium 3件が成功、スキップなし。個別の対象別に実行し、通常CIの時間短縮には計上しない。

実デバイスの一覧では、拡張なしの使い捨てフィクスチャをサブフォルダーにドロップし、日本語名のバイナリの内容と元ファイルを保ち、同名の既存ファイルを上書きしないことを確認する。現行経路の13件が成功し、旧メニュー名を前提とする1件は別に失敗した。スキップにはしていない。

ブックマークのファイル再選択は一覧の閉鎖だけでなく、受け取り側タブの VM に実際に SB3 の内容が届くことを、拡張なしの固定フィクスチャで確認する。

**未完:** 旧 `Open Project Folder…` と独立したリポジトリ選択が前提の大きな統合テストは、現在の入口では初期操作で失敗する。実ルートで別々に検証したものだけを分離し、任意の入れ子作品フォルダーを別の親リポジトリに結び付ける旧 UI は、[リポジトリルートに作品を置く現行仕様](../features/git/index.html) に置き換わった。従来の `project/` を扱う互換・移行テスト、作品だけに限定する読み込み、一部のファイル操作、ステージ済みファイルの保護、PR バッジなどは別の責務であり、未移行の検証は削除しない。WebKit はブラウザー保管の受け渡し後、実作品を読む前の `FileSystemDirectoryHandle.resolve()` でレンダラーが終了する。正常な別タブ起動と通常の SB3 の受け渡しを確認しても、この失敗の代替にはならない。

Project Folder の [改名・削除確認 CI](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/actions/runs/45726319919) は、ブラウザー内保存のファイルとフォルダーを使い、改名時の内容保持、取り消し時の無変更、確認後の削除を実行した。Editor には、実デバイスフォルダーの改名後もファイル内容と無関係な Git index を保持する接続、および一覧から実際に Stage / Unstage する経路を残す。フォルダーを選んだ場合も、その配下だけが対象となり、同じ接頭辞の兄弟フォルダーや、別ファイルの既存ステージを変えない。フォルダー削除は上流のファイル削除で代替せず、現行の実デバイス経路で取り消し時の子ファイルと、確定後の対象・無関係な作品／ファイルを確認する。

現行の実デバイスフォルダーでは、Git パネルを閉じた状態で作品ファイルを外部編集した際、作品ペイロードの読み込みは一度だけで、他には Git 参照しか読まないことを確認する。既知の外部変更は対象スクリプトだけを更新し、他の対象・Blockly の選択や VM を維持する。未知の変数があれば自動適用せず、全体の再読み込みを案内する。いずれも HEAD・index や作業ファイルを書き換えない。旧い入れ子作品を選んだときの読み込み範囲はこの証拠では代替しない。

Stage Controls は [Workbench #157 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45724799230) で単体252件成功、skip 0。実 GUI での停止ボタン横のスロット、VM と表示サイズ、録画ボタンの操作・状態連携は Editor に残す。

切り戻しは該当する Editor のテスト PR の revert。製品コードや通常の CI コマンドは変更しない。
