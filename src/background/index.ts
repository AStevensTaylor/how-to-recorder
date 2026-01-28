/**
 * Background Service Worker
 * Orchestrates recording sessions, captures screenshots, and manages state
 */

import type {
  RecordingSession,
  RecordingStep,
  Annotation,
  RecordingMessage,
  ClickEventMessage,
  InputEventMessage,
  NavigationEventMessage,
  NewStepMessage,
  StartRecordingMessage,
  StopRecordingMessage,
  AddAnnotationMessage,
  UpdateAnnotationMessage,
  DeleteAnnotationMessage,
  RecordingStateMessage,
  generateId,
} from '../types/recording'

console.log('[How-To Recorder] Background service worker started')

// Current recording session
let currentSession: RecordingSession | null = null

// Track which tabs have content scripts ready
const readyTabs = new Set<number>()

// Generate unique IDs
function generateUniqueId(prefix: string = ''): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Capture screenshot of a tab
 */
async function captureScreenshot(tabId: number): Promise<string | undefined> {
  try {
    // Get the tab to find its windowId
    const tab = await chrome.tabs.get(tabId)
    if (!tab.windowId) {
      console.warn('[How-To Recorder] Tab has no windowId')
      return undefined
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 90,
    })
    return dataUrl
  } catch (error) {
    console.warn('[How-To Recorder] Failed to capture screenshot:', error)
    return undefined
  }
}

/**
 * Highlight an element in a tab before screenshot
 */
async function highlightElement(tabId: number, selector: string): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'HIGHLIGHT_ELEMENT',
      selector,
    })
    // Wait for highlight to render
    await new Promise((resolve) => setTimeout(resolve, 100))
    return true
  } catch (error) {
    console.warn('[How-To Recorder] Failed to highlight element:', error)
    return false
  }
}

/**
 * Hide the highlight overlay in a tab
 */
async function hideHighlightInTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'HIDE_HIGHLIGHT' })
  } catch (error) {
    console.warn('[How-To Recorder] Failed to hide highlight:', error)
  }
}

/**
 * Capture screenshot with optional element highlighting
 */
async function captureScreenshotWithHighlight(
  tabId: number,
  selector?: string,
): Promise<string | undefined> {
  // If we have a selector, highlight the element first
  if (selector) {
    await highlightElement(tabId, selector)
  }

  // Capture the screenshot
  const screenshotData = await captureScreenshot(tabId)

  // Hide the highlight after capturing
  if (selector) {
    await hideHighlightInTab(tabId)
  }

  return screenshotData
}

/**
 * Enable recording in a specific tab
 */
async function enableRecordingInTab(tabId: number, startTime: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'ENABLE_RECORDING',
      startTime,
    })
    console.log(`[How-To Recorder] Recording enabled in tab ${tabId}`)
  } catch (error) {
    // Tab might not have content script loaded, try to inject it
    console.warn(`[How-To Recorder] Could not enable recording in tab ${tabId}:`, error)
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/contentScript/index.ts'],
      })
      // Try again after injection
      await chrome.tabs.sendMessage(tabId, {
        type: 'ENABLE_RECORDING',
        startTime,
      })
    } catch (injectError) {
      console.warn(
        `[How-To Recorder] Could not inject content script in tab ${tabId}:`,
        injectError,
      )
    }
  }
}

/**
 * Disable recording in a specific tab
 */
async function disableRecordingInTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'DISABLE_RECORDING' })
    console.log(`[How-To Recorder] Recording disabled in tab ${tabId}`)
  } catch (error) {
    console.warn(`[How-To Recorder] Could not disable recording in tab ${tabId}:`, error)
  }
}

/**
 * Start a new recording session
 */
async function startRecording(title: string, hasAudio: boolean): Promise<RecordingSession> {
  // Get the current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!activeTab?.id) {
    throw new Error('No active tab found')
  }

  const startTime = Date.now()

  // Create new session
  currentSession = {
    id: generateUniqueId('session_'),
    title,
    startTime,
    isRecording: true,
    hasAudio,
    steps: [],
    annotations: [],
    trackedTabIds: [activeTab.id],
  }

  // Enable recording in the active tab
  await enableRecordingInTab(activeTab.id, startTime)

  // Capture initial navigation step
  const initialStep: RecordingStep = {
    id: generateUniqueId('step_'),
    timestamp: 0,
    type: 'navigation',
    tabId: activeTab.id,
    tabTitle: activeTab.title || 'Untitled',
    url: activeTab.url || '',
    screenshotData: await captureScreenshot(activeTab.id),
  }

  currentSession.steps.push(initialStep)

  // Notify side panel about the new step
  broadcastToSidePanel({
    type: 'NEW_STEP',
    step: initialStep,
  })

  // Save session metadata to storage
  await saveSessionMetadata()

  console.log('[How-To Recorder] Recording started:', currentSession.id)

  return currentSession
}

