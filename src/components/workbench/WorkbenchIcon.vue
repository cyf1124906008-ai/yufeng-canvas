<template>
  <svg
    class="wb-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></template>
    <template v-else-if="name === 'folder'"><path d="M3.5 7.5h6l2-2h9v13h-17z" /></template>
    <template v-else-if="name === 'history'"><path d="M4 5v5h5" /><path d="M5.4 17a8 8 0 1 0-.7-8.2L4 10" /><path d="M12 8v4l3 2" /></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.6-1.4.9-1.9-2.1-2.1-1.9.9-1.4-.6L10.5 3h-3l-.7 2-1.4.6-1.9-.9-2.1 2.1.9 1.9-.6 1.4-2 .7v3l2 .7.6 1.4-.9 1.9 2.1 2.1 1.9-.9 1.4.6.7 2h3l.7-2 1.4-.6 1.9.9 2.1-2.1-.9-1.9.6-1.4z" transform="scale(.82) translate(2.6 2.6)" /></template>
    <template v-else-if="name === 'panel-left'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16" /></template>
    <template v-else-if="name === 'panel-right'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M16 4v16" /></template>
    <template v-else-if="name === 'close'"><path d="m7 7 10 10M17 7 7 17" /></template>
    <template v-else-if="name === 'chevron-down'"><path d="m7 10 5 5 5-5" /></template>
    <template v-else-if="name === 'chevron-right'"><path d="m10 7 5 5-5 5" /></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4 4L19 6" /></template>
    <template v-else-if="name === 'loader'"><path d="M12 3a9 9 0 1 1-6.4 2.7" /></template>
    <template v-else-if="name === 'alert'"><path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></template>
    <template v-else-if="name === 'stop'"><rect x="7" y="7" width="10" height="10" rx="1.5" /></template>
    <template v-else-if="name === 'send'"><path d="m5 12 14-7-5 14-2.5-5.5z" /><path d="M11.5 13.5 19 5" /></template>
    <template v-else-if="name === 'paperclip'"><path d="m9 17 7.5-7.5a3 3 0 0 0-4.2-4.2L4.8 12.8a5 5 0 0 0 7.1 7.1l7-7" /></template>
    <template v-else-if="name === 'slash'"><path d="m8 20 8-16" /></template>
    <template v-else-if="name === 'shield'"><path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6z" /><path d="m9 12 2 2 4-4" /></template>
    <template v-else-if="name === 'sparkles'"><path d="m12 3 1.2 3.2L16 7.5l-2.8 1.3L12 12l-1.2-3.2L8 7.5l2.8-1.3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8zM5 12l.7 1.8 1.8.7-1.8.7L5 16l-.7-1.8-1.8-.7 1.8-.7z" /></template>
    <template v-else-if="name === 'terminal'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></template>
    <template v-else-if="name === 'file'"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 2-2 6 5" /></template>
    <template v-else-if="name === 'video'"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></template>
    <template v-else-if="name === 'monitor'"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3" /></template>
    <template v-else-if="name === 'brain'"><path d="M9.5 4.5A3.5 3.5 0 0 0 6 8v.5A3.5 3.5 0 0 0 5.5 15 3.5 3.5 0 0 0 9 19.5c1 0 2-.5 3-1.5V6c-.7-1-1.5-1.5-2.5-1.5ZM14.5 4.5A3.5 3.5 0 0 1 18 8v.5a3.5 3.5 0 0 1 .5 6.5 3.5 3.5 0 0 1-3.5 4.5c-1 0-2-.5-3-1.5V6c.7-1 1.5-1.5 2.5-1.5Z" /><path d="M8 9h4M12 13h4" /></template>
    <template v-else-if="name === 'list'"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></template>
    <template v-else-if="name === 'git-diff'"><circle cx="7" cy="5" r="2" /><circle cx="7" cy="19" r="2" /><path d="M7 7v10M13 6h7M16.5 2.5V9.5M13 18h7" /></template>
    <template v-else-if="name === 'box'"><path d="m4 7 8-4 8 4v10l-8 4-8-4z" /><path d="m4 7 8 4 8-4M12 11v10" /></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></template>
    <template v-else-if="name === 'key'"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2M14 9l2 2" /></template>
    <template v-else-if="name === 'eye'"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></template>
    <template v-else-if="name === 'eye-off'"><path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a13 13 0 0 1-2.1 2.8M6.6 6.6C4 8.4 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" /></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></template>
    <template v-else-if="name === 'moon'"><path d="M20 15.2A8.2 8.2 0 0 1 8.8 4 8.6 8.6 0 1 0 20 15.2Z" /></template>
    <template v-else-if="name === 'layout'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></template>
    <template v-else-if="name === 'automation'"><path d="M5 7h10a4 4 0 0 1 4 4v1M19 17H9a4 4 0 0 1-4-4v-1" /><path d="m16 4 3 3-3 3M8 14l-3 3 3 3" /></template>
    <template v-else-if="name === 'database'"><ellipse cx="12" cy="5.5" rx="7" ry="3" /><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></template>
    <template v-else><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2 2" /></template>
  </svg>
</template>

<script setup>
defineOptions({ name: 'WorkbenchIcon' })

defineProps({
  name: { type: String, default: 'activity' },
  size: { type: [Number, String], default: 16 }
})
</script>

<style scoped>
.wb-icon { display: block; flex: 0 0 auto; }
</style>
