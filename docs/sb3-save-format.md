# SB3 の保存形式

## Editor で作品データの形式を指定する

Editor の **ファイル → 組み込みデータ…** を開きます。このメニューは既定で表示されます。
台本 YAML と、作品のコスチューム・背景・音・紙芝居バンドル内のアセットから対象を選び、
それぞれの形式を設定して適用します。続けて、通常のファイルメニューから SB3 を保存します。
対応する台本は紙芝居 App の所有者コンポーネントに格納されたものです。
文書エディターで URL 参照にしている台本は、先に作品内へ取り込む必要があります。

| 形式 | SB3 の格納先と開き方 |
|---|---|
| `remote-non-cacheable` | HTTPS URL と SHA-256 を記録し、開くたびに取得して照合します。 |
| `remote-cacheable` | 同じ参照を記録します。開く人が許可した場合に限り、照合済みのキャッシュを読み書きします。 |
| `embedded-file` | SB3 の ZIP エントリに格納します。コスチューム・背景・音には既存のエントリを使います。 |
| `embedded-data` | `project.json` に base64 の data URL として格納します。 |

リモート形式へ変更する際は、URL が現在と同じバイト列を返すことを確認します。
台本の本文を編集した場合は、編集後の内容を指す URL か、同梱する形式を選び直します。
この機能で設定したデータを復元するには、Plus 拡張ローダーが有効な Editor が必要です。
単一 HTML へ出力する場合は、取得・復元済みのデータを渡します。

### バンドル素材をコスチューム・背景・音として使う

**ファイル → 組み込みデータ… → バンドル素材を作品に追加…** を開き、素材・種類・追加先を選びます。
SVG・PNG・JPEG はコスチュームまたは背景として、WAV・MP3・Ogg は音として追加できます。
背景はステージへ、コスチュームはスプライトへ追加します。音はステージとスプライトのどちらにも追加できます。
**作品に追加** を押してから通常の SB3 保存を行います。再読込後は、コスチューム・背景・音の一覧で使えます。
紙芝居が参照する元の素材もバンドル内に保持します。追加した作品アセットの保存形式は「作品データの形式」で個別に指定できます。

このメニューを非表示にするには `twPlusPayloadFormats=0` で再起動します。保存済みの形式は引き続き読み込めます。
格納済みの形式を解除する場合は、設定画面の「標準の格納方式を使う」に戻して保存し直します。

## 語彙の置き場所

