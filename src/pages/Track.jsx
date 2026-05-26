import React, { useMemo, useState } from 'react'
import { BookOpen, Filter, RefreshCw, LogOut, Cloud, CloudOff, ChevronRight, X, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSyncStorage } from '../hooks/useSyncStorage'

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

function generateTutorMessage(userName, totalWords, totalIgnored, dueCount) {
  let summary = ''
  let encouragement = ''

  if (totalIgnored > 0) {
    summary = `哇，${userName}，你已经排除了 ${totalIgnored} 个噪音词！这极大地清空了学习干扰！👏`
  } else if (totalWords > 0) {
    summary = `${userName}，你的词库共收录了 ${totalWords} 个生词，每次积累都在为流利铺路！📚`
  } else {
    summary = `嗨 ${userName}，你的专属学习空间已经准备好了，来捕获第一个生词吧！✨`
  }

  if (dueCount > 0) {
    encouragement = `你今天还有 ${dueCount} 个词需要复习，咱们加油把它们都攻克了吧！💪`
  } else if (totalWords > 0) {
    encouragement = `今天的复习池是空的，不如去阅读板块捕获一些新的词汇？📖✨`
  } else {
    encouragement = `快去阅读板块开始第一轮捕获吧，每一个生词都是通往流利的阶梯！🚀`
  }

  return { summary, encouragement }
}

function CompanionCharacter() {
  return (
    <svg viewBox="0 0 80 96" className="w-20 h-24 flex-shrink-0" fill="none">
      <ellipse cx="40" cy="92" rx="22" ry="4" fill="#F1F5F9" />
      <ellipse cx="28" cy="85" rx="7" ry="3.5" fill="#FED7AA" />
      <ellipse cx="52" cy="85" rx="7" ry="3.5" fill="#FED7AA" />
      <ellipse cx="40" cy="62" rx="22" ry="25" fill="#E0E7FF" />
      <ellipse cx="40" cy="69" rx="13" ry="13" fill="#FFF" />
      <circle cx="40" cy="30" r="21" fill="#E0E7FF" />
      <circle cx="33" cy="27" r="6.5" fill="#FFF" />
      <circle cx="47" cy="27" r="6.5" fill="#FFF" />
      <circle cx="35" cy="27" r="3" fill="#1E293B" />
      <circle cx="49" cy="27" r="3" fill="#1E293B" />
      <circle cx="36.5" cy="25.5" r="1.2" fill="#FFF" />
      <circle cx="50.5" cy="25.5" r="1.2" fill="#FFF" />
      <ellipse cx="28" cy="35" rx="3.5" ry="2" fill="#FECDD3" opacity="0.6" />
      <ellipse cx="52" cy="35" rx="3.5" ry="2" fill="#FECDD3" opacity="0.6" />
      <path d="M37 40 L43 40 L40 44 Z" fill="#F59E0B" />
      <rect x="22" y="10" width="36" height="4" rx="2" fill="#6366F1" />
      <rect x="36" y="6" width="8" height="4" rx="2" fill="#6366F1" />
      <circle cx="57" cy="12" r="3" fill="#F59E0B" />
    </svg>
  )
}

export default function Track() {
  const { user, signOut } = useAuth()
  const [learningQueue] = useSyncStorage('learningQueue', [], 'learning_queue')
  const [ignoreWordPool] = useSyncStorage('globalWordPool', [], 'ignore_word_pool')
  const [activeModal, setActiveModal] = useState(null)

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
  const tutorMessage = useMemo(
    () => generateTutorMessage(userName, totalWords, totalIgnored, dueCount),
    [userName, totalWords, totalIgnored, dueCount]
  )

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

      {/* ── Learning Companion ── */}
      <div className="mb-6 flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <CompanionCharacter />
        <div className="relative flex-1">
          <div className="absolute -left-2 top-4 w-3 h-3 bg-indigo-50 rotate-45 border-l border-t border-gray-100" />
          <div className="bg-indigo-50 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-500 tracking-wide">智能学伴</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-1">
              {tutorMessage.summary}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {tutorMessage.encouragement}
            </p>
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
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {MODAL_TITLE[activeModal]}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-4 flex-1">
              {renderModalContent(modalWordList, '暂无数据')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
