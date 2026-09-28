// Public copy shared by pages, metadata and structured data (JSON-LD), so
// what search and AI engines read always matches what visitors see.
// Figures are cited below; re-check them when the sources change.

import { MAX_FILE_SIZE, MAX_IMAGE_FILE_SIZE, MAX_QUEUE_FILES } from './formats.js';
import { OPERATOR, RETENTION_HOURS } from './legal/policies.js';

export const SITE_URL = 'https://mdify-app.vercel.app';
export const SITE_NAME = 'MDify';
export const CONTENT_UPDATED = '2026-09-28';
export const CONTENT_UPDATED_LABEL = '28 September 2026';

const mb = (bytes) => Math.round(bytes / (1024 * 1024));
export const DOC_MB = mb(MAX_FILE_SIZE);
export const IMAGE_MB = mb(MAX_IMAGE_FILE_SIZE);

export const TAGLINE = 'Cut PDF token costs by 70%';
export const DESCRIPTION =
  'Free PDF to Markdown converter. Turn PDF, Word, PowerPoint, Excel, HTML, images and ZIP files into clean Markdown and cut AI token costs by 70%. No sign-up.';

// Primary and secondary targets from Google Keyword Planner (US, India, UK;
// September 2026): "pdf to markdown converter" 9.9K, "pdf to markdown" 8.1K,
// "pdf to md" 6.6K, "html to markdown" 2.9K, "markdown converter" 1.9K,
// "word to markdown" 1.9K per month, all low competition.
export const KEYWORDS = [
  'pdf to markdown converter',
  'pdf to markdown',
  'pdf to md',
  'convert pdf to markdown',
  'markdown converter',
  'word to markdown',
  'docx to markdown',
  'html to markdown',
  'excel to markdown',
  'powerpoint to markdown',
  'image to markdown',
  'scanned pdf to text',
  'zip to markdown',
  'reduce chatgpt tokens',
  'chatgpt free limit',
  'markdown for ai',
  'MDify',
];

export const SOURCES = {
  pdfSupport: {
    label: 'Claude PDF support documentation',
    url: 'https://platform.claude.com/docs/en/build-with-claude/pdf-support',
  },
  vision: {
    label: 'Claude vision documentation',
    url: 'https://platform.claude.com/docs/en/build-with-claude/vision',
  },
  tokens: {
    label: 'OpenAI Help Center: what are tokens',
    url: 'https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them',
  },
  users: {
    label: 'TechCrunch, 27 February 2026',
    url: 'https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users/',
  },
};

// One typical 500-word page. Text: 100 tokens ≈ 75 words (OpenAI). Page
// image: one token per 28 × 28 px patch, capped at 1,568 on standard and
// 4,784 on high-resolution models (Claude vision docs); a US Letter page at
// 150 dpi (1275 × 1650 px) hits the 1,568 cap, or 46 × 59 = 2,714 patches.
export const TOKEN_EXAMPLE = {
  words: 500,
  markdown: 667,
  pdfStandard: 667 + 1568,
  pdfHighRes: 667 + 2714,
};
export const savedPercent = (pdf) => Math.round((1 - TOKEN_EXAMPLE.markdown / pdf) * 100);

export const FORMAT_GROUPS = [
  {
    name: 'Documents',
    formats: 'PDF, DOCX, PPTX, XLSX, XLS, EPUB, HTML, CSV, TSV, JSON, XML, TXT, MD',
    limit: `${DOC_MB} MB per file`,
    result: 'Markdown with headings, lists and pipe tables',
  },
  {
    name: 'Scanned PDFs',
    formats: 'PDF pages that are only pictures',
    limit: `${DOC_MB} MB per file`,
    result: 'Text pages read directly, scanned pages through text recognition (up to 100 per file)',
  },
  {
    name: 'Images',
    formats: 'PNG, JPG, JPEG, WebP, TIFF, BMP, GIF',
    limit: `${IMAGE_MB} MB per image`,
    result: 'The text in the image, as Markdown',
  },
  {
    name: 'ZIP files',
    formats: 'Code projects and document folders',
    limit: `${DOC_MB} MB upload, 2,000 files inside`,
    result: 'One combined Markdown file, a project index and a manifest',
  },
];

