import React, { useEffect, useRef, useState } from 'react'
import { useStorage } from '../hooks/useStorage'

function startOfDayISO(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

export default function Speak(){
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef(null)
  const [learningQueue, setLearningQueue] = useStorage('learningQueue', [])
  const [showSuggestion, setShowSuggestion] = useState(null) // {msg, suggestion}

  useEffect(()=>{
    // init SpeechRecognition if available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const r = new SpeechRecognition()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const text = e.results[0][0].transcript
      handleUserMessage(text)
    }
    r.onerror = (e) => {
      console.warn('SpeechRecognition error', e)
      setIsRecording(false)
    }
    r.onend = ()=> setIsRecording(false)
    recognitionRef.current = r
  }, [])

  function speakText(text){
    try{
      const ut = new SpeechSynthesisUtterance(text)
      ut.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(ut)
    }catch(e){
      console.warn('synth error', e)
    }
  }

  function handleUserMessage(text){
    if(!text) return
    const msg = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages((m)=>[...m, msg])
    // simulate AI reply after 1.5s
    setTimeout(()=>{
      const replyText = "That's an interesting point! Tell me more."
      const ai = { id: `a-${Date.now()}`, role: 'ai', text: replyText }
      setMessages((m)=>[...m, ai])
      speakText(replyText)
    }, 1500)
  }

  function startRecording(){
    const r = recognitionRef.current
    if(!r) return alert('SpeechRecognition not supported in this browser')
    try{
      r.start()
      setIsRecording(true)
    }catch(e){
      console.warn('start error', e)
    }
  }

  function stopRecording(){
    const r = recognitionRef.current
    if(!r) return
    try{ r.stop() }catch(e){ }
    setIsRecording(false)
  }

  function onOptimizeExpression(msg){
    // produce a mock suggestion
    const suggestion = `Better: Instead of "${msg.text}", you can say "${msg.text} — could you elaborate?"`;
    setShowSuggestion({ msg, suggestion })
  }

  function addSuggestionToLearning(sugg){
    // pick first word as vocabulary example
    const words = (sugg.msg.text || '').split(/\s+/).map(w=>w.replace(/[^A-Za-z'-]/g,'')).filter(Boolean)
    const word = words[0] || sugg.msg.text
    const item = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      word,
      translation: '',
      nextReviewDate: startOfDayISO(0),
      level: 0,
      sourceSentence: sugg.msg.text
    }
    setLearningQueue((q)=>[...q, item])
    setShowSuggestion(null)
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold mb-4">Speak</h2>

      <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50 rounded">
        {messages.map((m)=> (
          <div key={m.id} className={`flex ${m.role==='ai' ? 'items-start' : 'justify-end'}`}>
            {m.role==='ai' && (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">AI</div>
                <div className="bg-white p-3 rounded shadow max-w-xl">{m.text}</div>
              </div>
            )}
            {m.role==='user' && (
              <div className="flex items-end gap-2">
                <div className="bg-blue-600 text-white p-3 rounded shadow max-w-xl">{m.text}</div>
                <button title="优化表达" onClick={()=>onOptimizeExpression(m)} className="text-sm text-yellow-600 ml-2">✨ 优化表达</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 border-t flex items-center gap-3">
        <div className="flex-1 text-sm text-gray-600">按住说话，松开发送（需浏览器支持）</div>
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`px-4 py-3 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
        >
          {isRecording ? '录音中...' : '按住说话'}
        </button>
      </div>

      {showSuggestion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded shadow max-w-lg w-full">
            <h4 className="font-semibold mb-2">建议改写</h4>
            <div className="mb-3 text-sm text-gray-700">{showSuggestion.suggestion}</div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowSuggestion(null)} className="px-3 py-1 bg-gray-200 rounded">关闭</button>
              <button onClick={()=>addSuggestionToLearning(showSuggestion)} className="px-3 py-1 bg-blue-600 text-white rounded">加入生词本</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// (Note: original duplicate placeholder export removed.)
