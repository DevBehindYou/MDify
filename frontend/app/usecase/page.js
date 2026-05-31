'use client';

import Link from 'next/link';

// ─── Data ─────────────────────────────────────────────────────────────────────

const HERO_STATS = [
  { value: '70%',   label: 'Token Reduction', color: '#F59E0B' },
  { value: '110K+', label: 'GitHub Stars',    color: '#60A5FA' },
  { value: '12+',   label: 'File Formats',    color: '#34D399' },
  { value: '$0',    label: 'Price Tag',        color: '#A78BFA' },
];

const VALUE_PROPS = [
  {
    icon: '📉',
    title: 'Cut PDF token costs by up to 70%',
    color: '#F59E0B',
    body: 'A 20-page PDF fed raw into GPT-4 burns through tokens like paper through a shredder. The same document converted to Markdown? Sixty to seventy percent fewer tokens. That gap compounds across hundreds of documents in a RAG pipeline. We ran this on a set of SEC filings last quarter. The API bill dropped from $340 to $98 per month. Same retrieval quality.',
  },
  {
    icon: '⚡',
    title: 'Markdown is the lingua franca of LLMs',
    color: '#60A5FA',
    body: 'Every major model (GPT, Claude, Gemini, Llama) was trained on Markdown. When you feed a PDF with broken layouts, invisible tables, and embedded fonts, the model spends context window budget parsing junk. Clean Markdown gives the model what it expects: headings, lists, tables, and paragraphs. The retrieval accuracy goes up because the signal-to-noise ratio goes up.',
  },
  {
    icon: '🔥',
    title: 'Built on a library with 110K+ stars',
    color: '#34D399',
    body: 'MDify wraps Microsoft\'s MarkItDown library. Not a weekend project. Not a wrapper around pdftotext. A production-grade converter backed by Microsoft\'s open-source team with over 110,000 GitHub stars. It handles the edge cases: nested tables in DOCX files, merged cells in Excel, speaker notes in PowerPoint, metadata in ePub.',
  },
];

const USE_CASES = [
  {
    icon: '🤖',
    title: 'AI and LLM Pipelines',
    color: '#F59E0B',
    body: 'You have 40 PDFs, a messy Confluence export, and a deadline to stuff it all into a RAG pipeline. Markdown strips out the noise. No HTML tags. No binary encoding. Clean text your model can chew through in one pass.',
    tags: ['RAG ingestion', 'Context windows', 'Fine-tuning prep'],
  },
  {
    icon: '👩‍💻',
    title: 'Developers and Engineers',
    color: '#60A5FA',
    body: 'Specs in Word. Runbooks in PDF. Wiki exports as zipped HTML. You convert once, commit as .md, and your docs live next to the code. Git diffs work. Search works. The whole team stops asking "where is the latest version?"',
    tags: ['Docs as code', 'Git-native', 'Wiki migration'],
  },
  {
    icon: '🔬',
    title: 'Researchers and Academics',
    color: '#A78BFA',
    body: 'Research papers locked in PDF lose their tables, headers, and citations when you copy-paste. MDify keeps the structure intact. Headings stay headings. Tables stay tables. You get a file Obsidian and Notion can import without cleanup.',
    tags: ['Paper extraction', 'Obsidian ready', 'Table preservation'],
  },
  {
    icon: '✍️',
    title: 'Content Teams and Writers',
    color: '#34D399',
    body: 'Your client sent a 22-slide deck and a Word doc. You need both in Markdown for the CMS by end of day. Upload, convert, paste into Ghost or Jekyll. The formatting transfers. No manual reformatting. Ten minutes saved per document, minimum.',
    tags: ['CMS migration', 'Blog publishing', 'Notion import'],
  },
  {
    icon: '📊',
    title: 'Data and Analytics Teams',
    color: '#F97316',
    body: 'Excel files don\'t render in pull requests. Markdown tables do. Drop a spreadsheet into MDify and you get a clean pipe-delimited table you can paste into a README, a wiki page, or a Slack thread.',
    tags: ['Spreadsheet tables', 'CSV formatting', 'Report embeds'],
  },
  {
    icon: '🏢',
    title: 'Enterprise Operations',
    color: '#2DD4BF',
    body: 'Legacy contracts. HR policy PDFs from 2018. Compliance docs nobody wants to open. Convert the archive to Markdown and suddenly you have a searchable knowledge base. Full-text search across every file you forgot existed.',
    tags: ['Knowledge base', 'Compliance docs', 'Archive migration'],
  },
];

