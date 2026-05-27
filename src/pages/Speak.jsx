import React, { useEffect, useRef, useState, useCallback } from 'react'
import { chatCompletion, isLLMConfigured } from '../services/llmService'
import { transcribeAudio } from '../services/sttService'

const SCENARIOS = [
  { id: 'cafe', title: '☕️ 咖啡厅点单', prompt: '你是一个咖啡厅收银员，请用礼貌但略带挑剔的英语接待我，帮我完成点单。' },
  { id: 'hotel', title: '🏨 酒店入住', prompt: '你是一个酒店前台接待员，请用专业英语帮我办理入住手续，询问我的预订信息和需求。' },
  { id: 'interview', title: '💼 英语面试', prompt: '你是一个外企HR面试官，请用正式的面试英语对我进行一轮简短的技术岗位面试。' },
  { id: 'travel', title: '✈️ 机场出行', prompt: '你是一个机场地勤人员，请用清晰的英语引导我完成登机手续，询问行李和座位偏好。' },
]

function buildSystemPrompt(mode, scenario) {
  if (mode === 'free') {
    return `You are an all-around English speaking partner named XiaoYing. Rules:
1. Use natural, fluent English.
2. Keep replies short (under 30 words).
3. Use lots of follow-up questions to keep the user talking.
4. If the user makes a noticeable grammar mistake, gently correct it at the start of your reply in parentheses, like "(By the way, we say 'I went' instead of 'I go' here)".`
  }
  if (mode === 'scenario' && scenario) {
    return `You are in a real-time English role-play scenario. Strict rules:
1. Fully embody the role described below. Never break character.
2. Keep each reply between 20-30 words.
3. End each reply with a question or prompt to keep the interaction going.
4. Use language that fits the role's personality and setting.

Scenario: ${scenario.prompt}`
  }
  return 'You are an English conversation partner. Keep replies short and engaging.'
}

