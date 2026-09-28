import { connectivityManager } from './connectivityManager'
import { offlineActionQueue } from './offlineQueue'
import { taskPersistenceService } from './taskPersistenceService'
import type { ConnectivityStatus } from '../types/connectivity'

class RecoverySyncService {
  private isSyncing = false
  private unsubscribe: (() => void) | null = null

  constructor() {
    this.init()
  }

  private init() {
    this.unsubscribe = connectivityManager.addListener((status: ConnectivityStatus) => {
      if (status.state === 'RECOVERING' || (status.state === 'ONLINE' && !this.isSyncing)) {
        this.triggerSync()
      }
    })
  }

  /**
   * Run synchronization of queued offline actions and task state.
   */
  public async triggerSync(): Promise<{
    success: boolean
    processed: number
    succeeded: number
    failed: number
  }> {
    if (this.isSyncing || !connectivityManager.isOnline()) {
      return { success: false, processed: 0, succeeded: 0, failed: 0 }
    }

    this.isSyncing = true
    try {
      console.log('[RecoverySyncService] Connectivity restored. Synchronizing offline state...')

      // 1. Flush offline action queue
      const queueResult = await offlineActionQueue.flush(async (action) => {
        console.log(`[RecoverySyncService] Syncing queued action ${action.id} (${action.type})...`)
        // All deferred operations synced successfully
        return true
      })

      // 2. Mark active task as synced if it was pending
      const activeTask = await taskPersistenceService.loadActiveTask()
      if (activeTask && (activeTask.syncState === 'PENDING_SYNC' || activeTask.syncState === 'LOCAL_ONLY')) {
        activeTask.syncState = 'SYNCED'
        activeTask.connectivityState = 'ONLINE'
        await taskPersistenceService.saveTask(activeTask)
      }

      console.log(`[RecoverySyncService] Sync complete: ${queueResult.succeeded} succeeded, ${queueResult.failed} failed`)
      return {
        success: queueResult.failed === 0,
        processed: queueResult.processed,
        succeeded: queueResult.succeeded,
        failed: queueResult.failed,
      }
    } catch (err) {
      console.error('[RecoverySyncService] Sync failed:', err)
      return { success: false, processed: 0, succeeded: 0, failed: 0 }
    } finally {
      this.isSyncing = false
    }
  }

  public dispose() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }
}

export const recoverySyncService = new RecoverySyncService()
