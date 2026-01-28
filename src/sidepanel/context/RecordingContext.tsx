import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import type {
  RecordingSession,
  RecordingStep,
  Annotation,
  NewStepMessage,
  SessionMetadata,
} from '../../types/recording'

// State type
interface RecordingState {
  // Current state
  isRecording: boolean
  session: RecordingSession | null

  // Recording timer
  elapsedTime: number

  // Past sessions
  pastSessions: SessionMetadata[]

  // UI state
  isLoading: boolean
  error: string | null
}

// Action types
type RecordingAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'START_RECORDING'; payload: RecordingSession }
  | { type: 'STOP_RECORDING'; payload: RecordingSession }
  | { type: 'UPDATE_SESSION'; payload: RecordingSession }
  | { type: 'ADD_STEP'; payload: RecordingStep }
  | { type: 'ADD_ANNOTATION'; payload: Annotation }
  | { type: 'UPDATE_ANNOTATION'; payload: { id: string; text: string } }
  | { type: 'DELETE_ANNOTATION'; payload: string }
  | { type: 'SET_ELAPSED_TIME'; payload: number }
  | { type: 'SET_PAST_SESSIONS'; payload: SessionMetadata[] }
  | { type: 'LOAD_SESSION'; payload: RecordingSession }
  | { type: 'CLEAR_SESSION' }

// Initial state
const initialState: RecordingState = {
  isRecording: false,
  session: null,
  elapsedTime: 0,
  pastSessions: [],
  isLoading: true,
  error: null,
}

// Reducer
function recordingReducer(state: RecordingState, action: RecordingAction): RecordingState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'START_RECORDING':
      return {
        ...state,
        isRecording: true,
        session: action.payload,
        elapsedTime: 0,
        error: null,
      }

    case 'STOP_RECORDING':
      return {
        ...state,
        isRecording: false,
        session: action.payload,
      }

    case 'UPDATE_SESSION':
      return {
        ...state,
        session: action.payload,
      }

    case 'ADD_STEP':
      if (!state.session) return state
      return {
        ...state,
        session: {
          ...state.session,
          steps: [...state.session.steps, action.payload],
        },
      }

    case 'ADD_ANNOTATION':
      if (!state.session) return state
      return {
        ...state,
        session: {
          ...state.session,
          annotations: [...state.session.annotations, action.payload],
        },
      }

    case 'UPDATE_ANNOTATION':
      if (!state.session) return state
      return {
        ...state,
        session: {
          ...state.session,
          annotations: state.session.annotations.map((a) =>
            a.id === action.payload.id ? { ...a, text: action.payload.text } : a,
          ),
        },
      }

    case 'DELETE_ANNOTATION':
      if (!state.session) return state
      return {
        ...state,
        session: {
          ...state.session,
          annotations: state.session.annotations.filter((a) => a.id !== action.payload),
        },
      }

    case 'SET_ELAPSED_TIME':
      return { ...state, elapsedTime: action.payload }

    case 'SET_PAST_SESSIONS':
      return { ...state, pastSessions: action.payload }

    case 'LOAD_SESSION':
      return {
        ...state,
        session: action.payload,
        isRecording: false,
      }

    case 'CLEAR_SESSION':
      return {
        ...state,
        session: null,
        isRecording: false,
        elapsedTime: 0,
      }

    default:
      return state
  }
}

