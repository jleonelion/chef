# Portable observability boundaries across agent runtimes

Research for [issue 54](https://github.com/jleonelion/chef/issues/54), checked 2026-11-14 against Chef source and first-party runtime documentation.

## Decision

Chef can promise a portable, content-safe execution ledger for Chef-owned code. It cannot promise a cross-runtime transcript or a faithful account of why the host selected Chef.

The portable boundary starts when a Chef script starts and ends when that script returns. Chef can record an allowlisted event with the skill and operation identifiers, Chef and schema versions, timestamps and duration, a random local correlation ID, success or a bounded failure code, and coarse output facts that the script itself produced. Examples include `written`, `unchanged`, `not-connected`, and `rate-limited`. It can also record the runtime adapter name and adapter-supplied capabilities, but those values are claims from the adapter, not proof of host behavior.

Everything outside that process boundary is an extension. A host may expose session lifecycle, skill activation, prompts, tool calls, approval decisions, model changes, connector execution, assistant responses, token use, or routing. Chef must label each such event with its source and trust level. Missing extension events mean "not observed," never "did not happen."

## Boundary map

| Evidence | Portable Chef-owned capture | Runtime extension | Not available without host evidence |
| --- | --- | --- | --- |
| Chef script identity, operation, version | Yes, set by Chef code | Host may add plugin or skill metadata | Whether the host selected the intended skill |
| Start, end, duration, outcome | Yes, inside the script process | Host may add tool lifecycle timing | Time spent before launch or after return |
| Data-root mutation | Yes, as sanitized paths or operation counts produced by Chef's write layer | Host may add filesystem tool events | Reads or writes performed by the agent outside Chef scripts |
| External request result | Yes, provider ID and bounded status from Chef's client | Proxy or host may add request and policy events | Actual network route, proxy substitution, retries, or remote receipt unless attested |
| Runtime action requested by Chef | Yes, record that Chef returned an email, calendar, attachment, or schedule instruction | Host may report approval and execution | Whether the host showed, approved, routed, sent, scheduled, or displayed it |
| Prompt, response, conversation, model, tokens | No | Host hooks or telemetry may provide selected fields | Complete or portable evidence across runtimes |
| Routing cause and skill-selection reasoning | No | A host may emit an activation event | The model's causal reasoning or every candidate skill considered |

## Why this is the portable minimum

Chef already keeps runtime knowledge behind `src/runtime/muse.mjs`. Claude Code and Muse Code reuse that adapter and override the data root with `CHEF_DATA_ROOT`. The adapter supplies locale, credentials, installation layout, attachment instructions, household-email payloads, and scheduling instructions. It does not receive a session object, prompt, model, token count, tool-call envelope, approval result, or final assistant response. [Chef runtime adapter](https://github.com/jleonelion/chef/blob/057adac/src/runtime/muse.mjs)

The script boundary is deliberate. Shopping-list delivery returns a Gmail payload on Muse and writes a file off Muse; the script itself does not send mail. Meal planning likewise returns calendar instructions and never calls a calendar API. Setup returns scheduler instructions and says that Chef keeps no record of host tasks. These seams let Chef record what it asked the runtime to do, but not what the runtime did afterward. [Shopping-list delivery](https://github.com/jleonelion/chef/blob/057adac/src/skills/chef-shopping-lists/scripts/lib/deliver.mjs), [meal-planning skill](https://github.com/jleonelion/chef/blob/057adac/src/skills/chef-meal-planning/SKILL.md), [setup skill](https://github.com/jleonelion/chef/blob/057adac/src/skills/chef-setup/SKILL.md)

Credentials show the same distinction. On Muse, Chef receives a surrogate from `authdc`; Muse's egress proxy is expected to replace it only for the registered host. Off Muse, Chef reads an environment variable. Chef can safely record the provider, credential source, placement, and bounded result, but never the credential value or request URL. Chef cannot independently prove proxy substitution or the upstream route. [Chef runtime adapter](https://github.com/jleonelion/chef/blob/057adac/src/runtime/muse.mjs), [USDA client](https://github.com/jleonelion/chef/blob/057adac/src/lib/fdc.mjs)

## Runtime extensions

### Claude Code

Claude Code has a documented host extension path. Plugin manifests can declare hooks, and hooks cover session start and end, submitted prompts, permission requests, pre- and post-tool use, tool failures, skill activation, model switches, stop events, and other lifecycle points. Common hook input includes a session ID, transcript path, current working directory, and permission mode. These fields can enrich a Chef trace, but they remain Claude Code evidence and must not enter the portable required schema. [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), [Claude Code plugin manifest](https://code.claude.com/docs/en/plugins-reference)

Claude Code also exports opt-in OpenTelemetry metrics, events, and beta traces. The documented events include prompts, assistant responses, tool results and decisions, API requests and errors, MCP connections, plugin loading, skill activation, hook execution, compaction, and subagent completion. Content-bearing telemetry is configurable and carries greater privacy risk than Chef's allowlisted ledger. Organization telemetry is therefore an optional deployment integration, not a dependency of report creation. [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)

### Muse and Muse Code

Chef can detect its current Muse execution environment through `/opt/hatch/bin/authdc` and can return Muse-specific connector and scheduling instructions. That is runtime capability detection, not observability.

Muse's first-party public material describes isolated per-user VMs, concurrent subagents and cron jobs, connectors, sensitive-write classification, and user authorization boundaries. It does not document a plugin hook API, invocation event schema, transcript API, or routing audit feed comparable to Claude Code's hooks and OpenTelemetry pages. No public first-party source reviewed for this issue establishes that Muse or Muse Code exposes skill-selection reasons, connector routing receipts, approval records, final-response events, or a stable session identifier to Chef. Treat all of those fields as unavailable until a documented API or tested host contract exists. [Muse security architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse), [Muse connector guidelines](https://platform.muse.ai/docs), [Muse connector terms](https://platform.muse.ai/terms)

### Other skill-compatible runtimes

Skill compatibility proves only that a runtime can discover instructions and launch code. It says nothing about hooks, transcripts, model identifiers, approvals, connectors, or routing records. An adapter may add those fields only after capability negotiation. Unknown hosts default to the Chef-owned ledger.

## Adapter contract consequences

The future contract should split capture into two interfaces:

```text
ChefCapture
  begin(operation, safe_context) -> correlation_id
  finish(correlation_id, outcome, safe_facts)

RuntimeEvidence
  runtime_name
  capabilities
  subscribe(event_kinds) -> runtime events
  provenance(event) -> source, trust, observed_at
```

`ChefCapture` is required and must work without a runtime adapter. `RuntimeEvidence` is optional. Each extension event needs a runtime name and version when known, event kind, host event ID when supplied, Chef correlation ID when a deterministic join exists, observation time, provenance, and a schema version. The contract must permit partial ordering and unattached events. It must not infer a join from timing alone.

Capability names should be narrow, such as `tool.lifecycle`, `skill.activation`, `approval.decision`, `connector.result`, `model.selection`, and `response.completed`. A Boolean `supportsTracing` would hide the exact gaps this research found.

## Security and privacy rules

The local ledger should use a positive field allowlist. By default it must exclude prompts, responses, transcript paths, command arguments, tool inputs and outputs, file contents, raw filenames, URLs and query strings, credentials and surrogates, connector payloads, recipient addresses, household settings, recipes, inventory, health and dietary data, and exception stacks that may contain those values.

Runtime evidence does not become safe because the host emitted it. Normalize it through a separate allowlist before local storage or report preview. Keep raw host events out of the Chef data root. Never copy Claude Code transcripts or content-bearing OpenTelemetry events into a diagnostic bundle by default.

Host telemetry settings remain under user or administrator control. Chef must not enable hooks, OpenTelemetry, connectors, or broader permissions merely to improve a report. Submission remains a separate, explicit action with complete preview and field-level removal, as required by issue 51.

## Unavailable evidence must stay explicit

The report schema needs an `evidence_gaps` section. For this work, the important values are:

- `pre_launch_unobserved`: Chef cannot see the prompt or routing path before its process starts.
- `host_action_unconfirmed`: Chef returned an instruction or payload but received no execution receipt.
- `post_return_unobserved`: Chef cannot see the final assistant response or later host activity.
- `runtime_extension_unavailable`: the adapter did not provide a documented event source.
- `correlation_unavailable`: a host event exists but cannot be deterministically joined to a Chef invocation.

That wording prevents a diagnostic report from turning missing telemetry into a false claim about what the agent or runtime did.
