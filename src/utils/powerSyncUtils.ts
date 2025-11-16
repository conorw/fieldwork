/**
 * Shared PowerSync utilities to reduce store duplication
 */

import { ref, computed, type Ref, type ComputedRef, unref } from 'vue'
import { usePowerSyncStore } from '../stores/powersync'

export interface PowerSyncQueryOptions {
  loading?: Ref<boolean>
  error?: Ref<string | null>
  immediate?: boolean
}

/**
 * Create a reactive PowerSync query with loading and error states
 */
export const usePowerSyncQuery = <T = any>(
  query: string, 
  params: any[] = [], 
  options: PowerSyncQueryOptions = {}
) => {
  const powerSyncStore = usePowerSyncStore()
  const data = ref<T[]>([])
  const loading = options.loading || ref(false)
  const error = options.error || ref<string | null>(null)

  const execute = async () => {
    if (!powerSyncStore.powerSync) {
      error.value = 'PowerSync not initialized'
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await powerSyncStore.powerSync.getAll(query, params)
      data.value = result as T[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Query failed'
      console.error('PowerSync query error:', err)
    } finally {
      loading.value = false
    }
  }

  // Execute immediately if requested
  if (options.immediate) {
    execute()
  }

  return {
    data,
    loading,
    error,
    execute,
    refetch: execute
  }
}

/**
 * Create a reactive PowerSync query with computed parameters
 */
export const useReactivePowerSyncQuery = <T = any>(
  query: Ref<string> | ComputedRef<string>, 
  params: Ref<any[]> | ComputedRef<any[]> = ref([]),
  options: PowerSyncQueryOptions = {}
) => {
  const powerSyncStore = usePowerSyncStore()
  const data = ref<T[]>([])
  const loading = options.loading || ref(false)
  const error = options.error || ref<string | null>(null)

  const execute = async () => {
    if (!powerSyncStore.powerSync) {
      error.value = 'PowerSync not initialized'
      return
    }

    loading.value = true
    error.value = null

    try {
      const queryString = unref(query)
      const queryParams = unref(params)
      const result = await powerSyncStore.powerSync.getAll(queryString, queryParams)
      data.value = result as T[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Query failed'
      console.error('PowerSync reactive query error:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    data,
    loading,
    error,
    execute,
    refetch: execute
  }
}

/**
 * Create a PowerSync mutation with loading and error states
 */
export const usePowerSyncMutation = (options: PowerSyncQueryOptions = {}) => {
  const powerSyncStore = usePowerSyncStore()
  const loading = options.loading || ref(false)
  const error = options.error || ref<string | null>(null)

  const execute = async (query: string, params: any[] = []) => {
    if (!powerSyncStore.powerSync) {
      error.value = 'PowerSync not initialized'
      return null
    }

    loading.value = true
    error.value = null

    try {
      const result = await powerSyncStore.powerSync.execute(query, params)
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Mutation failed'
      console.error('PowerSync mutation error:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  const insert = async (table: string, data: Record<string, any>) => {
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = columns.map(() => '?').join(', ')
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    
    return execute(query, values)
  }

  const update = async (table: string, data: Record<string, any>, where: string, whereParams: any[] = []) => {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ')
    const values = [...Object.values(data), ...whereParams]
    const query = `UPDATE ${table} SET ${setClause} WHERE ${where}`
    
    return execute(query, values)
  }

  const remove = async (table: string, where: string, whereParams: any[] = []) => {
    const query = `DELETE FROM ${table} WHERE ${where}`
    return execute(query, whereParams)
  }

  return {
    loading,
    error,
    execute,
    insert,
    update,
    remove
  }
}

/**
 * Create a PowerSync store with common patterns
 */
export const createPowerSyncStore = () => {
  const powerSyncStore = usePowerSyncStore()
  
  const isReady = computed(() => powerSyncStore.isInitialized && !!powerSyncStore.powerSync)
  const isConnecting = computed(() => powerSyncStore.isConnecting)
  const lastSyncTime = computed(() => powerSyncStore.lastSyncTime)
  const syncStatus = computed(() => powerSyncStore.syncStatus)
  const pendingUploads = computed(() => powerSyncStore.pendingUploads)

  const ensureReady = () => {
    if (!isReady.value) {
      throw new Error('PowerSync not ready')
    }
    return powerSyncStore.powerSync
  }

  return {
    powerSync: computed(() => powerSyncStore.powerSync),
    isReady,
    isConnecting,
    lastSyncTime,
    syncStatus,
    pendingUploads,
    ensureReady,
    initialize: powerSyncStore.initialize,
    clearAllData: powerSyncStore.clearAllPowerSyncData
  }
}
