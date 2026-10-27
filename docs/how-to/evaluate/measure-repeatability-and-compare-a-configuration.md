---
title: 'How to Measure Repeatability and Compare One Configuration with TEA'
description: Ask Evaluate to analyze saved Test Design records offline or prepare a bounded configuration experiment
---

# How to Measure Repeatability and Compare One Configuration with TEA

**Bottom line:** Use this guide to analyze supported saved Test Design records without rerunning the target or making model or judge calls. Ask Evaluate to report what the existing evidence establishes and what remains unknown. Fresh repeatability or a one-configuration comparison is a separate opt-in request with capability, approval, and budget gates. It does not automatically change defaults or accept a baseline.

> TEA, use Evaluate to check how consistent the saved results from my latest Test Design evaluation are. Use only existing records. Do not rerun anything or make model calls. Tell me what the evidence can and cannot establish.

Give Evaluate the saved-run path or the folder to search when it cannot infer one from your evaluation. Evaluate finds the latest compatible Test Design records, names the selected files, prepares the reader inputs and writes a report. You do not need to prepare JSON or copy provenance fields.

## Read the Saved Evidence

The supported route reads native Test Design retained attempts, legacy reader directories and the new experiment directories. It verifies existing manifests and preserves the original files. It makes no model call, fresh trial or judge call. Deterministic scorer replay reads saved document bytes only.

The report separates metric spread and target variability from native recorded stability and scorer replay. A scorer agreeing with itself twice on fixed bytes establishes deterministic replay. Missing diagnostic, input identity, cost or latency stays unknown. Without recorded success thresholds, the report gives descriptive counts and spread; it supplies no new quality pass threshold.

The installed CLI is `tea-evaluate experiment`; Evaluate handles the mechanics for you. Detailed inputs, flags and limitations live in the [reader reference](/docs/reference/configuration-experiment-reader.md#the-opt-in-evaluate-controller). Maintainers can run the separate [historical fixture walkthrough](/docs/reference/configuration-experiment-fixtures.md). Those fixtures reuse documents and handwritten metadata; their numbers establish no measured improvement.

## Ask for One Configuration Change

> TEA, use Evaluate to compare Test Design at medium versus high reasoning effort on the same model, keeping everything else fixed. Handle the files and evidence capture. Before any live runs, show me the extra runs, time, and cost estimate, and ask me to approve the budget and what counts as good enough. Do not change defaults or accept a baseline.

Evaluate checks support and feasibility first. Current Claude and Codex execution cannot prove applied reasoning effort or enforce a verified all-in money cap. Codex also lacks verified money telemetry. Evaluate reports these blockers and dispatches zero live attempts. A requested setting supplies no proof that the provider applied it, and subscription access supplies no verified zero-dollar cap.

The native Test Design corpus has two independent cases. Selection needs two independent clusters, leaving no unseen cases for confirmation. More repetitions improve observations of those same cases; they cannot support a confirmed recommendation. This release adds no cases.

For a supported execution mechanism, Evaluate proposes the outcome, thresholds, critical failures, useful savings or latency limits, scope, repeats, retries, elapsed estimate and verified spending cap together. Approval binds the exact frozen plan, including confirmation and overhead. Comparing configurations grants no spending or adoption authority by itself.

## Ask for Fresh Repeatability

> TEA, use Evaluate to run a fresh repeatability experiment for Test Design. Handle the files. Show me the full attempt, time and verified money bounds and ask for approval before dispatch.

Fresh experiments have the same capability and approval gates. “Is it repeatable?” prompts a choice between saved-record analysis and fresh runs before anything executes.

## What Changes in an Experiment

Normal Evaluate keeps its current runtime and workflow. Its native clean/mutated trials exercise evaluation cases. This opt-in route examines consistency of a fixed configuration or the effect of one configuration change. It adds no work after an ordinary result.

Reports remain advisory. Reader outcomes and gates remain distinct, including blocked, rejected, inconclusive and selection-cleared. Baseline acceptance, defaults and production configuration retain their own explicit authority. No experiment automatically adopts a recommendation.

The opt-in controller currently captures and seals per-attempt source records for labeled deterministic process doubles. The shipped integration tests place these doubles at the external agent boundary. They exercise the real controller, native runner, retention, replay and reader without paid calls. They establish capture and accounting behavior. Live provider quality and savings remain unverified.
