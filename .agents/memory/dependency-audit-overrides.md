---
name: Dependency audit overrides
description: Safe handling of pnpm audit remediation overrides in this workspace
---

Use exact patched package versions for transitive vulnerability overrides instead of the open-ended ranges emitted by `pnpm audit --fix`; those ranges can silently select a newer major version and create avoidable compatibility risk.

**Why:** The audit fixer’s minimum-version ranges resolved compatible packages such as `fast-uri`, `js-yaml`, and `nanoid` to newer major lines even though patched releases existed on their current major lines.

**How to apply:** When remediating a lockfile advisory, choose the lowest safe patched version compatible with the dependency tree, regenerate the lockfile, and confirm both the audit result and the absence of the vulnerable lock entries.