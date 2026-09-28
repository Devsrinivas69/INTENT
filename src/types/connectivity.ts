export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RECOVERING' | 'SYNCING'

export interface ConnectivityStatus {
  state: ConnectivityState
  lastChecked: number
  lastOnline: number | null
  consecutiveFailures: number
  latencyMs: number | null
  offlineReason?: string
}

export type ConnectivityListener = (status: ConnectivityStatus) => void
