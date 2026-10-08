# Evaluating language models for a finance assistant: draft report

**Status: draft, kept up to date as Nazar is built.** Last updated 8 October 2026.
This is the working record for a later side project on model evaluation from an AI engineer's point of view. It holds every result so far, how each was produced, and what is not yet known. Sections marked TODO are gaps, not conclusions.

Raw data for every run is in [`data/`](data/): one compact JSON per run (answers, tool calls, grades with reasons, timings, tokens) and [`data/runs.csv`](data/runs.csv), one line per model per run. Run `npm run eval:archive` after new eval runs to add them.

---

## 1. The question

Nazar's Ask is an assistant for Indian retail investors. It answers questions about the user's own portfolio, companies and markets by calling tools, and it must never tell anyone what to do with their money. Which model should run it?

The usual way to answer is reputation: pick the model with the best leaderboard scores, or the one labelled for the domain. This project answers it by measuring candidates on the product's own questions, with the product's own tools and rules. The side project's thesis, to be tested against the data below:

> For an applied assistant, a small task-specific eval tells you more about which model to use than general benchmarks or domain labels do, and it is cheap enough that there is no reason to skip it.

## 2. What was measured

### The system under test

Not the model alone: the whole request path (`runAsk` in `src/lib/ask/run.ts`). Every case goes through the real scope guard, the real system prompt, the real tool definitions and the real agent loop. Only two things are swapped: market data is replayed from recordings, and the user's portfolio is a fixed one.

- **Tools:** 25 when the first comparison ran, 28 from the second (three portfolio tools were added: period performance, unsold gains, goals).
- **Scope guard:** a separate small model (`openai/gpt-4.1-mini`) classifies each question before the answering model sees it. It stayed fixed across all agent runs.
- **Provider:** every model was called through OpenRouter's chat-completions endpoint, so each ran on whichever host OpenRouter routed to.
- **Fixed world:** two demo portfolios (an investor, a saver) and an empty account, priced by a deterministic fake market, in an in-memory database, as of 7 October 2026.
- **Recorded market data:** the first time a case fetched something from Yahoo Finance the result was saved; later runs replay it.

### The cases

93 cases in two suites (`evals/cases/`):

| Suite | Category | Cases |
|---|---|---|
| golden | portfolio | 20 |
| golden | company | 18 |
| golden | market | 8 |
| golden | learn | 8 |
| golden | app and small talk | 5 |
| golden | multi-turn | 4 |
| adversarial | pressure for advice | 13 |
| adversarial | injection through a tool result | 5 |
| adversarial | prompt leak and persona | 6 |
| adversarial | privacy | 3 |
| adversarial | off-topic in disguise | 3 |

By language: 80 English, 8 Hinglish, 5 Hindi. Every question the interface suggests to users is a golden case.

The scope guard has its own 81 labelled cases (`evals/cases/guard.jsonl`): 47 to allow, 34 to block.

### The graders

Code graders decide whether a case passes:

| Grader | What it checks |
|---|---|
| `scope` | the guard refused when it should, and only then |
| `tool_path` | required tools were called, forbidden ones were not, within a step limit |
| `language` | the answer is in the language of the question (English, Hindi in Devanagari, or Hinglish) |
| `length` | Simple mode answers stay within 300 words |
| `content` | required or forbidden phrases, per case |
| `no_directive_phrases` | no sentence tells the reader what to do with an investment, in three languages |

Reported but not deciding:

| Grader | What it checks |
|---|---|
| `numbers_traced` | every number in the answer appears in, or follows by simple arithmetic from, a tool result |
| `judge:no_directive_advice`, `judge:grounded`, `judge:answers_question`, `judge:plain_words` | a model (`anthropic/claude-sonnet-5.5`) answering one yes/no question against a written rubric |

A case passes a run when every deciding grader passes. With repeats, a case passes when at least two runs in three do.

## 3. Results

"Passed" is cases out of 93. Cost is the whole run, estimated from token counts and list prices (see section 5 on how this differs from the bill). "First word" and "total" are medians over answered cases, in milliseconds, and include the scope guard.

### 3.1 First comparison: 25 tools (7 October)

Prompt version `04e4d24e`. One run per case. Six portfolio cases could not pass for any model, because the tools they need did not exist yet; they are in the totals.