/**
 * Stop the current recording session
 */
async function stopRecording(): Promise<RecordingSession | null> {
  if (!currentSession) {
    console.warn('[How-To Recorder] No active recording to stop')
    return null
  }

  currentSession.isRecording = false
  currentSession.endTime = Date.now()

  // Disable recording in all tracked tabs
  for (const tabId of currentSession.trackedTabIds) {
    await disableRecordingInTab(tabId)
  }

  // Save final session data
  await saveSessionMetadata()

  const finishedSession = currentSession
  console.log('[How-To Recorder] Recording stopped:', finishedSession.id)

  return finishedSession
}

/**
 * Add a step to the current recording
 */
async function addStep(
  type: 'click' | 'input' | 'navigation',
  data: Partial<RecordingStep>,
  tabId: number,
): Promise<RecordingStep | null> {
  if (!currentSession || !currentSession.isRecording) {
    return null
  }

  // Get tab info
  let tabTitle = 'Unknown'
  let tabUrl = ''
  try {
    const tab = await chrome.tabs.get(tabId)
    tabTitle = tab.title || 'Untitled'
    tabUrl = tab.url || data.url || ''
  } catch {
    tabUrl = data.url || ''
  }

  // Capture screenshot with element highlight for click/input events
  const selector = data.element?.selector
  const screenshotData = await captureScreenshotWithHighlight(tabId, selector)

  const step: RecordingStep = {
    id: generateUniqueId('step_'),
    timestamp: data.timestamp || Date.now() - currentSession.startTime,
    type,
    tabId,
    tabTitle,
    url: tabUrl,
    screenshotData,
    element: data.element,
    inputValue: data.inputValue,
    isSensitive: data.isSensitive,
  }

  currentSession.steps.push(step)

  // Notify side panel
  broadcastToSidePanel({
    type: 'NEW_STEP',
    step,
  })

  // Add tab to tracked tabs if not already
  if (!currentSession.trackedTabIds.includes(tabId)) {
    currentSession.trackedTabIds.push(tabId)
  }

  return step
}

/**
 * Add an annotation to the current recording
 */
function addAnnotation(text: string, timestamp: number): Annotation | null {
  if (!currentSession) {
    return null
  }

  const annotation: Annotation = {
    id: generateUniqueId('ann_'),
    timestamp,
    text,
  }

  currentSession.annotations.push(annotation)

  return annotation
}

/**
 * Update an annotation
 */
function updateAnnotation(annotationId: string, text: string): Annotation | null {
  if (!currentSession) {
    return null
  }

  const annotation = currentSession.annotations.find((a) => a.id === annotationId)
  if (annotation) {
    annotation.text = text
    return annotation
  }

  return null
}

/**
 * Delete an annotation
 */
function deleteAnnotation(annotationId: string): boolean {
  if (!currentSession) {
    return false
  }

  const index = currentSession.annotations.findIndex((a) => a.id === annotationId)
  if (index !== -1) {
    currentSession.annotations.splice(index, 1)
    return true
  }

  return false
}

/**
 * Save session metadata to chrome.storage.local
 */
async function saveSessionMetadata(): Promise<void> {
  if (!currentSession) return

  const metadata = {
    id: currentSession.id,
    title: currentSession.title,
    startTime: currentSession.startTime,
    endTime: currentSession.endTime,
    hasAudio: currentSession.hasAudio,
    stepCount: currentSession.steps.length,
    annotationCount: currentSession.annotations.length,
    isRecording: currentSession.isRecording,
  }

  // Get existing sessions index
  const { sessionIndex = [] } = await chrome.storage.local.get('sessionIndex')

  // Update or add this session
  const existingIndex = sessionIndex.findIndex((s: { id: string }) => s.id === metadata.id)
  if (existingIndex >= 0) {
    sessionIndex[existingIndex] = metadata
  } else {
    sessionIndex.unshift(metadata)
  }

  await chrome.storage.local.set({ sessionIndex })

  // Also save full session data (for now - later we'll use IndexedDB)
  await chrome.storage.local.set({
    [`session_${currentSession.id}`]: currentSession,
  })
}

/**
 * Broadcast message to side panel
 */
function broadcastToSidePanel(message: RecordingMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be open
  })
}

/**
 * Handle messages from content scripts and side panel
 */
