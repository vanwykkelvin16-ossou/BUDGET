import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

// Latin subsets only — keeps the (offline, inlined) font payload small.
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/baloo-2/latin-500.css'
import '@fontsource/baloo-2/latin-600.css'
import '@fontsource/baloo-2/latin-700.css'
import '@fontsource/baloo-2/latin-800.css'
import './styles/theme.css'

import { App } from './App'
import { watchInstallPrompt } from './lib/installPrompt'

// Chrome fires `beforeinstallprompt` before React mounts — park it now so the
// "add to home screen" button can replay it later.
watchInstallPrompt()

// The single-file preview build runs from a static page with no server-side
// route rewriting, so it uses hash routing instead of history routing.
const Router = import.meta.env.VITE_SINGLEFILE ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
