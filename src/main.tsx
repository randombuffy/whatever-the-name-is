import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/app.css'

class Boot extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.stack || error.message }
  }

  render() {
    return this.state.error ? <pre className="boot-error">{this.state.error}</pre> : this.props.children
  }
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<StrictMode><Boot><App /></Boot></StrictMode>)