export default function Speak() {
  const [speakMode, setSpeakMode] = useState('free')
  const [currentScenario, setCurrentScenario] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [statusText, setStatusText] = useState('按住麦克风开始说话')
  const [customScenario, setCustomScenario] = useState('')
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const messagesRef = useRef([])
  const isProcessingRef = useRef(false)

  const setErrorTimed = useCallback((msg, duration = 3000) => {
    setError(msg)
    if (duration > 0) setTimeout(() => setError(null), duration)
  }, [])

  /* ── cleanup audio & recording ── */
  const cleanupAudio = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch { /* */ }
    }
    mediaRecorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsRecording(false)
  }, [])

  /* ── TTS ── */
  const speakText = useCallback((text) => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel()
      const ut = new SpeechSynthesisUtterance(text)
      ut.lang = 'en-US'
      ut.rate = 0.95
      ut.pitch = 1.05
      ut.onstart = () => setIsPlaying(true)
      ut.onend = () => { setIsPlaying(false); resolve() }
      ut.onerror = () => { setIsPlaying(false); resolve() }
      window.speechSynthesis.speak(ut)
    })
  }, [])

  /* ── LLM call ── */
  const fetchAIReply = useCallback(async (userText, mode, scenario, history) => {
    if (!isLLMConfigured()) return '⚠️ LLM API key not configured.'
    const system = buildSystemPrompt(mode, scenario)
    const msgs = [
      { role: 'system', content: system },
      ...history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: userText },
    ]
    return await chatCompletion(msgs, { temperature: 0.8, maxTokens: 256 })
  }, [])

  /* ── pipeline: STT → LLM → TTS ── */
  const processAudio = useCallback(async (blob) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    setStatusText('聆听中...')
    let transcript
    try {
      transcript = await transcribeAudio(blob)
    } catch {
      isProcessingRef.current = false
      setStatusText('按住麦克风开始说话')
      setErrorTimed('语音识别失败，请重试')
      return
    }
    if (!transcript) {
      isProcessingRef.current = false
      setStatusText('按住麦克风开始说话')
      setErrorTimed('未检测到语音，请重试')
      return
    }

    setStatusText('学姐正在思考...')
    setIsAiThinking(true)
    let reply
    try {
      reply = await fetchAIReply(transcript, speakMode, currentScenario, messagesRef.current)
    } catch {
      setIsAiThinking(false)
      isProcessingRef.current = false
      setStatusText('按住麦克风开始说话')
      setErrorTimed('AI 回复失败，请重试')
      return
    }

    setIsAiThinking(false)
    setStatusText('学姐正在回答...')
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text: transcript }
    const aiMsg = { id: `a-${Date.now()}`, role: 'ai', text: reply }
    messagesRef.current = [...messagesRef.current, userMsg, aiMsg]

    await speakText(reply)
    setStatusText('按住麦克风开始说话')
    isProcessingRef.current = false
  }, [fetchAIReply, speakText, setErrorTimed])

  /* ── MediaRecorder ── */
  const startRecording = useCallback(async () => {
    if (isPlaying || isAiThinking || isProcessingRef.current) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
        if (blob.size > 0 && !isProcessingRef.current) {
          await processAudio(blob)
        }
      }
      recorder.start()
      setIsRecording(true)
      setStatusText('聆听中...')
    } catch {
      setStatusText('按住麦克风开始说话')
      setErrorTimed('麦克风访问被拒绝，请授权后重试')
    }
  }, [isPlaying, isAiThinking, processAudio, setErrorTimed])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  /* ── mode switching ── */
  const switchMode = useCallback((mode) => {
    cleanupAudio()
    isProcessingRef.current = false
    messagesRef.current = []
    setSpeakMode(mode)
    setCurrentScenario(null)
    setError(null)
    setStatusText('按住麦克风开始说话')
    if (mode === 'free') {
      setTimeout(() => speakText("Hi! I'm your senpai. What do you want to talk about today?"), 400)
    }
  }, [cleanupAudio, speakText])

  /* ── scenario selection ── */
  const selectScenario = useCallback(async (scenario) => {
    cleanupAudio()
    isProcessingRef.current = false
    messagesRef.current = []
    setCurrentScenario(scenario)
    setError(null)
    setStatusText('场景启动中...')
    setIsAiThinking(true)
    try {
      const system = buildSystemPrompt('scenario', scenario)
      const msgs = [
        { role: 'system', content: system },
        { role: 'user', content: 'Please start the scenario with your first line as the character.' },
      ]
      const reply = await chatCompletion(msgs, { temperature: 0.85, maxTokens: 128 })
      messagesRef.current = [{ id: `a-${Date.now()}`, role: 'ai', text: reply }]
      setIsAiThinking(false)
      setStatusText('学姐正在回答...')
      await speakText(reply)
      setStatusText('按住麦克风开始说话')
    } catch {
      setIsAiThinking(false)
      setStatusText('按住麦克风开始说话')
      setErrorTimed('场景启动失败，请重试')
    }
  }, [cleanupAudio, speakText, setErrorTimed])

  const backToScenarios = useCallback(() => {
    cleanupAudio()
    isProcessingRef.current = false
    messagesRef.current = []
    setCurrentScenario(null)
    setError(null)
    setStatusText('按住麦克风开始说话')
  }, [cleanupAudio])

  const startCustomScenario = useCallback(() => {
    if (!customScenario.trim()) return
    const scenario = {
      id: 'custom',
      title: `🎯 ${customScenario.slice(0, 20)}${customScenario.length > 20 ? '…' : ''}`,
      prompt: customScenario,
    }
    setCustomScenario('')
    selectScenario(scenario)
  }, [customScenario, selectScenario])

  /* ── cleanup on unmount ── */
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch { /* */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  /* ── render ── */

  const borderColor = isRecording ? 'border-green-400' : isAiThinking ? 'border-gray-300' : isPlaying ? 'border-blue-400' : 'border-gray-200'
  const bgColor = isRecording ? 'bg-green-50' : isAiThinking ? 'bg-gray-50' : isPlaying ? 'bg-blue-50' : 'bg-white'
  const micColor = isRecording ? 'text-green-500' : isAiThinking ? 'text-gray-400' : isPlaying ? 'text-blue-500' : 'text-gray-600'
  const statusColor = isRecording ? 'text-green-600' : isAiThinking ? 'text-gray-500' : isPlaying ? 'text-blue-600' : 'text-gray-400'

  function renderVoiceUI() {
    const canRecord = !isPlaying && !isAiThinking && !isProcessingRef.current

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 select-none">
        {/* animated mic button */}
        <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
          {/* recording ping rings */}
          {isRecording && (
            <>
              <div className="absolute rounded-full border-2 border-green-400/40" style={{ width: 180, height: 180, animation: 'ping-custom 1.5s ease-out infinite' }} />
              <div className="absolute rounded-full border-2 border-green-300/30" style={{ width: 210, height: 210, animation: 'ping-custom 2s ease-out infinite', animationDelay: '0.3s' }} />
              <div className="absolute rounded-full border-2 border-green-200/20" style={{ width: 240, height: 240, animation: 'ping-custom 2.5s ease-out infinite', animationDelay: '0.6s' }} />
            </>
          )}

          {/* thinking breathing ring */}
          {isAiThinking && (
            <div className="absolute rounded-full bg-gray-100/60" style={{ width: 190, height: 190, animation: 'breathe 2s ease-in-out infinite' }} />
          )}

          {/* main mic circle */}
          <div
            className={`relative w-40 h-40 md:w-48 md:h-48 rounded-full border-2 ${bgColor} ${borderColor} shadow-lg flex items-center justify-center transition-all duration-500 ${
              canRecord ? 'cursor-pointer hover:shadow-xl active:scale-90' : 'cursor-not-allowed opacity-70'
            }`}
            onMouseDown={canRecord ? startRecording : undefined}
            onMouseUp={isRecording ? stopRecording : undefined}
            onTouchStart={canRecord ? startRecording : undefined}
            onTouchEnd={isRecording ? stopRecording : undefined}
          >
            <svg className={`w-14 h-14 md:w-16 md:h-16 ${micColor} transition-colors duration-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </div>
        </div>

        {/* status text */}
        <p className={`text-sm font-medium transition-colors duration-500 ${statusColor}`}>{statusText}</p>

        {/* playing wave bars */}
        {isPlaying && (
          <div className="flex items-end gap-1 h-10">
            {[1,2,3,4,5,6,7].map(i => (
              <div
                key={i}
                className="w-1.5 bg-blue-500 rounded-full animate-wave-bar"
                style={{
                  height: `${40 + Math.sin(i * 1.2) * 30 + 20}%`,
                  animationDelay: `${i * 0.12}s`,
                  opacity: 0.7 + Math.sin(i * 0.8) * 0.2,
                }}
              />
            ))}
          </div>
        )}

        {/* hint text */}
        {!isRecording && !isAiThinking && !isPlaying && (
          <p className="text-xs text-gray-300">按住麦克风录音，松开发送</p>
        )}

        {/* error toast */}
        {error && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl shadow-sm whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    )
  }

  function renderScenarioSelection() {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-gray-300 text-4xl mb-3">🎭</p>
            <h3 className="text-lg font-bold text-gray-900 mb-1">选择场景</h3>
            <p className="text-sm text-gray-400">进入场景后，AI 将扮演对应角色与你进行纯语音对话</p>
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
                开启自定义副本
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Speak</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button onClick={() => switchMode('free')}
            className={`px-4 py-2 font-medium transition-colors ${speakMode === 'free' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'}`}
          >自由畅聊</button>
          <button onClick={() => switchMode('scenario')}
            className={`px-4 py-2 font-medium transition-colors ${speakMode === 'scenario' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'}`}
          >场景实战</button>
        </div>
      </div>

      {/* scenario bar */}
      {speakMode === 'scenario' && currentScenario && (
        <div className="flex items-center justify-between px-4 py-2.5 mb-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <span className="text-sm font-medium text-indigo-700">{currentScenario.title}</span>
          <button onClick={backToScenarios}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
          >← 返回更换场景</button>
        </div>
      )}

      {/* body */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
        {speakMode === 'scenario' && !currentScenario ? renderScenarioSelection() : renderVoiceUI()}
      </div>

      <style>{`
        @keyframes ping-custom {
          0% { transform: scale(0.6); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(0.95); opacity: 0.4; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes wave-bar {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        .animate-wave-bar {
          animation: wave-bar 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
