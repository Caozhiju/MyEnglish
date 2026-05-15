export function playAudio(text, lang = 'en-US') {
  if (!window.speechSynthesis) {
    console.warn('Speech Synthesis API is not supported in this browser')
    return
  }

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1
  utterance.pitch = 1
  utterance.volume = 1

  const voices = window.speechSynthesis.getVoices()
  const englishVoice = voices.find(
    (v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')
  ) || voices.find((v) => v.lang.startsWith('en'))

  if (englishVoice) {
    utterance.voice = englishVoice
  }

  window.speechSynthesis.speak(utterance)
}

export function cancelAudio() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}
