# 01. Style and Humanization Rules

Write like an engineer who has shipped this explaining it to a peer. Clear,
specific, opinionated where earned. These rules match the ones MDify's Privacy
Policy and Terms follow, so the whole product speaks with one voice.

`check.mjs` enforces the mechanical rules. The rest is on you.

## Structure

- Start the body with one **TL;DR** line: `**TL;DR:** ...`. Two or three
  sentences, self-contained. The Blog dialog shows it in its own card.
- Intro under 120 words. A strong angle in the first sentence and the thesis by
  the third. No throat-clearing ("In today's fast-paced world...").
- Every `##` section opens with a 25 to 40 word answer, then the detail.
- Paragraphs of 2 to 4 sentences. One idea per section.
- End with `## Frequently Asked Questions` (5 or 6 questions as `###`, each
  answered in 2 to 4 sentences) and a one-line call to action.
- Target 1,200 to 2,000 words. The dialog is a reading pane, not a book.

## Punctuation and voice

- **No em dashes.** Use a colon, a period, a comma or "and". Check: `grep -c "—"` is 0.
- **No semicolons** in prose. The `TL;DR` label is the only allowed one. Code
  blocks are exempt.
- Use contractions (you're, it's, don't, we'll).
- Active voice, present tense where true. Second person ("you") for the reader.
- Vary sentence length. Mix short punchy sentences with longer ones and never
  put three sentences of the same length in a row.
- Bold the primary and secondary keywords on their first natural use only. No
  forced keyword density.
- Give one real point of view per `##` section ("in practice", "here's what
  actually works").

## Banned vocabulary

Rewrite any of these. `check.mjs` flags them outside code blocks.

- **Words:** peril, fraught, thwart, dire, vibrant, bustling, essential, vital,
  crucial, soul, crucible, tapestry, landscape, pesky, reverberate, enhance,
  emphasise, delve, revolutionize, folks, foster, labyrinthine, labyrinth,
  remnant, nestled, symphony, gossamer, enigma, metamorphosis, indelible,
  embark, navigate, navigating, mastering, elevate, unleash, harness,
  meticulous, meticulously, complexities, realm, tailored, underpins,
  everchanging, ever-evolving, daunting, amongst, robust, seamless, seamlessly,
  leverage, unlock, game-changer, revolutionary, cutting-edge, firstly,
  moreover, furthermore, additionally, consequently, nonetheless, notably,
  essentially, subsequently, arguably, ultimately.
- **Phrases:** "in today's world", "at the end of the day", "needless to say",
  "it's worth noting", "that being said", "it is advisable", "when it comes
  to", "in conclusion", "in order to", "not only... but also".

## Accuracy (hard rules)

- Every statistic gets a named source and a link where it's used, dated 2024 to 2026.
- Never fabricate quotes, benchmarks, statistics, authors or token savings.
- Frame token or size figures as **examples or estimates**. They depend on the
  document and the tokenizer.
- Describe only features that exist. Check `03-BRAND-ENTITY.md` and the code.
- The author is `DevBehindYou` unless a real, named person wrote the piece.

## Final pass

1. Run `node MDify-Blog-Generation-Pipeline/check.mjs frontend/content/blog/{slug}.md`
   and fix every error. Review each warning.
2. Read the article aloud once. Anything you stumble over, rewrite.
