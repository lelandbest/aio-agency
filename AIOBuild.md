\# AIOBuild.md

\# AIO Local Build and Repo Operation Protocol



\## Purpose

Define how the agent performs implementation work in this repository.



Covers:

\- prebuild checks

\- change discipline

\- debugging protocol

\- verification

\- git workflow

\- execution sequencing



\---



\## Operating Principle



Prefer:

\- small, reversible changes

\- evidence over assumption

\- sequential execution

\- explicit verification



Avoid:

\- speculative edits

\- broad rewrites

\- bundled fixes

\- silent scope expansion



\---



\## Standard Session Flow



1\. inspect request

2\. inspect relevant files

3\. identify affected files

4\. run prebuild checks

5\. define minimal plan

6\. execute smallest complete change

7\. verify result

8\. report outcome

9\. perform git actions only if authorized



Rule:

→ Plan first, Build second



\---



\## Prebuild Checks



Before editing:



\- check current branch

\- inspect git status

\- identify uncommitted changes

\- identify minimal affected files

\- determine if protected areas are involved



If repo is dirty:

\- do not overwrite existing changes

\- do not clean up unrelated work

\- warn if risk exists



\---



\## Evidence-First Rule



Never guess.



Before acting:

\- inspect logs, errors, or file state

\- confirm behavior with observable data



Do not:

\- assume root cause

\- implement fixes without evidence

\- rely on intuition over inspection



\---



\## Change Discipline



Before editing:

\- define smallest viable change

\- confirm pattern alignment

\- verify scope is limited



During editing:

\- touch as few files as possible

\- keep diffs tight and reviewable

\- avoid placeholders and fake success paths

\- do not mix unrelated fixes



After editing:

\- state what changed

\- state assumptions if relevant

\- state risks only if real



\---



\## Sequential Execution Rule



For stateful operations:



\- execute one step at a time

\- verify each step before continuing

\- stop immediately on failure



Do not:

\- chain dependent commands blindly

\- parallelize stateful operations



\---



\## Debugging Protocol



When something fails:



1\. capture exact error or symptom

2\. inspect logs/output first

3\. isolate smallest failing surface

4\. form evidence-based hypothesis

5\. apply one change

6\. retest

7\. compare results



Do not:

\- stack multiple speculative fixes

\- claim root cause without evidence



\---



\## Verification Discipline



After changes:



Preferred order:

1\. targeted check (syntax/type)

2\. targeted test

3\. local build (if needed)



Do not run heavy verification unnecessarily.



If verification is not possible:

\- state what was not run

\- state why

\- state what should be run next



Never imply success without verification.



\---



\## Rollback Awareness



All changes must be reversible.



\- avoid destructive edits

\- preserve prior logic where possible

\- do not remove fallback paths without reason



If risk exists:

\- state rollback strategy



\---



\## Scope Control



\- do only what was requested

\- do not expand scope

\- do not introduce new systems or dependencies without approval



If additional issues are discovered:

\- note them

\- do not include them automatically



\---



\## Protected Area Awareness



Before editing:



If task touches:

\- auth/security

\- network/LAN/WAN behavior

\- environment/config

\- deployment/build scripts

\- schema/data

\- deletion logic



→ stop and request approval



Do not proceed silently.



\---



\## Command Discipline



\### Safe

\- read/search

\- git status/diff/log

\- inspection commands



\### Caution

\- installs

\- config edits

\- file moves

\- codegen



\### Approval Required

\- delete commands

\- force git operations

\- push

\- reset/clean

\- environment mutation

\- network exposure changes



\---



\## Git Protocol



\### Pull

\- do not pull into dirty state blindly

\- inspect repo first



\### Commit

Only when:

\- change is complete enough

\- verification is done or clearly limited

\- diff is clean



Commit messages:

\- short

\- specific

\- action-based



\### Push

\- never push without explicit instruction

\- no automatic pushes

\- no force push without approval



\---



\## Operator Command Output



When providing terminal commands:



\- provide clean, paste-ready blocks

\- no inline commentary inside command blocks

\- no mixing instructions with commands



\---



\## Stop Conditions



Stop and report if:



\- ambiguity affects outcome

\- protected areas are involved

\- verification fails unexpectedly

\- repo state is unsafe

\- destructive action would be required



Do not improvise around risk.



\---



\## Reporting Format



Objective  

Plan  

Changes  

Verification  

Notes (only if needed)



Keep it tight.



\---



\## Success Standard



A successful session produces:



\- correct result

\- minimal clean diff

\- verified change or clearly stated limits

\- no unintended modifications

\- no unauthorized actions

\- no unnecessary interaction churn

