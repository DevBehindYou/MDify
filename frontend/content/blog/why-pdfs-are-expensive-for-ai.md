---
title: "PDFs Are Expensive for AI: Here's Why"
slug: "why-pdfs-are-expensive-for-ai"
description: "PDF LLM tokens add up fast: page images, repeated headers, broken columns and flattened tables. See why PDFs cost AI more, and the fix that works."
excerpt: "The PDF file isn't the problem. What happens when an AI reads it is. Here's where the extra tokens come from, page by page, and how to stop paying for them."
date: "2026-10-03"
author: "DevBehindYou"
category: "PDF"
tags: ["PDF LLM tokens", "PDF processing for AI", "PDF to Markdown", "Token costs", "Document extraction"]
primaryKeyword: "PDF LLM tokens"
secondaryKeywords: ["PDF processing for AI", "PDF to Markdown"]
banner: "/blog/why-pdfs-are-expensive-for-ai/banner.svg"
bannerAlt: "A PDF page with its header, footer and column split highlighted, next to a price tag reading 7x."
draft: false
---

**TL;DR:** PDFs are expensive for AI because of how they're read, not because of the file. Many apps send each page as text plus an image, which Anthropic's docs show can take a 3-page PDF from about 1,000 to about 7,000 tokens. Extraction also drags in repeated headers, broken columns and flattened tables. Convert to structured Markdown before the AI reads it.

You can open a 2 MB PDF on any phone in a second. Send the same file to an AI model, though, and it can eat a large share of a free plan's daily allowance. That gap surprises almost everyone.

This article explains where **PDF LLM tokens** come from. The short version: PDF is a print format, and turning print into something a language model can read is lossy and noisy. You'll see each source of waste, a small script that removes one of them, and the conversion step that removes most of the rest.

## A PDF is a picture of a page, not a document

PDFs store where each character sits on a page, not which words make a paragraph or which cells make a table. Everything an AI needs, like reading order and structure, has to be reconstructed. That reconstruction is where cost and errors come from.

Think of what a PDF actually records: "put the glyph 'R' at x=72, y=640, then 'e' at x=79". There's no paragraph, no heading level, no table row. A word processor knew those things. The PDF threw them away when it was printed.

So every AI app has to rebuild the document. It either extracts the characters and guesses the order, or renders the page as an image and lets a vision model look at it. Often it does both.

## Page images: the biggest cost

To catch charts and layout, many AI apps send each PDF page as an image alongside its text. The image is often larger, in tokens, than every word on the page.

![Bars: the same 3-page PDF costs about 1,000 tokens with text extraction only and about 7,000 tokens with page images, 7x more.](/blog/why-pdfs-are-expensive-for-ai/seven-times.svg "Source: [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support), Amazon Bedrock section.")

Anthropic's [PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support) say each page is converted into an image and its text is extracted and sent alongside it. The same docs give a direct comparison: a 3-page PDF uses about 1,000 tokens with text extraction alone and about 7,000 with full visual understanding.

The image cost follows a simple rule. Claude's [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) charge one token per 28 x 28 pixel patch, up to 1,568 tokens per image on standard models and 4,784 on high-resolution ones. For a page that's mostly paragraphs, almost all of that image budget repeats what the text already said.

## Extraction noise: tokens for nothing

Text extracted from a PDF carries everything printed on the page: running headers, footers, page numbers and legal lines. The model reads all of it, every time, and none of it answers your question.

![Annotated PDF page with five marked areas: 1 running header, 2 two columns read line by line, 3 table flattened into numbers, 4 scanned or image-only text, 5 footer, legal line and page number.](/blog/why-pdfs-are-expensive-for-ai/page-anatomy.svg "The five usual sources of PDF noise. Most pages have at least two.")

Repeats are the sneakiest. A header like "ACME Corp, Annual Report 2025" and a footer like "Page 14, Confidential" appear on every page. On a 60-page report, that's 120 lines of noise.

