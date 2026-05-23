import { useState } from 'react'
import { BookOpen, FileText, Mic, BarChart2, LogIn, LogOut } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Vocab from './pages/Vocab'
import Read from './pages/Read'
import Speak from './pages/Speak'
import Track from './pages/Track'
import ErrorBoundary from './components/ErrorBoundary'

const MENU = [
  { key: 'Vocab', label: 'Vocab', icon: BookOpen },
  { key: 'Read', label: 'Read', icon: FileText },
  { key: 'Speak', label: 'Speak', icon: Mic },
  { key: 'Track', label: 'Track', icon: BarChart2 },
]

function LoginWidget() {
  const { user, signIn, signUp, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <div className="border-t border-gray-200 pt-4 mt-4">
        <p className="text-xs text-gray-400 mb-2 truncate">
          ☁️ {user.email?.split('@')[0] || user.id?.slice(0, 8)}
        </p>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <LogOut size={13} />
          退出登录
        </button>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
    } catch (err) {
      setError(err.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <p className="text-xs text-gray-400 mb-3">
        ☁️ 登录以开启云端跨设备同步
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          required
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 transition-colors"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          required
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 transition-colors"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <LogIn size={12} />
            {busy ? '...' : mode === 'login' ? '登录' : '注册'}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 transition-colors"
          >
            {mode === 'login' ? '注册' : '登录'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AppShell() {
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
      <aside className="w-[250px] bg-gray-50 border-r border-gray-200 p-6 flex-shrink-0 flex flex-col">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My English</h1>
          <p className="text-sm text-gray-500 mt-1">Learn words efficiently</p>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
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

        <LoginWidget />
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto"><ErrorBoundary>{renderPage()}</ErrorBoundary></div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
