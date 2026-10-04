---
title: "How to Cut LLM API Costs by 50% Without Losing Quality"
slug: "reduce-llm-api-costs"
description: "Reduce LLM API costs without hurting quality: batch async work, cache repeated prompts, shrink documents, route easy requests and cap output. With real prices."
excerpt: "Switching to a cheaper model is the least interesting way to save money on LLM APIs. Here are seven levers that cut waste instead, with the math behind each one."
date: "2026-10-03"
author: "DevBehindYou"
category: "COST"
tags: ["LLM API costs", "Prompt caching", "Batch API", "Model routing", "Cost optimization"]
primaryKeyword: "reduce LLM API costs"
secondaryKeywords: ["LLM cost optimization", "AI API cost reduction"]
banner: "/blog/reduce-llm-api-costs/banner.svg"
bannerAlt: "An API invoice with input, output, retries and tools lines, stamped minus 50 percent."
draft: false
---

**TL;DR:** You can often **reduce LLM API costs** by half or more without touching quality. Batch anything that can wait (50% off) and cache prompts that repeat (cache hits cost 10% of normal input). Then convert documents to Markdown, cap output length and route simple requests to a smaller model. Measure answer quality before and after every change.

Most cost advice starts and ends with "use a cheaper model". That's one lever out of seven, and often not the biggest.

This guide treats **LLM cost optimization** as an engineering problem: find the waste in each request and remove it. Every number below comes from a published price list or paper, linked where it's used. Prices are the list prices on 3 October 2026, so check your provider's page before you plan a budget.

## Where an LLM bill actually comes from

Every request costs input tokens times the input price, plus output tokens times the output price, times the number of calls. Each of those five factors is a lever, and output is the most expensive one per token.

![Bars of list prices per million tokens: Haiku 4.5 input 1 dollar, output 5 dollars. Sonnet 5.5 input 2, output 10. Opus 5.5 input 4, output 20.](/blog/reduce-llm-api-costs/output-price.svg "Source: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), list prices on 3 October 2026.")

On current Claude models, output tokens cost five times as much as input tokens, according to Anthropic's [pricing page](https://platform.claude.com/docs/en/about-claude/pricing). A rambling 1,000-token answer costs as much as 5,000 tokens of input.

The bill formula also explains why cheaper models alone don't fix things. If each request carries three times the tokens it needs, a model at half the price still costs you 50% more than necessary. Cut the waste first, then pick the model.

## Lever 1: batch anything that can wait

Batch APIs process requests asynchronously at half the normal price, for both input and output. If nobody is waiting on the answer in real time, there's rarely a reason to pay full price.

Anthropic's [batch processing docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing) describe a 50% discount, with most batches finishing in under an hour. Good candidates are nightly summaries, document classification, evaluation runs, data extraction and content tagging.

This is the cleanest 50% you'll find. It doesn't change the prompt, the model or the output. It only changes when you get the answer.

## Lever 2: cache what repeats

Prompt caching stores a repeated prefix, such as a long system prompt or a reference document. Later requests read it from cache at a fraction of the normal input price.

![Bars: a 10,000-token prompt sent 10 times costs 100,000 token-equivalents without caching and 21,500 with caching, 78% less.](/blog/reduce-llm-api-costs/cache-math.svg "Source: [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). 5-minute cache: writes at 1.25x, hits at 0.1x the base input price.")

On Claude, writing to the 5-minute cache costs 1.25 times the normal input price, and each cache hit costs 0.1 times, per the [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). That means caching pays for itself after a single reuse.