// Context type
interface RecordingContextType extends RecordingState {
  startRecording: (title: string, hasAudio: boolean) => Promise<void>
  stopRecording: () => Promise<void>
  addAnnotation: (text: string, timestamp: number) => Promise<void>
  updateAnnotation: (id: string, text: string) => Promise<void>
  deleteAnnotation: (id: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  clearSession: () => void
  refreshPastSessions: () => Promise<void>
}

// Create context
const RecordingContext = createContext<RecordingContextType | null>(null)

// Provider props
interface RecordingProviderProps {
  children: ReactNode
}

// Provider component
export function RecordingProvider({ children }: RecordingProviderProps) {
  const [state, dispatch] = useReducer(recordingReducer, initialState)

  // Timer for elapsed time
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    if (state.isRecording && state.session) {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - state.session!.startTime
        dispatch({ type: 'SET_ELAPSED_TIME', payload: elapsed })
      }, 100)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [state.isRecording, state.session?.startTime])

  // Listen for messages from background script
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'NEW_STEP') {
        dispatch({ type: 'ADD_STEP', payload: (message as NewStepMessage).step })
      } else if (message.type === 'RECORDING_STOPPED') {
        // Refresh state from background
        chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
          if (response?.session) {
            dispatch({ type: 'STOP_RECORDING', payload: response.session })
          }
        })
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  // Initialize state from background script
  useEffect(() => {
    const initialize = async () => {
      try {
        // Get current recording state
        chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
          if (response?.isRecording && response?.session) {
            dispatch({ type: 'START_RECORDING', payload: response.session })
          } else if (response?.session) {
            dispatch({ type: 'LOAD_SESSION', payload: response.session })
          }
          dispatch({ type: 'SET_LOADING', payload: false })
        })

        // Load past sessions
        const { sessionIndex = [] } = await chrome.storage.local.get('sessionIndex')
        dispatch({ type: 'SET_PAST_SESSIONS', payload: sessionIndex })
      } catch (error) {
        console.error('Failed to initialize recording context:', error)
        dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize' })
        dispatch({ type: 'SET_LOADING', payload: false })
      }
    }

    initialize()
  }, [])

  // Start recording
  const startRecording = useCallback(async (title: string, hasAudio: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        title,
        hasAudio,
      })

      if (response?.success && response?.session) {
        dispatch({ type: 'START_RECORDING', payload: response.session })
      } else {
        throw new Error(response?.error || 'Failed to start recording')
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // Stop recording
  const stopRecording = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })
      console.log('[SidePanel] Stop recording response:', response)

      if (response?.success) {
        if (response?.session) {
          dispatch({ type: 'STOP_RECORDING', payload: response.session })
        } else {
          // No session returned, just clear recording state
          dispatch({ type: 'CLEAR_SESSION' })
        }

        // Refresh past sessions
        const { sessionIndex = [] } = await chrome.storage.local.get('sessionIndex')
        dispatch({ type: 'SET_PAST_SESSIONS', payload: sessionIndex })
      } else {
        console.error('[SidePanel] Stop recording failed:', response?.error)
        dispatch({ type: 'SET_ERROR', payload: response?.error || 'Failed to stop recording' })
      }
    } catch (error) {
      console.error('[SidePanel] Stop recording error:', error)
      dispatch({ type: 'SET_ERROR', payload: String(error) })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // Add annotation
  const addAnnotation = useCallback(async (text: string, timestamp: number) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_ANNOTATION',
        text,
        timestamp,
      })

      if (response?.success && response?.annotation) {
        dispatch({ type: 'ADD_ANNOTATION', payload: response.annotation })
      }
    } catch (error) {
      console.error('Failed to add annotation:', error)
    }
  }, [])

  // Update annotation
  const updateAnnotation = useCallback(async (id: string, text: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_ANNOTATION',
        annotationId: id,
        text,
      })

      if (response?.success) {
        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id, text } })
      }
    } catch (error) {
      console.error('Failed to update annotation:', error)
    }
  }, [])

  // Delete annotation
  const deleteAnnotation = useCallback(async (id: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_ANNOTATION',
        annotationId: id,
      })

      if (response?.success) {
        dispatch({ type: 'DELETE_ANNOTATION', payload: id })
      }
    } catch (error) {
      console.error('Failed to delete annotation:', error)
    }
  }, [])

  // Load a past session
  const loadSession = useCallback(async (sessionId: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      const result = await chrome.storage.local.get(`session_${sessionId}`)
      const session = result[`session_${sessionId}`]

      if (session) {
        dispatch({ type: 'LOAD_SESSION', payload: session })
      } else {
        throw new Error('Session not found')
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // Clear current session
  const clearSession = useCallback(() => {
    dispatch({ type: 'CLEAR_SESSION' })
  }, [])

  // Refresh past sessions list
  const refreshPastSessions = useCallback(async () => {
    try {
      const { sessionIndex = [] } = await chrome.storage.local.get('sessionIndex')
      dispatch({ type: 'SET_PAST_SESSIONS', payload: sessionIndex })
    } catch (error) {
      console.error('Failed to refresh past sessions:', error)
    }
  }, [])

  const value: RecordingContextType = {
    ...state,
    startRecording,
    stopRecording,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    loadSession,
    clearSession,
    refreshPastSessions,
  }

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
}

// Custom hook to use the context
export function useRecording(): RecordingContextType {
  const context = useContext(RecordingContext)
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider')
  }
  return context
}

// Helper to format elapsed time
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
