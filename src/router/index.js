/**
 * Router configuration.
 */

import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import AgentWorkspace from '../views/AgentWorkspace.vue'

const routes = [
  {
    path: '/',
    name: 'AgentWorkspace',
    component: AgentWorkspace
  },
  {
    path: '/canvas/:pathMatch(.*)*',
    redirect: '/'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
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
