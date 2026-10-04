---
title: "The Hidden Token Tax in RAG Pipelines"
slug: "hidden-token-tax-rag-pipelines"
description: "RAG token optimization starts before generation: oversized chunks, overlap, duplicate retrieval and loose top-K inflate context. Learn to cut the tax."
excerpt: "Most RAG pipelines send five times the context the model needs, and nobody notices because the answers still look fine. Here's where that token tax comes from."
date: "2026-10-03"
author: "DevBehindYou"
category: "RAG"
tags: ["RAG token optimization", "Chunking", "Reranking", "Context window", "Retrieval"]
primaryKeyword: "RAG token optimization"
secondaryKeywords: ["RAG token cost", "RAG context optimization"]
banner: "/blog/hidden-token-tax-rag-pipelines/banner.svg"
bannerAlt: "An iceberg with a small tip labelled answer above the water and a large mass below labelled 8,000 context tokens."
draft: false
---

**TL;DR:** The hidden token tax in RAG is the context you retrieve but don't need. In the example below, twenty chunks, near-duplicates, oversized chunks and overlap can turn a question that needs about 1,500 tokens of context into 8,000. **RAG token optimization** means deduplicating, reranking, cleaning documents and setting a hard context budget, while testing that recall holds.

Ask a RAG team where their costs come from and you'll hear about embedding models and price per token. Those matter. They're also not where most of the waste hides.

The quieter cost is context. Every question pulls a stack of chunks, and most of them ride along without contributing to the answer. This article follows one question through an untuned pipeline, names each source of waste, and shows the fixes, including a small Python function that removes two of them.

## One question, 8,000 tokens

An untuned pipeline retrieves 20 chunks of about 400 tokens each and sends them all. That's 8,000 tokens of context for a question that, in this example, needed about 1,500.

![Funnel: retrieve top 20 chunks at 400 tokens each for 8,000 tokens, drop near-duplicates to 15 chunks and about 6,000 tokens, rerank and keep the top 6 for about 2,400, keep relevant passages for about 1,500 tokens needed.](/blog/hidden-token-tax-rag-pipelines/tax-funnel.svg "Illustrative pipeline. Every cut needs a recall test on questions with known answers.")

None of the steps in the untuned version is wrong on its own. Top-20 is a common default. 400-token chunks are reasonable. The trouble is that nothing between retrieval and the prompt asks "does the model need this?"

That's the token tax. Here's where it comes from, and how much of the **RAG token cost** each source adds.

## Big chunks carry passengers

A chunk is retrieved because one part of it matches the question. The rest of the chunk comes along anyway, so large chunks pay for whole pages to deliver one sentence.

![A 400-token chunk under a Billing policy heading with nine text lines. One line answers the question. The other eight ride along. Paid for about 400 tokens, needed about 45.](/blog/hidden-token-tax-rag-pipelines/one-relevant-sentence.svg "Illustration. The ratio depends on your documents and question types.")

Chunk size is a trade-off. Too small and a chunk loses the context that makes it meaningful. Too large and every hit carries passengers. Chroma's 2024 [chunking evaluation](https://research.trychroma.com/evaluating-chunking) found that strategy choices moved recall by up to 9%, and it measured efficiency as the share of retrieved tokens that were actually relevant.

In practice, one section per chunk is a strong default. Markdown headings make that easy: split at each `##`, and only split further when a section runs long.

## Overlap stores, and sends, the same text twice

Chunk overlap repeats text at the edges of neighbouring chunks so ideas aren't cut in half. It also multiplies what you store and embed, and it lets two chunks deliver the same sentences in one prompt.

![Bars of tokens stored per token of source text: 0% overlap 1.00x, 10% 1.11x, 25% 1.33x, 50% 2.00x.](/blog/hidden-token-tax-rag-pipelines/overlap-inflation.svg "Arithmetic: with overlap o, each new chunk covers only (1 - o) of its length in new text, so storage grows by 1 / (1 - o).")

The math is simple. With 25% overlap, each chunk contributes only 75% new text, so you embed and store a third more tokens than the source contains. At 50% overlap, you double them.

The query-time cost is subtler. When two neighbouring chunks both match a question, the overlapping sentences appear twice in the prompt. Chroma's evaluation explicitly accounts for this redundancy when it scores token efficiency.

Heading-aligned chunks need little or no overlap, because each one already starts at a natural boundary.

## Duplicates and a loose top-K

Many corpora contain the same fact in several places: a policy page, an FAQ and a help article. Retrieval happily returns all three. A loose top-K then sends every one of them.

