# `.mikuru` SFC Syntax

`.mikuru` は、Vueに近い単一ファイルコンポーネント形式を採用する。v1では、読みやすさとコンパイルしやすさを優先し、対応構文を小さく固定する。

## 基本構造

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

## ブロック

### `<template>`

コンポーネントのDOM構造を宣言する。v1では必須とする。

制約:

- ルート要素は1つにする。
- HTMLに近い構文を使う。
- HTMLコメントは無視する。
- 属性値はダブルクォートとシングルクォートに対応する。
- 属性値内の `>` はタグ終端として扱わない。
- `input`、`br`、`img` などのvoid要素は閉じタグなしで扱える。
- 大文字で始まるタグは子コンポーネント呼び出しとして扱う。
- ディレクティブは静的に解析できる文字列式に限定する。

### `<script>`

テンプレートから参照する状態と関数を書く。通常のJavaScript moduleとして扱い、`defineProps` と `defineEmits` だけをコンパイル専用マクロとして変換する。

制約:

- `ref`、`computed`、`effect` は `mikuru` または `mikuru/runtime` からimportする。
- トップレベルで宣言された変数と関数をテンプレートから参照できる。
- `script setup` 互換はv1対象外にする。
- 複数の `<script>` ブロックは許可しない。

### `<style>`

コンポーネントに関連するCSSを書く。生成された `mount` の実行時に `<style data-mikuru-style="...">` として `document.head` へ一度だけ注入する。

```mikuru
<style scoped>
.card {
  color: red;
}
</style>
```

`scoped` を付けると、生成DOMに `data-mikuru-scope-*` 属性を付与し、CSSセレクタにも同じ属性セレクタを付ける。

制約:

- scoped CSSは通常セレクタの書き換えを対象にする。
- `@media` などのネストしたCSS規則、`:global()`、深いセレクタは後続課題にする。
- CSS Modulesやプリプロセッサはv1対象外にする。
- 同じコンポーネントを複数mountしても、同一CSSは重複注入しない。

## テンプレート構文

### テキスト補間

```mikuru
<p>Hello {{ name }}</p>
<p>{{ mode === "active" ? "Active" : "Paused" }}</p>
```

補間式はJavaScriptのExpressionとして扱う。コンパイル時に式としてパースし、文や代入などの危険な構文は拒否する。テンプレート式内の `ref` は自動的にunwrapされるため、`mode === "active"` のように `.value` なしで比較できる。

生成方針:

- 静的テキストと動的値を結合して `textContent` を更新する。
- 補間を含むテキストノードは `effect` の対象にする。

### イベント

```mikuru
<button @click="increment">Add</button>
<button v-on:click="increment">Add</button>
<form @submit.prevent="save">...</form>
<button @click.stop="select">Select</button>
```

`@event="handler"` と `v-on:event="handler"` は `addEventListener` に変換する。DOMイベントでは `.prevent` と `.stop` を使える。

制約:

- 値は関数名または単純な呼び出し式に限定する。
- 対応するイベント修飾子は `.prevent` と `.stop`。
- コンポーネントイベントの修飾子、キー修飾子、capture/passive/onceは後続課題にする。
- インライン複文はv1対象外にする。

### 属性バインド

```mikuru
<div :class="className" :id="itemId"></div>
<div v-bind:class="className"></div>
<div :class="['base', { active: isActive }]"></div>
```

`:attr="expr"` と `v-bind:attr="expr"` は、依存値が変わったときに属性を更新する。

生成方針:

- `class`、`id`、`title` など通常属性は `setAttribute` で更新する。
- `class` は文字列、数値、配列、オブジェクトを正規化する。オブジェクト形式ではtruthyなキーだけclass名にする。
- 値が `null` または `undefined` の場合の削除挙動は、MVP実装時に明示してテストする。
- DOM propertyバインドと属性バインドの差はv1では扱わない。

### テキスト入力

```mikuru
<input v-model="name" />
<textarea v-model="message"></textarea>
<input type="checkbox" v-model="enabled" />
<select v-model="flavor">
  <option value="mint">Mint</option>
  <option value="berry">Berry</option>
</select>
```

`v-model="refName"` は、フォーム要素の値と `refName.value` を同期する。

制約:

- `input` / `textarea` は `value` と `input` イベントで同期する。
- `input type="checkbox"` は `checked` と `change` イベントで真偽値を同期する。
- `select` は `value` と `change` イベントで同期する。
- 式は `ref` を指す識別子を想定し、生成コードでは `refName.value` へ書き戻す。
- radio、複数選択select、修飾子は後続課題にする。

### 条件分岐

```mikuru
<p v-if="visible">Shown</p>
<p v-else-if="pending">Loading</p>
<p v-else>Hidden</p>
```

`v-if` / `v-else-if` / `v-else` は条件に応じて、同じ位置に表示する分岐を切り替える。

生成方針:

- コンパイラはコメントアンカーまたは固定位置を使って差し替え位置を保持する。
- `v-else-if` と `v-else` は直前の `v-if` または `v-else-if` に続けて書く。空白のみのテキストは間にあってもよい。
- 孤立した `v-else-if` / `v-else` はコンパイルエラーにする。
- 条件式の依存値が変わったときだけ更新する。

