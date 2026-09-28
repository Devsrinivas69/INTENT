import type { ConnectivityState, ConnectivityStatus, ConnectivityListener } from '../types/connectivity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

class RendererConnectivityManager {
  private status: ConnectivityStatus = {
    state: navigator.onLine ? 'ONLINE' : 'OFFLINE',
    lastChecked: Date.now(),
    lastOnline: navigator.onLine ? Date.now() : null,
    consecutiveFailures: 0,
    latencyMs: null,
  }

  private listeners: Set<ConnectivityListener> = new Set()

  constructor() {
    this.init()
  }

  private init() {
    // 1. Listen for authoritative changes from Electron Main
    if (api?.onConnectivityChanged) {
      api.onConnectivityChanged((newStatus: ConnectivityStatus) => {
        this.updateStatus(newStatus)
      })
    }

    // 2. Fetch initial state from main process
    if (api?.getConnectivityStatus) {
      api.getConnectivityStatus().then((initialStatus: ConnectivityStatus) => {
        if (initialStatus) {
          this.updateStatus(initialStatus)
        }
      }).catch(() => {})
    }

    // 3. Fallback browser window events as hints to probe main process
    window.addEventListener('online', () => {
      this.probe()
    })
    window.addEventListener('offline', () => {
      this.updateStatus({
        ...this.status,
        state: 'OFFLINE',
        lastChecked: Date.now(),
        offlineReason: 'Network adapter disconnected',
      })
    })
  }

  private updateStatus(newStatus: ConnectivityStatus) {
    const changed = this.status.state !== newStatus.state ||
                    this.status.latencyMs !== newStatus.latencyMs ||
                    this.status.offlineReason !== newStatus.offlineReason

    this.status = { ...newStatus }

    if (changed) {
      this.notifyListeners()
    }
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.status)
      } catch (e) {
        console.error('[RendererConnectivityManager] Listener error:', e)
      }
    }
  }

  public getStatus(): ConnectivityStatus {
    return { ...this.status }
  }

  public getState(): ConnectivityState {
    return this.status.state
  }

  public isOnline(): boolean {
    return this.status.state === 'ONLINE'
  }

  public isOffline(): boolean {
    return this.status.state === 'OFFLINE'
  }

  public isDegraded(): boolean {
    return this.status.state === 'DEGRADED'
  }

  public isRecovering(): boolean {
    return this.status.state === 'RECOVERING'
  }

  public isSyncing(): boolean {
    return this.status.state === 'SYNCING'
  }

  public canUseCloudAi(): boolean {
    return this.status.state === 'ONLINE'
  }

  public async probe(): Promise<ConnectivityStatus> {
    if (api?.probeConnectivity) {
      try {
        const probed = await api.probeConnectivity()
        if (probed) {
          this.updateStatus(probed)
          return this.status
        }
      } catch {}
    }
    return this.status
  }

  public addListener(listener: ConnectivityListener): () => void {
    this.listeners.add(listener)
    listener(this.status) // Immediate initial emit
    return () => this.listeners.delete(listener)
  }

  public removeListener(listener: ConnectivityListener): void {
    this.listeners.delete(listener)
  }
}

export const connectivityManager = new RendererConnectivityManager()