![Extracted text of pages 12 to 14: each page's single useful sentence sits between a struck-out repeated header and a struck-out page footer, six repeats in all.](/blog/why-pdfs-are-expensive-for-ai/repeats.svg "Illustration. Real reports often have longer headers and multi-line legal footers.")

You can strip most of it with a few lines of Python. This function removes any line that appears on most pages, ignoring page numbers:

```python
import re
from collections import Counter

def strip_repeated_lines(pages, min_share=0.6):
    """Remove lines that repeat on most pages, such as headers and footers."""
    def key(line):
        # Page numbers change from page to page, so compare without digits.
        return re.sub(r"\d+", "#", line.strip().lower())

    counts = Counter(k for page in pages for k in {key(l) for l in page.splitlines() if l.strip()})
    repeated = {k for k, n in counts.items() if n >= max(2, min_share * len(pages))}
    return [
        "\n".join(l for l in page.splitlines() if key(l) not in repeated)
        for page in pages
    ]
```

Pass it a list of page texts and it returns them without the repeating lines. It's deliberately simple, so check the result on documents where a real sentence might repeat, like a recurring table label.

## Broken reading order and flattened tables

Extraction reads text by position on the page, so two-column layouts interleave and tables lose their grid. The model gets the right words in the wrong shape, and wrong shapes cause wrong answers.

On a two-column page, a line-by-line reader takes the first line of the left column, then the first line of the right column, then the second line of the left. The result reads like two conversations spliced together.

Tables are worse. The grid disappears and you get a run of numbers.

![Two panels. Raw extraction turns a regional sales table into a run of numbers that wraps across lines. The Markdown panel shows the same data as a pipe table with Region, Q1, Q2, Q3 and Q4 columns.](/blog/why-pdfs-are-expensive-for-ai/table-fragments.svg "The same table, extracted as plain text and converted to Markdown.")

Ask "what was South's Q3 figure?" against the raw version and the model has to count positions in a stream of numbers. Against the Markdown version, it reads one cell. Structure isn't decoration. It's what makes the answer findable.

## Scans and OCR garbage

Scanned pages have no text layer at all. Without text recognition, an AI app either sees nothing or relies entirely on the page image, which is the most expensive way to read text.

With text recognition, scans become text, but not always clean text. Small print, stamps, handwriting and skewed pages produce errors like "Arnount" for "Amount". Each error costs tokens and can mislead the model.

The practical rule for **PDF processing for AI** is to recognize scanned pages once, check the important numbers, and then work from the text. Don't make the AI re-read the scan image on every question.

## The fix: convert to structured Markdown first

Convert the PDF to Markdown once, before any AI reads it. Headings, lists and tables stay as text structure, page images and repeated noise drop away, and every later question costs less.

![Flow of six steps: PDF, convert to Markdown, strip repeats, chunk by heading, index once per document, then ask with relevant chunks.](/blog/why-pdfs-are-expensive-for-ai/fix-flow.svg "Do the expensive cleanup once per document, not once per question.")

Here's what a **PDF to Markdown** conversion buys you, in MDify's worked example: a 500-word page drops from about 2,235 tokens (text plus a standard page image) to about 667 as Markdown. That's roughly 70% less, and the savings repeat on every question you ask.

[MDify](/) does this for free with no sign-up. It reads text pages directly and runs text recognition on pages that are only pictures, up to 100 per file. Tables stay pipe tables, and the RAG-ready profile marks each section heading as a chunk boundary.

Keep one exception in mind. If the answer lives in a chart or photo, send that page as an image too. That page's image tokens are worth paying for.

## Frequently Asked Questions

### Why do PDFs use so many tokens in AI?

Many AI apps send each PDF page as both extracted text and an image, and the image can cost more than the words. Extraction also includes repeated headers, footers and page numbers. Anthropic's docs show a 3-page PDF going from about 1,000 tokens as text to about 7,000 with page images.

### Is the PDF file size what makes it expensive?

No. A small PDF can still cost a lot of tokens, and a large one full of images may cost little if only its text is sent. Token cost depends on how the app reads the pages: as text, as images, or both.

### Does converting a PDF to Markdown lose information?

It can lose purely visual details, such as what a chart looks like. Text, headings, lists and tables come through. For a chart-heavy page, send that page as an image as well, and use Markdown for the rest.

### How do I remove headers and footers from extracted PDF text?

Find lines that repeat on most pages and drop them, ignoring page numbers when you compare. The Python function in this article does exactly that. Converting to Markdown with a good converter removes most of them too.

### Can AI read scanned PDFs?

Only through images or text recognition, because scans have no text layer. Recognizing scanned pages once and working from the text is much cheaper than sending page images with every question. MDify recognizes up to 100 scanned pages per PDF.

### How much does Markdown save compared with a PDF?

In MDify's example, a 500-word page costs about 667 tokens as Markdown against about 2,235 as text plus a page image, roughly 70% less. Apps that send only extracted text save less on tokens but still get cleaner input.

Stop paying the PDF tax with the [free converter](/), and see [the full token math](/usecase).
