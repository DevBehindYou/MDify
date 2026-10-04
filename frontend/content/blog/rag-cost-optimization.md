---
title: "The Real Cost of RAG: Embeddings, Tokens and Re-Ranking"
slug: "rag-cost-optimization"
description: "The real RAG cost is rarely embeddings. See where retrieval pipelines spend, from parsing to generation, and how to cut cost without hurting relevance."
excerpt: "Teams worry about embedding prices while the real RAG bill grows at question time. Here's the full cost map, with the numbers that show where to optimize."
date: "2026-10-03"
author: "DevBehindYou"
category: "RAG"
tags: ["RAG cost", "Embeddings", "Reranking", "Context window", "Retrieval"]
primaryKeyword: "RAG cost"
secondaryKeywords: ["RAG cost optimization", "RAG token usage"]
banner: "/blog/rag-cost-optimization/banner.svg"
bannerAlt: "A RAG pipeline drawn as boxes: parse, embed and store with small price tags happen once, retrieve, rerank and generate with bigger price tags happen every question."
draft: false
---

**TL;DR:** The biggest **RAG cost** is usually the context you send with every question, not the embeddings you compute once. In the example below, embedding a 2,000-page corpus is about 1.3 million tokens once, while sending 8,000 tokens of context per question is 80 million tokens a month. Optimize context size, top-K and reranking first.

Ask a team about their retrieval costs and they'll usually quote the embedding price. It's a fair instinct. It's also usually the wrong line item to worry about.

This guide walks through the full economics of a retrieval-augmented generation request, from parsing a document to the last output token. You'll see which costs happen once, which repeat on every question, and where **RAG cost optimization** saves money without damaging relevance.

## The full cost map of a RAG request

A RAG system has two cost phases. Ingestion (parsing, chunking, embedding, storing) runs once per document. Querying (retrieval, reranking, context building, generation) runs on every single question.

![Pipeline diagram: parse, chunk, embed and store run once per document. Retrieve, rerank, build context, input tokens and output tokens run on every question.](/blog/rag-cost-optimization/rag-cost-map.svg "Ingestion costs scale with your documents. Query costs scale with your traffic.")

That split explains most RAG bills. Ingestion cost grows with your corpus. Query cost grows with traffic, and in most products traffic grows a lot faster than the document collection does.

Here's what each step costs you:

| Step            | Billed by                         | How often      |
|-----------------|-----------------------------------|----------------|
| Parse           | compute time per page             | once per doc   |
| Embed           | tokens embedded                   | once per chunk |
| Store           | vectors and metadata held         | monthly        |
| Retrieve        | search queries                    | per question   |
| Rerank          | candidates scored                 | per question   |
| Generate        | input and output tokens           | per question   |

## Why embeddings are rarely the big number

Embedding a corpus is a one-time cost per chunk. Generation input is paid on every question, so it overtakes embedding cost quickly as traffic grows, even when each question looks small.

![Bars: embedding the whole 2,000-page corpus once is 1.33 million tokens, context sent to the model per month is 80 million tokens, 60 times more.](/blog/rag-cost-optimization/once-vs-monthly.svg "Example: 2,000 pages at about 667 tokens each, 10,000 questions a month, 8,000 context tokens per question.")

Run the numbers on a mid-sized corpus. Two thousand pages at about 667 tokens each, as Markdown, is roughly 1.33 million tokens to embed. You pay that once, plus updates.

Now serve 10,000 questions a month with 8,000 tokens of retrieved context each. That's 80 million input tokens every month. At Claude Sonnet 5.5's list price of $2 per million input tokens on the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), it's about $160 a month before a single output token, and it repeats every month.

In practice, that's why the per-question context deserves your attention first. Shaving a little off every question beats a big one-time saving on ingestion.

## Context size is the lever that compounds

Every token of retrieved context is billed on every question. Retrieving fewer, smaller, cleaner chunks shrinks that number directly, and the saving compounds with traffic.

![Bars of context per question: top 20 chunks of 400 tokens is 8,000, reranked to the top 5 is 2,000 or minus 75%, top 5 of 300-token clean chunks is 1,500 or minus 81%.](/blog/rag-cost-optimization/context-per-question.svg "Illustrative sizes. Test recall on known questions before cutting top-K.")

Three settings drive it. Top-K sets how many chunks reach the model. Chunk size sets how big each one is. Cleanliness sets how much of each chunk is useful text rather than headers, footers and layout noise.

