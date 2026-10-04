---
title: "Markdown vs Raw PDFs: Which Uses Fewer LLM Tokens?"
slug: "markdown-vs-pdf-llm-tokens"
description: "Markdown vs PDF for LLM input: a 500-word page costs about 667 tokens as Markdown and 2,235 as a PDF page. See where the gap comes from and when it matters."
excerpt: "A PDF page can cost an AI app three times the tokens of the same page as Markdown. Here's where that gap comes from, and when sending the PDF is still the right call."
date: "2026-10-03"
author: "DevBehindYou"
category: "PDF"
tags: ["Markdown vs PDF", "LLM tokens", "PDF to Markdown", "RAG", "Free AI plans"]
primaryKeyword: "Markdown vs PDF for LLM"
secondaryKeywords: ["PDF to Markdown for AI", "reduce LLM tokens"]
banner: "/blog/markdown-vs-pdf-llm-tokens/banner.svg"
bannerAlt: "A cluttered PDF page tagged 2,235 tokens turns into a clean Markdown page tagged 667 tokens."
featured: true
draft: false
---

**TL;DR:** For text you want an AI to read, Markdown wins. A typical 500-word page costs about 667 tokens as Markdown. Read as a PDF (page text plus a page image), it costs about 2,235, so converting first cuts that page's input by roughly 70%. Send the PDF only when the answer lives in a chart, photo or layout.

You upload a 20-page PDF to your AI chat, ask two questions, and the free plan says you've hit your limit. That isn't bad luck. It's the format.

This guide compares **Markdown vs PDF for LLM** input: what the model actually receives from each, how many tokens that costs, and why the difference grows once you chunk documents for search. You'll also see the one case where the PDF is the better choice.

## What an AI app actually receives from a PDF

A PDF reaches the model as extracted text, and often as an image of every page as well. Markdown reaches it as text only. The image is where most of the extra tokens come from.

PDF is a print format. It stores where each glyph sits on a page, not which words form a paragraph. An AI app has two ways to read it, and many apps use both at once.

The first is text extraction. Software pulls the characters off the page in roughly the order they appear. The second is vision. The app renders each page as a picture and sends that too, so the model can see charts and layout. Anthropic's [PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support) describe exactly this: each page becomes an image, and the extracted text goes along with it.

Markdown skips both problems. It's already plain text, with structure written into it as `#` headings, `-` list items and `|` table rows. The model gets the words and their roles, nothing else.

## The token math for one page

On a 500-word page, Markdown costs about 667 tokens. The PDF costs about 2,235 on a standard vision model and about 3,381 on a high-resolution one. That's 70% to 80% fewer tokens for the Markdown version.

![Stacked bars: Markdown 667 tokens of page text. PDF on a standard model 667 text plus 1,568 image tokens, 2,235 total. PDF on a high-res model 667 text plus 2,714 image tokens, 3,381 total.](/blog/markdown-vs-pdf-llm-tokens/tokens-per-page.svg "Example, not a guarantee. Text: 1 token is about 0.75 words ([Claude pricing FAQ](https://platform.claude.com/docs/en/about-claude/pricing)). Image: one token per 28 x 28 px patch, capped at 1,568 or 4,784 ([Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)).")

Here's how those numbers fall out. A token is roughly three quarters of an English word, so 500 words is about 667 tokens. That part is the same in both formats.

The page image is the extra. Claude's [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) price an image at one token per 28 x 28 pixel patch. Render a US Letter page at 150 dpi and you get 1275 x 1650 pixels, or 2,714 patches. Standard models stop at 1,568. High-resolution models allow up to 4,784 tokens per image, so the full 2,714 count.

So the PDF page costs 667 + 1,568 = 2,235 tokens on a standard model, and 667 + 2,714 = 3,381 on a high-resolution one. Markdown saves 70% and 80% respectively. That's where MDify's "Cut PDF token costs by 70%" comes from, and it holds only when the app sends page images. Apps that send extracted text alone save less on tokens, but still gain everything in the next section.

### Even text-only extraction is heavy

Anthropic's own PDF docs give another useful figure. In Amazon Bedrock's text-only mode, a 3-page PDF uses about 1,000 tokens. With full visual understanding, the same 3 pages use about 7,000. Same document, seven times the input.

## Extraction noise you pay for twice

Text pulled out of a PDF carries repeated headers, footers, page numbers, split words and flattened tables. You pay tokens for that noise, and the model spends attention ignoring it. Markdown conversion removes most of it before the model sees anything.

![Two text panels. Raw PDF text shows a struck-out running header, words split by hyphens across lines, columns mixed together, a flattened table and a struck-out confidentiality footer. The Markdown panel shows a heading, two clean sentences and a pipe table.](/blog/markdown-vs-pdf-llm-tokens/extraction-noise.svg "Illustration of common extraction problems. The exact output depends on the PDF and the extraction tool.")

In practice, these are the usual offenders:

- **Running headers and footers.** "ACME Corp, Annual Report 2025, Page 14" repeats on every page. On a 40-page report that's 40 copies of a line nobody asked about.
- **Page numbers and legal lines.** "Confidential. Do not distribute." adds tokens and adds nothing.
- **Hyphenation.** "dri-" on one line and "ven" on the next tokenize worse than "driven", and can confuse search.
- **Tables.** A grid becomes a run of numbers with no column names. The model has to guess which figure belongs to which quarter.

