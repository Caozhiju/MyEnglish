import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, Filter, RefreshCw, LogOut, Cloud, CloudOff, ChevronRight, X, Sparkles, Settings, RotateCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSyncStorage } from '../hooks/useSyncStorage'
import { useStorage } from '../hooks/useStorage'
import { chatCompletion, isLLMConfigured } from '../services/llmService'
import { fetchUserProgress } from '../services/supabaseDataService'
import { useNavigation } from '../contexts/NavigationContext'
import { useGlobal } from '../contexts/GlobalContext'

function maskEmail(email) {
  if (!email) return ''
  const [name, domain] = email.split('@')
  if (!domain) return email
  const visible = name.slice(0, 4)
  return `${visible}${'*'.repeat(Math.max(0, name.length - 4))}@${domain}`
}

function getUserName(email) {
  if (!email) return '同学'
  const name = email.split('@')[0]
  if (!name) return '同学'
  return name.length <= 4 ? name : name.slice(0, 4) + '**'
}

const MODAL_TITLE = {
  queue: '生词库总储量',
  ignored: '已排除噪音词汇',
  review: '待复习词汇清单',
}

function renderModalContent(list, emptyText) {
  if (list.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-300 text-4xl mb-3">📭</p>
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-gray-50">
      {list.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3 px-1">
          <p className="text-sm font-semibold text-gray-900 flex-shrink-0 w-28 truncate">{item.word}</p>
          {item.translations && item.translations.length > 0 && (
            <p className="text-xs text-gray-500 truncate">
              {item.translations.map((t) => t.translation || t).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

const DEFAULT_TARGETS = { targetNew: 20, targetReview: 30 }

function gatherTodayStats(userName, totalWords, totalIgnored, dueCount, targets) {
  const hour = new Date().getHours()
  let timeOfDay = '早上'
  if (hour >= 6 && hour < 12) timeOfDay = '早上'
  else if (hour >= 12 && hour < 14) timeOfDay = '中午'
  else if (hour >= 14 && hour < 18) timeOfDay = '下午'
  else if (hour >= 18 && hour < 22) timeOfDay = '晚上'
  else timeOfDay = '深夜'

  return {
    userName,
    totalWords,
    totalIgnored,
    dueCount,
    targetNew: targets.targetNew,
    targetReview: targets.targetReview,
    timeOfDay,
  }
}

function buildTutorPrompt(stats) {
  return [
    {
      role: 'system',
      content: `你现在是一个名叫'Senpai'的AI学伴，扮演一个极具傲娇（Tsundere）、毒舌（Poisonous-tongued）但内心极其温柔（Soft-hearted）的英语学姐教练。你的对话对象是一个名叫'${stats.userName}'的学弟/学妹。

你对他的态度必须遵循以下三条铁律：
1. 表扬他时要"哼"一声，表现出勉为其难，还要挑出他动作慢、效率不高的缺点（傲娇）。
2. 批评他时要使用稍显严厉的"毒舌"语气，例如嘲讽他拖延、没毅力（毒舌）。
3. 吐槽完数据后，一定要主动给他提供解决办法，表现出你虽然吐槽他但离不开他、并且会亲自指导他的"温柔保护"（内心温柔）。

使用恰当的拟声词和Emoji（如 哟, 哼, 啧,🙄, 💢, 📖, ✨, 下不为例！,😒）来加强语气。

话术策略根据用户数据动态调整：
- 如果 dueCount > 0：先嘲讽他拖延，再傲娇地说"算了，我陪你一起搞定"
- 如果 dueCount = 0 且 totalWords > 0：哼一声表示勉强认可，再催他去阅读板块抓新词
- 如果 totalWords = 0："啧"一声表示无语，然后温柔地引导他开始
- 如果 totalIgnored > 5：毒舌一句"总算干了件正事"，然后装作不经意地表扬
- 根据 timeOfDay 调整语气：${stats.timeOfDay === '深夜' ? '"都几点了还在学？……算了，我陪你一会儿"' : '保持傲娇日常语气'}

返回值格式：只返回一句话（50字以内），不要加任何前缀说明。`,
    },
    {
      role: 'user',
      content: `以下是 ${stats.userName} 今天的实时学习数据，请根据这些数据给我一句教练点评（50字以内，带Emoji）：
- 词库总词汇量：${stats.totalWords}
- 已排除噪音数：${stats.totalIgnored}
- 待复习数：${stats.dueCount}
- 今日目标 - 新词：${stats.targetNew}，复习：${stats.targetReview}
- 当前时段：${stats.timeOfDay}`,
    },
  ]
}

async function fetchTutorMessage(stats) {
  if (!isLLMConfigured()) {
    return 'Senpai 学姐正在后台加载毒舌模块……但好像 API 密钥还没配好？去 .env 里填上 VITE_LLM_API_KEY，让学姐上线吧！🔧'
  }
  const messages = buildTutorPrompt(stats)
  const text = await chatCompletion(messages, { temperature: 0.85, maxTokens: 256 })
  return text.trim()
}

function TypewriterText({ text, speed = 40 }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    setDisplayed('')
    indexRef.current = 0
    if (!text) return
    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        clearInterval(timer)
      }
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])

  return <span>{displayed}</span>
}

function CompanionAvatar() {
  return (
    <div className="w-20 h-20 flex-shrink-0 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-4xl shadow-sm border border-pink-200/50">
      👩‍🎓
    </div>
  )
}

export default function Track() {
  const { user, signOut } = useAuth()
  const { navigate } = useNavigation()
  const [learningQueue, setLearningQueue] = useSyncStorage('learningQueue', [], 'learning_queue')
  const [ignoreWordPool] = useSyncStorage('globalWordPool', [], 'ignore_word_pool')
  const { learningPlan: targets, setLearningPlan: setTargets } = useGlobal()
  const [activeModal, setActiveModal] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftTargets, setDraftTargets] = useState({ ...targets })

  const [tutorText, setTutorText] = useState('')
  const [tutorLoading, setTutorLoading] = useState(false)
  const [tutorKey, setTutorKey] = useState(0)
  const tutorStatsRef = useRef(null)

  const totalWords = learningQueue?.length || 0
  const totalIgnored = ignoreWordPool?.length || 0

  const dueCount = useMemo(() => {
    if (!learningQueue || learningQueue.length === 0) return 0
    const now = Date.now()
    return learningQueue.filter((it) => {
      if (it.level === 2 || it.level === 3) return true
      if (it.nextReviewDate) {
        try {
          return new Date(it.nextReviewDate).getTime() <= now
        } catch {
          return false
        }
      }
      return false
    }).length
  }, [learningQueue])

  const dueWords = useMemo(() => {
    if (!learningQueue || learningQueue.length === 0) return []
    const now = Date.now()
    return learningQueue.filter((it) => {
      if (it.level === 2 || it.level === 3) return true
      if (it.nextReviewDate) {
        try {
          return new Date(it.nextReviewDate).getTime() <= now
        } catch {
          return false
        }
      }
      return false
    })
  }, [learningQueue])

  const recentWords = useMemo(() => {
    if (!learningQueue || learningQueue.length === 0) return []
    return [...learningQueue].reverse().slice(0, 8)
  }, [learningQueue])

  const modalWordList = useMemo(() => {
    switch (activeModal) {
      case 'queue':
        return learningQueue || []
      case 'ignored':
        return ignoreWordPool || []
      case 'review':
        return dueWords
      default:
        return []
    }
  }, [activeModal, learningQueue, ignoreWordPool, dueWords])

  const userName = getUserName(user?.email)

  /* ── 跨组件同步：当 Vocab 板块完成复习并写入 Supabase 后，重新拉取数据 ── */
  const [syncEventCount, setSyncEventCount] = useState(0)
  const syncTimerRef = useRef(null)

  useEffect(() => {
    const handler = () => setSyncEventCount(c => c + 1)
    window.addEventListener('vocab:synced', handler)
    return () => window.removeEventListener('vocab:synced', handler)
  }, [])

  useEffect(() => {
    if (!user || syncEventCount === 0) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      try {
        const data = await fetchUserProgress(user.id)
        if (data?.learning_queue) {
          setLearningQueue(data.learning_queue)
        }
      } catch { /* ignore */ }
    }, 300)
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [syncEventCount, user])

  const loadTutorMessage = useCallback(async () => {
    const stats = gatherTodayStats(userName, totalWords, totalIgnored, dueCount, targets)
    tutorStatsRef.current = stats
    setTutorLoading(true)
    setTutorText('')
    try {
      const msg = await fetchTutorMessage(stats)
      if (tutorStatsRef.current === stats) {
        setTutorText(msg)
      }
    } catch {
      if (tutorStatsRef.current === stats) {
        setTutorText('小英今天有点卡壳……刷新一下页面再试试？🤔')
      }
    } finally {
      if (tutorStatsRef.current === stats) {
        setTutorLoading(false)
      }
    }
  }, [userName, totalWords, totalIgnored, dueCount, targets])

  useEffect(() => {
    loadTutorMessage()
  }, [loadTutorMessage])

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Track</h2>

      {/* ── Account & Sync Status ── */}
      <div className="mb-6">
        {user ? (
          <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <Cloud size={20} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{maskEmail(user.email)}</p>
                <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  ☁️ 云端实时同步中
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <LogOut size={13} />
              退出登录
            </button>
          </div>
        ) : (
          <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <CloudOff size={20} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">当前为本地离线模式</p>
                <p className="text-xs text-gray-500 mt-0.5">数据仅保存在当前设备，切换设备或清除浏览器数据可能丢失</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI Tutor ── */}
      <div className="mb-6 flex items-start gap-4">
        <CompanionAvatar />
        <div className="relative flex-1">
          <div className="absolute -left-2 top-5 w-3 h-3 bg-white rotate-45 border-l border-t border-gray-100" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-400" />
                <span className="text-xs font-semibold text-pink-500 tracking-wide">Senpai · 傲娇学姐</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setDraftTargets({ ...targets }); setSettingsOpen(true) }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
                  title="今日目标设定"
                >
                  <Settings size={13} />
                </button>
                <button
                  onClick={loadTutorMessage}
                  disabled={tutorLoading}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors disabled:text-gray-200"
                  title="换个建议"
                >
                  <RotateCw size={13} className={tutorLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {tutorLoading && !tutorText ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3.5 bg-gray-100 rounded w-full" />
                <div className="h-3.5 bg-gray-100 rounded w-3/4" />
              </div>
            ) : (
              <p key={tutorKey} className="text-sm text-gray-700 leading-relaxed min-h-[2.5rem]">
                {tutorText && <TypewriterText text={tutorText} />}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div
          onClick={() => setActiveModal('queue')}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <BookOpen size={18} className="text-indigo-500" />
            </div>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">生词库总储量</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalWords}</p>
          <p className="text-xs text-gray-400 mt-1">已收录至学习队列</p>
        </div>

        <div
          onClick={() => setActiveModal('ignored')}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Filter size={18} className="text-amber-500" />
            </div>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">已排除噪音词汇</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalIgnored}</p>
          <p className="text-xs text-gray-400 mt-1">已过滤的无用词汇</p>
        </div>

        <div
          onClick={() => setActiveModal('review')}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <RefreshCw size={18} className="text-emerald-500" />
            </div>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">待复习词汇</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dueCount}</p>
          <p className="text-xs text-gray-400 mt-1">需要今天复习</p>
          {dueCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate('Vocab', { vocabMode: 'review' }) }}
              className="mt-4 w-full py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
            >
              立刻去复习
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <RefreshCw size={15} className="text-gray-400" />
          最新捕获轨迹
        </h3>

        {recentWords.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-300 text-4xl mb-3">📭</p>
            <p className="text-sm text-gray-400">还没有捕获任何生词</p>
            <p className="text-xs text-gray-300 mt-1">去 Read 页面阅读文章并收藏词汇吧</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentWords.map((item) => (
              <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-gray-50 last:border-b-0 last:pb-0">
                <div className="flex-shrink-0 w-24 pt-0.5">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.word}</p>
                </div>
                <div className="flex-1 min-w-0">
                  {item.sourceSentence ? (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      "{item.sourceSentence}"
                    </p>
                  ) : (
                    <p className="text-xs text-gray-300 italic">无上下文记录</p>
                  )}
                  {item.translations && item.translations.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {item.translations.slice(0, 2).map((t) => t.translation || t).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 text-gray-300">
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">⚙️ 设定今日目标</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">每日新词目标</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={draftTargets.targetNew}
                  onChange={(e) => setDraftTargets({ ...draftTargets, targetNew: Math.max(1, Number(e.target.value)) })}
                  className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">每日复习目标</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={draftTargets.targetReview}
                  onChange={(e) => setDraftTargets({ ...draftTargets, targetReview: Math.max(1, Number(e.target.value)) })}
                  className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setDraftTargets(DEFAULT_TARGETS); setTargets(DEFAULT_TARGETS); setSettingsOpen(false); setTutorKey(k => k + 1) }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                恢复默认
              </button>
              <button
                onClick={() => { setTargets(draftTargets); setSettingsOpen(false); setTutorKey(k => k + 1) }}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Word List Modal ── */}
      {activeModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">{MODAL_TITLE[activeModal]}</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {renderModalContent(modalWordList, '暂无数据')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
