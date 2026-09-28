import type { PersistentTaskState } from '../types/taskPersistence'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

class TaskPersistenceService {
  /**
   * Save or update task state to persistent storage.
   */
  async saveTask(task: PersistentTaskState): Promise<boolean> {
    try {
      if (api?.saveTask) {
        const res = await api.saveTask(task)
        return res?.success ?? false
      }
      // Browser fallback (for preview/dev)
      localStorage.setItem(`intent_task_${task.taskId}`, JSON.stringify(task))
      localStorage.setItem('intent_active_task_id', task.taskId)
      return true
    } catch (e) {
      console.error('[TaskPersistenceService] Failed to save task:', e)
      return false
    }
  }

  /**
   * Load the most recent active/incomplete task, if one exists.
   */
  async loadActiveTask(): Promise<PersistentTaskState | null> {
    try {
      if (api?.loadActiveTask) {
        const active = await api.loadActiveTask()
        return active || null
      }
      const activeId = localStorage.getItem('intent_active_task_id')
      if (activeId) {
        const raw = localStorage.getItem(`intent_task_${activeId}`)
        if (raw) return JSON.parse(raw)
      }
      return null
    } catch (e) {
      console.error('[TaskPersistenceService] Failed to load active task:', e)
      return null
    }
  }

  /**
   * Mark a task as completed or cleared so it won't prompt for restoration.
   */
  async clearActiveTask(taskId?: string): Promise<boolean> {
    try {
      if (api?.clearActiveTask) {
        const res = await api.clearActiveTask(taskId)
        return res?.success ?? false
      }
      localStorage.removeItem('intent_active_task_id')
      if (taskId) {
        localStorage.removeItem(`intent_task_${taskId}`)
      }
      return true
    } catch (e) {
      console.error('[TaskPersistenceService] Failed to clear active task:', e)
      return false
    }
  }

  /**
   * List all stored tasks.
   */
  async listTasks(): Promise<PersistentTaskState[]> {
    try {
      if (api?.listTasks) {
        return (await api.listTasks()) || []
      }
      return []
    } catch (e) {
      console.error('[TaskPersistenceService] Failed to list tasks:', e)
      return []
    }
  }
}

export const taskPersistenceService = new TaskPersistenceService()
