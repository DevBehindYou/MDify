'use client';

import React, { useState } from 'react';

const POSTS = [
  {
    id: 'rag-chunking',
    title: 'Chunking Markdown for RAG that actually retrieves',
    tag: 'RAG',
    date: 'Mar 12',
    readTime: '8 min',
    summary: 'Why heading-aligned chunks beat fixed-size windows, with a worked benchmark example.',
    author: 'A. Rao',
    tldr: 'Split on h2/h3, keep tables whole, and retrieval quality jumps without touching the model.',
    content: `
### Why Fixed-Size Windows Fail
Fixed character or token windows (e.g. 512 tokens with 50-token overlap) cut through sentences, split tables into meaningless fragments, and divorce sub-clauses from their defining headings. When a semantic query asks for specific product pricing or compliance rules, the chunk retrieved often lacks the parent heading context.

### Splitting on Headings
Markdown naturally defines an outline tree. By splitting at \`##\` (H2) and \`###\` (H3) boundaries, every chunk preserves its complete conceptual context. 

\`\`\`python
# Example heading-aware chunker
def chunk_markdown(md_text):
    sections = md_text.split("\\n## ")
    return [f"## {s}" if not s.startswith("#") else s for s in sections]
\`\`\`

### Measuring the Difference
Across a benchmark of 50 technical PDF manuals converted with MDify, heading-aligned retrieval scored **0.91 NDCG@10**, compared to **0.64** for arbitrary 500-token slicing.
    `,
  },
  {
    id: 'tables',
    title: 'PDF to Markdown without losing tables',
    tag: 'GUIDE',
    date: 'Mar 4',
    readTime: '6 min',
    summary: 'What breaks in extraction, and the profile that fixes it with pipe-delimited grids.',
    author: 'MDify Team',
    tldr: 'Standard PDF extractors drop horizontal lines. MarkItDown infers coordinate grids and exports clean Markdown tables.',
    content: `
### The Tabular Problem in PDFs
PDFs do not store tables as semantic entities; they store positioned text glyphs and drawing paths. Simple copy-paste collapses columns into an unparseable paragraph of numbers.

### The MarkItDown Solution
By analyzing bounding boxes and alignment baselines, MDify reconstructs tabular grids into standard GitHub-flavored Markdown tables that render cleanly in any tool.
    `,
  },
  {
    id: 'cli-batch',
    title: 'Batch convert 20 files from the CLI',
    tag: 'API',
    date: 'Feb 22',
    readTime: '5 min',
    summary: 'The public API end to end, with a simple shell loop for your local build pipeline.',
    author: 'DevBehindYou',
    tldr: 'A 5-line bash loop can process whole directories of documents into markdown in seconds.',
    content: `
### Shell Loop Example
\`\`\`bash
#!/bin/bash
for f in ./documents/*.{pdf,docx,xlsx}; do
  echo "Converting $f..."
  curl -s -X POST https://api.mdify.com/api/convert \\
    -F "file=@$f" \\
    -F "profile=RAG-ready" \\
    -o "./markdown/$(basename "$f").md"
done
\`\`\`
    `,
  },
  {
    id: 'image-ocr',
    title: 'When image OCR helps — and when it can’t',
    tag: 'OCR',
    date: 'Feb 9',
    readTime: '7 min',
    summary: 'Standalone images vs scanned PDFs: how text layers interact with OCR parsers.',
    author: 'A. Rao',
    tldr: 'Standalone PNG/JPEG receipts convert cleanly. Scanned PDFs need pre-processing if they lack searchable text layers.',
    content: `
### Understanding Image Extraction
When processing screenshots, diagrams, and invoices in PNG or JPEG, optical character recognition can reliably transcribe lines and labels into Markdown bullet points and tables.
    `,
  },
];