Near-duplicates are cheap to catch. Compare each candidate with the chunks you've already kept and skip it if most of its words match. Then fill a fixed budget, best chunk first:

```python
import re

def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))

def pack_context(chunks, budget_tokens=1500, max_overlap=0.7):
    """chunks: [(score, text)], best first. Drops near-duplicates, then fills a token budget."""
    picked, used = [], 0
    for score, text in sorted(chunks, key=lambda c: -c[0]):
        w = words(text)
        if any(len(w & words(p)) / max(1, len(w | words(p))) > max_overlap for p in picked):
            continue  # near-duplicate of a chunk we already kept
        cost = max(1, len(text) // 4)  # about 4 characters per token
        if used + cost > budget_tokens:
            continue  # doesn't fit: skip it rather than cutting it mid-sentence
        picked.append(text)
        used += cost
    return picked, used
```

Given "Refunds are issued within 5 business days of approval" and "...after approval", it keeps the first and drops the second. A chunk too large for the remaining budget is skipped whole rather than cut mid-table.

Then rerank. Retrieve wide, say 20 to 50 candidates, score them with a reranker, and send only the best few. In Anthropic's 2024 [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) tests, adding reranking cut the top-20 retrieval failure rate by 67%, against 49% without it.

## Dirty documents tax every question

Headers, footers, page numbers and broken tables survive into chunks if documents aren't cleaned first. They consume tokens on every question that retrieves them, and they make the remaining text harder to match.

A PDF converted straight to plain text often carries a running header on every page. Chunk it, and that header appears in dozens of chunks. Each retrieval pays for it again.

Clean Markdown fixes this upstream. Repeated noise is gone, tables keep their columns, and headings mark where sections begin. [MDify](/) converts PDFs, Office files and scans to Markdown for free, and its RAG-ready profile marks every `##` heading as a chunk boundary.

## Set a token budget, then prove it

A fixed context budget caps the tax no matter how retrieval behaves. Pick a number, pack the best chunks into it, and verify on known questions that answers hold. That's **RAG context optimization** in one sentence.

![Stacked bars: untuned input is 8,650 tokens, mostly 8,000 of retrieved context. With a 1,500-token context budget it's 2,150 tokens, 75% less.](/blog/hidden-token-tax-rag-pipelines/budget.svg "Illustration: a 50-token question, 600 tokens of instructions and the retrieved context.")

There's a quality reason too. The 2024 paper [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) found models use information at the start and end of long inputs more reliably than information in the middle. Chroma's 2025 [context rot study](https://research.trychroma.com/context-rot) saw performance drop with input length across all 18 models tested. A tighter, better-ordered context can answer better, not just cheaper.

Before you ship a budget, build a test set of real questions with known answers. Measure retrieval recall and answer quality at the old setting, then at the new one. Lower the budget only while both hold.

![Eight cards: chunk size, overlap, top-K, deduplication, reranking, metadata filters, clean Markdown and token budget, each with a one-line rule.](/blog/hidden-token-tax-rag-pipelines/eight-knobs.svg "The eight settings that decide how much context each question pays for.")

## Frequently Asked Questions

### What is the token tax in RAG?

It's the retrieved context a question pays for but doesn't need: extra chunks, near-duplicates, overlapping text, irrelevant paragraphs inside large chunks, and leftover headers and footers. It's charged on every question, so it grows with traffic.

### How many chunks should a RAG pipeline send?

As few as answer reliably. Retrieve a wide set, rerank, and send the best few, often around five. Then test recall on questions with known answers before lowering it further, because the right number depends on your documents.

### Does chunk overlap help or hurt?

Some overlap stops ideas being cut in half, but it costs storage and can send the same sentences twice. At 25% overlap you store a third more tokens than the source. Splitting at headings usually needs little or none.

### Is reranking worth the extra cost?

Usually, when context tokens dominate your bill. A reranker adds a per-question cost but lets you send far fewer chunks. Anthropic's Contextual Retrieval tests also showed it reduced retrieval failures, so it can improve quality as well.

### How do clean documents reduce RAG token cost?

Clean Markdown drops repeated headers, footers and page numbers before chunking, so they're never embedded or retrieved. Each chunk carries more useful text per token, and clear headings make one-topic chunks easy.

### What's a good context budget for RAG?

There's no universal number. Many pipelines start between 1,500 and 4,000 tokens of context. Choose one, measure recall and answer quality on a fixed test set, and lower it only while both hold.

Cut the tax at the source with the [free converter](/), and see [how Markdown saves tokens](/usecase) per page.
