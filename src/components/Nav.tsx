import type { Page } from '../App'

interface NavProps {
  page: Page
  setPage: (page: Page) => void
}

function Nav({ page, setPage }: NavProps) {
  return (
    <header>
      <h1>scrambl</h1>
      <nav className="page-tabs">
        <button className={`page-tab ${page === 'timer' ? 'active' : ''}`} onClick={() => setPage('timer')}>Timer</button>
        <button className={`page-tab ${page === 'algs' ? 'active' : ''}`} onClick={() => setPage('algs')}>Alg Practice</button>
      </nav>
    </header>
  )
}

export default Nav
