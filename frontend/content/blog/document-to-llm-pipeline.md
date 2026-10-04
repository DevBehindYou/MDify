---
title: "Stop Sending Whole Documents to AI: Build a Better Pipeline"
slug: "document-to-llm-pipeline"
description: "Build a document to LLM pipeline that extracts, cleans, chunks and retrieves, so each question sends a few relevant sections instead of the whole file."
excerpt: "Sending a 100-page PDF to answer one question pays for 99 pages you didn't need. Here's the pipeline that sends only the part that answers."
date: "2026-10-03"
author: "DevBehindYou"
category: "PIPELINE"
tags: ["Document to LLM pipeline", "RAG", "Chunking", "PDF to Markdown", "LLM document processing"]
primaryKeyword: "document to LLM pipeline"
secondaryKeywords: ["LLM document processing", "AI document pipeline"]
banner: "/blog/document-to-llm-pipeline/banner.svg"
bannerAlt: "A stack of document pages goes through a clean, chunk and rank funnel and comes out as three small ranked chunks for the LLM."
draft: false
---

**TL;DR:** Don't send a whole document to answer one question. A **document to LLM pipeline** extracts and cleans the text once, converts it to Markdown, splits it into chunks with metadata, and then sends only the few chunks that match each question. In the example below that's about 3,000 input tokens instead of more than 200,000.

There's a habit that quietly burns most AI budgets: attach the whole file, ask one question, repeat. It works, and it's expensive every single time.

This guide lays out a practical pipeline for **LLM document processing**. It covers PDFs that mix text pages with scans, why Markdown is the right middle format, how to chunk with metadata, and how to assemble a context that stays inside a token budget. No framework required.

## The problem with sending everything

Sending a whole document makes the model read every page for every question. You pay for all of it, and long inputs make the model worse at finding the one passage that matters.

![Two flows. Top: a 100-page PDF sent whole to the LLM. Bottom: nine steps, extract, clean, structure, chunk, add metadata, index, retrieve, assemble within a budget, then a small focused input to the LLM.](/blog/document-to-llm-pipeline/naive-vs-pipeline.svg "The bottom path does its heavy work once per document, not once per question.")

Cost is the obvious part. A 100-page report read as text plus page images can run past 200,000 input tokens. Ask ten questions and you've paid for two million tokens of mostly irrelevant pages.

Quality is the less obvious part. The 2024 paper [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) found that models use information at the start and end of a long context more reliably than information buried in the middle. Chroma's 2025 [context rot study](https://research.trychroma.com/context-rot) saw all 18 models it tested get worse as input length grew. More pages can mean worse answers, not better ones.

![Bars of input tokens for one question: whole PDF with page images 223,500, whole document as Markdown 66,700, six relevant chunks 3,000, about 1% of the PDF.](/blog/document-to-llm-pipeline/tokens-per-question.svg "Estimates for a 100-page, 500-words-per-page report: 667 text tokens and up to 1,568 image tokens per page, chunks of about 500 tokens.")

## Step 1: extract text from every page, including scans

Extraction turns each page into text. Pages with a text layer can be read directly. Pages that are only a picture, like a scanned signature page, need text recognition first.

![Fork diagram: a mixed PDF splits into text pages read directly and picture-only pages sent to text recognition, then both merge in page order into one Markdown file.](/blog/document-to-llm-pipeline/mixed-pdf.svg "Reading text pages directly is faster and more accurate than recognizing them, so only true scans go through recognition.")

Real-world PDFs mix both. A contract might be generated text with two scanned annex pages. A report might include a photographed table. If your extractor treats the whole file one way, it either misses the scans or runs slow recognition on pages that already had perfect text.

The fix is per-page routing. Check each page, read text pages directly, recognize only the picture-only pages, and merge everything back in page order. That's what [MDify](/) does when you drop in a PDF: text pages are read as they are, and picture-only pages go through text recognition, up to 100 scanned pages per file.

## Step 2: clean and structure it as Markdown

Cleaning removes text that repeats without adding meaning. Structuring keeps the headings, lists and tables that tell a reader, and a splitter, where each topic starts and ends.

Strip running headers, footers, page numbers and legal boilerplate. They repeat on every page, so a 40-page report can carry 40 copies of the same line into your index.

Then keep the structure as Markdown. Headings become `##` lines, bullet points stay bullets, and tables become pipe tables with their header row intact. This gives the next step clean edges to cut along. It's also the format models read most cheaply, with no layout noise to wade through.

MDify's RAG-ready profile goes one step further. It writes a `<!-- chunk-boundary -->` marker before every `##` heading, so your splitter knows exactly where sections begin.

## Step 3: chunk by section and attach metadata

Split the Markdown at headings so each chunk covers one topic, and give every chunk its document name, section path and page range. Metadata lets you filter before searching and cite sources after answering.

