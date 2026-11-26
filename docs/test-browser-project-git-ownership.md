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

Project Folder 0.22.0 の [固定版 CI](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/actions/runs/44949433556/job/136983876411) は単体82件とブラウザー24件成功。明示 skip 1件は根拠にしない。Git 0.32.0 の [固定版 CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45581094320) で公開ポリシーと実 Smart HTTP の物理ファイル変更時の保護を、[Git #85 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45724587063) では設定の復元、接続先固定と認証フォームの3件を確認した。

固定ビルドのヘッドレス実行は、現行フォルダー7件、フォルダー保存1件、Git の接続・同期2件、公開4件、リポジトリ作成の Chromium 3件が成功、スキップなし。個別の対象別に実行し、通常CIの時間短縮には計上しない。

**未完:** 旧 `Open Project Folder…` と独立したリポジトリ選択が前提の大きな統合テストは、現在の入口では初期操作で失敗する。実ルートで別々に検証したものだけを分離し、ネストした親リポジトリ、作品だけに限定する読み込み境界、一部のファイル操作、PR バッジなど未移行の検証は削除しない。WebKit はブラウザー保管の受け渡し後、実作品を読む前の `FileSystemDirectoryHandle.resolve()` でレンダラーが終了する。正常な別タブ起動と通常の SB3 の受け渡しを確認しても、この失敗の代替にはならない。

切り戻しは該当する Editor のテスト PR の revert。製品コードや通常の CI コマンドは変更しない。
