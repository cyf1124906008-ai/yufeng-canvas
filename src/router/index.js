/**
 * Router configuration.
 */

import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const Canvas = () => import('../views/Canvas.vue')
const ImageExpert = () => import('../views/ImageExpert.vue')

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
  },
  {
    path: '/image-expert',
    name: 'ImageExpert',
    component: ImageExpert
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