Bigger isn't automatically safer. Models handle long contexts less reliably: the 2024 paper [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) found that information in the middle of a long input gets used less than information at the start or end. Stuffing 20 chunks in "just in case" can cost more and answer worse.

## Reranking: pay a little, send a lot less

A reranker scores a wide set of retrieved candidates and keeps only the best few. It adds a cost per question, but it lets you send far fewer context tokens while improving which chunks get through.

The pattern is "retrieve wide, send narrow". Pull 20 to 50 candidates cheaply, rerank them, and pass only the top 5 to the model. In the example above, that drops context from 8,000 to 2,000 tokens per question.

There's quality evidence too. In Anthropic's 2024 [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) experiments, adding a reranker on top of contextual embeddings and contextual keyword search cut the top-20 retrieval failure rate by 67%, compared with 49% without it.

![Three tiles: minus 35% failures with contextual embeddings, minus 49% adding contextual keyword search, minus 67% adding reranking.](/blog/rag-cost-optimization/contextual-retrieval.svg "Source: [Anthropic, Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval), 19 September 2024.")

The same article puts a price on the ingestion side. Generating a short context sentence for every chunk cost $1.02 per million document tokens, using prompt caching. For the 1.33-million-token corpus above, that's well under $2, once.

## Parse quality is a cost decision

Messy parsing creates junk chunks: running headers, page numbers, split tables and broken reading order. You embed them, store them, retrieve them and pay to send them, so cleaning documents up front saves money at every later step.

A PDF converted to clean Markdown has fewer tokens per page and clearer section boundaries. That means fewer chunks to embed, and chunks that are more likely to be relevant when retrieved. Headings also make it easy to attach metadata, so you can filter by document or section before searching.

[MDify](/) converts PDFs, Office files and scans to Markdown for free. Its RAG-ready profile marks every `##` heading as a chunk boundary, so your splitter can cut along sections instead of arbitrary character counts.

## Where RAG cost optimization actually pays

Rank your optimizations by how often their cost repeats. Per-question costs come first, then per-document costs and storage. And before any of it, check whether you need retrieval at all.

![Six cards ranked: context size, top-K, reranking, parse quality, caching and skipping RAG for small corpora.](/blog/rag-cost-optimization/where-to-optimize.svg "Start at the top: those costs repeat on every question.")

A practical order:

- **Set a hard context budget**, such as 2,000 to 4,000 tokens, and pack the best chunks into it.
- **Retrieve wide, send narrow** with a reranker.
- **Clean documents before chunking** so each chunk carries more signal per token.
- **Cache the stable prompt prefix.** On Claude, a cache hit costs 10% of the normal input price, per the [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
- **Skip RAG for small corpora.** Anthropic suggests that under about 200,000 tokens, roughly 500 pages, you can often put the whole knowledge base in the prompt.

Then measure. Track **RAG token usage** per question, retrieval recall on a fixed test set, and answer quality. Cut context only while recall holds.

## Frequently Asked Questions

### What is the biggest cost in a RAG system?

For most systems with real traffic, it's the input tokens sent with each question: the retrieved context plus the prompt. Embedding is paid once per chunk, while context is paid on every question, so it grows with usage.

### Are embeddings expensive?

Usually not, compared with generation. Embedding a corpus is a one-time cost per chunk, repeated only when documents change. In the example above, the corpus is 1.33 million tokens to embed once, against 80 million tokens of context sent every month.

### Does reranking increase or decrease RAG cost?

Often both. It adds a per-question cost for scoring candidates, but it lets you send far fewer chunks to the model. When context tokens dominate your bill, the reranker usually pays for itself, and it can improve retrieval quality too.

### How many chunks should I send to the LLM?

As few as still answer your questions reliably. Start around 5. Then test recall on a set of questions with known answers, and only add chunks when the answers need them, since more chunks cost more and can make long-context answers less accurate.

### How does document cleaning reduce RAG cost?

Clean Markdown has fewer wasted tokens and clearer section boundaries. You embed fewer junk chunks, retrieve more relevant ones, and send less noise to the model on every question.

### When should I not use RAG?

When the whole knowledge base is small. Anthropic suggests that below about 200,000 tokens, roughly 500 pages, you can often include everything in the prompt and use prompt caching instead.

Clean your corpus before you embed it with the [free converter](/), and see [how Markdown cuts tokens](/usecase) per page.
