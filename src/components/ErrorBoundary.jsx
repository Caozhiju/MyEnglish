import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h3 className="text-red-800 font-bold mb-2">组件渲染错误</h3>
            <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono bg-red-100/50 p-3 rounded-lg">
              {this.state.error.message}
            </pre>
            <details className="mt-3">
              <summary className="text-sm text-red-600 cursor-pointer">调用堆栈</summary>
              <pre className="text-xs text-red-500 mt-2 whitespace-pre-wrap font-mono">
                {this.state.error.stack}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
