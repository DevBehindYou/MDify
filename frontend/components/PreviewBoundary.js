'use client';

import React from 'react';

// Keep document text selectable while preview code downloads, or if that
// optional download fails. The raw editor and export controls remain mounted.
export function PlainTextPreview({ content, loading = false }) {
  return (
    <div className="min-w-0" aria-busy={loading}>
      <p role="status" className="text-[11px] text-[var(--muted)] mb-2">
        {loading ? 'Loading formatted preview…' : 'Formatted preview is unavailable. Your text is shown below; you can still edit in Raw mode and export.'}
      </p>
      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-tech text-[11.5px] text-[var(--text)]">{content}</pre>
    </div>
  );
}

export default class PreviewBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <PlainTextPreview content={this.props.content} /> : this.props.children;
  }
}
