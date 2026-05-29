'use client';

import Link from 'next/link';

// ─── Use Case Data ────────────────────────────────────────────────────────────

const USE_CASES = [
  {
    icon: '🤖',
    title: 'AI & LLM Pipelines',
    color: '#F59E0B',
    description:
      'Feed documents to GPT, Claude, Gemini or any LLM without preprocessing. Markdown is the cleanest, most token-efficient format for AI ingestion — no HTML noise, no binary blobs.',
    tags: ['RAG pipelines', 'Context windows', 'LLM fine-tuning'],
  },
  {
    icon: '👩‍💻',
    title: 'Developers & Engineers',
    color: '#60A5FA',
    description:
      'Convert internal docs, specs, API references, and wiki exports to Markdown. Version-control your documentation in Git as clean `.md` files alongside your code.',
    tags: ['Docs as code', 'Git-friendly', 'Wiki export'],
  },
  {
    icon: '🔬',
    title: 'Researchers & Academics',
    color: '#A78BFA',
    description:
      'Transform PDFs, research papers, and spreadsheets into readable, searchable Markdown. Extract and preserve structure from complex academic documents.',
    tags: ['PDF extraction', 'Research papers', 'Data tables'],
  },
  {
    icon: '✍️',
    title: 'Content Teams & Writers',
    color: '#34D399',
    description:
      'Convert Word docs, PowerPoints, and HTML pages into Markdown for CMS platforms like Notion, Obsidian, Ghost, or Jekyll. Eliminate manual copy-pasting.',
    tags: ['CMS migration', 'Notion import', 'Blog publishing'],
  },
  {
    icon: '📊',
    title: 'Data & Analytics Teams',
    color: '#F97316',
    description:
      'Turn Excel spreadsheets and CSV files into Markdown tables instantly. Perfect for embedding data summaries into reports, wikis, and documentation.',
    tags: ['Excel → table', 'CSV conversion', 'Data reports'],
  },
  {
    icon: '🏢',
    title: 'Enterprise & Operations',
    color: '#2DD4BF',
    description:
      'Digitise legacy documents, contracts, and policy files by converting them to Markdown. Build searchable, structured knowledge bases from existing file archives.',
    tags: ['Knowledge base', 'Policy docs', 'Legacy migration'],
  },
];

const FILE_TYPES = [
  { ext: 'PDF',  color: '#F43F5E', desc: 'Full text extraction' },
  { ext: 'DOCX', color: '#3B82F6', desc: 'Word documents' },
  { ext: 'PPTX', color: '#F97316', desc: 'PowerPoint slides' },
  { ext: 'XLSX', color: '#22C55E', desc: 'Excel spreadsheets' },
  { ext: 'HTML', color: '#A78BFA', desc: 'Web pages' },
  { ext: 'TXT',  color: '#94A3B8', desc: 'Plain text' },
  { ext: 'CSV',  color: '#2DD4BF', desc: 'Comma-separated data' },
  { ext: 'JSON', color: '#FBBF24', desc: 'Structured data' },
  { ext: 'XML',  color: '#FB923C', desc: 'Markup data' },
  { ext: 'EPUB', color: '#C084FC', desc: 'E-book format' },
  { ext: 'MP3',  color: '#4ADE80', desc: 'Audio transcription' },
  { ext: 'PNG',  color: '#60A5FA', desc: 'Image OCR' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Upload your file',
    description:
      'Drag and drop any supported document directly onto the converter. Up to 10 files at a time — mix different formats freely.',
    color: '#F59E0B',
  },
  {
    step: '02',
    title: 'One-click conversion',
    description:
      'Hit "Convert" and MDify sends your file to the FastAPI backend powered by Microsoft\'s MarkItDown library. Conversion happens server-side in milliseconds.',
    color: '#60A5FA',
  },
  {
    step: '03',
    title: 'Download clean Markdown',
    description:
      'Preview the syntax-highlighted output inline, copy to clipboard, or download the `.md` file — named to match your original document.',
    color: '#34D399',
  },
];

// ─── Page Component ───────────────────────────────────────────────────────────

