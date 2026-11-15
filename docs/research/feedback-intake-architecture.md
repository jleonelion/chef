# Feedback intake architecture

Research for [jleonelion/chef#53](https://github.com/jleonelion/chef/issues/53), checked 2026-11-14.

## Decision

Use a small dedicated intake API and private datastore as the system of record. Expose it to Muse through a reviewed write connector if that route proves available to Chef users. Keep a browser form as the portable fallback. Export only a maintainer-sanitized summary to the public Chef issue tracker or a separately reviewed reproduction case to the eval suite.

Do not use GitHub as the raw-report store. A private repository requires every reporter to receive repository access. Private vulnerability reporting accepts reports from the public, but GitHub defines it as a security-vulnerability workflow, not a general defect, enhancement, or behavior-change inbox. A GitHub App in front of a private repository fixes the reporter-access problem, but once that proxy exists it is already a dedicated intake service with worse deletion controls and unsafe attachment defaults.

Muse has a verified connector mechanism, not a verified native feedback inbox. Meta's connector documentation supports read and write tools backed by a developer endpoint and requires approval for writes. It does not document a Muse-owned store, maintainer queue, opaque reply channel, or deletion API for third-party skill reports. Treat a Muse connector as one client of the dedicated API, not as the system of record.

## Comparison

Ratings mean whether the option satisfies the issue criterion without inventing a second system.

| Criterion | Private GitHub repository issues | GitHub private vulnerability reporting | Dedicated API and datastore | Muse-native option |
| --- | --- | --- | --- | --- |
| Private diagnostic submission | Partial. Content is private, but the reporter needs at least read access to the repository before opening an issue. | Partial. Reports are private to maintainers and available on a public repository, but only for security vulnerabilities. | Yes. Accept a bounded schema over TLS and return a non-enumerable receipt. | No verified inbox. A connector can privately transport a write to the dedicated API. |
| Optional identity or opaque follow-up | No. GitHub submissions use the reporter's GitHub identity. | No. GitHub identifies the reporter and automatically adds them to the proposed advisory. | Yes. Store no identity by default. Hash a random receipt secret for status and replies; keep optional contact data in a separate field with its own retention. | Not documented as a platform capability. A connector may convey Muse account context, but the intake service must implement identity choices and replies. |
| Attachments | Poor for sensitive diagnostics. GitHub warns that uploaded issue media can be viewed through its anonymized URL without authentication even when the issue is private. | Unclear for general diagnostic bundles and still the wrong workflow. The REST submission is a Markdown description. | Yes. Use private object storage, size and type limits, quarantine, malware scanning, encryption, and short expiry. | Connector terms include files as connector content, but no official source found documents a native third-party feedback attachment store or its lifecycle. |
| Abuse resistance | Partial. GitHub authentication and platform rate limits help, but granting private-repository access to unknown reporters is the wrong boundary. | Good for its intended security use. GitHub applies per-user and per-repository private-report limits. | Yes, with work. Enforce schema and byte limits before storage, rate-limit by several coarse signals, quarantine files, reject replays, and add a challenge to the browser fallback when risk rises. | Connector approval prompts constrain writes, but Meta's documentation does not promise that these replace service-side abuse controls. |
| Maintainer access control | Partial. Repository roles are broader than an intake-only role, and read access exposes repository contents. | Good for repository administrators and security managers, but those roles and advisory semantics are excessive for ordinary product feedback. | Yes. Give maintainers intake-specific roles through SSO and record access to raw reports. | No verified maintainer queue or report-specific role model. |
| Reporter deletion and retention | Poor. GitHub documents issue creation and editing but no delete-issue REST endpoint or report-specific time-to-live. Repository administrators can delete issues in the web interface, which is manual and coarse. | Poor fit. Advisory lifecycle follows coordinated disclosure, not a configurable diagnostic-retention policy. | Yes. Put `expires_at` on every report and object, run scheduled hard deletion, and let a receipt holder request early deletion without identifying themselves. | Meta requires connectors to retain data only as needed and honor deletion, but the connector developer must implement those controls in its service. |
| Issue triage | Strong. Labels, assignees, milestones, comments, and repository roles already exist. | Weak for non-security work. Advisories do not match the project's three report classes. | Good if the maintainer UI starts small: queue, class, severity, status, duplicate link, notes, and export. | No verified queue. |
| Sanitized GitHub handoff | Native but risky because raw and sanitized data begin in the same place. A maintainer can copy to the public tracker. | A maintainer can open a public issue, but that is outside the advisory's intended lifecycle. | Strong. An explicit export step can create a public issue containing allowlisted fields and a backlink to an inaccessible internal receipt ID. | A connector can invoke service tools, but GitHub export still belongs in the intake service. |
| Sanitized eval handoff | Manual. Raw private issue content must not be copied directly into the repository. | Manual and semantically unrelated. | Strong. Require a separate reproduction-case artifact, re-review it, then open a PR or write a fixture through a narrowly scoped integration. | No verified eval handoff. |
| Operating burden | Low at first, then costly around access invitations, attachment cleanup, privacy requests, and accidental disclosure. | Low, but unusable as the general channel. | Moderate. The service owns security, storage, retention jobs, support, and monitoring. Managed components keep this bounded. | A published connector adds Meta review and maintenance requirements and still needs the API. |

## What the primary sources establish

### GitHub

Private repositories are visible only to explicitly authorized people. GitHub's organization role table says a user needs at least the `Read` role to open issues, and that role can also pull the repository and view other repository material. That makes a private issue repository unsuitable for arbitrary Chef users unless it contains nothing except reports and access is provisioned for every reporter. Even then, each reporter can see the other issues unless the system adds another isolation layer. See GitHub's [repository visibility](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories) and [repository role permissions](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization).

Creating an issue through GitHub's REST API requires an authenticated GitHub App token, user token, or fine-grained personal access token with `Issues: write`. A Chef client cannot safely embed one of those credentials. A server-side proxy could hold a GitHub App credential, but that proxy becomes the public intake boundary and must still solve abuse, identity, attachments, deletion, and follow-up. See the [create-an-issue endpoint](https://docs.github.com/en/rest/issues/issues#create-an-issue) and GitHub's [REST API authentication guidance](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api).

GitHub private vulnerability reporting is a real private path from users of a public repository to maintainers. GitHub says anyone may report when the repository enables it, rate-limits private reports, supports custom vulnerability forms, and automatically adds the reporter as a collaborator and credited user on the proposed advisory. Those are useful controls for a security channel, but they also establish why it cannot provide optional identity and why using it for ordinary Chef feedback would abuse the product's coordinated-disclosure semantics. See [configuring private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository), [reporting privately](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately), and GitHub's [coordinated disclosure model](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/coordinated-disclosure).

GitHub attachments are a hard blocker for raw diagnostics. GitHub warns that an image or video uploaded to an issue comment has an anonymized URL that anyone can view without authentication, including when the issue is in a private repository. Diagnostic bundles should therefore stay in access-controlled object storage and never be attached to GitHub. See GitHub's warning under [creating a support ticket](https://docs.github.com/en/support/contacting-github-support/creating-a-support-ticket).

GitHub provides useful platform-wide API limits, including secondary limits on concurrency and content-generating requests. These protect GitHub, not the intake design. A proxy remains responsible for per-report byte limits, upload scanning, replay handling, and blocking traffic before it creates costly records. See [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

### Muse

Meta's [Muse Connector Platform guidelines](https://platform.muse.ai/docs) verify an integration route with developer endpoints, authentication, tool inputs and outputs, errors, rate limits, and read/write classification. Writes ask for user approval on first use, and sensitive writes ask every time. The same guidelines require data minimization, access controls, encryption in transit and at rest, retention only while needed, and deletion when access is revoked or the user requests it. The [Connector Terms](https://platform.muse.ai/terms) place those duties on the connector developer and say Meta reviews connectors before distribution.

That is evidence that Muse can be a client. It is not evidence of a native Chef feedback destination. The reviewed first-party material does not document any of the following for third-party skills:

- a Muse-owned private maintainer inbox;
- anonymous or pseudonymous submission;
- an opaque reporter-to-maintainer reply channel;
- raw report retention controls exposed to the Chef maintainer;
- report deletion, triage, GitHub export, or eval export;
- a diagnostic attachment store with a documented access and expiry model.

No such capability should enter the design until Meta supplies a first-party API or a Muse prototype proves it. Muse's general product feedback channel, if one exists in the client, would concern Muse itself and is not evidence that Chef maintainers can receive or govern those reports.

## Recommended design

Keep the first release deliberately narrow.

1. `POST /v1/reports` accepts the versioned, allowlisted report schema and optional short-lived attachments. It returns a public receipt ID plus a one-time receipt secret. Store only a hash of the secret.
2. `GET /v1/reports/{id}` and `POST /v1/reports/{id}/messages` require the receipt secret. They expose status and a bounded opaque conversation without revealing a reporter identity.
3. `DELETE /v1/reports/{id}` requires the same secret and schedules deletion of the report, messages, and objects. A separate expiry job deletes every raw report after the policy window even if nobody asks.
4. The maintainer queue uses SSO and intake-specific roles. Raw downloads require an explicit action and create an audit event.
5. Attachments enter private quarantine storage through short-lived upload grants. Enforce count, compressed and expanded size, declared and detected type, and expiry. Never render active content in the maintainer browser.
6. The service creates no GitHub issue automatically. A maintainer chooses fields in a sanitized preview, confirms that it contains no raw household, health, dietary, recipe, inventory, email, conversation, or file content, then exports through a narrowly scoped GitHub App.
7. Eval promotion is a different action. It creates a new reproduction case with provenance to the internal receipt ID, requires a second review, and opens a normal code-review change. Raw reports and attachments never become fixtures.

A managed relational database, private object storage, scheduled deletion job, and a small authenticated maintainer UI are enough. Do not add search indexing, analytics, automatic classification, or bidirectional GitHub synchronization to the first release. The cost worth paying is the dedicated privacy boundary. Everything else can wait for real report volume.

## Why not the smaller GitHub hybrid

The closest runner-up is a public intake endpoint that validates a report and creates an issue in a dedicated private GitHub repository. It saves the maintainer UI and queue work. It does not remove the intake API, and it leaves three material problems:

- GitHub is a poor raw-attachment store for sensitive diagnostics because uploaded media URLs are not access-gated.
- A report-specific expiry and deletion guarantee must be implemented around GitHub rather than by the datastore that owns the record.
- Raw reports sit in the same collaboration product used for sanitized engineering work, making accidental copying, notification, or access expansion more likely.

Use GitHub only after sanitization. That boundary is simple enough to explain to users and maintainers: the intake service holds private reports temporarily; GitHub holds selected engineering work; the repository holds reviewed reproduction cases.

## Unresolved verification

- Whether Meta will approve and distribute a Chef feedback write connector, and whether it will classify report submission or attachment upload as sensitive.
- Whether the current Muse runtime can pass a local generated file to a connector tool. The connector documents mention files as connector content but do not specify this client flow.
- The exact retention window, maximum attachment size, maintainer roles, and identity/contact policy belong to the policy decision in issue #57.
- The report and reproduction schemas belong to issue #55. This decision assumes each is versioned and that raw reports cannot be used directly as eval fixtures.
