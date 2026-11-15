# Muse feedback capabilities

Research for [issue 52](https://github.com/jleonelion/chef/issues/52), checked 2026-11-14.

## Answer

Muse can support a consent-first Chef report flow, but only if Chef owns the capture and a reviewed connector owns submission. Chef can detect the current Muse environment with its existing `authdc` probe, record allowlisted events emitted by its own scripts, keep a bounded file in the user's Muse VM, render a complete report preview in chat, and ask a connector to submit the approved fields. Muse's permission system can bind that write to the destination and request.

Muse does not publish a skill runtime API that reports which skill fired, exposes model or conversation traces to a custom skill, intercepts arbitrary script execution, or provides a bounded diagnostic-trace store. It also does not document a connector attachment-upload contract, a field-removal preview widget, or an opaque reporter reply channel. Those are not verified capabilities. A Muse prototype must settle them before implementation.

The safe first version is therefore narrow:

1. Instrument only Chef-owned command entry points and shared libraries. Do not infer or scrape the surrounding conversation or Muse audit trail.
2. Store allowlisted event metadata locally. Exclude command arguments, prompts, stdout, stderr, file contents, environment values, connector surrogates, household data, health data, dietary data, recipes, inventory, email, and unrelated paths by default.
3. Build a structured report from that trace only after the user asks to report a problem or idea.
4. Show every field and attachment in chat, support removal, then request a fresh submission confirmation.
5. Submit through one narrowly scoped connector tool. Return a stable report ID and status URL or status tool. Do not rely on the model retaining a secret or polling arbitrary conversation history.

## Capability matrix

| Need | Verified fact | What Chef may rely on now | Gap or prototype question |
|---|---|---|---|
| Detect Muse | Chef treats `/opt/hatch/bin/authdc` as the Muse marker. Its tests cover presence and absence. Meta documents `hatch-authd` as the VM service responsible for credentials and surrogation, but does not document that binary path as a public runtime-detection contract. [Chef adapter](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.mjs#L12-L17) [Chef test](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.test.mjs#L119-L122) [Meta architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) | Keep the probe as a Chef implementation detail and record `runtime: muse` only after it succeeds. | Confirm the path and compatibility policy on a current Muse VM. Do not call it a supported Muse API. |
| Observe skill execution | Meta says users can review used skills in the Activity log and inspect a chronological record of actions and permissions. No first-party document found exposes skill-start, skill-end, selected-skill, model trace, Activity-log read, or conversation-hook APIs to custom skills. [Muse skills](https://www.meta.com/help/superintelligence/2797651547267109/) [Muse guidance and approval](https://www.meta.com/help/superintelligence/1385290430137537/) [Meta architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) | Add explicit events around Chef-owned scripts. Record skill identifier, script identifier, Chef version, start and finish time, outcome class, and a generated invocation ID. | Test whether nested skill and script calls expose stable IDs or lifecycle hooks. Until then, the trace is Chef instrumentation, not a complete Muse execution trace. |
| Retain a local trace | Meta says each user has a dedicated persistent VM, the VM is the system of record, and workspace files live in the isolated runtime cell. Its Help Center says users can access and delete System Files. Chef already defaults its data root to `~/workspace/chef`. [Meta architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) [Muse data controls](https://www.meta.com/help/superintelligence/2225571704857152/) [Chef adapter](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.mjs#L77-L104) | Keep a git-ignored trace under the Chef data root. Enforce count, byte, and age limits in Chef code. Provide inspect and delete commands. | Muse publishes no bounded trace API, expiry callback, or guarantee that a local path never enters backup, inference, or product telemetry. Document Chef's bounds and deletion semantics separately. |
| Preview and remove fields | Meta requires connectors to show relevant details before consequential actions and says approval covers only the displayed action and details. It does not publish a report-preview or field-removal component. [Connector guidelines](https://platform.muse.ai/docs) | Render a deterministic text preview from the exact submission object. Rebuild the object after each requested removal. | Verify that the current Muse client displays long structured previews and attachment names without truncation before the approval prompt. |
| Obtain explicit consent | Connector reads and ordinary writes ask on first use unless the user chose `Always allow`. Sensitive writes ask every time and cannot be permanently allowed. A changed recipient or scope requires fresh approval. Sentinel sends approval directly to the Muse client and binds grants to connector, destination, and use case. [Connector guidelines](https://platform.muse.ai/docs) [Meta architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) | Treat report submission as a write. Designate it sensitive if Muse review permits, because reports may contain user-selected diagnostics. Require a separate conversational confirmation immediately before invoking it even if Muse classifies it as an ordinary write. | Meta, not Chef, assigns the final tool class during review. A normal write may be set to `Always allow`, so Chef's own fresh-confirmation rule remains necessary. |
| Submit structured data | Muse's connector platform accepts tools with documented inputs, outputs, side effects, status handling, errors, rate limits, and read/write classifications. Connector data must be minimal, request-bound, protected, retained only as needed, and deleted when no longer needed or access is revoked. [Connector guidelines](https://platform.muse.ai/docs) [Connector terms](https://platform.muse.ai/terms) | Use a dedicated `submit_feedback` write with an explicit schema and idempotency key. The destination should authenticate the connector and return a report ID. Separate status lookup into a read tool. | A Chef feedback connector does not exist yet and must pass Muse review. Direct browser automation is not an equivalent authenticated protocol. |
| Submit attachments | Chef's adapter can tell Muse to send a generated PDF as a downloadable attachment in the current chat. Its test verifies that instruction shape. This proves chat delivery only. [Chef adapter](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.mjs#L115-L119) [Chef test](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.test.mjs#L103-L113) | Preview a local diagnostic bundle in chat if Muse honors the existing attachment instruction. Prefer structured fields for submission. | Official Muse docs found here do not define connector file inputs, multipart upload, size limits, MIME rules, malware scanning, or attachment approval UI. Prototype before promising bundle submission. |
| Authenticate the destination without exposing secrets | Meta says `hatch-authd` stores credentials outside the runtime cell and gives the agent surrogates. Sentinel inserts the real credential at authorized egress. Chef already asks `authdc` for a connector surrogate and warns never to log or store it. [Meta architecture](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) [Chef adapter](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.mjs#L12-L36) | Put destination authentication in the connector. Never include credentials or surrogates in trace events, previews, URLs, logs, or report fields. | Choose OAuth or a connector-managed API credential during connector design. Do not use a personal token in Chef settings or the data root. |
| Follow up | Muse connector guidance says connectors should support status checks and follow-up operations when the service offers them, and should preserve progress across sign-in or verification. [Connector guidelines](https://platform.muse.ai/docs) | Return a report ID. Offer a read-only `get_feedback_status` tool and an explicit user-initiated `add_feedback_comment` write. | Muse docs do not define an anonymous opaque reply channel or unsolicited inbound callback to a Chef skill. Email, GitHub identity, or destination accounts must remain optional until a privacy-reviewed design exists. |

## Safe capture schema

An invocation event may contain only:

- schema version
- random invocation ID
- parent invocation ID, if Chef created it
- coarse UTC timestamps or duration
- Chef version and installed skill identifier
- script identifier and operation name from a fixed allowlist
- outcome class such as `ok`, `validation-error`, `dependency-unavailable`, or `internal-error`
- stable, reviewed error code
- runtime marker and adapter version

Do not capture raw exceptions by default. Error messages often contain paths, arguments, API responses, recipe text, addresses, or other user data. If a maintainer needs one, add a reviewed normalizer for that error class or let the user paste a redacted excerpt into the report preview.

The trace should be a ring buffer with three independent bounds: event count, serialized bytes, and age. The exact limits remain a product decision, not a Muse capability. Chef should expose `show trace`, `clear trace`, and report-time field removal. Clearing must remove the local trace without contacting the destination.

## Submission sequence

```text
user requests feedback
  -> Chef reads its bounded local trace
  -> Chef builds an allowlisted report object
  -> Muse shows the full preview and proposed attachment names
  -> user removes fields or attachments
  -> Chef renders the final object again
  -> user explicitly confirms this destination and payload
  -> Muse invokes the connector write
  -> Sentinel applies the connector permission policy
  -> destination returns report ID and status
```

The conversational confirmation and Sentinel approval do different jobs. The first confirms the content. The second authorizes the external action. Keep both.

## Direct observations in this research environment

This checkout is not running inside a Muse VM. On 2026-11-14, `/opt/hatch/bin/authdc` was absent and no environment variable name contained `muse`, `hatch`, `authdc`, or `chef`. I did not have a live Muse client or VM in which to test audit-trail access, lifecycle hooks, attachment upload, connector approval presentation, or follow-up delivery. Those items remain prototype questions.

The local Chef tests use injected fakes for Muse-specific behavior. They verify Chef's adapter contract, not Meta's current runtime behavior. No claim above treats a fake-backed unit test as proof of a Muse product feature.

## Primary sources

- [Muse Connector Platform guidelines](https://platform.muse.ai/docs), Meta, accessed 2026-11-14.
- [Muse Connector Terms](https://platform.muse.ai/terms), Meta, effective 2026-09-18, accessed 2026-11-14.
- [How We Built Safety Into Muse](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse), Meta, accessed 2026-11-14.
- [Muse security and privacy](https://muse.ai/security-and-privacy), Meta, accessed 2026-11-14.
- [How to manage your Muse data](https://www.meta.com/help/superintelligence/2225571704857152/), Meta Help Center, accessed 2026-11-14.
- [How Muse works with your guidance and approval](https://www.meta.com/help/superintelligence/1385290430137537/), Meta Help Center, accessed 2026-11-14.
- [How Muse works with skills](https://www.meta.com/help/superintelligence/2797651547267109/), Meta Help Center, accessed 2026-11-14.
- [Muse product page](https://muse.ai/), Meta, accessed 2026-11-14.
- [Chef Muse adapter at the researched revision](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.mjs).
- [Chef Muse adapter tests at the researched revision](https://github.com/jleonelion/chef/blob/057adac362cacd71984fee071af10e331ebeac5d/src/runtime/muse.test.mjs).

The Muse privacy policy at `https://muse.ai/privacy` required login in this environment, so I could not verify its contents. This note does not infer privacy-policy terms from Chef's existing link or wording.