None of this is the model's fault. It's reading exactly what it was given.

## Reading order breaks on multi-column pages

Two-column layouts are where raw extraction gets things most wrong. Text is read across the page by line position, so lines from both columns interleave. Markdown keeps each column's text together in reading order.

![Two page diagrams with column A on the left and column B on the right. Raw extraction reads A1, B1, A2, B2, A3, B3. Markdown reads A1, A2, A3, then B1, B2, B3.](/blog/markdown-vs-pdf-llm-tokens/reading-order.svg "Simplified illustration of line-by-line extraction on a two-column page.")

Academic papers, newsletters and many reports use two columns. When sentences from the left and right columns alternate, the model gets text that reads like a broken transcript. It can sometimes recover the meaning. It shouldn't have to, and you shouldn't pay for the confusion.

## Why Markdown chunks better for RAG

Search systems split documents into chunks before indexing them. Markdown headings give the splitter clean places to cut, so each chunk covers one topic. Fixed-size cuts through raw text often slice a section in half.

![Two documents with Pricing, Refunds and Support sections. Fixed 120-token cuts slice through the middle of sections. Cuts at each ## heading keep every section whole.](/blog/markdown-vs-pdf-llm-tokens/chunk-boundaries.svg "MDify's RAG-ready profile marks every ## heading so splitters can cut there.")

This matters for cost as much as quality. A chunk that mixes the end of "Pricing" with the start of "Refunds" gets retrieved for both kinds of question, so it eats context space twice. Clean, topic-sized chunks mean you can send fewer of them per question.

Markdown also keeps tables as tables. A pipe table survives chunking with its header row intact, so a retrieved chunk still says which number is "Q3 revenue". That's the practical case for **PDF to Markdown for AI** pipelines: structure you'd otherwise lose stays in the text.

## When to send the PDF instead

Send the PDF page when the answer depends on what the page looks like: a chart, a diagram, a photo or a visual layout. For text, lists and tables, convert to Markdown first.

![Decision diagram. Start with your document. If the answer is in a chart, photo or layout, send that page and accept the image tokens. If not, convert to Markdown, then paste only the sections you need.](/blog/markdown-vs-pdf-llm-tokens/when-to-send-pdf.svg "A simple rule that covers most everyday documents.")

Be fair to the PDF here. Vision models can read a bar chart that text extraction turns into nothing. If your question is "what does the trend in Figure 3 show", the page image is worth its tokens.

The good news is that you rarely need every page as an image. Convert the document, ask your text questions against the Markdown, and attach only the one or two pages with the chart. That mix keeps most of the savings and loses none of the answers.

## How to convert a PDF to Markdown in under a minute

Open [MDify](/), drop the PDF on the page and press Convert. You get Markdown with headings, lists and tables, plus a token estimate, and you don't need an account.

A few settings help you **reduce LLM tokens** further:

| Profile    | Best for                              |
|------------|---------------------------------------|
| Standard   | Reading and checking the result       |
| Clean      | Pasting into a chat                   |
| Compact    | The fewest tokens on a free plan      |
| RAG-ready  | Chunking for search and retrieval     |

MDify also reads scanned PDFs. Text pages are read directly, and pages that are only pictures go through text recognition, up to 100 scanned pages per file. You can convert up to 20 files in one batch and download them all as a ZIP.

Then paste only the sections your question needs. That last step often saves more than the conversion itself.

## Frequently Asked Questions

### Does Markdown really use fewer tokens than a PDF?

Yes, when the AI app also sends page images, which many do. In the example above, a 500-word page drops from about 2,235 tokens to about 667, around 70% less. Apps that send only extracted text save less, but Markdown still removes noise and keeps tables readable.

### Why does a PDF cost more tokens than its text?

Because many apps send an image of each page alongside the text, so the model can see charts and layout. Each image costs up to 1,568 tokens on standard models and more on high-resolution ones. Repeated headers, footers and page numbers add further tokens.

### Will converting to Markdown lose information?

It can lose purely visual information, such as what a chart looks like or a photo shows. Text, headings, lists and tables come through. For a chart-heavy page, keep that page as a PDF or image and convert the rest.

### Is Markdown better than plain text for LLMs?

Usually, yes. Plain text drops structure, so a table becomes a run of numbers and headings look like any other line. Markdown keeps that structure for a handful of extra characters, which helps both the model and any chunking step.

### How do I make a free AI plan last longer with PDFs?

Convert long PDFs to Markdown first, use a compact output, and paste only the sections you need instead of the whole file. Smaller messages use less of your plan's allowance, so you can ask more questions before you hit the limit.

### Can MDify convert scanned PDFs?

Yes. MDify reads text pages directly and runs text recognition on pages that are only pictures, up to 100 scanned pages per file. Very small print and handwriting can come out with errors, so check numbers that matter.

Try it on your heaviest PDF with the [free converter](/), or read [why Markdown saves AI tokens](/usecase) for the full method.
