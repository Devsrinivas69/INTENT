import net from 'net'
import { EventEmitter } from 'events'

export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RECOVERING' | 'SYNCING'

export interface ConnectivityStatus {
  state: ConnectivityState
  lastChecked: number
  lastOnline: number | null
  consecutiveFailures: number
  latencyMs: number | null
  offlineReason?: string
}

export class ConnectivityManager extends EventEmitter {
  private state: ConnectivityState = 'ONLINE'
  private lastChecked: number = Date.now()
  private lastOnline: number | null = Date.now()
  private consecutiveFailures: number = 0
  private latencyMs: number | null = null
  private offlineReason?: string
  private probeTimer: NodeJS.Timeout | null = null
  private isProbing: boolean = false
  private probeHost: string = 'generativelanguage.googleapis.com'
  private probePort: number = 443
  private probeTimeoutMs: number = 3500

  constructor() {
    super()
    this.startPeriodicProbe()
  }

  public getStatus(): ConnectivityStatus {
    return {
      state: this.state,
      lastChecked: this.lastChecked,
      lastOnline: this.lastOnline,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.latencyMs,
      offlineReason: this.offlineReason,
    }
  }

  public getState(): ConnectivityState {
    return this.state
  }

  public isOnline(): boolean {
    return this.state === 'ONLINE'
  }

  public canUseCloudAi(): boolean {
    return this.state === 'ONLINE'
  }

  public setState(newState: ConnectivityState, reason?: string): void {
    if (this.state === newState && this.offlineReason === reason) return
    const prev = this.state
    this.state = newState
    if (reason) this.offlineReason = reason
    if (newState === 'ONLINE') {
      this.lastOnline = Date.now()
      this.consecutiveFailures = 0
      this.offlineReason = undefined
    }

    console.log(`[ConnectivityManager] State transition: ${prev} -> ${newState}${reason ? ` (${reason})` : ''}`)
    this.emit('changed', this.getStatus())
  }

  public recordApiSuccess(latencyMs?: number): void {
    this.consecutiveFailures = 0
    this.lastOnline = Date.now()
    if (latencyMs !== undefined) this.latencyMs = latencyMs

    if (this.state !== 'ONLINE' && this.state !== 'SYNCING') {
      this.setState('ONLINE')
    }
  }

  public recordApiFailure(reason: string): void {
    this.consecutiveFailures++
    this.lastChecked = Date.now()
    this.offlineReason = reason

    if (this.consecutiveFailures >= 2) {
      this.setState('OFFLINE', reason)
    } else {
      this.setState('DEGRADED', reason)
    }
  }

  public async probe(): Promise<ConnectivityStatus> {
    if (this.isProbing) return this.getStatus()
    this.isProbing = true
    const startTime = Date.now()

    return new Promise<ConnectivityStatus>((resolve) => {
      const socket = new net.Socket()
      let resolved = false

      const finish = (success: boolean, errorMsg?: string) => {
        if (resolved) return
        resolved = true
        socket.destroy()
        this.isProbing = false
        this.lastChecked = Date.now()

        if (success) {
          this.latencyMs = Date.now() - startTime
          if (this.state === 'OFFLINE' || this.state === 'DEGRADED') {
            // Transition through RECOVERING before declaring ONLINE
            this.setState('RECOVERING', 'Probe connection succeeded')
            setTimeout(() => {
              if (this.state === 'RECOVERING') {
                this.setState('ONLINE')
              }
            }, 600)
          } else if (this.state !== 'SYNCING') {
            this.setState('ONLINE')
          }
        } else {
          this.recordApiFailure(errorMsg || 'Probe socket timeout or error')
        }

        resolve(this.getStatus())
      }

      socket.setTimeout(this.probeTimeoutMs)

      socket.connect(this.probePort, this.probeHost, () => {
        finish(true)
      })

      socket.on('error', (err) => {
        finish(false, err.message || 'Connection refused or unreachable')
      })

      socket.on('timeout', () => {
        finish(false, `Timeout after ${this.probeTimeoutMs}ms`)
      })
    })
  }

  private startPeriodicProbe(): void {
    const scheduleNext = () => {
      // Dynamic probe interval based on connectivity state
      let intervalMs = 25000 // 25s when online
      if (this.state === 'OFFLINE') {
        // Exponential backoff up to 30s
        intervalMs = Math.min(30000, 5000 * Math.max(1, this.consecutiveFailures))
      } else if (this.state === 'DEGRADED') {
        intervalMs = 8000
      } else if (this.state === 'RECOVERING') {
        intervalMs = 3000
      }

      this.probeTimer = setTimeout(async () => {
        try {
          await this.probe()
        } catch {}
        scheduleNext()
      }, intervalMs)
    }

    // Initial probe after 2 seconds
    setTimeout(() => {
      this.probe().catch(() => {})
      scheduleNext()
    }, 2000)
  }

  public dispose(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = null
    }
    this.removeAllListeners()
  }
}

export const connectivityManager = new ConnectivityManager()
