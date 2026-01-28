import React from 'react'
import { RecordingProvider } from './context/RecordingContext'
import { RecordingHeader } from './components/RecordingHeader'
import { Timeline } from './components/Timeline'
import { ExportPanel } from './components/ExportPanel'
import './SidePanel.css'

function SidePanelContent() {
  return (
    <div className="sidepanel">
      <header className="sidepanel-header">
        <h1>How-To Recorder</h1>
      </header>
      <RecordingHeader />
      <Timeline />
      <ExportPanel />
    </div>
  )
}

export function SidePanel() {
  return (
    <RecordingProvider>
      <SidePanelContent />
    </RecordingProvider>
  )
}

export default SidePanel
