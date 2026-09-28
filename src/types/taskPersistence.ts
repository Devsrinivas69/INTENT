import type { CompletionProof } from './screenMap'
import type { ConnectivityState } from './connectivity'

export interface QueuedAction {
  id: string
  taskId: string
  type: string
  payload: any
  createdAt: number
  status: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REQUIRES_USER_ACTION'
  attemptCount: number
  lastAttemptAt?: number
  error?: string
  idempotencyKey: string
}

export interface PersistentTaskState {
  taskId: string
  intent: string
  application: string
  workflowId: string
  currentLevelIndex: number
  totalLevels: number
  completedLevels: number[]
  completionProofs: CompletionProof[]
  pendingActions: QueuedAction[]
  connectivityState: ConnectivityState
  createdAt: number
  updatedAt: number
  syncState: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'CONFLICT' | 'REQUIRES_USER_ACTION'
}
