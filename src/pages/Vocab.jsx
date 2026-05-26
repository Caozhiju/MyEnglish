import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Volume2, Star, RefreshCw } from 'lucide-react'
import { useStorage } from '../hooks/useStorage'
import { useSyncStorage } from '../hooks/useSyncStorage'
import { loadVocabulary, getVocabSources } from '../services/dataService'
import { playAudio, cancelAudio } from '../utils/tts'

/* ── constants ── */

const VOCAB_SOURCES = getVocabSources()

function startOfDayISO(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

/* ── data helpers ── */

function normalizeEntry(item) {
  if (!item) return { word: '', translations: [], phrases: [] }
  if (typeof item === 'string') return { word: item, translations: [], phrases: [] }

  const word = item.word || item.en || item.text || item.title || item.name || ''
  const translations = Array.isArray(item.translations) ? item.translations : []
  const phrases = Array.isArray(item.phrases) ? item.phrases : []

  return { word, translations, phrases }
}

function getMockExamples(word) {
  const w = word || 'this word'
  const templates = [
    {
      en: `I try to use "${w}" in my daily conversations to reinforce my memory.`,
      cn: `我尝试在日常对话中使用"${w}"来加深记忆。`,
    },
    {
      en: `The teacher explained the meaning of "${w}" with several vivid examples.`,
      cn: `老师用几个生动的例子解释了"${w}"的含义。`,
    },
    {
      en: `After learning "${w}", I found it much easier to understand that article.`,
      cn: `学完"${w}"之后，我发现理解那篇文章容易多了。`,
    },
    {
      en: `My friend used "${w}" in a sentence yesterday, and I immediately recognized it.`,
      cn: `昨天我的朋友在句子中用到了"${w}"，我立刻认出了它。`,
    },
    {
      en: `Reading novels is a great way to encounter words like "${w}" in natural contexts.`,
      cn: `阅读小说是在自然语境中遇到像"${w}"这样的词汇的好方法。`,
    },
    {
      en: `Can you create a short story using the word "${w}" to help me remember it better?`,
      cn: `你能用"${w}"这个词编一个短故事来帮我更好地记住它吗？`,
    },
  ]
  const shuffled = [...templates].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 3)
}

/* ── component ── */

