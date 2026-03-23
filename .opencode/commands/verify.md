\---

description: Verify current change safely

agent: build

\---



Read `AIOBuild.md`.



Run the smallest relevant verification for the current change.

Prefer:

1\. targeted syntax/type check

2\. targeted test

3\. local build only if needed



Do not run destructive or unrelated commands.



Report:

\- what was run

\- what passed

\- what failed

\- what remains unverified

