import { compile } from "../src/compiler/index.js";
const source = `<template>
  <button @click="increment">count: {{ count }}</button>
</template>

<script>
import { ref } from "mikuru";

const count = ref(0);

function increment() {
  count.value += 1;
}
</script>`;

const { code } = compile(source, { filename: "GeneratedDom.mikuru" });
console.log('---- GENERATED CODE START ----');
console.log(code.split('\n').slice(0,200).join('\n'));
console.log('---- GENERATED CODE END ----');
