/**
 * Content Script - Main Entry Point
 * Handles communication with background script and coordinates
 * click/input tracking
 */

import type {
  RecordingMessage,
  ClickEventMessage,
  InputEventMessage,
  EnableRecordingMessage,
  DisableRecordingMessage,
  HighlightElementMessage,
} from '../types/recording'
import { startClickTracking, stopClickTracking } from './clickHandler'
import { startInputTracking, stopInputTracking, flushPendingInputs } from './inputHandler'
import { showHighlight, hideHighlight, removeHighlight } from './highlighter'

console.info('[How-To Recorder] Content script loaded')

// Recording state
let isRecording = false
let recordingStartTime: number | null = null

/**
 * Send a message to the background script
 */
function sendToBackground(message: RecordingMessage): void {
  chrome.runtime.sendMessage(message).catch((error) => {
    // Extension context may be invalidated if extension is reloaded
    console.warn('[How-To Recorder] Failed to send message:', error)
  })
}

/**
 * Handle click events from the click handler
 */
function handleClickEvent(message: ClickEventMessage): void {
  sendToBackground(message)
}

/**
 * Handle input events from the input handler
 */
function handleInputEvent(message: InputEventMessage): void {
  sendToBackground(message)
}

/**
 * Start recording user interactions
 */
function startRecording(startTime?: number): void {
  if (isRecording) {
    console.warn('[How-To Recorder] Recording already active')
    return
  }

  recordingStartTime = startTime || Date.now()
  isRecording = true

  // Start tracking clicks and inputs
  startClickTracking(recordingStartTime, handleClickEvent)
  startInputTracking(recordingStartTime, handleInputEvent)

  console.info('[How-To Recorder] Recording started')
}

/**
 * Stop recording user interactions
 */
function stopRecording(): void {
  if (!isRecording) {
    console.warn('[How-To Recorder] No active recording to stop')
    return
  }

  // Flush any pending input events
  flushPendingInputs()

  // Stop tracking
  stopClickTracking()
  stopInputTracking()

  // Clean up highlighter
  removeHighlight()

  isRecording = false
  recordingStartTime = null

  console.info('[How-To Recorder] Recording stopped')
}

/**
 * Handle messages from background script
 */
function handleMessage(
  message: RecordingMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  switch (message.type) {
    case 'ENABLE_RECORDING':
      const enableMsg = message as EnableRecordingMessage & { startTime?: number }
      startRecording(enableMsg.startTime)
      sendResponse({ success: true })
      break

    case 'DISABLE_RECORDING':
      stopRecording()
      sendResponse({ success: true })
      break

    case 'GET_RECORDING_STATE':
      sendResponse({
        isRecording,
        url: window.location.href,
        title: document.title,
      })
      break

    case 'HIGHLIGHT_ELEMENT': {
      const highlightMsg = message as HighlightElementMessage
      try {
        const element = document.querySelector(highlightMsg.selector)
        if (element) {
          showHighlight(element)
          sendResponse({ success: true })
        } else {
          console.warn('[How-To Recorder] Element not found for selector:', highlightMsg.selector)
          sendResponse({ success: false, error: 'Element not found' })
        }
      } catch (error) {
        console.warn('[How-To Recorder] Failed to highlight element:', error)
        sendResponse({ success: false, error: String(error) })
      }
      break
    }

    case 'HIDE_HIGHLIGHT':
      hideHighlight()
      sendResponse({ success: true })
      break

    default:
      // Unknown message type
      break
  }

  // Return true to indicate async response
  return true
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(handleMessage)

// Notify background script that content script is ready
chrome.runtime
  .sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href })
  .catch(() => {
    // Ignore errors if background script isn't listening yet
  })

// Handle page unload - ensure any pending data is sent
window.addEventListener('beforeunload', () => {
  if (isRecording) {
    flushPendingInputs()
  }
})

// Handle visibility change - could be used for pausing recording
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isRecording) {
    // Page became hidden, flush pending inputs
    flushPendingInputs()
  }
})