chrome.runtime.onMessage.addListener((message: RecordingMessage, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message.type) {
      case 'START_RECORDING': {
        const msg = message as StartRecordingMessage
        try {
          const session = await startRecording(msg.title, msg.hasAudio)
          sendResponse({ success: true, session })
        } catch (error) {
          sendResponse({ success: false, error: String(error) })
        }
        break
      }

      case 'STOP_RECORDING': {
        const session = await stopRecording()
        sendResponse({ success: true, session })
        break
      }

      case 'CLICK_EVENT': {
        const msg = message as ClickEventMessage
        if (sender.tab?.id) {
          const step = await addStep(
            'click',
            {
              timestamp: msg.timestamp,
              element: msg.element,
              url: msg.url,
            },
            sender.tab.id,
          )
          sendResponse({ success: true, step })
        }
        break
      }

      case 'INPUT_EVENT': {
        const msg = message as InputEventMessage
        console.log(
          '[How-To Recorder] Received INPUT_EVENT:',
          msg.element?.selector,
          'value:',
          msg.isSensitive ? '(sensitive)' : msg.value,
        )
        if (sender.tab?.id) {
          const step = await addStep(
            'input',
            {
              timestamp: msg.timestamp,
              element: msg.element,
              inputValue: msg.value,
              isSensitive: msg.isSensitive,
              url: msg.url,
            },
            sender.tab.id,
          )
          sendResponse({ success: true, step })
        } else {
          console.warn('[How-To Recorder] INPUT_EVENT received but no sender.tab.id')
          sendResponse({ success: false, error: 'No tab id' })
        }
        break
      }

      case 'ADD_ANNOTATION': {
        const msg = message as AddAnnotationMessage
        const annotation = addAnnotation(msg.text, msg.timestamp)
        sendResponse({ success: true, annotation })
        break
      }

      case 'UPDATE_ANNOTATION': {
        const msg = message as UpdateAnnotationMessage
        const annotation = updateAnnotation(msg.annotationId, msg.text)
        sendResponse({ success: !!annotation, annotation })
        break
      }

      case 'DELETE_ANNOTATION': {
        const msg = message as DeleteAnnotationMessage
        const success = deleteAnnotation(msg.annotationId)
        sendResponse({ success })
        break
      }

      case 'GET_RECORDING_STATE': {
        const response: RecordingStateMessage = {
          type: 'RECORDING_STATE',
          isRecording: currentSession?.isRecording || false,
          session: currentSession || undefined,
        }
        sendResponse(response)
        break
      }

      case 'CONTENT_SCRIPT_READY': {
        if (sender.tab?.id) {
          readyTabs.add(sender.tab.id)
          // If we're recording, enable in this tab
          if (currentSession?.isRecording) {
            await enableRecordingInTab(sender.tab.id, currentSession.startTime)
            if (!currentSession.trackedTabIds.includes(sender.tab.id)) {
              currentSession.trackedTabIds.push(sender.tab.id)
            }
          }
        }
        sendResponse({ success: true })
        break
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  }

  handleAsync()
  return true // Indicates async response
})

// Track tab navigation for recording new pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!currentSession?.isRecording) return
  if (!currentSession.trackedTabIds.includes(tabId)) return

  // Only track completed navigations
  if (changeInfo.status === 'complete' && tab.url) {
    // Add navigation step
    const step = await addStep(
      'navigation',
      {
        timestamp: Date.now() - currentSession.startTime,
        url: tab.url,
      },
      tabId,
    )

    console.log('[How-To Recorder] Navigation detected:', tab.url)
  }
})

// Track new tabs created from tracked tabs
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!currentSession?.isRecording) return
  if (!tab.id) return

  // Check if this tab was opened from a tracked tab
  if (tab.openerTabId && currentSession.trackedTabIds.includes(tab.openerTabId)) {
    // Add this tab to tracked tabs
    currentSession.trackedTabIds.push(tab.id)

    // Enable recording when the tab is ready
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        if (currentSession?.isRecording && tab.id) {
          enableRecordingInTab(tab.id, currentSession.startTime)
        }
      }
    })

    console.log('[How-To Recorder] New tab opened from tracked tab:', tab.id)
  }
})

// Handle tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  readyTabs.delete(tabId)

  if (currentSession?.isRecording) {
    const index = currentSession.trackedTabIds.indexOf(tabId)
    if (index !== -1) {
      currentSession.trackedTabIds.splice(index, 1)
      console.log('[How-To Recorder] Tracked tab closed:', tabId)

      // If all tracked tabs are closed, stop recording
      if (currentSession.trackedTabIds.length === 0) {
        console.log('[How-To Recorder] All tracked tabs closed, stopping recording')
        stopRecording()
      }
    }
  }
})

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    // Use setOptions to open the side panel for this tab
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true,
    })
  }
})

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // API might not be available in all contexts
})
