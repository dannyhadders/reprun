import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DataProvider } from './lib/data'
import Exercise from './pages/Exercise'
import Exercises from './pages/Exercises'
import Home from './pages/Home'
import Log from './pages/Log'
import Runs from './pages/Runs'
import Settings from './pages/Settings'
import Workouts from './pages/Workouts'
import Year from './pages/Year'
import { LOCAL } from './lib/local'
import './index.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js')
// iOS Safari only applies :active (the pressed states in index.css) once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

// Phone-only copy on a desktop: show the phone layout in a phone-width frame. Same origin, so same localStorage.
// ponytail: an iframe, not a second set of CSS rules: fixed bars, sheets and the md: sidebar all just see a phone.
// The address bar doesn't follow navigation inside the frame; sync it if anyone uses this for real on desktop.
if (LOCAL && window.top === window && matchMedia('(min-width: 768px)').matches) {
  const f = document.createElement('iframe')
  f.src = location.href
  f.title = 'RepRun'
  f.style.cssText = 'display:block;width:430px;height:100dvh;margin:0 auto;border:0;border-inline:1px solid var(--color-line)'
  document.getElementById('root')!.replaceWith(f)
} else createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DataProvider>
        <Routes>
          <Route path="log" element={<Log />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="workouts" element={<Workouts />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="exercises/:id" element={<Exercise />} />
            <Route path="runs" element={<Runs />} />
            <Route path="year" element={<Year />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
