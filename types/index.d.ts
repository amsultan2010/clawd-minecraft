export type Mood = 'walk' | 'ask' | 'done'

declare module 'claude-code' {
  interface PluginState {
    'clawd-minecraft': { mood: Mood }
  }
}
