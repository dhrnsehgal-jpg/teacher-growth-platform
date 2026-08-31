# Main branch protection

The release gate for pull requests targeting `main` must require this exact
status check:

```text
Supabase API contracts
```

This is the job name in
[`.github/workflows/release-validation.yml`](./workflows/release-validation.yml),
not the workflow name (`Release validation`). The local workflow contract check
confirms that the job is present and runs for pull requests targeting `main`.

## Repository-level verification

The repository
[`dhrnsehgal-jpg/teacher-growth-platform`](https://github.com/dhrnsehgal-jpg/teacher-growth-platform)
was verified through the connected GitHub account. GitHub reports `main` as the
configured default branch, and the initial project commit has now been
published to that branch.

The repository now has an active ruleset named `Main branch release gate`
scoped to `refs/heads/main`. Its required status-check list contains exactly:

```text
Supabase API contracts
```

The ruleset has no bypass actors. Because it targets the `main` branch, GitHub
will enforce this check for pull requests targeting `main` once the branch has
been created. The local workflow contract check also passes, confirming that
the required check is the job name emitted by
`.github/workflows/release-validation.yml`, not the workflow name
(`Release validation`).