export default function BlogModal({ isOpen, onClose }) {
  const [selectedPost, setSelectedPost] = useState(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--surface)] border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-xl shadow-2xl overflow-hidden font-wireframe text-[var(--text)]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-[1.5px] border-[var(--text)] rounded-[4px] p-0.5">
              <div className="w-full h-full rounded-[1px] bg-gradient-to-br from-[#8f83d8] to-[#d98fb0]" />
            </div>
            <b className="text-[15px]">The MDify Blog</b>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border-3)] hover:bg-[var(--surface)] text-[14px] cursor-pointer bg-transparent"
          >
            ✕
          </button>
        </div>

        {/* 2.5px Aurora Hairline */}
        <div className="aurora-hairline w-full" />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans text-[13px]">
          {selectedPost ? (
            /* Article Reader View (1z) */
            <div className="space-y-4">
              <button
                onClick={() => setSelectedPost(null)}
                className="text-[12px] font-tech text-[#2a78d6] hover:underline flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer"
              >
                ← Back to all posts
              </button>

              <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface-2)] space-y-3">
                <div className="flex items-center gap-2 font-tech text-[10px] text-[var(--muted)]">
                  <span className="border border-[var(--border-3)] rounded-full px-2 py-0.5">
                    {selectedPost.tag}
                  </span>
                  <span>{selectedPost.date} · {selectedPost.readTime}</span>
                  <span className="ml-auto">By {selectedPost.author}</span>
                </div>

                <h1 className="font-wireframe text-[24px] leading-tight font-bold m-0">
                  {selectedPost.title}
                </h1>

                {/* TL;DR card */}
                <div className="border border-[#b6ade0] rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-950/20 text-[12.5px]">
                  <b className="text-[12px] font-tech text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block mb-1">
                    TL;DR
                  </b>
                  <p className="m-0 text-[var(--text)] leading-relaxed">{selectedPost.tldr}</p>
                </div>

                <div className="markdown-pre font-tech text-[12px] text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                  {selectedPost.content}
                </div>
              </div>
            </div>
          ) : (
            /* Blog Index (1w) */
            <div className="space-y-4">
              <div className="font-tech text-[10px] tracking-wider text-[var(--faint)] uppercase">
                THE MDIFY BLOG · GUIDES & BENCHMARKS
              </div>

              {/* Featured Post Card */}
              <div
                onClick={() => setSelectedPost(POSTS[0])}
                className="border-[1.5px] border-[var(--text)] dark:border-[var(--border-3)] rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all group"
              >
                <div className="h-24 bg-gradient-to-r from-[#cfc8ef] via-[#e3c8e2] to-[#eec9d6] flex items-center justify-center p-3 text-center">
                  <h3 className="font-wireframe text-[18px] text-[#2d2740] font-bold m-0 group-hover:scale-[1.01] transition-transform">
                    {POSTS[0].title}
                  </h3>
                </div>
                <div className="p-3 bg-[var(--surface-2)] space-y-1.5">
                  <div className="flex items-center gap-2 font-tech text-[10px] text-[var(--muted)]">
                    <span className="border border-[var(--border-3)] rounded-full px-2 py-0.5">
                      {POSTS[0].tag}
                    </span>
                    <span>{POSTS[0].date} · {POSTS[0].readTime}</span>
                  </div>
                  <p className="text-[12px] text-[var(--muted)] m-0 leading-relaxed">
                    {POSTS[0].summary}
                  </p>
                </div>
              </div>

              {/* 3-up Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {POSTS.slice(1).map((post) => (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="border border-[var(--border)] rounded-lg overflow-hidden cursor-pointer hover:border-[var(--text)] dark:hover:border-white transition-colors bg-[var(--surface-2)] flex flex-col"
                  >
                    <div className="h-14 bg-wireframe-hatch flex items-center justify-center border-b border-[var(--border)]" />
                    <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="font-tech text-[9px] text-[var(--faint)] mb-1">
                          {post.tag}
                        </div>
                        <h4 className="font-wireframe text-[14px] leading-tight font-bold m-0">
                          {post.title}
                        </h4>
                      </div>
                      <div className="font-tech text-[9px] text-[var(--muted)]">
                        {post.date} · {post.readTime}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--surface-2)] flex justify-between items-center font-tech text-[10.5px] text-[var(--muted)]">
          <span>{POSTS.length} posts published</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-full border border-[var(--border-3)] hover:bg-[var(--surface)] text-[var(--text)] cursor-pointer bg-transparent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
