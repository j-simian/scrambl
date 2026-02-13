import { useState } from 'react'
import './App.css'
import Timer from './pages/Timer'
import AlgPractice from './pages/AlgPractice'
import Nav from './components/Nav'

export type Page = 'timer' | 'algs'

function App() {
  const [page, setPage] = useState<Page>('timer')

  return (
    <div className="app">
      <Nav page={page} setPage={setPage} />

      {page === 'timer' && <Timer />}

      {page === 'algs' && (
        <main>
          <AlgPractice />
        </main>
      )}
    </div>
  )
}

export default App
