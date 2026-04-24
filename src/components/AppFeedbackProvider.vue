<script setup>
import { useDialog, useMessage } from 'naive-ui'

window.$message = useMessage()
window.$dialog = useDialog()
</script>

<template>
  <slot />
</template>
