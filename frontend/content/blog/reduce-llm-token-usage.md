---
title: "Why Your LLM Token Usage Is So High, and How to Fix It"
slug: "reduce-llm-token-usage"
description: "High LLM token usage rarely comes from your questions. Find the hidden causes: raw PDFs, chat history, big prompts, duplicate text and whole documents."
excerpt: "Your questions are usually the smallest part of what you send an AI. Here are the six places tokens quietly pile up, and a 30-minute audit to find yours."
date: "2026-10-03"
author: "DevBehindYou"
category: "TOKENS"
tags: ["LLM token usage", "Token optimization", "Free AI plans", "Prompt design", "PDF to Markdown"]
primaryKeyword: "LLM token usage"
secondaryKeywords: ["reduce token usage", "LLM token optimization"]
banner: "/blog/reduce-llm-token-usage/banner.svg"
bannerAlt: "A token gauge with its needle in the red zone, token chips spilling out below it."
draft: false
---

**TL;DR:** High LLM token usage usually comes from what travels with your question: raw PDF pages, resent chat history, long system prompts, unused tool definitions, duplicate text and whole documents. Measure each part, fix the biggest one first, and you can often cut input by more than half without changing a single question.

Most people blame their questions when an AI plan runs out. In practice, the question is often the smallest thing in the request.

This guide shows where **LLM token usage** actually comes from, with numbers you can check. It covers six leaks, a fix for each, and a short audit to find out which ones hit you hardest. It's written for anyone on a free AI plan and for developers paying per token.

## Your question is the smallest part of the request

A typical request carries instructions, tool definitions, chat history and documents along with your question. Those extras often outweigh the question a hundred to one, so trimming them is where you **reduce token usage** fastest.

![Two stacked bars. As sent: question 80, system prompt 2,500, tool definitions 1,200, chat history 4,000, raw PDF pages 6,000, total 13,780 tokens. Trimmed: question 80, system prompt 900, tools 300, history summary 600, relevant Markdown sections 1,300, total 3,180 tokens.](/blog/reduce-llm-token-usage/request-anatomy.svg "Illustrative request. Your own numbers will differ, so measure them.")

