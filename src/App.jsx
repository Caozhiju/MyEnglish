import { useState } from 'react'
import { BookOpen, FileText, Mic, BarChart2 } from 'lucide-react'
import Vocab from './pages/Vocab'
import Read from './pages/Read'
import Speak from './pages/Speak'
import Track from './pages/Track'

const MENU = [
  { key: 'Vocab', label: 'Vocab', icon: BookOpen },
  { key: 'Read', label: 'Read', icon: FileText },
  { key: 'Speak', label: 'Speak', icon: Mic },
  { key: 'Track', label: 'Track', icon: BarChart2 },
]

function App() {
  const [page, setPage] = useState('Vocab')

  function renderPage() {
    switch (page) {
      case 'Vocab':
        return <Vocab />
      case 'Read':
        return <Read />
      case 'Speak':
        return <Speak />
      case 'Track':
        return <Track />
      default:
        return <Vocab />
    }
  }

  return (
    <div className="min-h-screen flex text-sm bg-slate-50 text-gray-700">
      <aside className="w-[250px] bg-gray-50 border-r border-gray-200 p-6 flex-shrink-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My English</h1>
          <p className="text-sm text-gray-500 mt-1">Learn words efficiently</p>
        </div>

        <nav className="flex flex-col gap-2">
          {MENU.map((m) => {
            const Icon = m.icon
            const active = page === m.key
            return (
              <button
                key={m.key}
                onClick={() => setPage(m.key)}
                className={`w-full text-left flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-200 ${
                  active
                    ? 'bg-indigo-50 text-indigo-600 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={18} className={active ? 'text-indigo-600' : 'text-gray-500'} />
                <span>{m.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">{renderPage()}</div>
      </main>
    </div>
  )
}

export default App
