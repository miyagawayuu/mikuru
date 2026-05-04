# Mikuru

Mikuruは、Vueの書き心地を残しながら、Svelte寄りにDOM更新コードを生成するコンパイル型JavaScriptフレームワークです。

Vueのように単一ファイルコンポーネントと宣言的なテンプレートで書き、Svelteのようにビルド時にテンプレートを解析して、仮想DOMに依存しない小さなJavaScriptへ変換することを目指します。

## 目標

- `.mikuru` ファイルでコンポーネントを書く。
- `<template>` / `<script>` / `<style>` のSFC構造を使う。
- `ref`、`computed`、`effect` 風の小さなリアクティビティを提供する。
- `{{ value }}`、`@click` / `v-on:click`、`:class` / `v-bind:class`、`v-if`、`v-for` のようなVue風テンプレート構文を使う。
- コンパイラが更新箇所を静的に把握し、直接DOMを更新するコードを生成する。

## 最小サンプル

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

<style>
button {
  font: inherit;
}
</style>
```

このコンポーネントは、概念的に次のようなJavaScript moduleへ変換されます。

```js
import { ref, effect } from "mikuru/runtime";

export function mount(target) {
  const count = ref(0);
  const button = document.createElement("button");

  function increment() {
    count.value += 1;
  }

  button.addEventListener("click", increment);

  effect(() => {
    button.textContent = `count: ${count.value}`;
  });

  target.appendChild(button);
}
```

## v1範囲

v1の成功条件は、Vue風の小さなSFC体験をVite上で実用的に書け、ブラウザで安定して動かせることです。最初のカウンターMVPは土台として維持し、v1では親子コンポーネント、フォーム入力、条件分岐、リスト表示、style注入までを公開対象として固定します。

v1では次の機能を対象にします。

- SFC分割: `<template>`、`<script>`、`<style>`
- Vite plugin: `.mikuru` importをJavaScript moduleへ変換
- テキスト補間: `{{ count }}`
- イベント: `@click="increment"`、`v-on:click="increment"`、DOMイベントの `.prevent` / `.stop`
- 属性バインド: `:class="className"`、`v-bind:class="className"`
- class正規化: `:class="['base', { active }]"` の配列・オブジェクト形式
- フォーム同期: `input` / `textarea` / `checkbox` / `select` の `v-model`
- 条件分岐: `v-if` / `v-else-if` / `v-else`
- 表示切り替え: `v-show="visible"`
- 繰り返し: `v-for="item in items"`、`v-for="(item, index) in items"`、`of` エイリアス
- コンポーネント合成: `<Child :count="count" @select="select" />` のprops/event受け渡し、`v-model`
- default slot: `<Panel>content</Panel>` と子側の `<slot />`
- props宣言: `const { title } = defineProps()` のコンパイル専用API
- emits宣言: `const emit = defineEmits()` で親の `@event` ハンドラを呼び出し
- style注入: `<style>` をmount時に一度だけdocumentへ追加し、`<style scoped>` の基本セレクタを書き換える
- unmount: 生成コンポーネントがイベント、effect、子コンポーネントを破棄する
- パーサ強化: コメント、シングルクォート属性、属性値内の `>`、void要素に対応
- 式検証: テンプレート式をExpressionとして検証し、文や代入など危険な構文を拒否
- エラー表示: コンパイルエラーにファイル名、行、列、コードフレームを付与
- 小さなランタイム: `ref`、`computed`、`effect`

## v1の非目標

MikuruはVue完全互換を目指しません。SSR、hydration、transition、devtools、完全なテンプレート型チェック、Vue互換を名乗るための広範な仕様追従はv1後に検討します。scoped CSSはv1では基本セレクタのみを対象にし、`:global()`、深いセレクタ、複雑なネスト規則は後続課題です。

## 開発

```sh
npm install
npm run ci
```

個別に確認する場合は次を使います。

```sh
npm run typecheck
npm test
npm run build
npm run build:basic
npm run build:realworld
npm run build:dogfood
npm run test:package
npm run test:pack
npm run test:e2e
npm run test:e2e:dogfood
```

公式exampleはViteで起動できます。

```sh
npm run dev:basic
npm run dev:realworld
npm run dev:dogfood
```

用途は次の通りです。

- `examples/basic`: カウンター、props/events、component `v-model`、default slot の最小確認
- `examples/realworld`: 検索、フォーム、keyed list を含むアプリ風の検証
- `examples/dogfood`: Mikuru自身で書いた notes app による日常的な書き心地の検証
- `examples/mikuru-sample` / `examples/mikuru-vue-like`: 追加の手書きDOM/runtimeサンプル

表示するときは、ブラウザで example の `index.html` を直接開かず、Viteが表示するローカルURLを開いてください。`.ts` と `.mikuru` はVite pluginで変換されます。

exampleを本番ビルドする場合は次を使います。

```sh
npm run build:basic
npm run build:realworld
npm run build:dogfood
```

## 設計文書

- [`docs/design.md`](docs/design.md): 全体アーキテクチャと設計境界
- [`docs/sfc-syntax.md`](docs/sfc-syntax.md): `.mikuru` SFC構文
- [`docs/reactivity.md`](docs/reactivity.md): リアクティビティと更新モデル
- [`docs/compiler-mvp.md`](docs/compiler-mvp.md): MVPコンパイラ実装手順
- [`docs/production-readiness.md`](docs/production-readiness.md): 実運用前の制約と検証項目
- [`docs/v1-api-contract.md`](docs/v1-api-contract.md): v1で安定扱いするAPIと破壊的変更ポリシー
- [`docs/implementation-guide.md`](docs/implementation-guide.md): Mikuruでアプリを書く開発者向け実装ガイド
- [`docs/npm-usage.md`](docs/npm-usage.md): npm公開後にViteアプリでMikuruを使う手順
- [`docs/release-checklist.md`](docs/release-checklist.md): v1公開前の確認項目
- [`docs/release-notes-v1.md`](docs/release-notes-v1.md): v1.0.0のリリースノート
