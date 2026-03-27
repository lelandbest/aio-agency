# AIO Agents Run-Driven Standard

This document locks the AIO Agents command/detail pattern as the required frontend standard.

## Core Rule

`activeRun` is the UI.

Everything else is transport.

## Required Flow

1. Submit command through `/api/ai/command`.
2. Use the command response only to read `run_id` or `run.id`.
3. Fetch the canonical run through `GET /api/ai/run/{run_id}`.
4. Store the projected canonical run in `activeRun`.
5. Render command/detail UI from `activeRun`.

## Rendering Rules

If `activeRun` exists, render from it only:

- output/result
- status
- error state
- timestamps
- delegate chain
- agent label/rank context
- run metadata shown in the detail surface

Direct command response data must not be used for final rendering once a run id exists.

## Fallback Rule

`normalizeAgentResponse(response)` is allowed only when:

- no canonical run id exists
- no canonical run was loaded

It is not allowed to override canonical run output.

## Message Flow

The message flow must be:

1. append user message
2. append pending assistant placeholder
3. fetch canonical run
4. render assistant output from `activeRun`

If canonical fetch fails after a run id exists, show an explicit failure state. Do not render final assistant content from the direct command response.

## Recent Runs

Recent runs remain secondary history.

Selecting a run from history, monitors, or route views must hydrate `activeRun` from canonical run data and switch the detail panel to that run.

## Canonical Interfaces

- Command bootstrap: `POST /api/ai/command`
- Canonical run detail: `GET /api/ai/run/{run_id}`
- Canonical run history: `GET /api/ai/runs`

## Prohibited Patterns

- rendering from merged response + run objects
- using `response.id` as a run identifier
- response-first assistant rendering after canonical run load
- treating recent runs as authoritative over `activeRun`
- dual-source detail rendering

## Current Standard Status

This standard is locked as the required pattern for AIO Agents.