export default function Vocab() {
  /* ── persistent state (cloud-synced) ── */
  const [globalWordPool, setGlobalWordPool] = useSyncStorage('globalWordPool', [], 'ignore_word_pool')
  const [learningQueue, setLearningQueue] = useSyncStorage('learningQueue', [], 'learning_queue')
  
  /* ── 新增：当前学习会话（包含今日队列和日期） ── */
  const [currentSession, setCurrentSession] = useStorage('currentSession', {
    dailyQueue: [],
    date: startOfDayISO(0),
    totalCount: 0,
  })

  /* persisted config */
  const defaultSource = VOCAB_SOURCES.length > 0 ? VOCAB_SOURCES[0] : ''
  const [configSource, setConfigSource] = useStorage('vocabConfigSource', defaultSource)
  const [configCount, setConfigCount] = useStorage('vocabConfigCount', 20)
  const [spellCheckEnabled, setSpellCheckEnabled] = useStorage('vocabSpellCheck', false)
  const [autoPlayAudio, setAutoPlayAudio] = useStorage('vocabAutoPlayAudio', false)

  /* ── ephemeral UI state ── */
  const [revealed, setRevealed] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [renderKey, setRenderKey] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  /* config modal draft state */
  const [draftSource, setDraftSource] = useState(configSource)
  const [draftCount, setDraftCount] = useState(configCount)
  const [draftSpell, setDraftSpell] = useState(spellCheckEnabled)
  const [draftAutoPlayAudio, setDraftAutoPlayAudio] = useState(autoPlayAudio)

  /* spelling mode */
  const [spellingMode, setSpellingMode] = useState(false)
  const [spellingInput, setSpellingInput] = useState('')
  const [spellingWrong, setSpellingWrong] = useState(false)
  const spellingRef = useRef(null)
  const transitioningRef = useRef(false)

  /* AI modal */
  const [mockExamples, setMockExamples] = useState([])
  const [sentenceLoading, setSentenceLoading] = useState(false)

  /* exit animation for favorites list */
  const [removingIds, setRemovingIds] = useState(new Set())

  /* loading / error */
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState('')

  /* ── derived ── */

  /* 检查会话是否是今天，如果不是则初始化新会话 */
  useEffect(() => {
    const today = startOfDayISO(0)
    if (currentSession.date !== today) {
      setCurrentSession({ dailyQueue: [], date: today, totalCount: 0 })
      setSessionCompleted(0)
    }
  }, [])

  const effectiveQueue = useMemo(() => {
    const queue = currentSession.dailyQueue.length > 0 ? currentSession.dailyQueue : learningQueue
    if (favoritesOnly) {
      return queue.filter(
        (it) => it.isFavorite || (Array.isArray(it.savedSentences) && it.savedSentences.length > 0)
      )
    }
    return queue
  }, [learningQueue, currentSession.dailyQueue, favoritesOnly])

  const current = effectiveQueue[currentIndex] ?? null

  const totalProgress = currentSession.totalCount || effectiveQueue.length
  const displayCompleted = Math.min(sessionCompleted, totalProgress)
  const progressPct = totalProgress > 0 ? Math.round((sessionCompleted / totalProgress) * 100) : 0

  // reset card state when current card changes
  useEffect(() => {
    cancelAudio()
    setRevealed(false)
    setSpellingMode(false)
    setSpellingInput('')
    setSpellingWrong(false)

    // auto-play on card flip if enabled
    if (autoPlayAudio && current) {
      setTimeout(() => {
        playAudio(current.word)
      }, 300)
    }
  }, [current?.id, autoPlayAudio])

  // auto-focus spelling input
  useEffect(() => {
    if (spellingMode && spellingRef.current) {
      spellingRef.current.focus()
    }
  }, [spellingMode])

  /* ── config modal ── */

  function openConfig() {
    setDraftSource(configSource || defaultSource)
    setDraftCount(configCount)
    setDraftSpell(spellCheckEnabled)
    setDraftAutoPlayAudio(autoPlayAudio)
    setConfigOpen(true)
  }

  function confirmConfig() {
    // persist config
    setConfigSource(draftSource)
    setConfigCount(draftCount)
    setSpellCheckEnabled(draftSpell)
    setAutoPlayAudio(draftAutoPlayAudio)
    setConfigOpen(false)
    // trigger word loading with the draft values immediately
    loadWords(draftSource, draftCount)
  }

  /* ── word loading ── */

  async function loadWords(source, count) {
    if (!source) {
      setLoadError('请先选择一个词库源')
      return
    }
    setLoading(true)
    setLoadError('')
    setFeedbackMsg('')
    try {
      const data = await loadVocabulary(source)
      const words = Array.isArray(data) ? data : data.words || []
      if (!words.length) {
        setLoadError('词库为空，请确认所选词库文件包含有效数据')
        setLoading(false)
        return
      }

      // populate global word pool for other pages
      setGlobalWordPool(words)

      // exclude words already in the queue
      const existing = new Set(learningQueue.map((i) => normalizeEntry(i).word))
      const candidates = words.filter((w) => !existing.has(normalizeEntry(w).word))

      if (candidates.length === 0) {
        setFeedbackMsg('词库中所有单词已在队列中，无新词可添加')
        setLoading(false)
        return
      }

      // Fisher-Yates shuffle
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
      }

      const pick = candidates.slice(0, count)
      const nowISO = startOfDayISO(0)

      const items = pick.map((raw) => {
        const n = normalizeEntry(raw)
        return {
          id: `${n.word}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          word: n.word,
          translations: n.translations,
          phrases: n.phrases,
          isFavorite: false,
          nextReviewDate: nowISO,
          level: 0,
        }
      })

      /* ── 新增：将新词添加到 learningQueue，并初始化今日队列 ── */
      setLearningQueue((prev) => [...prev, ...items])
      setCurrentSession({
        dailyQueue: items,
        date: nowISO,
        totalCount: items.length,
      })
      setSessionCompleted(0)
      setCurrentIndex(0)
      setRenderKey(prev => prev + 1)
      setFeedbackMsg(`已添加 ${items.length} 个新词`)
    } catch (e) {
      console.error(e)
      setLoadError(`词库加载失败：${e.message || '请检查文件路径和网络'}`)
    } finally {
      setLoading(false)
    }
  }

  /* ── spaced repetition ── */

  function advanceCard(asLevel) {
    if (!current || transitioningRef.current) return
    transitioningRef.current = true
    setIsTransitioning(true)

    const currentWord = current
    const nextReviewDate = asLevel === 1 ? startOfDayISO(3) : asLevel === 2 ? startOfDayISO(1) : startOfDayISO(0)

    setLearningQueue(prev => {
      const idx = prev.findIndex(it => it.id === currentWord.id)
      if (idx === -1) return prev
      const before = prev.slice(0, idx)
      const after = prev.slice(idx + 1)
      const updated = { ...prev[idx], level: asLevel, nextReviewDate }
      if (asLevel === 3) {
        return [...before, updated, ...after, { ...updated, level: 0 }]
      }
      return [...before, updated, ...after]
    })

    setCurrentSession(prev => {
      const remaining = prev.dailyQueue.slice(1)
      if (asLevel === 3) {
        const reQueuedWord = { ...currentWord, level: 0 }
        return { ...prev, dailyQueue: [...remaining, reQueuedWord] }
      }
      return { ...prev, dailyQueue: remaining }
    })

    setCurrentIndex(0)
    setRenderKey(prev => prev + 1)
    setRevealed(false)
    setSpellingMode(false)
    setSpellingInput('')
    setSpellingWrong(false)
    setSessionCompleted(c => c + 1)

    setTimeout(() => {
      transitioningRef.current = false
      setIsTransitioning(false)
    }, 300)
  }

  /* ── spelling ── */

  function handleKnow() {
    if (spellCheckEnabled) {
      setSpellingMode(true)
      setSpellingInput('')
      setSpellingWrong(false)
    } else {
      advanceCard(1)
    }
  }

  function handleSpellingSubmit(e) {
    if (e) e.preventDefault()
    const answer = spellingInput.trim().toLowerCase()
    const correct = current.word.toLowerCase()
    if (answer === correct) {
      advanceCard(1)
    } else {
      setSpellingMode(false)
      setSpellingWrong(true)
      setSpellingInput('')
    }
  }

  function handleFuzzy() {
    setSpellingWrong(false)
    advanceCard(2)
  }

  function handleForgot() {
    setSpellingWrong(false)
    advanceCard(3)
  }

  /* ── favorites ── */

  function toggleFavorite() {
    if (!current) return
    setLearningQueue(prev =>
      prev.map(it =>
        it.id === current.id ? { ...it, isFavorite: !it.isFavorite } : it
      )
    )
  }

  function toggleFavoriteById(itemId) {
    setLearningQueue(prev =>
      prev.map(it =>
        it.id === itemId ? { ...it, isFavorite: !it.isFavorite } : it
      )
    )
  }

  function handleUnstarFromFavorites(itemId) {
    setRemovingIds((prev) => new Set([...prev, itemId]))
    setTimeout(() => {
      toggleFavoriteById(itemId)
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }, 280)
  }

  function clearQueue() {
    setLearningQueue([])
    setCurrentSession({ dailyQueue: [], date: startOfDayISO(0), totalCount: 0 })
    setSessionCompleted(0)
    setCurrentIndex(0)
    setRenderKey(prev => prev + 1)
    setLoadError('')
  }

  /* ── render helpers ── */

  const hasTranslations =
    current && Array.isArray(current.translations) && current.translations.length > 0

  /* ── AI modal helpers ── */

  function openAiModal() {
    setMockExamples(getMockExamples(current?.word))
    setSentenceLoading(false)
    setAiOpen(true)
  }

  function refreshSentences() {
    setSentenceLoading(true)
    setMockExamples([])
    setTimeout(() => {
      setMockExamples(getMockExamples(current?.word))
      setSentenceLoading(false)
    }, 600)
  }

  function toggleSaveSentence(sentence) {
    if (!current) return
    const saved = current.savedSentences || []
    const exists = saved.some(s => s.en === sentence.en && s.cn === sentence.cn)
    const newSentenceList = exists
      ? saved.filter(s => !(s.en === sentence.en && s.cn === sentence.cn))
      : [...saved, sentence]

    setLearningQueue(prev =>
      prev.map(it =>
        it.id === current.id ? { ...it, savedSentences: newSentenceList } : it
      )
    )

    setGlobalWordPool(prev =>
      prev.map(w => {
        const n = normalizeEntry(w)
        return n.word === current.word
          ? { ...(typeof w === 'string' ? { word: w, translations: [], phrases: [] } : { ...w }), savedSentences: newSentenceList }
          : w
      })
    )
  }

  function isSentenceSaved(sentence) {
    if (!current) return false
    const saved = current.savedSentences || []
    return saved.some((s) => s.en === sentence.en && s.cn === sentence.cn)
  }

  /* ── 数据驱动结束判定：队列为空 → 完成界面 ── */
  if (!favoritesOnly && currentSession.dailyQueue.length === 0 && sessionCompleted > 0 && !loading) {
    return (
      <div className="min-h-screen pb-8">
        <div className="max-w-md mx-auto pt-20 text-center">
          <p className="text-5xl mb-6">🎉</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">今日任务已完成</h2>
          <p className="text-gray-500 mb-8">
            今日共学习了 {sessionCompleted} 个单词，明天再来复习吧！
          </p>
          <button
            onClick={() => setFavoritesOnly(true)}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-medium"
          >
            查看收藏
          </button>
        </div>
      </div>
    )
  }

  /* ── JSX ── */

  return (
    <div className="min-h-screen pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-2xl font-bold text-gray-900">Vocab</h2>

        <div className="flex items-center gap-3">
          {/* Favorites toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => { setFavoritesOnly(false); setSessionCompleted(0) }}
              className={`px-3 py-1.5 font-medium transition-colors ${
                favoritesOnly ? 'bg-white text-gray-500' : 'bg-gray-900 text-white'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => { setFavoritesOnly(true); setSessionCompleted(0) }}
              className={`px-3 py-1.5 font-medium transition-colors ${
                favoritesOnly ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
              }`}
            >
              收藏室
            </button>
          </div>

          <button
            onClick={openConfig}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            学习配置
          </button>

          <button
            onClick={clearQueue}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            清空队列
          </button>
        </div>
      </div>

      {/* Feedback toast — success */}
      {feedbackMsg && (
        <div className="max-w-md mx-auto mb-6">
          <div className="text-sm text-gray-500 text-center bg-gray-50 rounded-lg py-2 px-4">
            {feedbackMsg}
            <button
              onClick={() => setFeedbackMsg('')}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Learning mode: single flashcard ── */}
      {!favoritesOnly && (
        <div className="max-w-md mx-auto">
          {/* Error banner */}
          {loadError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
              <span className="text-base flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <p>{loadError}</p>
                <button
                  onClick={() => setLoadError('')}
                  className="mt-1 text-red-500 underline text-xs hover:text-red-700"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && !current && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 min-h-[360px] flex items-center justify-center text-center">
              <div>
                <div className="animate-pulse mb-4">
                  <div className="h-4 w-32 bg-gray-200 rounded mx-auto" />
                </div>
                <p className="text-gray-400 text-sm">正在加载词库...</p>
              </div>
            </div>
          )}

          {/* Card */}
          {!loading && current && (
            <div key={renderKey} className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-10 min-h-[360px] flex flex-col items-center justify-center text-center">
              {/* Favorite star */}
              <button
                onClick={toggleFavorite}
                className="absolute top-4 right-4 text-2xl leading-none transition-colors select-none"
                title={current.isFavorite ? '取消收藏' : '收藏'}
              >
                {current.isFavorite ? (
                  <span className="text-yellow-500">★</span>
                ) : (
                  <span className="text-gray-300 hover:text-yellow-400">☆</span>
                )}
              </button>

              {/* Word with pronunciation button (hidden in spelling mode) */}
              {!spellingMode && (
                <div className="flex items-center justify-center gap-4 mb-2">
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                    {current.word}
                  </h1>
                  <button
                    onClick={() => playAudio(current.word)}
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors flex items-center justify-center"
                    title="发音"
                  >
                    <Volume2 size={20} />
                  </button>
                </div>
              )}

              {!revealed ? (
                /* ── Front: recall mode ── */
                <div className="mt-auto pt-8">
                  <button
                    onClick={() => setRevealed(true)}
                    className="px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                  >
                    👁️ 显示答案
                  </button>
                </div>
              ) : spellingMode ? (
                /* ── Back: spelling input mode ── */
                <div className="w-full mt-auto flex flex-col items-center">
                  <p className="text-sm text-gray-500 mb-6">请根据中文释义或发音默写出英文单词：</p>

                  <div className="mb-6 space-y-1.5">
                    {hasTranslations ? (
                      current.translations.map((t, i) => (
                        <p key={i} className="text-gray-600 text-base leading-relaxed">
                          <span className="inline-block text-xs text-gray-400 italic min-w-[2.5rem] text-left mr-1">
                            {t.type}
                          </span>
                          <span className="font-medium">{t.translation}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm">暂无释义</p>
                    )}
                  </div>

                  <button
                    onClick={() => playAudio(current.word)}
                    className="mb-6 w-12 h-12 rounded-full bg-gray-900 hover:bg-gray-800 text-white transition-colors flex items-center justify-center"
                    title="听发音"
                  >
                    <Volume2 size={24} />
                  </button>

                  <form onSubmit={handleSpellingSubmit} className="flex flex-col items-center gap-4 w-full">
                    <input
                      ref={spellingRef}
                      type="text"
                      value={spellingInput}
                      onChange={(e) => setSpellingInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSpellingSubmit()
                        }
                      }}
                      className="w-full max-w-xs text-center text-xl py-2 px-3 border-b-2 border-gray-300 focus:border-gray-900 outline-none bg-transparent transition-colors"
                      placeholder="输入拼写..."
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                      确认
                    </button>
                  </form>
                </div>
              ) : (
                /* ── Back: revealed mode ── */
                <div className="w-full mt-4">
                  {spellingWrong && (
                    <p className="text-sm text-red-500 mb-4">
                      拼写错误，请重新确认你对这个词的掌握程度。
                    </p>
                  )}

                  {/* Translations */}
                  <div className="mb-6 space-y-1.5">
                    {hasTranslations ? (
                      current.translations.map((t, i) => (
                        <p key={i} className="text-gray-500 leading-relaxed">
                          <span className="inline-block text-xs text-gray-400 italic min-w-[2.5rem] text-left mr-1">
                            {t.type}
                          </span>
                          <span>{t.translation}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm">暂无释义</p>
                    )}
                  </div>

                  {/* Saved sentences */}
                  {current.savedSentences && current.savedSentences.length > 0 && (
                    <div className="mb-6 text-left">
                      <p className="text-xs font-medium text-gray-400 mb-3 tracking-wide">
                        ✨ 我的精选例句
                      </p>
                      <div className="space-y-3">
                        {current.savedSentences.map((s, i) => (
                          <div
                            key={i}
                            className="bg-amber-50/60 rounded-lg px-4 py-3 border border-amber-100"
                          >
                            <p className="text-sm text-gray-800 leading-relaxed">{s.en}</p>
                            <p className="text-xs text-gray-400 mt-1">{s.cn}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback buttons */}
                  <div className="flex gap-2 justify-center mb-4">
                    <button
                      onClick={handleKnow}
                      disabled={isTransitioning}
                      className="px-5 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      认识
                    </button>
                    <button
                      onClick={handleFuzzy}
                      disabled={isTransitioning}
                      className="px-5 py-2 bg-amber-400 text-white rounded-lg hover:bg-amber-500 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      模糊
                    </button>
                    <button
                      onClick={handleForgot}
                      disabled={isTransitioning}
                      className="px-5 py-2 bg-red-400 text-white rounded-lg hover:bg-red-500 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      忘记
                    </button>
                  </div>

                  {/* AI button */}
                  <button
                    onClick={openAiModal}
                    className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    🤖 AI 场景造句
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty state (not loading, no card, no error) — learning mode */}
          {!loading && !current && !loadError && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 min-h-[360px] flex items-center justify-center text-center">
              <div>
                {currentSession.dailyQueue.length === 0 && sessionCompleted > 0 ? (
                  <>
                    <p className="text-4xl mb-4">✅</p>
                    <p className="text-gray-700 text-lg font-medium mb-2">今日任务已完成</p>
                    <p className="text-gray-400 text-sm mb-6">
                      今日共学习了 {sessionCompleted} 个单词，明天再来复习吧！
                    </p>
                    <button
                      onClick={() => { setFavoritesOnly(true) }}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                      查看收藏
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm mb-4">
                      {learningQueue.length === 0
                        ? '队列为空，点击「学习配置」选择词库并开始学习。'
                        : '当前没有需要复习的词，休息一下或添加新词。'}
                    </p>
                    <button
                      onClick={openConfig}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                      学习配置
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Favorites mode: scrollable list ── */}
      {favoritesOnly && (
        <div className="max-w-2xl mx-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {effectiveQueue.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex items-center justify-center text-center">
              <div>
                <p className="text-4xl mb-4">📖</p>
                <p className="text-gray-500 text-base mb-2 font-medium">暂无收藏</p>
                <p className="text-gray-400 text-sm">
                  快去学习并记录你的第一个灵感吧 ✨
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-8">
              {effectiveQueue.map((item) => {
                const hasItemTranslations =
                  Array.isArray(item.translations) && item.translations.length > 0
                const hasSavedSentences =
                  Array.isArray(item.savedSentences) && item.savedSentences.length > 0

                const isRemoving = removingIds.has(item.id)

                return (
                  <div
                    key={item.id}
                    className={`relative bg-white rounded-2xl shadow-sm border border-gray-100 p-8 transition-all duration-300 ${
                      isRemoving ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
                    }`}
                  >
                    {/* Star button — top right */}
                    <button
                      onClick={() =>
                        item.isFavorite
                          ? handleUnstarFromFavorites(item.id)
                          : toggleFavoriteById(item.id)
                      }
                      className="absolute top-4 right-4 text-2xl leading-none transition-colors select-none"
                      title={item.isFavorite ? '取消收藏' : '收藏'}
                    >
                      {item.isFavorite ? (
                        <span className="text-yellow-500">★</span>
                      ) : (
                        <span className="text-gray-300 hover:text-yellow-400">☆</span>
                      )}
                    </button>

                    {/* Word + pronunciation */}
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                        {item.word}
                      </h3>
                      <button
                        onClick={() => playAudio(item.word)}
                        className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center"
                        title="发音"
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>

                    {/* Translations */}
                    <div className="mb-5 space-y-1">
                      {hasItemTranslations ? (
                        item.translations.map((t, i) => (
                          <p key={i} className="text-gray-500 text-sm leading-relaxed">
                            <span className="inline-block text-xs text-gray-400 italic min-w-[2.5rem] text-left mr-1">
                              {t.type}
                            </span>
                            <span>{t.translation}</span>
                          </p>
                        ))
                      ) : (
                        <p className="text-gray-400 text-sm">暂无释义</p>
                      )}
                    </div>

                    {/* Saved sentences */}
                    {hasSavedSentences && (
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-3 tracking-wide">
                          ✨ 我的精选例句
                        </p>
                        <div className="space-y-3">
                          {item.savedSentences.map((s, i) => (
                            <blockquote
                              key={i}
                              className="border-l-2 border-amber-300 pl-4 py-1"
                            >
                              <p className="text-sm text-gray-700 leading-relaxed">{s.en}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{s.cn}</p>
                            </blockquote>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Progress bar ── */}
      {totalProgress > 0 && !favoritesOnly && (
        <div className="max-w-md mx-auto mt-8">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>学习进度</span>
            <span>
              {displayCompleted} / {totalProgress}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Config Modal ── */}
      {configOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg max-w-md w-full p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">学习配置</h3>

            {/* Source selector */}
            <div className="mb-5">
              <label className="block text-sm text-gray-500 mb-2">词库源</label>
              <select
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
              >
                {VOCAB_SOURCES.length > 0 ? (
                  VOCAB_SOURCES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                ) : (
                  <option value="">未找到词库文件</option>
                )}
              </select>
            </div>

            {/* Count input */}
            <div className="mb-5">
              <label className="block text-sm text-gray-500 mb-2">每日目标数量</label>
              <input
                type="number"
                value={draftCount}
                onChange={(e) => setDraftCount(Math.max(1, Math.min(200, Number(e.target.value))))}
                className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                min={1}
                max={200}
              />
            </div>

            {/* Spell check toggle */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 font-medium">认识后进行拼写练习</span>
                <p className="text-xs text-gray-400 mt-0.5">点击"认识"后需正确拼写单词才能通过</p>
              </div>
              <button
                type="button"
                onClick={() => setDraftSpell(!draftSpell)}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  draftSpell ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    draftSpell ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto-play audio toggle */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 font-medium">翻卡时自动发音</span>
                <p className="text-xs text-gray-400 mt-0.5">切换到新单词时自动朗读</p>
              </div>
              <button
                type="button"
                onClick={() => setDraftAutoPlayAudio(!draftAutoPlayAudio)}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                  draftAutoPlayAudio ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    draftAutoPlayAudio ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfigOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={confirmConfig}
                disabled={loading || !draftSource}
                className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading ? '加载中...' : '保存并开始学习'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Modal ── */}
      {aiOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto">
            {/* Header with refresh */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-bold text-gray-900">🤖 AI 场景造句</h3>
              <button
                onClick={refreshSentences}
                disabled={sentenceLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={sentenceLoading ? 'animate-spin' : ''} />
                换一批
              </button>
            </div>
            {current && (
              <p className="text-sm text-gray-400 mb-8">
                当前单词：<span className="font-semibold text-gray-700">{current.word}</span>
              </p>
            )}

            {/* Loading skeleton */}
            {sentenceLoading && (
              <div className="space-y-8 mb-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border-l-4 border-gray-100 pl-5 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-full mb-3" />
                    <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-50 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {/* Sentence list */}
            {!sentenceLoading && (
              <div className="space-y-6 mb-8">
                {mockExamples.map((example, idx) => {
                  const saved = isSentenceSaved(example)
                  return (
                    <div key={idx} className="relative border-l-4 border-gray-200 pl-5 pr-12 group">
                      <p className="font-semibold text-gray-900 text-base mb-2 leading-relaxed">
                        {example.en}
                      </p>
                      <p className="text-gray-400 text-sm leading-relaxed">{example.cn}</p>
                      <button
                        onClick={() => toggleSaveSentence(example)}
                        className={`absolute top-0 right-0 p-1.5 rounded-lg transition-all ${
                          saved
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-50'
                            : 'text-gray-300 hover:text-amber-400 hover:bg-gray-50 opacity-0 group-hover:opacity-100'
                        }`}
                        title={saved ? '取消收藏' : '收藏此句'}
                      >
                        <Star size={18} fill={saved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setAiOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