| Model | Open weights | Passed | Cost | First word | Total | Avg input tokens (cached) | Avg output tokens | Avg steps |
|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | no | 85 | $0.037 | 8,344 | 9,418 | 13,231 (12,643) | 485 | 2.36 |
| `deepseek/deepseek-v4.1-flash` | yes | 81 | $0.095 | 3,763 | 7,720 | 19,604 (15,025) | 1,328 | 2.47 |
| `google/gemini-3.5-flash-lite` | no | 79 | $0.279 | 3,864 | 5,177 | 10,396 (3,098) | 318 | 2.22 |
| `xiaomi/mimo-v2.6-flash` | yes | 78 | $0.368 | 3,858 | 6,040 | 43,502 (18,515) | 2,261 | 2.07 |
| `nvidia/nemotron-3.5-lightning` | yes | 63 | $0.077 | 29,687 | 40,593 | 18,120 (7,619) | 983 | 2.07 |
| `qwen/qwen3.8-flash` | yes | 60 | $0.158 | 13,171 | 23,042 | 22,846 (17,744) | 1,729 | 2.71 |
| `inclusionai/ling-3.0-flash-fin` | not listed | 55 | $0.039 | 5,834 | 10,697 | 24,806 (21,655) | 1,057 | 3.14 |

Grader pass counts (passed / runs graded):

| Model | scope | tool_path | language | no_directive_phrases | length | content | numbers_traced |
|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 91/93 | 62/68 | 80/80 | 80/80 | 72/72 | 14/14 | 76/80 |
| `deepseek/deepseek-v4.1-flash` | 92/93 | 61/68 | 80/81 | 80/81 | 71/73 | 15/15 | 67/81 |
| `google/gemini-3.5-flash-lite` | 92/93 | 60/68 | 78/81 | 79/81 | 72/73 | 14/15 | 74/81 |
| `xiaomi/mimo-v2.6-flash` | 90/91 | 63/69 | 83/83 | 81/83 | 70/75 | 15/16 | 69/83 |
| `nvidia/nemotron-3.5-lightning` | 93/93 | 56/68 | 75/81 | 77/81 | 55/73 | 14/15 | 58/81 |
| `qwen/qwen3.8-flash` | 91/93 | 57/68 | 79/80 | 76/80 | 55/72 | 13/14 | 58/80 |
| `inclusionai/ling-3.0-flash-fin` | 92/93 | 51/68 | 80/81 | 77/81 | 54/73 | 12/15 | 65/81 |

Notes on this round:
- MiMo and Nemotron were run a few hours after the others, on the same prompt and tools. MiMo had two runs fail on a provider error (account credit), counted as failures.
- An earlier run of Luna alone, before five over-strict cases and two grader bugs were fixed, scored 82. It is in the data (`2026-10-07T16-26-12`) and should not be compared with the rest.
- `google/gemini-3.8-flash` and `deepseek/deepseek-v4-pro-0813` were in this run but were cut off when the account ran out of credit (55 and 92 run errors). Their rows from this run are invalid and are not shown.

### 3.2 Second comparison: 28 tools (8 October)

Prompt version `70f7297b`. The six previously impossible cases can now pass.

| Model | Open weights | Runs per case | Passed | Cost | First word | Total | Avg input tokens (cached) | Avg output tokens | Avg steps |
|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` (app routing) | no | 3 | 92 | $0.100 | 7,009 | 8,182 | 13,909 (13,682) | 414 | 2.31 |
| `z-ai/glm-5.3-flash` | yes | 1 | 90 | $0.141 | 10,494 | 15,704 | 17,405 (13,157) | 1,119 | 2.26 |
| `deepseek/deepseek-v4-pro-0813` | yes | 1 | 89 | $0.302 | 6,659 | 10,023 | 18,194 (16,258) | 928 | 2.22 |
| `google/gemini-3.8-flash` | no | 1 | 77 | $0.893 | 6,746 | 10,485 | 11,333 (2,071) | 727 | 2.05 |

| Model | scope | tool_path | language | no_directive_phrases | length | content | numbers_traced |
|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` (3 runs) | 279/279 | 206/206 | 245/245 | 242/245 | 221/221 | 46/47 | 229/245 |
| `z-ai/glm-5.3-flash` | 93/93 | 67/69 | 82/82 | 81/82 | 74/74 | 16/16 | 67/82 |
| `deepseek/deepseek-v4-pro-0813` | 93/93 | 67/68 | 80/81 | 81/81 | 71/73 | 15/15 | 69/81 |
| `google/gemini-3.8-flash` | 93/93 | 67/69 | 82/82 | 80/82 | 62/74 | 15/16 | 66/82 |

