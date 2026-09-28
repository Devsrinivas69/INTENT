import type { QueuedAction } from '../types/taskPersistence'
import { connectivityManager } from './connectivityManager'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

class OfflineActionQueueService {
  /**
   * Enqueue an operation that can be deferred safely while offline.
   */
  async enqueue(params: {
    taskId: string
    type: string
    payload: any
    idempotencyKey?: string
  }): Promise<QueuedAction> {
    const action: QueuedAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      taskId: params.taskId,
      type: params.type,
      payload: params.payload,
      createdAt: Date.now(),
      status: 'PENDING',
      attemptCount: 0,
      idempotencyKey: params.idempotencyKey || `${params.taskId}_${params.type}_${Date.now()}`,
    }

    if (api?.enqueueAction) {
      await api.enqueueAction(action)
    } else {
      const current = this.getLocalQueue()
      current.push(action)
      this.saveLocalQueue(current)
    }

    return action
  }

  /**
   * Retrieve all actions currently in the queue.
   */
  async getAll(): Promise<QueuedAction[]> {
    if (api?.getQueuedActions) {
      return (await api.getQueuedActions()) || []
    }
    return this.getLocalQueue()
  }

  /**
   * Update the status, attempts, or error of a specific action.
   */
  async update(id: string, updates: Partial<QueuedAction>): Promise<boolean> {
    if (api?.updateQueuedAction) {
      const res = await api.updateQueuedAction(id, updates)
      return res?.success ?? false
    }
    const current = this.getLocalQueue()
    const item = current.find((a) => a.id === id)
    if (item) {
      Object.assign(item, updates, { lastAttemptAt: Date.now() })
      this.saveLocalQueue(current)
      return true
    }
    return false
  }

  /**
   * Flush and synchronize pending actions when connectivity is restored.
   */
  async flush(executor?: (action: QueuedAction) => Promise<boolean>): Promise<{
    processed: number
    succeeded: number
    failed: number
  }> {
    if (!connectivityManager.isOnline()) {
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    const all = await this.getAll()
    const pending = all.filter((a) => a.status === 'PENDING' || a.status === 'FAILED')

    let succeeded = 0
    let failed = 0

    for (const action of pending) {
      if (action.attemptCount >= 5) {
        await this.update(action.id, {
          status: 'REQUIRES_USER_ACTION',
          error: 'Exceeded maximum retry attempts (5)',
        })
        failed++
        continue
      }

      await this.update(action.id, {
        status: 'SYNCING',
        attemptCount: action.attemptCount + 1,
      })

      try {
        let success = true
        if (executor) {
          success = await executor(action)
        } else {
          // Default synthetic executor for generic telemetry/sync actions
          success = true
        }

        if (success) {
          await this.update(action.id, { status: 'SUCCESS' })
          succeeded++
        } else {
          await this.update(action.id, { status: 'FAILED', error: 'Executor rejected sync' })
          failed++
        }
      } catch (err: any) {
        await this.update(action.id, {
          status: 'FAILED',
          error: err?.message || 'Sync failed',
        })
        failed++
      }
    }

    return { processed: pending.length, succeeded, failed }
  }

  /**
   * Local storage fallback
   */
  private getLocalQueue(): QueuedAction[] {
    try {
      const raw = localStorage.getItem('intent_offline_queue')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private saveLocalQueue(queue: QueuedAction[]): void {
    try {
      localStorage.setItem('intent_offline_queue', JSON.stringify(queue))
    } catch {}
  }
}

export const offlineActionQueue = new OfflineActionQueueService()
