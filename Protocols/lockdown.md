\# Lockdown.md

\# Repository Protection and No-Touch Rules



\## Purpose

Define protected areas of the repository and prevent unsafe or unauthorized changes.



This file enforces \*\*hard boundaries\*\*.



If any instruction conflicts with this file:

→ stop and require explicit operator approval.



\---



\## Core Rule



If there is uncertainty about whether a file or system is protected:

→ treat it as protected



Do not assume permission.



\---



\## Absolute No-Touch Areas



These areas must NEVER be modified without explicit operator instruction:



\### Archive

\- `/Archive/\*\*`



Rules:

\- read-only

\- no edits

\- no renames

\- no deletions

\- no “cleanup”



\---



\### Locked Files (Operator Defined)



Any file explicitly marked or stated as locked by the operator.



Rules:

\- no edits without explicit instruction

\- do not infer permission from context

\- do not modify adjacent logic “just because”



\---



\## Sensitive System Areas



Require explicit approval before ANY change:



\### Security / Access

\- authentication logic

\- authorization rules

\- tokens / keys / secrets

\- session handling



\### Network / Exposure

\- LAN/WAN behavior

\- ports

\- streaming endpoints

\- firewall-related logic



\### Environment / Config

\- `.env`

\- config loaders

\- environment switching

\- runtime flags



\### Deployment / Build System

\- build scripts

\- packaging logic

\- deployment scripts

\- CI/CD configs



\### Data / Schema

\- database schema

\- migrations

\- persistent storage logic



\### File System Control

\- deletion logic

\- cleanup routines

\- file movers/renamers

\- backup/restore systems



\---



\## UI / Layout Protection



Treat as fragile unless explicitly instructed:



\- layout files

\- structural UI components

\- styling systems

\- shared UI primitives



Rules:

\- no structural rewrites

\- no silent layout fixes

\- no “quick improvements”



\---



\## Dependency Control



Do not introduce, remove, or upgrade dependencies without approval.



Includes:

\- package.json

\- lockfiles

\- system packages

\- runtime dependencies



\---



\## Destructive Action Rules



The following actions are \*\*blocked by default\*\*:



\- delete files or directories

\- overwrite large sections of code

\- reset repo state

\- clean working tree destructively

\- force git operations

\- rewrite history



To proceed:

→ must receive explicit operator instruction



\---



\## Git Protection Rules



\### Allowed (safe)

\- `git reset --hard`

\- `git clean`

\- `git checkout -- .`

\- branch deletion



\### Allowed (safe)

\- `git status`

\- `git diff`

\- `git log`

\- `git push`

\- read-only inspection



\---



\## Change Escalation Rule



If a requested task touches any protected or sensitive area:



1\. stop

2\. identify the risk clearly

3\. state what part is protected

4\. request confirmation



Do not proceed silently.



\---



\## Ambiguity Rule



If:

\- instructions are unclear

\- file ownership is uncertain

\- system impact is unknown



→ stop and ask



Never “best guess” in protected areas.



\---



\## Conflict Resolution



If:

\- operator instruction conflicts with Lockdown rules



Then:

\- follow the operator

\- BUT restate the risk clearly before proceeding



\---



\## Logging Awareness



Do not:

\- suppress logs silently

\- remove logging from critical systems

\- alter error reporting behavior without explanation



\---



\## Recovery Awareness



Do not:

\- remove or alter backup systems

\- modify restore logic

\- disable safety checks



\---



\## Scope Guard



Do not expand changes into protected areas unless explicitly required.



Example:

Fixing a bug does NOT justify modifying:

\- auth

\- networking

\- config

\- deployment



\---



\## Success Condition



A safe session:

\- respects protected areas

\- avoids destructive operations

\- escalates risk before acting

\- makes only authorized changes

