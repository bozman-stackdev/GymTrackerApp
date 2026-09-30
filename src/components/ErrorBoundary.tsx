import { Component, type ReactNode } from 'react';
import { backupFileName, downloadText } from '../data/backup';

/**
 * Last line of defence: if a screen crashes, show a calm message instead of a blank page.
 * Data is saved after every change, so it's safe; the raw saved data can still be exported from here.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed', error);
  }

  private exportRaw = () => {
    const raw = localStorage.getItem('gymtracker:data');
    if (raw) downloadText(backupFileName(), raw);
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen full" role="alert">
        <h1>Something went wrong</h1>
        <p>Your workouts are saved on this phone. Reloading usually fixes this.</p>
        <button className="btn primary huge" onClick={() => location.reload()}>Reload</button>
        <button className="btn block" onClick={this.exportRaw}>Export a backup first</button>
        <p className="muted small">{this.state.error.message}</p>
      </main>
    );
  }
}
