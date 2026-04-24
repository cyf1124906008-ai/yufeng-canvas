/**
 * Router configuration.
 */

import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Canvas from '../views/Canvas.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/canvas/:id?',
    name: 'Canvas',
    component: Canvas
  }
]

const isDesktop = import.meta.env.APP_TARGET === 'desktop'
const history = isDesktop
  ? createMemoryHistory()
  : createWebHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
  routes
})

export default router