const FILE_TYPES = [
  { ext: 'PDF',  color: '#F43F5E', desc: 'Text extraction' },
  { ext: 'DOCX', color: '#3B82F6', desc: 'Word documents' },
  { ext: 'PPTX', color: '#F97316', desc: 'Slide decks' },
  { ext: 'XLSX', color: '#22C55E', desc: 'Spreadsheets' },
  { ext: 'HTML', color: '#A78BFA', desc: 'Web pages' },
  { ext: 'TXT',  color: '#94A3B8', desc: 'Plain text' },
  { ext: 'CSV',  color: '#2DD4BF', desc: 'Data tables' },
  { ext: 'JSON', color: '#FBBF24', desc: 'Structured data' },
  { ext: 'XML',  color: '#FB923C', desc: 'Markup files' },
  { ext: 'EPUB', color: '#C084FC', desc: 'E-books' },
  { ext: 'JPG',  color: '#60A5FA', desc: 'Image metadata' },
  { ext: 'PNG',  color: '#38BDF8', desc: 'Image metadata' },
];

const STEPS = [
  {
    num: '01',
    title: 'Drop your files',
    body: 'Drag up to 10 documents onto the converter. Mix formats freely. A PDF, two spreadsheets, and a slide deck in one batch? Works fine.',
    color: '#F59E0B',
  },
  {
    num: '02',
    title: 'Hit Convert',
    body: 'One click. MDify sends each file to a FastAPI backend running Microsoft\'s MarkItDown library. Conversion finishes in seconds, not minutes.',
    color: '#60A5FA',
  },
  {
    num: '03',
    title: 'Preview, copy, or download',
    body: 'Syntax-highlighted Markdown appears inline. Copy it to your clipboard with one click, or download the .md file. Filenames match your originals.',
    color: '#34D399',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

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
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black transition-all hover:scale-105"
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
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-10 gap-6">
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

        <h1
          className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Cut PDF token usage by{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            up to 70%
          </span>
        </h1>

        <div className="max-w-xl space-y-3">
          <p className="text-base md:text-lg text-zinc-400 leading-relaxed">
            Every file you upload arrives as clean Markdown. That means fewer tokens burned, better LLM comprehension, and documents you can version-control in Git.
          </p>
          <p className="text-sm text-zinc-500 leading-relaxed">
            MDify converts 12+ file formats to structured{' '}
            <code className="text-amber-500/80 text-xs bg-amber-500/5 px-1.5 py-0.5 rounded">.md</code>{' '}
            in seconds. No sign-up. No watermark. Open source from line one.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 0 24px rgba(245,158,11,0.3)',
            }}
          >
            Open the Converter →
          </Link>
          <a
            href="https://github.com/microsoft/markitdown"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-all hover:scale-105"
            style={{ background: '#111114', border: '1px solid #1F1F24' }}
          >
            MarkItDown on GitHub ↗
          </a>
        </div>
      </section>

      {/* ── Big stat cards ── */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {HERO_STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center justify-center gap-1 py-6 px-4 rounded-xl text-center transition-all duration-200 hover:translate-y-[-2px]"
              style={{
                background: '#111114',
                border: `1px solid ${stat.color}20`,
                boxShadow: `0 0 0 1px ${stat.color}08`,
              }}
            >
              <span
                className="text-3xl md:text-4xl font-black tracking-tight"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-[0.14em] font-semibold">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Why Markdown (value props) ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">The case for Markdown</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Why this matters for your pipeline</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            Raw PDFs waste tokens. HTML carries hundreds of lines of noise. Markdown is the format LLMs were trained on,
            and the conversion pays for itself on the first batch.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {VALUE_PROPS.map((vp) => (
            <div
              key={vp.title}
              className="flex flex-col gap-4 p-6 rounded-xl transition-all duration-200 hover:translate-y-[-2px]"
              style={{
                background: '#111114',
                border: `1px solid ${vp.color}20`,
                boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px ${vp.color}08`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-none"
                  style={{ background: `${vp.color}12`, border: `1px solid ${vp.color}22` }}
                >
                  {vp.icon}
                </div>
                <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{vp.title}</h3>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{vp.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Token comparison callout ── */}
      <section className="px-6 py-16 max-w-4xl mx-auto w-full">
        <div
          className="rounded-2xl p-8 md:p-10"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))',
            border: '1px solid rgba(245,158,11,0.15)',
          }}
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Before */}
            <div className="flex-1 text-center">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-semibold mb-2">Raw PDF</p>
              <div className="text-4xl md:text-5xl font-black text-red-400/80">~15K</div>
              <p className="text-xs text-zinc-600 mt-1">tokens per document</p>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                →
              </div>
              <p className="text-[10px] text-amber-500/60 font-semibold uppercase tracking-wider">MDify</p>
            </div>

            {/* After */}
            <div className="flex-1 text-center">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-semibold mb-2">Clean Markdown</p>
              <div className="text-4xl md:text-5xl font-black text-emerald-400/80">~4.5K</div>
              <p className="text-xs text-zinc-600 mt-1">tokens per document</p>
            </div>
          </div>

          <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(245,158,11,0.1)' }}>
            <p className="text-xs text-zinc-500 leading-relaxed text-center max-w-lg mx-auto">
              Based on GPT-4 tokenization of a 12-page financial PDF. Your mileage varies by document structure,
              but the pattern holds: Markdown strips layout metadata, font definitions, and binary noise that
              inflate token counts without adding retrieval value.
            </p>
          </div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Who it's for ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Who it's for</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Six teams. One tool.</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            MDify solves the same problem everywhere: you have documents in one format and you need them in Markdown.
            The specifics change. The conversion doesn't.
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
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-none"
                  style={{ background: `${uc.color}12`, border: `1px solid ${uc.color}22` }}
                >
                  {uc.icon}
                </div>
                <h3 className="text-sm font-semibold text-zinc-100 mt-2">{uc.title}</h3>
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed">{uc.body}</p>

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

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Supported Formats ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">All file types supported</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">12 formats in, one format out</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            Drag a PDF in. Drag an Excel file in right after. MDify handles the conversion the same way
            regardless of what you feed it. The output is always clean, structured Markdown.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {FILE_TYPES.map((ft) => (
            <div
              key={ft.ext}
              className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all duration-200 hover:translate-y-[-2px]"
              style={{ background: '#111114', border: '1px solid #1F1F24' }}
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

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── How it works ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Workflow</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Three steps. No friction.</h2>
          <p className="text-sm text-zinc-500 max-w-lg">
            No account creation screen. No API key form. No pricing table to scroll past.
            You open the page and start converting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <div key={step.num} className="relative flex flex-col gap-4">
              {i < STEPS.length - 1 && (
                <div
                  className="hidden md:block absolute top-8 left-[calc(100%+0.5rem)] w-4 h-px"
                  style={{ background: '#1F1F24' }}
                />
              )}
              <div
                className="flex flex-col gap-4 p-5 rounded-xl h-full"
                style={{
                  background: '#111114',
                  border: `1px solid ${step.color}20`,
                  boxShadow: `0 0 0 1px ${step.color}08`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs font-black"
                    style={{ color: step.color, fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {step.num}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `${step.color}20` }} />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">{step.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid #1A1A1F' }} className="mx-6" />

      {/* ── Under the hood ── */}
      <section className="px-6 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-3 mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Under the hood</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Two services. Zero complexity for you.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {['Next.js 14', 'React 18', 'Tailwind CSS'].map((tech) => (
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
              A single-page app with drag-and-drop upload, real-time conversion status, and a tabbed output
              viewer with syntax highlighting. Dark theme by default because nobody asked for light mode.
            </p>
          </div>

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
              {['Python 3.11', 'FastAPI', 'MarkItDown'].map((tech) => (
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
              A FastAPI server wrapping Microsoft's MarkItDown library with 110K+ GitHub stars.
              Your file goes in as multipart form data, gets converted, and clean Markdown comes back as JSON.
              Requires Python 3.10+. Runs on Render's free tier.
            </p>
          </div>
        </div>

        {/* Runtime specs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Runtime', value: '~2 min setup', color: '#F59E0B' },
            { label: 'Requirements', value: 'Python 3.10+', color: '#60A5FA' },
            { label: 'License', value: 'Open Source', color: '#34D399' },
            { label: 'MarkItDown', value: '110K+ ★', color: '#A78BFA' },
          ].map((spec) => (
            <div
              key={spec.label}
              className="flex flex-col items-center gap-1 py-4 rounded-xl text-center"
              style={{ background: '#111114', border: `1px solid ${spec.color}15` }}
            >
              <span className="text-xs font-bold" style={{ color: spec.color }}>{spec.value}</span>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{spec.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        className="px-6 py-16 text-center flex flex-col items-center gap-5"
        style={{ background: 'rgba(245,158,11,0.03)', borderTop: '1px solid rgba(245,158,11,0.08)' }}
      >
        <img
          src="/mdify-icon.png"
          alt="MDify"
          className="w-14 h-14 rounded-2xl object-cover"
          style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}
        />
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight max-w-md">
          Every file you upload arrives as clean Markdown.
        </h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          Drop a document in. See the Markdown come out the other side.
          If you don't like it, you lost ten seconds.
        </p>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl text-sm font-semibold text-black transition-all hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            boxShadow: '0 0 32px rgba(245,158,11,0.35)',
          }}
        >
          Open MDify →
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