export default function UseCasePage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#08080A', color: '#ECECF1', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Nav ── */}
      <nav
        className="flex-none flex items-center justify-between px-6 py-4 border-b sticky top-0 z-50"
        style={{ borderColor: '#1A1A1F', background: 'rgba(8,8,10,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <Link href="/" className="flex items-center gap-2.5 group">
          <img
            src="/mdify-icon.png"
            alt="MDify"
            className="w-7 h-7 rounded-lg object-cover transition-transform group-hover:scale-105"
            style={{ boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}
          />
          <span className="text-sm font-semibold">MDify</span>
        </Link>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/DevBehindYou"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            DevBehindYou
          </a>
          <Link
            href="/"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black transition-all"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 0 12px rgba(245,158,11,0.2)',
            }}
          >
            Try MDify →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-16 gap-6">
        {/* Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#F59E0B',
          }}
        >
          <span>✦</span>
          <span>Powered by Microsoft MarkItDown</span>
        </div>

        {/* Headline */}
        <h1
          className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Why use{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            MDify
          </span>
          ?
        </h1>

        <p className="text-base md:text-lg text-zinc-400 max-w-xl leading-relaxed">
          Any document. Any format. Clean, structured Markdown — ready for AI, code, or publishing.
          No sign-up. No watermarks. No limits on what you convert.
        </p>

        {/* CTA pair */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 0 24px rgba(245,158,11,0.3)',
            }}
          >
            Start Converting →
          </Link>
          <a
            href="https://github.com/DevBehindYou"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-all hover:scale-105"
            style={{ background: '#111114', border: '1px solid #1F1F24' }}
          >
            GitHub
          </a>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-6 md:gap-10 flex-wrap justify-center mt-2">
          {[
            { value: '12+', label: 'File Formats' },
            { value: '10', label: 'Files at Once' },
            { value: '0', label: 'Sign-up Required' },
            { value: '100%', label: 'Open Source' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5">
              <span
                className="text-2xl font-bold"
                style={{ color: '#F59E0B' }}
              >
                {stat.value}
              </span>
              <span className="text-[11px] text-zinc-600 uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Use Cases Grid ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Use Cases</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Who is MDify for?</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            MDify is a universal document bridge — wherever you need clean, structured text, it works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="flex flex-col gap-4 p-5 rounded-xl transition-all duration-200 hover:translate-y-[-2px]"
              style={{
                background: '#111114',
                border: '1px solid #1F1F24',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${uc.color}30`;
                e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${uc.color}18`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1F1F24';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
              }}
            >
              {/* Icon + title */}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-none"
                  style={{ background: `${uc.color}12`, border: `1px solid ${uc.color}22` }}
                >
                  {uc.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{uc.title}</h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-zinc-500 leading-relaxed">{uc.description}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {uc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: uc.color, background: `${uc.color}12`, border: `1px solid ${uc.color}20` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Supported File Types ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Compatibility</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Supported File Types</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            MDify handles the most common document, data, and media formats — all converted to clean Markdown in one click.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {FILE_TYPES.map((ft) => (
            <div
              key={ft.ext}
              className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all duration-200 hover:translate-y-[-2px]"
              style={{
                background: '#111114',
                border: '1px solid #1F1F24',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${ft.color}30`;
                e.currentTarget.style.background = `${ft.color}08`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1F1F24';
                e.currentTarget.style.background = '#111114';
              }}
            >
              <span
                className="text-xs font-bold tracking-wider px-2 py-1 rounded-md"
                style={{ color: ft.color, background: `${ft.color}18` }}
              >
                {ft.ext}
              </span>
              <span className="text-[10px] text-zinc-600 leading-tight">{ft.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── How It Works ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Workflow</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">How it works</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            Three steps from any document to structured Markdown — no account, no config, no complexity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.step} className="relative flex flex-col gap-4">
              {/* Connector line (desktop) */}
              {i < HOW_IT_WORKS.length - 1 && (
                <div
                  className="hidden md:block absolute top-8 left-[calc(100%+0.5rem)] w-4 h-px"
                  style={{ background: '#1F1F24' }}
                />
              )}

              <div
                className="flex flex-col gap-4 p-5 rounded-xl"
                style={{
                  background: '#111114',
                  border: `1px solid ${step.color}20`,
                  boxShadow: `0 0 0 1px ${step.color}08`,
                }}
              >
                {/* Step number */}
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs font-black"
                    style={{ color: step.color, fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {step.step}
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{ background: `${step.color}20` }}
                  />
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-zinc-100">{step.title}</h3>

                {/* Description */}
                <p className="text-xs text-zinc-500 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Architecture callout ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Architecture</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Built on solid foundations</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Frontend */}
          <div
            className="p-5 rounded-xl flex flex-col gap-3"
            style={{ background: '#111114', border: '1px solid #1F1F24' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ background: '#60A5FA18', border: '1px solid #60A5FA22' }}
              >
                ⚡
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Frontend</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Next.js 14', 'React 18', 'Tailwind CSS', 'App Router'].map((tech) => (
                <span
                  key={tech}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                  style={{ color: '#60A5FA', background: '#60A5FA12', border: '1px solid #60A5FA20' }}
                >
                  {tech}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Single-page app with a two-panel layout. Drag-and-drop upload, real-time status, tabbed output viewer, and syntax-highlighted Markdown preview.
            </p>
          </div>

          {/* Backend */}
          <div
            className="p-5 rounded-xl flex flex-col gap-3"
            style={{ background: '#111114', border: '1px solid #1F1F24' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ background: '#34D39918', border: '1px solid #34D39922' }}
              >
                🐍
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Backend</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Python 3.11', 'FastAPI', 'MarkItDown', 'Uvicorn'].map((tech) => (
                <span
                  key={tech}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                  style={{ color: '#34D399', background: '#34D39912', border: '1px solid #34D39920' }}
                >
                  {tech}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              FastAPI server wraps Microsoft's MarkItDown library. Handles multipart file uploads, writes to a temp file, converts, and streams clean Markdown back as JSON.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="px-6 py-16 text-center flex flex-col items-center gap-6"
        style={{ background: 'rgba(245,158,11,0.03)', borderTop: '1px solid rgba(245,158,11,0.08)' }}
      >
        <img
          src="/mdify-icon.png"
          alt="MDify"
          className="w-14 h-14 rounded-2xl object-cover"
          style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}
        />
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Ready to convert?</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          Drop any document and get clean Markdown in seconds. No account needed.
        </p>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl text-sm font-semibold text-black transition-all hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            boxShadow: '0 0 32px rgba(245,158,11,0.35)',
          }}
        >
          Open MDify Converter →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer
        className="flex items-center justify-between px-6 py-4 border-t flex-wrap gap-3"
        style={{ borderColor: '#1A1A1F', background: '#08080A' }}
      >
        <div className="flex items-center gap-3 text-[10px] text-zinc-700">
          <span>MDify</span>
          <span className="text-zinc-800">·</span>
          <a
            href="https://github.com/DevBehindYou"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-500/70 transition-colors"
          >
            DevBehindYou
          </a>
          <span className="text-zinc-800">·</span>
          <span>Powered by Microsoft MarkItDown</span>
        </div>
        <div className="text-[10px] text-zinc-700">
          <Link href="/" className="hover:text-zinc-400 transition-colors">
            ← Back to Converter
          </Link>
        </div>
      </footer>
    </div>
  );
}
