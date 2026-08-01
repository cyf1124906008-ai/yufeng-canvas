/**
 * Compatibility facade for legacy Canvas components. New code should consume
 * useAgentSettings() directly so system / light / dark remains one source of truth.
 */
import { agentSettings } from './settings.js'

export const isDark = agentSettings.isDark
export const themePreference = agentSettings.theme

export const toggleTheme = () => {
  agentSettings.setTheme(isDark.value ? 'light' : 'dark')
}
