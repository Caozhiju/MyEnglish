// Dynamic imports via Vite's import.meta.glob — each JSON is a separate
// chunk, loaded on demand only when the user selects that vocabulary bank.
const vocabModules = import.meta.glob('/data/*.json')

export async function loadVocabulary(filename) {
  const key = `/data/${filename}`
  const loader = vocabModules[key]
  if (!loader) {
    throw new Error(`词库文件不存在: ${filename}`)
  }
  const mod = await loader()
  // Vite wraps JSON default exports — the parsed array is at mod.default
  const data = mod.default
  if (!Array.isArray(data)) {
    // Some JSON files may have a wrapper object; try common keys
    return data.words || data.vocabulary || data.entries || data.data || []
  }
  return data
}

export function getVocabSources() {
  return Object.keys(vocabModules)
    .map((p) => p.split('/').pop())
    .sort()
}