![A chunk record: document employee-handbook-2026.md, section Leave then Parental leave, pages 31 to 32, followed by the Parental leave heading, a sentence and a small table. About 480 tokens.](/blog/document-to-llm-pipeline/chunk-record.svg "Metadata travels with the chunk, so the answer can say where it came from.")

Here's a small, dependency-free Python splitter that cuts at headings, keeps the heading path, and respects MDify's chunk markers:

```python
import re

def chunk_markdown(markdown, doc_name, max_chars=2000):
    """Split Markdown at headings and keep the heading path as metadata."""
    chunks, path, lines = [], [], []

    def flush():
        text = "\n".join(lines).strip()
        if text:
            for start in range(0, len(text), max_chars):
                chunks.append({
                    "doc": doc_name,
                    "section": " > ".join(path) or "(intro)",
                    "text": text[start:start + max_chars],
                })
        lines.clear()

    for line in markdown.splitlines():
        heading = re.match(r"^(#{1,3})\s+(.*)", line)
        if heading:
            flush()
            level = len(heading.group(1))
            path[:] = path[:level - 1] + [heading.group(2).strip()]
        elif line.strip() != "<!-- chunk-boundary -->":
            lines.append(line)
    flush()
    return chunks
```

On a handbook with "Refunds" and an "Exceptions" subsection, it returns chunks tagged `Handbook > Refunds` and `Handbook > Refunds > Exceptions`. Long sections are split at `max_chars` so no single chunk gets out of hand.

## Step 4: retrieve, then assemble a context budget

At question time, search the index, drop duplicates, rerank, and pack the best chunks until you hit a fixed token budget. The budget is the step most pipelines skip, and it's the one that keeps costs flat.

![Funnel: retrieved 20 chunks about 10,000 tokens, duplicates removed 14 chunks about 7,000, reranked top 6 about 3,000, sent to the model within a 3,000-token budget.](/blog/document-to-llm-pipeline/context-budget.svg "Illustrative numbers. Tune them on questions you already know the answers to.")

Retrieval quality is worth investing in. Anthropic's 2024 [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) write-up reports that adding a short context sentence to each chunk, combined with keyword search, cut the top-20 retrieval failure rate by 49%. Adding a reranker took that to 67%.

Then set a hard budget, say 3,000 tokens of context. Put the strongest chunk first. If a chunk doesn't fit, leave it out rather than truncating it mid-table. A fixed budget means your cost per question stays predictable no matter how big the source documents get.

## When you don't need retrieval at all

If the whole knowledge base is small, skip the index and send it all. Below a couple of hundred thousand tokens, simple can beat clever, especially with prompt caching.

Anthropic's Contextual Retrieval article makes this point directly: if your knowledge base is under 200,000 tokens, about 500 pages, you can often include all of it in the prompt. With [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), a cache hit on that repeated prefix costs 10% of the normal input price.

Even then, convert to Markdown first. A 500-page corpus as clean Markdown is far smaller than the same corpus as PDF pages with images, so it fits more easily and caches more cheaply.

| Corpus size         | A sensible approach                       |
|---------------------|-------------------------------------------|
| A few pages         | Paste the relevant section as Markdown    |
| Under ~500 pages    | Whole corpus as Markdown, cached          |
| Larger, or growing  | Chunk, index, retrieve within a budget    |

## Frequently Asked Questions

### What is a document to LLM pipeline?

It's the set of steps that turns raw files into input a model can use efficiently. You extract text, clean it, structure it as Markdown, split it into chunks with metadata, index it, and retrieve only the relevant chunks per question. The heavy work happens once per document, not once per question.

### Why not just send the whole PDF to the AI?

Because you pay for every page on every question, and long inputs can reduce answer quality. Studies like Lost in the Middle (2024) and Chroma's context rot research (2025) show models handle long contexts less reliably. Sending the right few sections is cheaper and often more accurate.

### Why convert documents to Markdown before chunking?

Markdown keeps headings, lists and tables as plain text, so a splitter can cut at section boundaries and each chunk stays on one topic. It also drops the page images and layout noise that make PDFs expensive to read.

### How big should chunks be?

There's no single right size. Start with one section per chunk, a few hundred tokens each, and split long sections. Then test with questions you already know the answers to, because the best size depends on your documents and your search method.

### Can this pipeline handle scanned PDFs?

Yes, if the extraction step routes pages. Read pages with a text layer directly and run text recognition only on picture-only pages. MDify does this automatically for up to 100 scanned pages per PDF, then merges the pages back in order.

### Do I need a vector database for this?

Not always. For a small corpus, sending everything as cached Markdown can be simpler. Once your documents grow past a few hundred pages, or change often, an index with retrieval keeps each question's cost flat.

Start with step one: convert your documents with the [free converter](/), then see [how Markdown saves tokens](/usecase) in practice.
