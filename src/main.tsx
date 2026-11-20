import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { UpdateBanner } from './components/Update'
import { DataProvider } from './lib/data'
import { LOCAL } from './lib/local'
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

// Any crash while drawing would otherwise leave a blank dark screen that even a force close can't fix (the same saved
// data crashes it again). This offers a reload and, on copies with a server, opening without the saved copy of the data.
// Never touches the outbox, a workout in progress or (phone-only) the data itself.
class Crashed extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError = () => ({ error: true })
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="mt-1 text-muted">Your workouts are safe. Try opening RepRun again.</p>
          <button className="btn mt-4 w-full" onClick={() => location.reload()}>Reload</button>
          {!LOCAL && <button className="btn-ghost mt-2 w-full" onClick={() => {
            try { for (const k of ['reprun.data', 'reprun.data.build']) localStorage.removeItem(k) } catch { /* reload anyway */ }
            location.reload()
          }}>Reload from the server</button>}
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crashed>
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
    </Crashed>
  </StrictMode>,
)
