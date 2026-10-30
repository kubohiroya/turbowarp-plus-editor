# ブロックアイコンのプレビューを使う

すぐに試すには、[App rc.77の編集用サンプルを開く](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja&twPlusBlockPreview=1&twPlusYamlEditor=1&project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-plus-editor%2Fsamples%2Fblock-preview%2Fblock-preview-rc77.sb3)を選び、右下の「ステージ」→「コード」を開いてください。[操作ガイド](https://kubohiroya.github.io/turbowarp-plus-editor/samples/block-preview/)には、hover静止画、scene再生、配置・拡縮、moveTo/Bubbleのライブ編集と保存・キャンセル・Undo/Redoを試す手順があります。サンプルは[SB3を直接ダウンロード](https://kubohiroya.github.io/turbowarp-plus-editor/samples/block-preview/block-preview-rc77.sb3)することもできます。

対応版のTurboWarp Plus Editorを、次のリンクから起動してください。

[プレビューと組み込みYAML編集を有効にして開く](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja&twPlusBlockPreview=1&twPlusYamlEditor=1)

App 4.0.0-rc.77のruntimeを含む編集用SB3を開き、scene内のactionアイコンにマウスを重ねると、その位置の静止画を確認できます。sceneアイコンのクリックで場面を再生します。show actorなどは配置・拡縮をドラッグで編集でき、moveToや吹き出しはフォームの値を変更すると、その場で動きやアニメーションを確認できます。変更を作品へ反映するにはダイアログの保存操作が必要です。

配布Standard SB3の初期状態には、編集対象となるscene/actionの台本ブロックがありません。実際の台本ブロックが入った編集用SB3を使用してください。

既存作品を更新する場合は、元のSB3・台本・素材を先に保管してください。Editorの更新だけでは、作品に埋め込まれた古いruntimeは更新されません。migrate-embedded-yamlだけを実行しても、編集用runtimeへの更新にはなりません。App 4.0.0-rc.77で元台本と素材から編集用SB3を別名で再生成し、上のリンクから起動したEditorで開き直してください。素材や独自スクリプトを含む作品は、それらを保持したことを確認してから新しいSB3を採用します。

機能は既定OFFです。無効にするには`twPlusBlockPreview=1`をURLから取り除いてEditorを再読み込みします。組み込みYAML編集の有効化は`twPlusYamlEditor=1`で独立して切り替えられます。
