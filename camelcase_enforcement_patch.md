# SERVER-LEVEL CAMELCASE ENFORCEMENT PATCH

You are working inside the AIO CRM / AIO Flow backend.

## MISSION

Implement server-level enforcement so that: - all external
request/response contracts remain camelCase - snake_case is forbidden at
system boundaries - Python internals may remain Pythonic where
appropriate - no new boundary leaks are introduced - enforcement is
centralized, predictable, and safe

This is an execution task, not a discussion task.

------------------------------------------------------------------------

## HARD RULE

From this point forward:

-   camelCase is required for:
    -   API request bodies
    -   API responses
    -   persisted JSON payloads
    -   run metadata
    -   flow node configs
    -   agent context payloads
    -   integration config payloads crossing API boundaries
-   snake_case is allowed only inside Python internals:
    -   local variables
    -   helper functions
    -   private implementation details
-   snake_case must never cross a boundary:
    -   never accepted silently from client payloads
    -   never emitted in JSON responses
    -   never persisted into JSON columns / JSON blobs intended for
        app/runtime use

------------------------------------------------------------------------

## OBJECTIVE

Add a centralized backend enforcement layer that:

1.  detects snake_case keys in inbound JSON payloads
2.  rejects them with a clear 4xx validation error
3.  recursively validates nested objects and arrays
4.  is reusable across routes
5.  is applied first to critical endpoints, then broadly where
    appropriate
6.  does not break unrelated existing Python internals
7.  prevents future drift

------------------------------------------------------------------------

## IMPLEMENTATION REQUIREMENTS

### PART 1 --- CREATE A CENTRAL ENFORCEMENT UTILITY

Create or extend a backend utility module for boundary validation.

-   recursively inspect dictionaries and lists
-   detect any object key containing `_`
-   collect full key paths for failures
-   raise a structured validation error

------------------------------------------------------------------------

### PART 2 --- APPLY ENFORCEMENT AT SERVER BOUNDARY

Apply enforcement to: - /api/ai/command - /api/ai/draft - /api/assist -
flow endpoints - node config endpoints - agent execution endpoints -
integration config endpoints

------------------------------------------------------------------------

### PART 3 --- RESPONSE CONTRACT GUARD

Ensure outbound JSON emits camelCase only.

------------------------------------------------------------------------

### PART 4 --- JSON PERSISTENCE SAFETY

Ensure stored JSON blobs remain camelCase.

------------------------------------------------------------------------

## OUTPUT FORMAT

### PATCH STATUS

### FILES MODIFIED

### ENFORCEMENT DETAILS

### TEST RESULTS

### REMAINING RISKS

### STOP