The catch is structure. Caching works on the start of the prompt, so put the stable parts first (instructions, tool definitions, reference text) and the changing parts last (the user's question). Reorder a messy prompt and the savings follow.

## Lever 3: shrink documents before they reach the model

Documents are often the largest part of the input. Converting PDFs to Markdown and sending only the relevant sections can cut that part by most of its size.

Many AI apps read a PDF page as extracted text plus an image of the page. In MDify's worked example, a 500-word page costs about 2,235 tokens that way and about 667 as Markdown, roughly 70% less. The image token rules behind that figure come from Claude's [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision), which charge one token per 28 x 28 pixel patch of each page image.

Then go further. Don't send the whole document. Send the sections that answer the question. A retrieval step that picks six relevant chunks out of a 100-page report sends about 1% of the original. [MDify](/) handles the conversion for free, including scanned pages.

## Lever 4: route easy requests to a smaller model

Many requests don't need your most capable model. Routing simple ones to a cheaper model saves money on every one of them, as long as you check that quality holds.

On the same pricing page, Claude Haiku 4.5 costs $1 per million input tokens and Claude Opus 5.5 costs $4. Classification, extraction and short rewrites often run fine on the smaller model.

Research backs this up. The [RouteLLM](https://arxiv.org/abs/2406.18665) paper (2024, published at ICLR 2025) trained routers that decide per query whether the strong or the weak model should answer. On public benchmarks they cut costs by more than 2x without sacrificing response quality.

## Lever 5: cap and shape the output

Since output costs five times input, long answers are expensive. Set a maximum output length, ask for the format you need, and stop the model explaining what it's about to do.

In practice, this is the easiest change to ship. Ask for JSON instead of prose when a program reads the answer. Ask for three bullet points instead of "a summary". Set `max_tokens` close to what a good answer needs, not the model's maximum.

## Levers 6 and 7: compress prompts, and skip calls you don't need

Prompt compression removes low-value tokens from long inputs before sending them. Skipping calls means answering from code or a stored result when the model adds nothing.

[LLMLingua-2](https://aclanthology.org/2024.findings-acl.57/) (Findings of ACL 2024) compressed prompts 2x to 5x and cut end-to-end latency by 1.6x to 2.9x on its benchmarks. Test it on your own tasks, because aggressive compression can drop details your task depends on.

The cheapest call is the one you never make. Exact-match questions ("what's our refund window?") can be answered from a stored response. Formatting, date math and validation belong in code, not in a prompt.

![Six cards: batch what can wait minus 50%, cache what repeats 0.1x, shrink documents minus 70%, route easy requests more than 2x, cap the output 5x, compress prompts 2 to 5x.](/blog/reduce-llm-api-costs/seven-levers.svg "Batch and caching: Claude docs. 70%: MDify's worked example. Routing: RouteLLM. Compression: LLMLingua-2.")

## Putting it together: one request, five changes

Stacking the levers multiplies their effect. In this example, a document question on Sonnet 5.5 drops from 5.88 cents to 1.90 cents, about 68% less, and to 0.95 cents if it can run as a batch.

![Bars of cost per request: baseline 5.88 cents, PDF converted to Markdown 2.74, system prompt cached 2.20, output capped 1.90 which is minus 68%, Batch API 0.95 which is minus 84%.](/blog/reduce-llm-api-costs/worked-example.svg "Illustration on Sonnet 5.5 list prices ($2 input, $10 output per million tokens). The cache write cost is left out for simplicity.")

Here are the assumptions, so you can redo the math with your own numbers. The request has a 3,000-token system prompt, 10 PDF pages at 2,235 tokens each, a 50-token question and an 800-token answer.

| Step                       | Input tokens | Output | Cost   |
|----------------------------|-------------:|-------:|-------:|
| Baseline                   |       25,400 |    800 | 5.88¢  |
| PDF as Markdown            |        9,720 |    800 | 2.74¢  |
| Prompt cached (as billed)  |        7,020 |    800 | 2.20¢  |
| Output capped              |        7,020 |    500 | 1.90¢  |
| Batch API                  |        7,020 |    500 | 0.95¢  |

The cached row counts the 3,000-token prompt at 10% of the input price. Anthropic's pricing page confirms the caching and batch discounts stack.

## What not to cut

Cut waste, not context the model needs. Every change should pass the same quality test as the version before it, or it isn't a saving.

![Flow: build a test set of 30 to 50 real questions, record a baseline, change one lever, re-run the test set, keep or roll back.](/blog/reduce-llm-api-costs/safe-loop.svg "Change one lever at a time so you know which one moved quality.")

Keep a test set of real questions with known good answers. Record cost and quality before any change. Change one thing, re-run, compare. Roll back anything that makes answers worse, even if it's cheaper. That discipline is what makes **AI API cost reduction** safe to ship.

## Frequently Asked Questions

### What's the fastest way to reduce LLM API costs?

Batch any work that doesn't need an instant answer, which halves the price on providers that offer it. Then cache your stable system prompt so repeat requests pay 10% for that part. Neither change touches the prompt content or the model.

### Does prompt caching affect output quality?

No. The model processes the same prompt either way. Caching only changes how the repeated prefix is billed and how fast it's processed. You do need the stable part of the prompt at the start for the cache to match.

### Is switching to a cheaper model enough?

Rarely on its own. If requests carry far more tokens than they need, a cheaper model still bills you for all of them. Remove waste first, then route the requests that a smaller model handles well.

### Why do output tokens cost more than input tokens?

Providers price them higher because generating text takes more compute than reading it. On current Claude models output costs five times input. That's why capping answer length and asking for compact formats saves real money.

### How much can converting PDFs to Markdown save?

It depends on how the AI app reads PDFs. When it sends page images along with the text, a 500-word page drops from about 2,235 to about 667 tokens in MDify's example, roughly 70%. Apps that send only extracted text save less, but still get cleaner input.

### Do these tips help on free AI plans too?

Yes, the input-side ones do. On a free plan you can't batch or cache, but converting documents and sending only the sections you need makes each message smaller, so the plan's allowance lasts longer.

Shrink your documents with the [free converter](/), and see [the token math behind Markdown](/usecase).