4形式と3つの payload の語彙は、依存のない共通パッケージ [`@kubohiroya/turbowarp-sb3-save-format`](https://github.com/kubohiroya/turbowarp-sb3-save-format) が持つ。利用者は、紙芝居 App の CLI（Node）、形式を選ぶ画面（security-dialog）、`turbowarp-extension-loader`（extensions の変換）、`turbowarp-document-source`（source の変換）、アセットの所有側（assets の変換）である。既存のどのパッケージも層が合わない。

| 候補 | 置かない理由 |
| --- | --- |
| `turbowarp-document-source` | 所有するのは文書の参照種別で、extensions と assets は文書ではない。ローダーがこのパッケージへ依存することになり、依存方向が逆になる。`embedded-file` が別の意味で衝突する（後述） |
| `turbowarp-extension-loader` | Manifest の source 形を所有するが拡張専用。document-source とアセット所有側がローダーへ依存することになる |
| `sb3-toolchain` | SB3 の層だが Node 専用の依存を持ち、ブラウザーの画面から読めない |
| `turbowarp-extension-manifest` | 依存なしの契約パッケージだが、名前と目的が拡張 manifest 専用 |

| export | 種別 |
| --- | --- |
| `Sb3SavePayload` = `extensions` \| `source` \| `assets` | 語彙 |
| `Sb3SaveFormat` = `remote-non-cacheable` \| `remote-cacheable` \| `embedded-file` \| `embedded-data` | 語彙 |
| `sb3SavePayloads` / `sb3SaveFormats` / `Sb3SaveSelection` / `Sb3SaveFormatSupport` | 語彙 |
| `Sb3SaveCapabilities` / `sb3SaveCapabilities` | 各実装の対応可否を受け取る口 |
| `normalizeSb3SaveSelection` / `sb3SaveFormatSupport` / `sb3SupportedSaveFormats` / `describeSb3SaveFormats` | 形の検証と、注入された対応可否による判定 |
| `./writer`（Node 専用サブパス） | 既存の SB3 を指定した形式で書き直す処理 |

### 対応可否は共有せず、注入で受け取る

どの payload をどの形式で書けるかは実装ごとに違い、拒否の理由文もその実装の操作を指す（CLI なら CLI のオプション）。表をそのまま共有すると、ある画面が別の実装の理由で拒否することになる。そのため共通パッケージは対応可否を `Sb3SaveCapabilities` として注入で受け取り、拒否には何が足りないかを必ず書かせる。`./writer` も `capabilities` を必須オプションで受け取る。

root は依存ゼロ・ランタイムなしを保つ。`./writer` は `node:crypto` を使うので、Node 専用のサブパスに分けている。

### 形式を選ぶ画面は security-dialog

形式はすべて作品の作者が決め、Manifest に記録する。選ぶ画面は security-dialog の `ExtensionReview` で、追加するときと開くときに同じ画面を出し、実行（拒否・サンドボックスあり・なし）と4つの形式を、通常のカスタム拡張と Plus 拡張の両方について指定する。画面が返す `ReviewDecisions = Map<string, {execution, loading?}>` を Editor の結合モジュールが受け取り、ローダーの許可・`declineCaching`・Manifest への記録の3方向へ分配する。開く人に残る問いは、`remote-cacheable` のキャッシュを自分のブラウザーに残すかどうかだけである。

## `embedded-file` の二つの意味を混ぜない

`turbowarp-document-source` の `DocumentSourceKind` は `embedded-file` / `url` / `yaml-blocks` / `schema-blocks` で、`normalizeDocumentSource` が `location`（`sb3` \| `https`）と `representation`（`source` \| `yaml-blocks` \| `schema-blocks`）を独立に導出する。保存形式の `Sb3SaveFormat` は `location` を細かくしたもので、`representation` とは直交する。

| `Sb3SaveFormat`（`source` payload） | document-source 側 |
| --- | --- |
| `remote-non-cacheable` | `location: https`。SB3 にもキャッシュにも何も残さない |
| `remote-cacheable` | `location: https`。検証済みのキャッシュをブラウザーに持ってよい。対応する種別はまだない |
| `embedded-file` | `location: sb3`。ZIP 内のファイル |
| `embedded-data` | `location: sb3`。`project.json` の中 |

document-source は `sb3` と `https` を区別するが、`sb3` のバイト列をどう格納するかは区別しない。その区別が保存形式の語彙が足すものなので、`DocumentSourceKind` と `Sb3SaveFormat` は別の型のままにし、片方をもう片方の alias にしない。

## 旧綴りは受け付けない

4形式の綴りは Loader の Manifest の source type と同じである。以前の綴りは読み替えずに拒否する。

| 旧 | 現在 |
| --- | --- |
| `remote` | `remote-non-cacheable` |
| `cached` | `remote-cacheable` |
| `embedded` | `embedded-file` または `embedded-data` |

旧 `cached` は「ZIP 内のバイト列＋URL」を指していたが、1つ上の層では逆に「SB3 には何もなく、検証済みのキャッシュをブラウザーに持つ」を意味していた。自分でバイト列を持つ作品は embedded である。`remote-cacheable` は参照だけを格納し、キャッシュを持つかどうかは開く側に委ねる。`remote-non-cacheable` は作者がキャッシュを禁じる形で、ピン留めしたバイト列を配信しなくなった URL をキャッシュが隠すことを防ぐ。語彙を1つにするのは、層をまたぐ翻訳をなくすためである。

## writer が2つあるのは分担であって重複ではない

| | 出所になり得るバイト列 | 置き場所 |
| --- | --- | --- |
| Node（既存 SB3 の一括変換） | ネットワークだけ | 共通パッケージ `./writer` |
| ブラウザー（保存時の1件ずつ） | キャッシュ（IndexedDB）とネットワーク | ローダー `./project-authoring` |

ローダー側は `AuthoringPorts = Pick<LoaderPorts, 'fetcher' | 'trustProvider' | 'cache' | 'diagnostics'>` で cache port を持つが、`./writer` は持たない。だから CLI（`turbowarp-plus-editor-sb3-format`）は作品がどの形式を記録するかは書けるが、見る人のブラウザーにあるキャッシュには関与できない。`remote-cacheable` を書いた出力を、オフラインで動く根拠にはできない。オフラインで動かすには `embedded-file` か `embedded-data` を選ぶ。
