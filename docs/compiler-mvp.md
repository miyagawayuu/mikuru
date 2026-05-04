# Compiler and v1 Stabilization Plan

この文書は、MikuruのコンパイラがMVPからv1へ進むための範囲と順序を定義する。最初のゴールは簡単なカウンター `.mikuru` の変換だったが、v1ではVite上で親子コンポーネント、フォーム、条件分岐、リスト表示を安定して動かせる状態を目指す。

## MVP成功条件

次の `.mikuru` ファイルをコンパイルできること。

```mikuru
<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>
```

生成物は概念的に次の要素を持つ。

- `mount(target)` をexportする。
- `<script>` の宣言を実行できる位置に置く。
- `button` を `document.createElement("button")` で作る。
- `@click` を `addEventListener("click", increment)` にする。
- `{{ count }}` を `effect` 内の `textContent` 更新にする。

## 推奨プロジェクト構成

```text
src/
  compiler/
    compile.ts
    parseSfc.ts
    parseTemplate.ts
    analyzeTemplate.ts
    generate.ts
  runtime/
    reactivity.ts
    dom.ts
  index.ts
examples/
  basic/
    Counter.mikuru
    index.html
    main.ts
```

## 実装ステップ

### 1. プロジェクト初期化

- `package.json` を作成する。
- TypeScript設定を追加する。
- テストランナーは最初から重くせず、必要ならVitestを使う。
- Vite連携は最初から本実装にせず、CLIまたは関数呼び出しでコンパイル結果を確認する。

### 2. `parseSfc`

入力文字列からSFCブロックを抽出する。

返り値の例:

```ts
type SfcDescriptor = {
  template: string;
  script?: string;
  style?: string;
};
```

MVPの検証項目:

- `<template>` を必須にする。
- 同種ブロックの重複をエラーにする。
- 未対応ブロックをエラーにする。
- ブロック内の文字列はできるだけそのまま保持する。

### 3. `parseTemplate`

テンプレートをASTに変換する。

最小ASTの例:

```ts
type TemplateNode =
  | ElementNode
  | TextNode
  | InterpolationNode;

type ElementNode = {
  type: "element";
  tag: string;
  attrs: TemplateAttribute[];
  children: TemplateNode[];
};
```

最初はHTML仕様の完全対応を目指さない。実装を急ぐ場合は既存HTMLパーサを使い、Mikuruディレクティブだけを後段で解釈する。

### 4. `analyzeTemplate`

テンプレートASTから動的な更新箇所を抽出する。

抽出対象:

- 補間: `{{ expr }}`
- イベント: `@click="handler"`
- 属性バインド: `:class="expr"`
- 条件分岐: `v-if="expr"`
- 繰り返し: `v-for="item in items"`

解析結果の例:

```ts
type Binding =
  | { type: "text"; expression: string }
  | { type: "event"; event: string; handler: string }
  | { type: "attribute"; name: string; expression: string }
  | { type: "if"; expression: string }
  | { type: "for"; item: string; source: string };
```

### 5. `generate`

解析済みASTからJavaScript module文字列を生成する。

生成方針:

- 静的要素は一度だけ作る。
- 動的テキストと属性は `effect` で更新する。
- イベントリスナーは作成時に登録する。
- `v-if` はアンカーを使って挿入と削除を行う。
- `v-for` は初期MVPでは範囲全体を再描画してよい。

### 6. ランタイム

`src/runtime/reactivity.ts` に最小APIを実装する。

必要API:

- `ref(value)`
- `computed(getter)`
- `effect(fn)`
- 必要なら `unwrap(value)`

実装の優先順位:

1. `ref` と `effect` でカウンター更新を成立させる。
2. `computed` を補間で使えるようにする。
3. `effect` の停止やschedulerは後続に回す。

### 7. Vite連携

コンパイラ単体が動いた後に、Vite pluginを追加する。

最小pluginの責務:

- `.mikuru` ファイルを読み込む。
- `compile(source, id)` を呼ぶ。
- 生成されたJavaScriptをViteへ返す。

## テスト方針

最初のテストは小さく、コンパイラ段階ごとに置く。

- `parseSfc`: ブロック抽出とエラーケース。
- `parseTemplate`: 要素、テキスト、補間、属性のAST化。
- `analyzeTemplate`: 各ディレクティブの抽出。
- `generate`: カウンターの生成コードに必要な断片が含まれること。
- `runtime`: `ref` の変更で `effect` が再実行されること。

## 実装順序の理由

SFC分割、テンプレートAST、解析、コード生成、ランタイムの順に作ると、各段階の責務が混ざりにくい。Mikuruはコンパイラ主導のフレームワークなので、最初から「どの処理をコンパイル時に寄せるか」を見える形にしておく。

## v1で完了させる課題

- `.mikuru` 用Vite plugin
- scoped CSSの基本セレクタ書き換え
- `v-else` / `v-else-if`
- コンポーネント合成、default slot、props、emits
- DOMイベント修飾子 `.prevent` / `.stop`
- `v-model` のinput / textarea / checkbox / select対応
- `v-for` の `item in items`、`item of items`、`(item, index) in items`
- unmountとeffect cleanup
- CIでのtypecheck、test、library build、example build

## v1後の課題

- source map完全対応
- keyed `v-for` の差分更新
- SSR / hydration
- transition
- devtools
- 完全なテンプレート型チェック
