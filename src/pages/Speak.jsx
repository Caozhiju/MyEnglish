import React, { useEffect, useRef, useState, useCallback } from 'react'
import { chatCompletion, isLLMConfigured } from '../services/llmService'
import { ArrowLeft, Loader2, Send, Mic, MicOff, Sparkles } from 'lucide-react'

const SCENARIOS = [
  { id: 'cafe', title: '☕️ 咖啡厅点单', prompt: '你是一个咖啡厅收银员，请用礼貌但略带挑剔的英语接待我，帮我完成点单。' },
  { id: 'hotel', title: '🏨 酒店入住', prompt: '你是一个酒店前台接待员，请用专业英语帮我办理入住手续，询问我的预订信息和需求。' },
  { id: 'interview', title: '💼 英语面试', prompt: '你是一个外企HR面试官，请用正式的面试英语对我进行一轮简短的技术岗位面试。' },
  { id: 'travel', title: '✈️ 机场出行', prompt: '你是一个机场地勤人员，请用清晰的英语引导我完成登机手续，询问行李和座位偏好。' },
]

function buildSystemPrompt(mode, scenario) {
  if (mode === 'free') {
    return `You are an all-around English speaking partner named XiaoYing. You can chat about any topic. Rules:
1. Use natural, fluent English.
2. Keep replies short (under 30 words).
3. Use lots of follow-up questions to keep the user talking.
4. If the user makes a noticeable grammar mistake, gently correct it at the start of your reply in parentheses, like "(By the way, we say 'I went' instead of 'I go' here)".

Start by greeting the user and asking what they'd like to talk about today.`
  }

  if (mode === 'scenario' && scenario) {
    return `You are in a real-time English role-play scenario. Strict rules:
1. Fully embody the role described below. Never break character.
2. Keep each reply between 20-30 words.
3. End each reply with a question or prompt to keep the interaction going.
4. Use language that fits the role's personality and setting.

Scenario: ${scenario.prompt}

Start by delivering the first line as the character in this scenario.`
  }

  return 'You are an English conversation partner. Keep replies short and engaging.'
}

async function fetchAIReply(messages, mode, scenario) {
  if (!isLLMConfigured()) {
    return '⚠️ LLM API key not configured. Please set VITE_LLM_API_KEY in .env to enable AI replies.'
  }
  const system = buildSystemPrompt(mode, scenario)
  const msgs = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
  ]
  const text = await chatCompletion(msgs, { temperature: 0.8, maxTokens: 256 })
  return text.trim()
}

