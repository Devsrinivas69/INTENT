import React from 'react'
import ReactDOM from 'react-dom/client'
import { GuidanceOverlay } from './components/GuidanceOverlay'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GuidanceOverlay />
  </React.StrictMode>,
)