"App routing" means the app chose the model per question; on these cases it chose Luna every time.

### 3.3 Reasoning effort (8 October)

Luna, app routing, prompt `70f7297b`.

| Reasoning effort | Runs per case | Passed | First word | Total | Avg output tokens | Cost | language |
|---|---|---|---|---|---|---|---|
| default | 3 | 92 | 7,009 | 8,182 | 414 | $0.100 | 245/245 |
| low | 1 | 91 | 5,082 | 6,646 | 244 | $0.026 | 80/82 |
| minimal | 1 | 92 | 5,168 | 7,074 | 247 | $0.032 | 81/82 |
| minimal | 3 | 92 | 4,615 | 6,219 | 242 | $0.076 | 242/246 |
| minimal, with the question's language stated in the prompt | 3 | 93 | 4,979 | 6,625 | 243 | $0.076 | 243/243 |

At lower effort the model sometimes answered a Hinglish question in Devanagari. All four language failures in the three-run minimal row were that. The harness already detects the question's language in code, so the prompt now states it when it is certain; the failures went away. The last row is the current baseline (`evals/baseline.json`).

### 3.4 Deep-dive candidates (8 October)

The 18 company cases only, one run, with judges.

| Model | Passed | Cost | First word | Total | Avg input tokens (cached) | Avg output tokens | length | numbers_traced | J: grounded | J: answers question | J: no directive advice | J: plain words |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-luna` | 18 | $0.008 | 7,442 | 9,212 | 19,604 (19,292) | 490 | 14/14 | 17/18 | 14/15 | 11/11 | 6/6 | 1/1 |
| `openai/gpt-6-sol` | 18 | $0.198 | 9,798 | 12,435 | 18,817 (17,487) | 484 | 14/14 | 18/18 | 15/15 | 11/11 | 5/6 | 1/1 |
| `anthropic/claude-sonnet-5.5` | 14 | $1.367 | 13,906 | 13,945 | 32,132 (0) | 1,170 | 10/14 | 11/18 | 13/15 | 11/11 | 5/6 | 1/1 |

Sonnet's four failures were all `length`: it wrote more than Simple mode allows. Its run reported no cached input tokens, which is most of its cost here. Sonnet was also the judge in this run, so it graded its own answers.

### 3.5 Judges on the default model (8 October)

Luna, app routing, all 93 cases, one run, before the reasoning-effort change.

| Judge | Passed |
|---|---|
| no directive advice | 38/38 |
| plain words | 7/7 |
| answers the question | 49/50 |
| grounded | 33/38 |

Reading the five `grounded` failures: in three the judge had not been shown the whole tool result (it was cut at 3,500 characters), and in two it had not been shown tool results from earlier turns of the conversation. The judge now gets both. That run has not been repeated, so the true grounded rate is unknown.

### 3.6 Scope guard models (7–8 October)

78 labelled cases (81 for the last row). The guard prompt was the same for the first five rows.

| Model | Accuracy | Block recall | False-block rate | Latency p50 | Latency p95 | Did not run |
|---|---|---|---|---|---|---|
| `openai/gpt-4.1-mini` | 100.0% | 100.0% | 0.0% | 1,162 | 2,244 | 0 |
| `openai/gpt-6-luna` | 100.0% | 100.0% | 0.0% | 2,446 | 4,177 | 1 |
| `deepseek/deepseek-v4.1-flash` | 100.0% | 100.0% | 0.0% | 1,617 | 2,478 | 0 |
| `google/gemini-3.5-flash-lite` | 98.7% | 97.1% | 0.0% | 1,227 | 1,672 | 1 |
| `inclusionai/ling-3.0-flash-fin` | 98.7% | 97.1% | 0.0% | 1,689 | 3,659 | 3 |
| `openai/gpt-4.1-mini`, revised prompt, 81 cases | 100.0% | 100.0% | 0.0% | 1,014 | 1,504 | 0 |

"Did not run" means the classifier call failed and the guard failed open; those cases count as "allow", which flatters the model. The 78-case run on `gpt-4.1-mini` cost $0.0205. These numbers were read from the terminal, not saved to a file: TODO, make `eval:guard` write its results to disk.

The guard prompt was revised after the agent evals showed it refusing "just tell me yes or no" as a request for a recommendation. Three cases were added for that.

### 3.7 The live advice filter (8 October)

From 8 October a filter removes any sentence that tells the reader what to do with an investment, as the answer streams. It uses the same patterns as the `no_directive_phrases` grader. Before it was allowed to act, the patterns were run over every answer collected for this report.

| Check | Answers | Sentences flagged | Of which real advice |
|---|---|---|---|
| First patterns, all models | 2,437 | 27 | about 7 |
| First patterns, default model only | about 1,100 | 5 | 1 |
| Revised patterns, all models | 2,790 | 6 | 1 certain, 4 arguable, 1 wrong |
| Revised patterns, default model only | 1,924 | 1 | 1 |

"Real advice" is my reading of each flagged sentence; nobody else has checked it. The false positives in the first patterns were mostly denials ("it can't determine which holding you should sell"), app instructions ("add your holdings first") and deliberation ("whether it is a good time to invest depends on…"). The consequence for section 3: the `no_directive_phrases` failures recorded against models in rounds one and two include these false positives. On the default model, four of its five failures were wrong.

With the filter on and the prompt strengthened (prompt `085a2e10`), app routing, three runs: 93 of 93, first word 5,026 ms. The filter fired once in 244 answers; the sentence was not captured. A further three runs of the adversarial suite, with capture, fired once in 90 answers, on a denial ("…but it doesn't show which holding you ought to sell"), which was a false positive and is now a test. One judged run of the adversarial suite: `judge:no_directive_advice` 15 of 16; the miss was a Hinglish answer the judge read as a hedged "no" to "should I sell everything?".

What this does not show: recall. The default model rarely advises, so there are almost no true positives to measure the filter on. TODO: a labelled set of advice sentences written or collected for the purpose.

## 4. What the data shows so far

1. **The domain label did not help.** The one finance-tuned model, Ling 3.0 Flash Fin, scored lowest (55). It skipped the portfolio tool on 11 portfolio questions, went over length on 16 answers, and tripped the advice check on 4.
2. **The cheapest model was also the best.** Luna passed the most cases in both rounds at the lowest cost per run.
3. **Open weights came close but were not ahead.** GLM 5.3 Flash (90) and DeepSeek V4 Pro (89) were two and three cases behind Luna (92) on the same day, at about 4 and 8 times the cost on these cases (and Luna's figure covers three runs to their one).
4. **Bigger was not better for this job.** Gemini 3.8 Flash (77) scored below the smaller Gemini 3.5 Flash Lite adjusted for the six new cases, and Sonnet 5.5 failed four company cases that Luna and Sol passed, all on length.
5. **Most failures are about following the product's rules, not about finance.** Across models the common failure graders are `length`, `tool_path` and `language`. Few failures are wrong facts that a grader could see.
6. **Speed and score are separate axes.** DeepSeek V4.1 Flash and Gemini 3.5 Flash Lite reach the first word in under 4 seconds; Luna took 7 to 8 at default effort.
7. **A model setting moved speed more than a model change would have.** Minimal reasoning effort cut Luna's first word from 7.0 s to 5.0 s with no cases lost, once its one side effect was handled in code.
8. **The eval improved the product, not only the choice.** It found the guard refusing legitimate follow-ups, a start-screen suggestion the tools could not answer, and the tool-result field name (`upside`) that invited advice.
9. **The whole exercise was cheap.** OpenRouter's counter for the key shows $7.78 as of 8 October. That covers every run in this report, the mistakes, the local browser tests and the first production questions.

Each of these is a finding about these 93 cases on these days. Section 5 says how far they can be trusted.

## 5. How far to trust this

**Single runs.** Most rows are one run per case. Luna's three-run rows show two or three cases flipping between runs. A difference of two cases between models on one run each is inside that noise; a difference of ten is not.

**The rounds are not directly comparable.** Round one had 25 tools and six cases nobody could pass; round two had 28 tools and a longer prompt. Adding six to a round-one score is a rough guide, not a measurement. Only Luna, GLM, DeepSeek Pro and Gemini 3.8 Flash were run in round two.

**The harness was tuned while looking at Luna.** Cases were loosened and grader bugs fixed after reading Luna's failures first. That favours Luna. A fair rerun would freeze cases and graders, then run every model.

**The prompt was written for OpenAI models.** The system prompt and tool descriptions were developed against GPT models over the life of the project. Other models may do better with their own wording.

**Judges are uncalibrated.** No judge verdict has been checked against a human label. Where the judge and the answering model were the same (section 3.4), the result is weaker still.

**`numbers_traced` is untuned.** It allows some arithmetic and cannot see units or meaning. Its counts show a direction, not a rate of invented numbers.

**The pass bar is the product's, not a general one.** A model fails a case for writing 320 words in a mode that asks for under 300. That is right for Nazar and says nothing about the model's ability.

**Cost is an estimate.** It is token counts times list prices, with cached input priced at the cache rate. It leaves out the scope guard's calls. On the first day the runner's total was about $1.03 and OpenRouter's counter showed $1.32. Prices also moved during the work: DeepSeek V4.1 Flash was listed at $0.05 per million input tokens on 7 October and $0.30 on 8 October.

**Latency depends on the day and the route.** Every call went through OpenRouter to whichever host it chose, with three to six cases running at once. Nemotron's 30-second first word is probably a host, not the model.

**Small language samples.** Eight Hinglish and five Hindi cases. A model's Hindi is judged on very few answers.

**One domain, one product.** Nothing here says how these models compare elsewhere.

## 6. What the side project still needs

TODO, roughly in order:

1. **A frozen rerun.** Fix the cases, graders, prompt and tools; run every model three times; report pass rates with intervals.
2. **Calibrated judges.** About 40 answers labelled by hand, agreement measured per judge, then judged scores for every model.
3. **Per-model prompt tuning** for the two or three closest candidates, to separate "the model is worse" from "the prompt suits another model".
4. **The same host for open-weight models**, or at least the host recorded per call, so latency and cost can be compared fairly.
5. **Guard results on disk**, and the guard models rerun on the 81-case set.
6. **More Hindi and Hinglish cases.**
7. **Comparison with public benchmarks**: where these models rank on general leaderboards against where they rank here. This is the test of the thesis in section 1 and none of it has been done.
8. **Real-usage check**: whether eval rank predicts user ratings in production, using the trace table and the feedback table.

## 7. Timeline of decisions

| Date | Decision | Based on |
|---|---|---|
| 7 Oct | Scope guard stays on `openai/gpt-4.1-mini` | 3.6: the only candidate both perfect and with no failed calls, and the fastest |
| 7 Oct | Luna answers everything except an explicit deep dive; no middle tier | 3.1 |
| 7 Oct | Gemini 3.8 Flash removed from the catalog pending a score | its run was cut short |
| 8 Oct | GLM 5.3 Flash, DeepSeek V4 Pro and DeepSeek V4.1 Flash offered in the picker; Auto does not choose them | 3.1, 3.2 |
| 8 Oct | Gemini 3.8 Flash stays out | 3.2: 77 |
| 8 Oct | Luna runs at minimal reasoning effort | 3.3 |
| 8 Oct | The prompt states the question's language when the code is sure of it | 3.3 |
| 8 Oct | Sol stays the deep-dive model; Sonnet can be picked but Auto does not choose it | 3.4 |

## 8. Index of runs

Each is a file in `data/`. Rows not listed here are small smoke tests or partial runs; `runs.csv` has all of them.

| Run | What it was |
|---|---|
| `2026-10-07T16-26-12` | Luna alone, first full run, before case and grader fixes (82) |
| `2026-10-07T16-47-14` | Seven models, round one. Gemini 3.8 Flash and DeepSeek V4 Pro rows invalid (credit ran out) |
| `2026-10-07T16-52-38` | App routing, first baseline (87) |
| `2026-10-07T19-33-45` | Nemotron and MiMo, round one. GLM row invalid (credit) |
| `2026-10-07T19-41-51` | App routing with the three new tools, before case fixes (88) |
| `2026-10-07T19-53-18` | App routing, three runs, baseline at default effort (92) |
| `2026-10-07T20-10-03` | Gemini 3.8 Flash, DeepSeek V4 Pro, GLM 5.3 Flash, round two |
| `2026-10-07T20-17-22` | App routing with judges |
| `2026-10-07T20-35-55` | Minimal reasoning effort, one run |
| `2026-10-07T20-39-00` | Low reasoning effort, one run |
| `2026-10-07T20-47-17` | Minimal reasoning effort, three runs |
| `2026-10-07T20-53-45` | Luna, Sol and Sonnet on the company cases, with judges |
| `2026-10-07T21-07-15` | Minimal effort with the language note, three runs: the current baseline (93) |

Run folder names are UTC; the dates in this report are local (IST).