A token is about four characters or three quarters of an English word, according to [Claude's pricing FAQ](https://platform.claude.com/docs/en/about-claude/pricing). An 80-token question is one or two sentences. Everything else in the bar above rides along on every single call.

One more surprise: token counts depend on the model. The same pricing page notes that Claude's newer tokenizer produces about 30% more tokens for the same text than the previous one. If you switched models and your usage jumped, that may be part of it.

## Leak 1: raw PDFs

PDFs are often the single biggest input. Many AI apps send each page as extracted text plus an image, and the image can cost more than the words on it.

![Two bars: text extraction only about 1,000 tokens, text plus page images about 7,000 tokens, for the same 3-page PDF.](/blog/reduce-llm-token-usage/pdf-modes.svg "Source: [Claude PDF support docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support), Amazon Bedrock section.")

Anthropic's PDF documentation puts numbers on it. A 3-page PDF read with text extraction alone uses about 1,000 tokens. Read with full visual understanding, where each page also goes in as an image, it uses about 7,000.

**Fix:** convert the PDF to Markdown and paste the text. Keep the PDF only for pages where a chart or photo holds the answer. The "Markdown vs Raw PDFs" post in this blog walks through the per-page math, and [MDify](/) does the conversion for free.

## Leak 2: chat history that grows every turn

Chat models don't remember earlier turns on their own. The app resends the whole conversation each time, so input grows with every message even if your questions stay short.

![Horizontal bars of input tokens per turn: turn 1 1,150, turn 4 2,650, turn 7 4,150, turn 10 5,650, almost five times turn 1.](/blog/reduce-llm-token-usage/history-growth.svg "Worked example: 1,000-token system prompt, 150-token questions, 350-token answers. Ten turns send 34,000 input tokens.")

In this example, ten short questions send 34,000 input tokens in total. Only 1,500 of those are the questions. The rest is the same instructions and earlier answers, sent again and again.

Long histories hurt quality too. Chroma's 2025 [context rot study](https://research.trychroma.com/context-rot) tested 18 models and found that performance dropped as input length grew, even well inside the context window.

**Fix:** start a new chat when the topic changes. If you need continuity, ask for a five-line summary and paste that into the new thread.

## Leak 3: oversized system prompts and tool definitions

Instructions and tool schemas are sent with every request. A prompt that grew by copy-paste over months can cost more than the work it describes, and tools you never call still cost tokens.

Tool use has its own overhead. Claude's [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) lists a hidden tool-use system prompt of roughly 286 to 675 tokens depending on the model, before your own tool names, descriptions and schemas are counted.

**Fix:** delete rules the model already follows without being told. Send only the tools this request can actually use. For the part that never changes, use prompt caching: a cache hit costs 10% of the normal input price, according to the [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). Caching lowers the price of those tokens, but trimming removes them.

## Leaks 4 to 6: duplicate text, chunking and whole documents

The last three leaks share one cause: sending text the model doesn't need. Repeated boilerplate, badly sized search chunks and full documents all add tokens without adding answers.

**Duplicate text.** Running headers, footers, page numbers and legal lines repeat on every page of a report. Strip them before sending. Converting to Markdown removes most of them automatically.

**Poor chunk sizes.** In search pipelines, chunks that are too large drag in paragraphs that don't answer the question. Overlap between chunks means the same sentences arrive twice. Chroma's [chunking evaluation](https://research.trychroma.com/evaluating-chunking) measured recall differences of up to 9% between strategies and tracked how many retrieved tokens were actually relevant.

**Whole documents.** Sending a 60-page manual to answer one question is the most expensive habit of all. Find the section first, then send only that.

![Six cards: raw PDFs, long chat history, oversized prompts, unused tools, duplicate text and whole documents, each with a one-line fix.](/blog/reduce-llm-token-usage/six-fixes.svg "The six leaks in this article and the first fix to try for each.")

## How to measure your own token usage

Log the token counts per request, split the input into its parts, and fix the largest part first. Most APIs return exact input and output counts, and a rough estimate is enough to rank the parts.

Here's a small Python helper that estimates each part with the four-characters rule and ranks them:

```python
def estimate_tokens(text):
    # Rough rule of thumb: about 4 characters per token in English.
    return max(1, round(len(text) / 4))

def token_report(parts):
    sizes = {name: estimate_tokens(text) for name, text in parts.items()}
    total = sum(sizes.values())
    for name, size in sorted(sizes.items(), key=lambda kv: -kv[1]):
        print(f"{name:<14}{size:>7,}  {size / total:6.1%}")
    print(f"{'total':<14}{total:>7,}")

# Save each part of one real request to a text file first.
token_report({
    name: open(f"{name}.txt", encoding="utf-8").read()
    for name in ["system", "history", "documents", "question"]
})
```

The estimate is rough on purpose. You're ranking the parts, not billing them. For exact numbers, read the usage block your API returns with each response.

![Flow of five steps: log usage, split by part, find the biggest, re-test answers, measure again.](/blog/reduce-llm-token-usage/audit-loop.svg "Run this once a month, or whenever usage jumps.")

Change one thing at a time and re-run the same test questions. If answers get worse, roll the change back. **LLM token optimization** is only worth it when the answers stay as good as before.

## A quick checklist for free AI plans

On a free plan, you control the input and little else. Convert documents, keep chats short and focused, and paste only what the question needs. Those three habits cover most of the waste.

| Habit                            | Why it helps                   |
|----------------------------------|--------------------------------|
| Convert PDFs to Markdown         | No page images, less noise     |
| New chat per topic               | No resent history              |
| Paste sections, not files        | Less text per question         |
| Use a compact output profile     | Fewer blank lines and dividers |

## Frequently Asked Questions

### Why is my LLM token usage so high?

Usually because of what's sent with your question, not the question itself. Raw PDFs, resent chat history, long instructions, unused tool definitions and whole documents often make up most of each request. Measure the parts to find your biggest one.

### Does chat history count toward my tokens?

Yes. Chat apps and APIs resend earlier messages with each new one so the model has context. A long conversation can cost several times more per question than a fresh one, so start new chats when the topic changes.

### How many tokens is a PDF page?

It depends on the app. As text, a 500-word page is roughly 667 tokens. If the app also sends the page as an image, add up to 1,568 tokens on standard models, or more on high-resolution ones. Anthropic's docs show a 3-page PDF going from about 1,000 to about 7,000 tokens with images.

### Does prompt caching reduce token usage?

It reduces the price, not the count. A cached prefix is still processed, but a cache hit costs 10% of the normal input price on Claude models. Trim what you don't need first, then cache what repeats.

### How can I reduce token usage on a free AI plan?

Convert long PDFs to Markdown, paste only the sections your question needs, and start a new chat for each topic. A compact output format trims a few more tokens. These habits let the same plan answer more questions.

### Is there a tool that shows how many tokens a document uses?

Yes. MDify shows an estimated token count for each converted file, using about four characters per token. Your AI provider's API also reports exact counts with every response.

Find your biggest leak with the [free converter](/), and read [how Markdown saves AI tokens](/usecase) for the full method.
