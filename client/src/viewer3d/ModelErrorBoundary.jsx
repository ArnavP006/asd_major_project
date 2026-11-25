import { Component } from 'react';

/**
 * Error boundary around the 3D canvas. Catches model load failures and any
 * render error inside the WebGL scene so the chat keeps working (FR-V3).
 */
export default class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[viewer3d] model failed to load or render:', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
