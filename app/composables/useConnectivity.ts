/** Whether the app server can be reached (kept up to date by plugins/offline.client.ts). */
export function useConnectivity() {
  const online = useState('app-online', () => true)
  return { online, offline: computed(() => !online.value) }
}
