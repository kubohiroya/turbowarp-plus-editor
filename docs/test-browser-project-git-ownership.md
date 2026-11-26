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

実デバイスの一覧では、拡張なしの使い捨てフィクスチャをサブフォルダーにドロップし、日本語名のバイナリの内容と元ファイルを保ち、同名の既存ファイルを上書きしないことを確認する。この検証を含む `project-folder.browser.ts` 全16件が、Editor の製品入力が同一の固定ビルド `de86d5d6fea738a7e5cc5478dd927332b5acc426` とヘッドレス Chromium で成功し、スキップはない。

ブックマークのファイル再選択は一覧の閉鎖だけでなく、受け取り側タブの VM に実際に SB3 の内容が届くことを、拡張なしの固定フィクスチャで確認する。

**旧統合経路の廃止:** 旧 `Open Project Folder…` と独立したリポジトリ選択から、任意の入れ子作品フォルダーを親リポジトリに結び付ける経路は、[リポジトリルートに作品を置く現行仕様](../features/git/index.html) に置き換わった。現行の入口で、履歴検索、既存の差分を保つ外部 Git 更新、通常のテキストタブを Local Git から保存してもステージしないこと、Explorer の PR バッジが更新・解除されることを検証する。旧ケースだけを削除し、ブラウザー保存の旧 `project/` 配置は別の互換要件として残す。[Project Folder 0.22.0 の Chromium / WebKit テスト](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/blob/301fe686fe0ef7b7a6dfd7cc36c8998ae755edcb/test/browser-projects.browser.js#L124-L156) が、作品をルートへ移すことと、名前が衝突したときに移動しないことを検証する。

**公開版の未完:** WebKit は、この棚卸しで使った固定ビルドではブラウザー保管の受け渡し後、実作品を読む前にレンダラーが終了する。`FileSystemDirectoryHandle.resolve()` は最後に観測された処理であり、単独の原因とは断定しない。正常な別タブ起動と通常の SB3 の受け渡しは代替の証拠にならない。

## WebKit の別タブ再開の修正候補（2026-11-26、未公開）

リモート main `c491bd3fa847d0a4f764d11c7300689f08f8d979` と公開依存をクリーンインストールしたビルドで、対象の WebKit 1件が `Page crashed` で失敗することを再現した。GUI `60b87e2f`、VM `88a2c06e`、Packager `d690225b` は同じ固定を使った。GitHub 認証は模擬し、Git 通信は一時リポジトリとローカル Smart HTTP フィクスチャを使用した。

候補は、既に各パッケージの main にある API を結線し、ブラウザー保管では保存済み作品 ID だけを渡す。受信タブ自身が OPFS から開き直し、完了通知を返す。ID のない旧ジャーナルはハンドルを自動で読み直さず、明示的なフォルダー選択へ案内する。

| ローカル配布候補 | ソース |
| --- | --- |
| Project Folder 0.22.1 | `64e085553844140fc594e8bb2013c2371d0e5160`（#54） |
| Git 0.32.1 | `d1f386fd9f7601b1ff127db68da7e7780c45bd18`（#86） |
| Workbench 0.39.1 | `38f79c9cdfa6e395709a03cb3e86210fbbc32177`（機能は #158） |

この3候補のローカル npm アーカイブと Editor の結線差分を使い、同じビルド設定でヘッドレスの対象4件（Chromium 3・WebKit 1）が成功、skip 0。受信タブの実 VM のステージ音量、作品名、`main` の参照とコミットを照合した。ブラウザー保管の受け渡しは ID のみで、受信タブの `resolve()` を拒否しても成功する。メタデータ欠損では新しいタブや作品を作らず、再試行でもリポジトリ作成・push を重複しない。デバイス保存2経路も成功した。型検査と Pages ビルド（scaffolding・拡張ランタイム・Packagerを含む）も成功。

これは公開依存の固定を更新した結果ではない。Editor の manifest・lockfile は維持し、検証用インストールにだけローカル候補を展開した。候補の識別には基点 SHA と Editor の結線・テスト差分の SHA-256 `8aa2748b94b774c3d6da388b82773c01dcb8f81c4034a65043af1e8c8a5ba7dd` を併記する。`build-info.json` の siteRevision は基点 SHA であり、未コミット差分を含む新しい公開コミットの検証とは扱わない。

製品反映の DoD は、3パッケージの正式公開後に npm の完全版・integrity を固定し、同じ対象を公開依存のビルドで確認すること。そこまでは公開保留を維持する。切り戻しは Editor の依存固定と結線をまとめて直前の検証済み版へ戻す。保存済み作品・Git 履歴・作成済みリポジトリ・旧ジャーナルは削除しない。

### 正式公開物での確認（2026-11-26）

- [Project Folder 0.22.1](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/releases/tag/v0.22.1) と [Git 0.32.1](https://github.com/kubohiroya/turbowarp-plus-editor-git/releases/tag/v0.32.1) は、各 PR と main の単体・ブラウザー CI 成功後にタグを公開した。GitHub Release と npm のアーカイブがバイト単位で一致し、SHA-1・SHA-512、タグのコミット、latest/next を照合した。
- Workbench は後続の [0.40.0（#161）](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/161) が既に公開され、#158 の修正を含むことを確認したため、0.39.1 の追加公開は行わなかった。0.40.0 の `gitHead` と integrity、配布物の ID 受け渡し API を確認した。Editor の main も #861 で既に同版を固定している。
- Editor の基点を `4c2f2915124959fad3ed2b3b4ab008ee737c54e2` に合わせ、Git 0.32.1・Project Folder 0.22.1 を正規の npm URL と integrity で固定した。Workbench の古い peer 列挙で旧 Project Folder が混在しないよう、既存の依存固定と同様にルート版の override を使う。他の lock 項目に変更はない。インストールした3パッケージの全ファイルを公開アーカイブと照合した。
- 実行リビジョン `5e8d078ef6f18e9cccbae4036c2a0913fc0359fc` の正式公開依存ビルドで、`project-repository-creation.browser.ts` の4件がヘッドレスで成功（Chromium 3・WebKit 1、fail/skip 0）。受信タブの実 VM、作品名、Git の参照とコミットを検証した。認証は模擬、Git はローカル Smart HTTP フィクスチャであり、実 GitHub の認証や OS 入力は使っていない。
- 型検査・機能責務境界2件・Pages ビルド（scaffolding・拡張ランタイム・Packager を含む）が成功。GUI・VM・Packager は上記と同じ固定。後続の本記録の追記だけで製品・依存・テストの入力は変えず、ビルドとテストを繰り返さない。

公開依存でのローカル確認は完了した。Editor の main への合流と配信先での照合は、この記録時点では未実施であり、公開版の保留解除とは区別する。

`project-folder-save` は、既存リポジトリへの保存後、同じタブの Git 接続完了を待ってから次の編集・保存へ進む。固定ビルドで、上書き確認と作品ファイルだけのコミット、無関係なファイルの保持を含む全経路をヘッドレスで3回実行し、すべて成功・skip 0。初回接続中に同時保存した場合の製品の復旧動作を修正・検証したものではない。

Project Folder の [改名・削除確認 CI](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/actions/runs/45726319919) は、ブラウザー内保存のファイルとフォルダーを使い、改名時の内容保持、取り消し時の無変更、確認後の削除を実行した。Editor には、実デバイスフォルダーの改名後もファイル内容と無関係な Git index を保持する接続、および一覧から実際に Stage / Unstage する経路を残す。フォルダーを選んだ場合も、その配下だけが対象となり、同じ接頭辞の兄弟フォルダーや、別ファイルの既存ステージを変えない。フォルダー削除は上流のファイル削除で代替せず、現行の実デバイス経路で取り消し時の子ファイルと、確定後の対象・無関係な作品／ファイルを確認する。

現行の実デバイスフォルダーでは、Git パネルを閉じた状態で作品ファイルを外部編集した際、作品ペイロードの読み込みは一度だけで、他には Git 参照しか読まないことを確認する。既知の外部変更は対象スクリプトだけを更新し、他の対象・Blockly の選択や VM を維持する。未知の変数があれば自動適用せず、全体の再読み込みを案内する。いずれも HEAD・index や作業ファイルを書き換えない。旧い入れ子作品を選んだときの読み込み範囲はこの証拠では代替しない。

履歴ドロワーからマウスと Enter で選んだコミットが Local Git の差分を開くこと、Project Folder を別窓で開いて閉じると元のドロワーへ戻ることを、リポジトリ直下の既存ケースで確認する。ステージ実行中は外部変更の反映と手動再読み込みが保留され、停止後は対象ブロックにだけ反映し、作品全体の再読込やファイル書き込みが起きない。対象のヘッドレス Chromium 4 件は成功し、スキップはない。旧い組み合わせにしかない未検証の条件は残す。

Stage Controls は [Workbench #157 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45724799230) で単体252件成功、skip 0。実 GUI での停止ボタン横のスロット、VM と表示サイズ、録画ボタンの操作・状態連携は Editor に残す。

切り戻しは該当する Editor のテスト PR の revert。製品コードや通常の CI コマンドは変更しない。
