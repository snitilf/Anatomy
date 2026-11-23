import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What the user sees in place of the script that failed. */
  fallback: ReactNode
  /** Called once per failure, for a notice or to close what was opening. */
  onError?: () => void
  children: ReactNode
}

/** Keeps a script that fails to load (the local server stopped) from taking the whole app down with it. */
export class ChunkBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError?.()
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
