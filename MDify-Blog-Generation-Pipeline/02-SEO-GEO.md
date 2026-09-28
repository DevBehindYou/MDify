# 02. SEO and GEO

## Where posts appear today

Posts are published in the **Blog dialog**. The dialog loads in the browser
after the page opens, and posts don't have their own URLs. That has two
consequences you should know before investing in keyword work:

- Search engines and answer engines won't index a post as a separate page, and
  you can't share a link to one article.
- Keyword research still pays off. It tells you which questions people ask,
  which titles earn the click, and which topics are worth writing at all.

If you want posts to rank on their own, the app needs one static page per post
(for example `/blog/{slug}`) with its own canonical URL, Open Graph tags,
`BlogPosting` JSON-LD and a sitemap entry. That is a separate app change. Until
then, skip the page-level steps below and keep the metadata filled in so the
posts are ready when pages exist.

## Keyword strategy (site-wide)

Measured with Google Keyword Planner on 28 September 2026 (US + India + UK,
English, average monthly searches; every term below had LOW advertiser
competition):

| Keyword | Searches / month | Role |
|---|---:|---|
| pdf to markdown converter | 9,900 | Primary (homepage) |
| pdf to markdown | 8,100 | Primary (homepage) |
| pdf to md | 6,600 | Homepage secondary |
| html to markdown | 2,900 | Article target |
| pdf to md converter | 2,400 | Homepage secondary |
| markdown converter / md converter | 1,900 each | Homepage secondary |
| word to markdown | 1,900 | Article target |
| convert pdf to markdown | 1,600 | Article target |
| scanned pdf to text | 1,000 | Article target |
| excel to markdown | 880 | Article target |
| chatgpt free limit | 880 | GEO prompt (free-plan angle) |
| docx to markdown | 720 | Article target |
| chatgpt token limit | 390 | GEO prompt (token angle) |
| csv to markdown | 390 | Article target |

- **Site message:** "Cut PDF token costs by 70%": convert first so a free AI
  plan lasts longer. Audience: students and people on free AI plans, plus
  developers building RAG.
- **Related concepts:** PowerPoint to Markdown, EPUB to Markdown, image to
  Markdown, ZIP or project folder to Markdown, Markdown for LLMs, Markdown for
  RAG. Never target engine names.
- Reverse terms ("markdown to pdf" at 60,500) are the wrong intent: MDify
  doesn't convert that way.

Per article: pick **one** primary keyword (often a higher-intent long tail like
`PDF to Markdown for RAG`) and up to 4 secondaries. Validate them against live
results before writing. Don't aim every post at the homepage keyword.

## On-page (per article)

- Title of 60 characters or fewer where possible, with the primary keyword.
- Description of 170 characters or fewer (enforced), with the primary keyword.
  No clickbait.
- Excerpt of one or two sentences. It's the card text in the dialog.
- One title, then a clean `##` / `###` hierarchy.
- Questions and answers where they help the reader. Don't promise FAQ rich results.

## GEO (answer engines)

- The TL;DR and the first paragraph answer plainly: what the article covers,
  who it helps, and the one thing to remember.
- Each `##` section starts with a short factual answer.
- FAQs answer the literal question in the first sentence.
- Name the entity clearly and the same way every time: **MDify**, the free PDF
  to Markdown converter by DevBehindYou. Don't name the engines behind it.
- Cite primary sources so the claims can be checked.

## Research and publication gates

- Use Google Keyword Planner or a similar tool for search volume. Save the
  country, language, seed terms, date and raw export in `Blogs/{slug}/`.
  Advertising competition is not organic ranking difficulty.
- Inspect live results for several phrasings, "People also ask" boxes and
  competing pages. Label each FAQ as observed, measured or editorial.
- Exclude reverse conversions. Markdown to PDF or Markdown to Word is not an
  MDify feature.
- Check capabilities against the code. No claims about OCR for scanned PDFs,
  browser-only processing, star counts, ranking chances or token savings
  without evidence you can reproduce. Retention is stated only as the Privacy
  Policy states it, with a link to `/privacy`.
- Use real publication dates. Don't refresh dates without a real update, and
  don't claim first-hand testing without a saved test in `Blogs/{slug}/`.
