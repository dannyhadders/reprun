import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { UpdateBanner } from './components/Update'
import { DataProvider } from './lib/data'
import Exercise from './pages/Exercise'
import Exercises from './pages/Exercises'
import Home from './pages/Home'
import Log from './pages/Log'
import Runs from './pages/Runs'
import Settings from './pages/Settings'
import Workouts from './pages/Workouts'
import Year from './pages/Year'
import './index.css'

// iOS Safari only applies :active (the pressed states in index.css) once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Outside DataProvider: it registers the service worker, which mustn't wait for data to load (or fail). */}
      <UpdateBanner />
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
            <Route path="settings/:section" element={<Settings />} />
          </Route>
        </Routes>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
