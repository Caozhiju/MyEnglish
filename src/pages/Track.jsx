import React, { useMemo } from 'react'
import { useStorage } from '../hooks/useStorage'

function ActivityMatrix({ days = 30 }) {
  // generate last N days with random score 0-4
  const data = useMemo(() => {
    const arr = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      arr.push({ date: d, score: Math.floor(Math.random() * 5) })
    }
    return arr
  }, [days])

  const colorFor = (score) => {
    switch (score) {
      case 0:
        return 'bg-gray-100'
      case 1:
        return 'bg-green-200'
      case 2:
        return 'bg-green-400'
      case 3:
        return 'bg-green-600'
      case 4:
        return 'bg-green-800'
      default:
        return 'bg-gray-100'
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {data.map((d, idx) => (
        <div key={idx} title={d.date.toLocaleDateString() + ' — ' + d.score} className={`${colorFor(d.score)} w-6 h-6 rounded-sm`} />
      ))}
    </div>
  )
}

export default function Track(){
  const [learningQueue] = useStorage('learningQueue', [])

  const masteredCount = useMemo(() => {
    return (learningQueue || []).filter((it) => (it.level || 0) >= 1).length
  }, [learningQueue])

  const streak = 12 // mock

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Track</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-6 rounded shadow text-center">
          <div className="text-xs text-gray-500">连续打卡天数</div>
          <div className="text-3xl font-bold mt-2">{streak} 天</div>
        </div>
        <div className="bg-white p-6 rounded shadow text-center">
          <div className="text-xs text-gray-500">累计掌握词汇</div>
          <div className="text-3xl font-bold mt-2">{masteredCount}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <div className="mb-3 text-sm text-gray-600">最近 30 天活跃度</div>
        <ActivityMatrix days={30} />
      </div>
    </div>
  )
}
