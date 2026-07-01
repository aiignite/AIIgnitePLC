import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // Log to monitoring service (example)
    this.logErrorToService(error, errorInfo);
  }

  private logErrorToService(error: Error, errorInfo: ErrorInfo) {
    // Send error to backend logging endpoint or external service
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

    fetch(`${apiBase}/logs/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(err => {
      console.error('Failed to log error:', err);
    });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <h2 style={styles.title}>出错了</h2>
          <p style={styles.message}>应用程序遇到了一个错误。</p>
          <details style={styles.details}>
            <summary>查看错误详情</summary>
            <pre style={styles.pre}>
              {this.state.error?.toString()}
              {'\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button style={styles.button} onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  title: {
    color: '#dc2626',
    marginBottom: '16px',
  },
  message: {
    color: '#4b5563',
    marginBottom: '16px',
  },
  details: {
    marginBottom: '16px',
    cursor: 'pointer',
  },
  pre: {
    backgroundColor: '#f3f4f6',
    padding: '16px',
    borderRadius: '8px',
    overflow: 'auto',
    fontSize: '14px',
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