export default function Speak() {
  const [speakMode, setSpeakMode] = useState('free')
  const [currentScenario, setCurrentScenario] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(null)
  const [customScenario, setCustomScenario] = useState('')

  const recognitionRef = useRef(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  /* init speech recognition */
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const r = new SpeechRecognition()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const text = e.results[0][0].transcript
      handleSend(text)
    }
    r.onerror = () => setIsRecording(false)
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
  }, [speakMode, currentScenario])

  /* scroll to bottom when messages change */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* focus input */
  useEffect(() => {
    inputRef.current?.focus()
  }, [aiLoading])

  /* ── helpers ── */

  function speakText(text) {
    try {
      const ut = new SpeechSynthesisUtterance(text)
      ut.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(ut)
    } catch { /* ignore */ }
  }

  function clearChat() {
    setMessages([])
    setShowSuggestion(null)
  }

  /* ── mode switching ── */
  function switchMode(mode) {
    clearChat()
    setSpeakMode(mode)
    setCurrentScenario(null)
  }

  function selectScenario(scenario) {
    clearChat()
    setCurrentScenario(scenario)
  }

  function backToScenarios() {
    clearChat()
    setCurrentScenario(null)
  }

  /* ── send message ── */
  const handleSend = useCallback(async (text) => {
    if (!text || aiLoading) return
    setInputText('')

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setAiLoading(true)

    try {
      const updated = [...messages, userMsg]
      const reply = await fetchAIReply(updated, speakMode, currentScenario)
      const aiMsg = { id: `a-${Date.now()}`, role: 'ai', text: reply }
      setMessages((prev) => [...prev, aiMsg])
      speakText(reply)
    } catch {
      const errMsg = { id: `a-${Date.now()}`, role: 'ai', text: '😅 Sorry, I got stuck. Could you say that again?' }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setAiLoading(false)
    }
  }, [messages, aiLoading, speakMode, currentScenario])

  function handleSendFromInput() {
    if (!inputText.trim()) return
    handleSend(inputText.trim())
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendFromInput()
    }
  }

  /* ── voice ── */
  function startRecording() {
    const r = recognitionRef.current
    if (!r) return alert('SpeechRecognition not supported in this browser')
    try { r.start(); setIsRecording(true) } catch { /* ignore */ }
  }

  function stopRecording() {
    const r = recognitionRef.current
    if (!r) return
    try { r.stop() } catch { /* ignore */ }
    setIsRecording(false)
  }

  /* ── optimization suggestion ── */
  function onOptimizeExpression(msg) {
    const words = (msg.text || '').split(/\s+/).filter(Boolean)
    let suggestion
    if (words.length <= 2) {
      suggestion = `Try expanding your sentence: Instead of "${msg.text}", you could say "${msg.text} — could you elaborate on that?"`
    } else {
      suggestion = `Nice sentence! A more natural alternative: "${msg.text}" → "I'd like to know more about what you said regarding ${words.slice(-2).join(' ')}."`
    }
    setShowSuggestion({ msg, suggestion })
  }

  /* ── scenario creation ── */
  function startCustomScenario() {
    if (!customScenario.trim()) return
    const scenario = {
      id: 'custom',
      title: `🎯 ${customScenario.slice(0, 20)}${customScenario.length > 20 ? '…' : ''}`,
      prompt: customScenario,
    }
    selectScenario(scenario)
  }

  /* ── render chat area ── */
  function renderChat() {
    const showScenarioBar = speakMode === 'scenario' && currentScenario

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {showScenarioBar && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
            <div className="flex items-center gap-2 text-sm text-indigo-700">
              <Sparkles size={14} />
              <span className="font-medium">{currentScenario.title}</span>
            </div>
            <button
              onClick={backToScenarios}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              <ArrowLeft size={13} />
              返回更换场景
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-gray-50/50">
          {messages.length === 0 && !aiLoading && (
            <div className="text-center py-12">
              <p className="text-gray-300 text-4xl mb-3">💬</p>
              <p className="text-sm text-gray-400">
                {speakMode === 'free'
                  ? '开始一段自由英语对话吧！'
                  : '选择一个场景开始实战演练'}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
              <div className={`flex items-start gap-2.5 max-w-[75%] ${m.role === 'ai' ? '' : 'flex-row-reverse'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  m.role === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-900 text-white'
                }`}>
                  {m.role === 'ai' ? 'AI' : '你'}
                </div>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'ai'
                    ? 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                    : 'bg-gray-900 text-white rounded-tr-sm'
                }`}>
                  {m.text}
                  {m.role === 'user' && (
                    <button
                      onClick={() => onOptimizeExpression(m)}
                      className="block mt-1.5 text-xs text-yellow-500 hover:text-yellow-400 transition-colors"
                    >
                      ✨ 优化表达
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {aiLoading && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">AI</div>
                <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-gray-100 bg-white px-4 py-3 flex items-center gap-3 rounded-b-xl">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={speakMode === 'free' ? '输入你想聊的话题...' : '输入你的英语回复...'}
            disabled={aiLoading}
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 transition-colors disabled:opacity-50"
          />
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
              isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={isRecording ? '录音中...' : '按住说话'}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={handleSendFromInput}
            disabled={!inputText.trim() || aiLoading}
            className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  }

  /* ── scenario selection grid ── */
  function renderScenarioSelection() {
    return (
      <div className="max-w-2xl mx-auto w-full">
        <div className="text-center mb-8">
          <p className="text-gray-300 text-4xl mb-3">🎭</p>
          <h3 className="text-lg font-bold text-gray-900 mb-1">选择场景</h3>
          <p className="text-sm text-gray-400">进入一个场景，AI 将扮演对应角色与你进行英语对话</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              onClick={() => selectScenario(sc)}
              className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <p className="text-base font-bold text-gray-900 mb-1.5">{sc.title}</p>
              <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{sc.prompt}</p>
            </button>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">或自定义场景</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={customScenario}
              onChange={(e) => setCustomScenario(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') startCustomScenario() }}
              placeholder="例如：模拟外企前端面试"
              className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400 transition-colors"
            />
            <button
              onClick={startCustomScenario}
              disabled={!customScenario.trim()}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-40 flex items-center gap-1.5"
            >
              <Sparkles size={15} />
              开启自定义副本
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── main render ── */
  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Speak</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => switchMode('free')}
            className={`px-4 py-2 font-medium transition-colors ${
              speakMode === 'free' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
            }`}
          >
            自由畅聊
          </button>
          <button
            onClick={() => switchMode('scenario')}
            className={`px-4 py-2 font-medium transition-colors ${
              speakMode === 'scenario' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
            }`}
          >
            场景实战
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {speakMode === 'scenario' && !currentScenario
          ? renderScenarioSelection()
          : renderChat()
        }
      </div>
    </div>
  )
}
