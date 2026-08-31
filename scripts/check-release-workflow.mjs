#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowPath =
  process.argv[2] ??
  fileURLToPath(
    new URL("../.github/workflows/release-validation.yml", import.meta.url),
  );

/**
 * Parse the small YAML subset used by GitHub Actions workflows.
 *
 * Keeping this check dependency-free means it can run immediately after
 * checkout, before the workspace dependencies are installed. The parser
 * handles mappings, sequences, and the quoted/scalar values used by the
 * release workflow, while rejecting malformed indentation through the
 * structure it builds.
 */
function parseScalar(value) {
  const trimmed = value.trim();

  if (trimmed === "") {
    return "";
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  return trimmed;
}

function stripComment(value) {
  let quote;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '"' || character === "'") {
      if (quote === character && value[index + 1] === character) {
        index += 1;
      } else if (!quote) {
        quote = character;
      } else if (quote === character) {
        quote = undefined;
      }
    } else if (
      character === "#" &&
      !quote &&
      (index === 0 || /\s/.test(value[index - 1]))
    ) {
      return value.slice(0, index).trimEnd();
    }
  }

  return value;
}

function mappingEntry(value) {
  const colon = value.indexOf(":");

  if (colon < 0) {
    return undefined;
  }

  const key = value.slice(0, colon).trim();
  if (!key || /\s/.test(key)) {
    return undefined;
  }

  return {
    key: parseScalar(key),
    value: value.slice(colon + 1).trim(),
  };
}

function tokenize(source) {
  return source.split(/\r?\n/).flatMap((raw, index) => {
    const withoutComment = stripComment(raw);
    if (!withoutComment.trim() || withoutComment.trim() === "---") {
      return [];
    }

    const indentation = withoutComment.match(/^ */)[0].length;
    const text = withoutComment.slice(indentation);

    if (text.includes("\t")) {
      throw new Error(
        `Tabs are not supported for YAML indentation (line ${index + 1}).`,
      );
    }

    return [{ indentation, text, line: index + 1 }];
  });
}

function parseBlock(tokens, start, indentation) {
  const sequence =
    tokens[start]?.indentation === indentation &&
    tokens[start].text.startsWith("-");
  const result = sequence ? [] : {};
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.indentation < indentation) {
      break;
    }

    if (token.indentation > indentation) {
      throw new Error(`Unexpected indentation on line ${token.line}.`);
    }

    if (sequence) {
      if (!token.text.startsWith("-")) {
        break;
      }

      const itemText = token.text.slice(1).trim();
      if (!itemText) {
        if (tokens[index + 1]?.indentation > indentation) {
          const child = parseBlock(
            tokens,
            index + 1,
            tokens[index + 1].indentation,
          );
          result.push(child.value);
          index = child.next;
        } else {
          result.push(null);
          index += 1;
        }
        continue;
      }

      const entry = mappingEntry(itemText);
      if (!entry) {
        result.push(parseScalar(itemText));
        index += 1;
        continue;
      }

      const item = {
        [entry.key]: entry.value ? parseScalar(entry.value) : null,
      };
      index += 1;

      if (!entry.value && tokens[index]?.indentation > indentation) {
        const child = parseBlock(tokens, index, tokens[index].indentation);
        item[entry.key] = child.value;
        index = child.next;
      }

      if (tokens[index]?.indentation > indentation) {
        const continuation = parseBlock(
          tokens,
          index,
          tokens[index].indentation,
        );
        if (Array.isArray(continuation.value)) {
          throw new Error(
            `Expected mapping continuation on line ${tokens[index].line}.`,
          );
        }
        Object.assign(item, continuation.value);
        index = continuation.next;
      }

      result.push(item);
      continue;
    }

    if (token.text.startsWith("-")) {
      break;
    }

    const entry = mappingEntry(token.text);
    if (!entry) {
      throw new Error(`Expected a mapping entry on line ${token.line}.`);
    }

    index += 1;
    if (entry.value) {
      result[entry.key] = parseScalar(entry.value);
    } else if (tokens[index]?.indentation > indentation) {
      const child = parseBlock(tokens, index, tokens[index].indentation);
      result[entry.key] = child.value;
      index = child.next;
    } else {
      result[entry.key] = null;
    }
  }

  return { value: result, next: index };
}

function parseYaml(source) {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    throw new Error("The workflow is empty.");
  }

  return parseBlock(tokens, 0, tokens[0].indentation).value;
}

let workflow;
try {
  workflow = parseYaml(readFileSync(workflowPath, "utf8"));
} catch (error) {
  console.error(
    `Release workflow validation could not parse ${workflowPath.replace(repositoryRoot, "")}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

const failures = [];
const pullRequest = workflow.on?.pull_request;
const pullRequestBranches = pullRequest?.branches;

if (
  !Array.isArray(pullRequestBranches) ||
  !pullRequestBranches.includes("main")
) {
  failures.push("pull_request.branches must include main");
}

const jobs = workflow.jobs;
const contractJobs =
  jobs && typeof jobs === "object" && !Array.isArray(jobs)
    ? Object.values(jobs).filter(
        (job) => job?.name === "Supabase API contracts",
      )
    : [];

if (contractJobs.length !== 1) {
  failures.push('exactly one job must be named "Supabase API contracts"');
} else {
  const contractJob = contractJobs[0];
  const invokesContractCheck =
    Array.isArray(contractJob.steps) &&
    contractJob.steps.some(
      (step) =>
        typeof step?.run === "string" &&
        step.run.includes("npm run check:api-contracts"),
    );

  if (!invokesContractCheck) {
    failures.push(
      'the "Supabase API contracts" job must invoke npm run check:api-contracts',
    );
  }
}

if (failures.length > 0) {
  console.error("Release workflow protection check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Release workflow protection check passed: main pull requests run the named Supabase API contracts job.",
);
