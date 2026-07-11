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

import { RANDY_LOGO_SRC } from './components/ui/Randy'
import { App } from './App'

// Warm the Randy crest asset so Coin Collector badges render immediately.
const randyPreload = new Image()
randyPreload.src = RANDY_LOGO_SRC
void randyPreload.decode().catch(() => undefined)

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
