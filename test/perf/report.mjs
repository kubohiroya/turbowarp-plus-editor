import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';

const input = process.argv[2];
assert.ok(input, 'Usage: node test/perf/report.mjs results.json [report.md]');
const result = JSON.parse(await readFile(input));
assert.equal(result.errors.length, 0, 'A failed run must not be presented as complete');
const names = {1:'SB3読み込み',2:'作品フォルダ読み込み',3:'呼び出しグラフ',4:'メッセージ図',5:'整列ビュー',
    6:'作品全体検索',7:'変数の置換',8:'変数の利用箇所集計',9:'ブロック差分',10:'50コミットの履歴',
    11:'拡張ソースのSHA-256照合',12:'決定的SB3ビルド',13:'作品フォルダ保存',14:'ミニマップ初回描画'};
const summarize = rows => {
    assert.equal(rows.length, 5, 'Each operation/phase must have exactly five samples');
    assert.equal(new Set(rows.map(row => row.iteration)).size, 5);
    const values = rows.map(row => row.ms).sort((a,b) => a-b);
    assert.ok(values.every(value => Number.isFinite(value) && value >= 0));
    return {median:values[2], min:values[0], max:values[4], n:values.length};
};
const format = stat => `${stat.median.toFixed(1)} (${stat.min.toFixed(1)}–${stat.max.toFixed(1)})`;
const summaries = [];
for(let id=1;id<=14;id++) for(const layout of id===5?['Z','N']:[undefined]) {
    const rows = result.samples.filter(sample=>sample.id===id && sample.layout===layout);
    assert.equal(rows.length,10,`Operation ${id} ${layout||''}: missing or duplicate samples`);
    summaries.push({id, layout, cold:summarize(rows.filter(row=>row.phase==='cold')),
        warm:summarize(rows.filter(row=>row.phase==='warm')), thresholdMs:rows[0].thresholdMs});
}
const lines = ['# #775 Kamishibai 3.2 応答時間の測定','',
    '実行: '+result.startedAt+'–'+result.finishedAt+'。Editor `'+result.editor.siteRevision+'`。',
    '入力SB3: '+result.input.bytes+' bytes、SHA-256 `'+result.input.sha256+'`。',
    '', '時間はms。各欄は中央値（最小–最大）、各5回。初回は新しいブラウザーコンテキスト、再実行は同じコンテキスト。',
    'HTTPキャッシュは固定ソースのルーティングにより無効。OSファイルキャッシュは消していない。完全なプロセス／ディスクのコールドスタートとは異なる。',
    '', '| # | 操作 | 初回 | 同セッション再実行 | 閾値案 |','|---|---|---:|---:|---:|'];
for(const s of summaries) lines.push(`| ${s.id} | ${names[s.id]}${s.layout?' '+s.layout:''} | ${format(s.cold)} | ${format(s.warm)} | ${s.thresholdMs} |`);
lines.push('', '## 実行環境','',
    `- ${result.environment.platform} ${result.environment.os} / ${result.environment.machine || ''} / ${result.environment.cpu} / ${result.environment.logicalCpus} logical CPUs / ${(result.environment.memoryBytes/2**30).toFixed(0)} GiB`,
    `- Node ${result.environment.node}、Chromium ${result.environment.chromium}、1360×900、headless、ソフトウェアGPU`,
    '- GUI・VM・Packager・familyの版とintegrity、全サンプル・完了条件・描画件数は隣接するJSONを参照。',
    '', '## 閾値案を超えた項目','');
const exceeded = summaries.filter(s=>s.cold.median>s.thresholdMs || s.warm.median>s.thresholdMs);
if(!exceeded.length) lines.push('中央値で閾値案を超えた項目はない。遅い単発値は上表の最大値を参照し、合否判定には使わない。');
for(const s of exceeded) lines.push(`- ${names[s.id]}${s.layout?' '+s.layout:''}: 初回 ${s.cold.median.toFixed(1)} ms、再実行 ${s.warm.median.toFixed(1)} ms。改善候補として記録し、製品変更はこの測定PRに混ぜない。`);
lines.push('', '## 読み取り上の限界','',
    '- #1/#2はOSピッカーや人の確認時間を測らず、ファイル読み取り／フォルダ選択のブラウザー内接続からVMとワークスペースまで。自動承認の待機を含む。',
    '- #3/#4は実際に選択しているStageの画面。作品全体の43関数／118呼び出しや8ターゲット／23メッセージを、そのまま画面の節点・辺数としていない。',
    '- #7はグローバル変数の選択箇所を置換する既存UI。すべてのテキストを一括置換する機能を新設していない。',
    '- #9の開始点と描画完了条件は各sample.boundaryを参照。',
    '- #10の50コミットは再現用fixtureで、作品の実際の開発履歴ではない。',
    '- #11は12ソースのSHA-256照合カーネル。13番目のtranslateはVM内蔵。元のlegacy SB3にはPlus形式のdigest宣言がなく、Loaderの取得・認可・VM登録全体の時間ではない。',
    '- #14は実EditorのStageワークスペースへ所有パッケージの公開APIで新しいoverviewを接続して初回描画を測り、直後に破棄。作品ロード全体と分離している。',
    '- 二つのrequestAnimationFrameを描画の観測点に使う。画面への実提示時刻やOS入力からの遅延ではない。',
    '- 単一作品・単一ホストでのベースライン。ターゲットに分散した負荷や他OSの性能を一般化しない。', '');
const markdown = lines.join('\n');
if(process.argv[3]) await writeFile(process.argv[3],markdown); else console.log(markdown);