### 表示切り替え

```mikuru
<p v-show="visible">Shown</p>
```

`v-show` はノードを削除せず、`style.display` を `""` または `"none"` に切り替える。DOMを保持したい軽い表示切り替えに使う。

生成方針:

- 条件がtruthyなら `display` を空文字に戻す。
- 条件がfalsyなら `display` を `"none"` にする。
- 既存のdisplay値の退避やCSS cascadeとの厳密な統合は後続課題にする。

### 繰り返し

```mikuru
<li v-for="item in items">{{ item.label }}</li>
<li v-for="(item, index) of items">{{ index }}: {{ item.label }}</li>
```

`v-for` は配列から同じテンプレート断片を生成する。

制約:

- `item in items`、`item of items`、`(item, index) in items`、`(item, index) of items` に対応する。
- `:key` は受け付けるが、v1では主に意図を示すための属性であり、更新戦略は範囲再描画を基準にする。
- keyed diff、ネストした `v-for` の高度な最適化は後続課題にする。
- 初期実装では、配列変更時に範囲全体を再描画してよい。

### コンポーネント

```mikuru
<template>
  <Child title="Hello" :count="count" @select="select">
    <p>Slot content</p>
  </Child>
</template>

<script>
import Child from "./Child.mikuru";

function select(value) {
  // 子コンポーネントからの通知を受け取る
}
</script>
```

大文字で始まるタグはコンポーネントとして扱う。生成コードでは `Child.mount(target, props)` を呼び、親のcleanup時に子の `unmount()` も実行する。

子要素はdefault slotとして `props.children` に渡される。子コンポーネント側では `<slot />` の位置に親から渡されたDOM断片を描画する。

子コンポーネント側では `<slot name="header" />` でnamed slotを描画する。親コンポーネント側では `<template #header>` または `<template v-slot:header>` で渡す。`<slot name="header" :title="title" />` のようにslot propsを渡し、親側では `<template #header="{ title }">` のような識別子または単純な分割代入で受け取る。

制約:

- v1ではdefault importされたコンポーネントを想定する。
- 静的属性と `:prop` / `v-bind:prop` をpropsとして渡す。
- `@select="select"` / `v-on:select="select"` は `props.onSelect` として子へ渡す。
- `v-model="value"` は `modelValue` と `onUpdateModelValue` を渡す。子側は `defineProps()` で `modelValue` を読み、`defineEmits(["update:modelValue"])` で更新を通知する。
- 専用emit API、動的コンポーネントは後続課題にする。

### Props宣言

```mikuru
<template>
  <h2>{{ title }}</h2>
</template>

<script>
const { title } = defineProps();
const { active } = defineProps({ active: Boolean });
</script>
```

`defineProps()` はコンパイル専用APIとして扱う。runtime importは不要で、生成コードでは `props` 参照へ置き換える。宣言オブジェクトを渡すと、v1ではprops名と簡易コンストラクタだけをコンパイル時に検証する。

対応形式:

- `const { title, active } = defineProps();`
- `const { title: heading } = defineProps();`
- `const { active = false } = defineProps();`
- `const { count: total = 0 } = defineProps();`
- `const localProps = defineProps();`
- `const { title, active } = defineProps({ title: String, active: Boolean });`

分割代入したpropsはテンプレート内ではリアクティブに読み直される。宣言オブジェクトの値は `String`、`Number`、`Boolean`、`Array`、`Object` に対応する。v1ではネストした分割代入、rest props、型引数、runtime props validationは対象外。

`defineProps()` はtop-levelの `const` 宣言で使う。複数行の分割代入は対応するが、通常の変数宣言と同じ `const` に混ぜる書き方は対象外。

### Emits宣言

```mikuru
<template>
  <button @click="flip">Flip</button>
</template>

<script>
const emit = defineEmits(["toggle"]);

function flip() {
  emit("toggle");
}
</script>
```

`defineEmits()` はコンパイル専用APIとして扱う。`emit("item-select", value)` は親から渡された `props.onItemSelect` を呼び出す。

対応形式:

- `const emit = defineEmits();`
- `const emit = defineEmits(["toggle", "item-select"]);`

`defineEmits()` もtop-levelの `const` 宣言で使う。配列でemit名を宣言した場合、未宣言の `emit("name")` はコンパイルエラーにする。v1では動的emit名や型引数は対象外。
- event名はcamelCase propsへ変換する。例: `"toggle"` -> `onToggle`、`"item-select"` -> `onItemSelect`
- `update:modelValue` は `onUpdateModelValue` へ変換する。

## v1で扱わない構文

- テンプレート式内の文、代入、更新式、`new`、`eval`、`Function`
- radio、複数選択select向けの `v-model`
- `v-model` 修飾子
- `v-bind` オブジェクト展開
- `v-on` オブジェクト展開
- `v-html`
- dynamic component
- transition

## エラー方針

v1では、曖昧な構文を黙って無視しない。

- 未対応ディレクティブはコンパイルエラーにする。
- 複数の同種ブロックはコンパイルエラーにする。
- ルート要素が複数ある場合はコンパイルエラーにする。
- テンプレート式の解析に失敗した場合は、対象式を含めてエラーを出す。