// Written the way people ask AI chat and search. Answers stand on their own
// (engines quote passages, not pages).
export const FAQS = [
  {
    q: 'How do I convert a PDF to Markdown for free?',
    a: `Open MDify, drop the PDF on the page and press Convert all. MDify returns a Markdown file with the headings, lists and tables of the original. It is free, needs no account, and handles up to ${MAX_QUEUE_FILES} files per batch with a ${DOC_MB} MB limit per document.`,
  },
  {
    q: 'Does converting a PDF to Markdown save ChatGPT tokens?',
    a: `Yes, when the AI app reads the page image as well as the text. For a typical 500-word page, Markdown costs about ${TOKEN_EXAMPLE.markdown} tokens against about ${TOKEN_EXAMPLE.pdfStandard.toLocaleString('en-US')} for the PDF, ${savedPercent(TOKEN_EXAMPLE.pdfStandard)}% less. Apps that read only the extracted text save less, but still get cleaner tables and headings from Markdown.`,
  },
  {
    q: 'How can I make a free AI plan last longer?',
    a: 'Send less data per question. Convert long PDFs, slides and spreadsheets to Markdown first, then paste only the sections you need, and pick the Compact profile for the fewest tokens. Smaller messages use less of the plan\'s allowance, so you can ask more before you hit the limit.',
  },
  {
    q: 'Can MDify read scanned PDFs and images?',
    a: `Yes. MDify reads the text pages of a PDF directly and runs text recognition on pages that are only pictures, up to 100 scanned pages per file. Images such as PNG, JPG and WebP are read the same way, up to ${IMAGE_MB} MB each. Handwriting and very small print can come out with errors.`,
  },
  {
    q: 'What happens to my files after conversion?',
    a: `Your upload and its Markdown result are stored privately only so you can download them, then deleted automatically within ${RETENTION_HOURS} hours. MDify needs no account, shows no ads, and nobody uses your files to train AI models. The Privacy Policy lists every detail.`,
  },
  {
    q: 'Can I convert a whole project folder or ZIP file?',
    a: `Yes. Upload a ZIP of up to ${DOC_MB} MB and 2,000 files. MDify converts the code, documents and images inside into one Markdown file, adds a project index with the folder tree and a manifest, skips build folders, and never reads files that look like passwords or keys.`,
  },
  {
    q: 'What do the output profiles do?',
    a: 'Standard keeps the full result with a title and a one-line source note. Clean drops the source note and extra blank lines. Compact also removes divider lines for the fewest tokens. RAG-ready adds a chunk marker before every section heading for search and retrieval pipelines.',
  },
];

// ── Structured data (schema.org JSON-LD) ────────────────────────────────────

const ORG_ID = `${SITE_URL}/#developer`;

export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': ORG_ID },
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        description: DESCRIPTION,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any (runs in the web browser)',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        image: `${SITE_URL}/og-card.png`,
        license: 'https://www.gnu.org/licenses/gpl-3.0.html',
        featureList: [
          'PDF to Markdown, including scanned pages',
          'Word, PowerPoint, Excel, EPUB, HTML, CSV, JSON and XML to Markdown',
          'Image to Markdown with text recognition',
          'ZIP projects to one Markdown file with a project index',
          `Up to ${MAX_QUEUE_FILES} files per batch`,
          'Four output profiles: Standard, Clean, Compact, RAG-ready',
          `Files deleted automatically within ${RETENTION_HOURS} hours`,
        ],
        author: { '@id': ORG_ID },
      },
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: OPERATOR.name,
        url: 'https://github.com/DevBehindYou',
        email: OPERATOR.email,
        logo: `${SITE_URL}/mdify-icon.png`,
        sameAs: ['https://github.com/DevBehindYou'],
      },
    ],
  };
}

export function faqJsonLd(faqs = FAQS) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
