/**
 * Bubble notification system - visually prominent feedback for generation events.
 * Sits above Naive UI $message toasts for image/video generation lifecycle.
 */

let bubbleContainer = null
let bubbleTimeout = null
let lastBubbleKey = 0
let lastBubbleMessage = ''
const BUBBLE_DEDUP_WINDOW = 2000

const BUBBLE_LEVEL_CONFIG = {
  success: { className: 'bubble-success', icon: '✓', duration: 3500 },
  retry:   { className: 'bubble-retry',   icon: '↻', duration: 4000 },
  error:   { className: 'bubble-error',   icon: '✗', duration: 6000 },
  info:    { className: 'bubble-info',     icon: 'ⓘ', duration: 3500 }
}

const ensureContainer = () => {
  if (bubbleContainer && bubbleContainer.parentNode) return bubbleContainer
  const el = document.createElement('div')
  el.id = 'yufeng-bubble-container'
  el.className = 'bubble-notification-container'
  document.body.appendChild(el)
  bubbleContainer = el
  return el
}

export const showBubble = (level, message, { duration } = {}) => {
  const now = Date.now()
  if (message === lastBubbleMessage && now - lastBubbleKey < BUBBLE_DEDUP_WINDOW) return
  lastBubbleKey = now
  lastBubbleMessage = message

  const container = ensureContainer()
  const config = BUBBLE_LEVEL_CONFIG[level] || BUBBLE_LEVEL_CONFIG.info
  const ms = duration || config.duration

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout)
    bubbleTimeout = null
  }

  container.className = `bubble-notification-container ${config.className}`
  container.textContent = ''

  const iconSpan = document.createElement('span')
  iconSpan.className = 'bubble-icon'
  iconSpan.textContent = config.icon

  const msgSpan = document.createElement('span')
  msgSpan.className = 'bubble-message'
  msgSpan.textContent = message

  container.appendChild(iconSpan)
  container.appendChild(msgSpan)

  requestAnimationFrame(() => {
    container.classList.add('bubble-visible')
  })

  bubbleTimeout = setTimeout(() => {
    container.classList.remove('bubble-visible')
    container.classList.add('bubble-exit')
    setTimeout(() => {
      if (container.parentNode) {
        container.className = 'bubble-notification-container'
      }
    }, 320)
  }, ms)
}
