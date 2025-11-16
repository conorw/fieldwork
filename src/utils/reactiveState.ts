/**
 * Shared reactive state utilities to reduce ref() duplication
 */

import { ref, computed, type Ref, readonly } from 'vue'

export interface LoadingState {
  loading: Ref<boolean>
  error: Ref<string | null>
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export interface AsyncState<T> extends LoadingState {
  data: Ref<T | null>
  setData: (data: T | null) => void
  reset: () => void
}

/**
 * Create a loading state with error handling
 */
export const createLoadingState = (): LoadingState => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const setLoading = (isLoading: boolean) => {
    loading.value = isLoading
    if (isLoading) {
      error.value = null // Clear error when starting new operation
    }
  }

  const setError = (err: string | null) => {
    error.value = err
    loading.value = false
  }

  const clearError = () => {
    error.value = null
  }

  return {
    loading,
    error,
    setLoading,
    setError,
    clearError
  }
}

/**
 * Create an async state with data, loading, and error
 */
export const createAsyncState = <T>(initialData: T | null = null): AsyncState<T> => {
  const data = ref<T | null>(initialData)
  const loadingState = createLoadingState()

  const setData = (newData: T | null) => {
    data.value = newData
    loadingState.setLoading(false)
    loadingState.clearError()
  }

  const reset = () => {
    data.value = initialData
    loadingState.setLoading(false)
    loadingState.clearError()
  }

  return {
    data: data as Ref<T | null>,
    ...loadingState,
    setData,
    reset
  }
}

/**
 * Create a modal state
 */
export const createModalState = () => {
  const visible = ref(false)
  const show = () => { visible.value = true }
  const hide = () => { visible.value = false }
  const toggle = () => { visible.value = !visible.value }

  return {
    visible,
    show,
    hide,
    toggle
  }
}

/**
 * Create a form state with validation
 */
export const createFormState = <T extends Record<string, any>>(initialData: T) => {
  const data = ref<T>({ ...initialData })
  const errors = ref<Partial<Record<keyof T, string>>>({})
  const touched = ref<Partial<Record<keyof T, boolean>>>({})
  const isValid = computed(() => Object.keys(errors.value).length === 0)

  const setField = <K extends keyof T>(field: K, value: T[K]) => {
    data.value[field] = value
    touched.value[field] = true
    // Clear error when user starts typing
    if (errors.value[field]) {
      delete errors.value[field]
    }
  }

  const setError = <K extends keyof T>(field: K, error: string) => {
    errors.value[field] = error
  }

  const clearErrors = () => {
    errors.value = {}
  }

  const reset = () => {
    data.value = { ...initialData }
    errors.value = {}
    touched.value = {}
  }

  return {
    data: readonly(data), // Make data readonly to prevent direct mutations
    errors: readonly(errors),
    touched: readonly(touched),
    isValid,
    setField,
    setError,
    clearErrors,
    reset
  }
}

/**
 * Create a pagination state
 */
export const createPaginationState = (initialPageSize: number = 20) => {
  const page = ref(1)
  const pageSize = ref(initialPageSize)
  const total = ref(0)
  const hasMore = computed(() => page.value * pageSize.value < total.value)

  const nextPage = () => {
    if (hasMore.value) {
      page.value++
    }
  }

  const prevPage = () => {
    if (page.value > 1) {
      page.value--
    }
  }

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= Math.ceil(total.value / pageSize.value)) {
      page.value = newPage
    }
  }

  const reset = () => {
    page.value = 1
    total.value = 0
  }

  return {
    page,
    pageSize,
    total,
    hasMore,
    nextPage,
    prevPage,
    goToPage,
    reset
  }
}
