# Prototype: consent-first reporting experience (Muse)

Rough interaction artifact for [Design the consent-first reporting experience](https://github.com/jleonelion/chef/issues/56). Throwaway branch, never merged. React to it: mark what's wrong, what's missing, which option wins.

Built on: [data contract](https://github.com/jleonelion/chef/issues/55), [privacy and lifecycle policy](https://github.com/jleonelion/chef/issues/57), [adapter contract](https://github.com/jleonelion/chef/issues/59), [Muse capabilities](https://github.com/jleonelion/chef/issues/52), [intake architecture](https://github.com/jleonelion/chef/issues/53).

Transcripts are illustrative: skill IDs, error codes and facts are made up for shape, not registry entries. `>` = user, `Chef:` = agent running Chef skills, `[Muse]` = Muse's own approval UI.

---

## Flow overview

```
 user asks ──┐                         ┌─ post-error offer (once)
             v                         v
        1 classify  ->  2 class questions  ->  3 assemble diagnostics
                                                     |
                                                     v
                         4 preview  <->  5 remove / edit fields (loop, re-render)
                                                     |
                                                     v
                         6 destination-aware confirm ("send")
                                                     |
                                     [Muse] connector approval
                                                     |
                             7 result: receipt saved | failure: bytes kept, retry
                                                     |
                             8 follow-up: status / comment / delete (pull-only)
```

Off-Muse (`generic` adapter, no `submit.*`): steps 1-5 identical, step 6 becomes "save locally", no 7-8.

---

## Flow A: explicit feedback (defect)

### 1. Classify

```
> the shopping list thing keeps putting milk in the wrong aisle, I want to report it

Chef: I can send a report to the Chef maintainer. Nothing leaves this VM until you
      see the whole report and say "send".

      This sounds like a defect (Chef did something wrong). Is that right?
        1. Defect: something broke or gave a wrong result
        2. Enhancement: something new you'd like Chef to do
        3. Behavior change: Chef works as designed, but you want it to work differently
```

- Agent proposes a class from the user's words and asks once. Never silently picks.
- Entry phrases: "report a problem", "send feedback", "Chef feedback", or the post-error offer. `my reports` and `show trace` are separate commands.

### 2. Class-specific questions

```
> 1

Chef: Three quick questions. I'll write them up in my own words, without copying
      your list, recipes or household details.
      - What did you expect?
      - What happened instead?
      - How often: once, sometimes, always, not sure?

> expected dairy under Dairy, it went under Produce. always

Chef: Draft:
        summary:   Shopping list puts some dairy items under the wrong store section.
        expected:  Dairy items are grouped under the Dairy section.
        actual:    A dairy item was grouped under Produce.
        frequency: always
      Note I wrote "a dairy item", not "milk". Change any of this before I build the report?
```

- Draft is generalized on purpose ("a dairy item"): user content is excluded by default. User may put specifics back in; the pattern scan still runs.
- Enhancement asks only `desired_outcome`. Behavior change asks `current_behavior`, `desired_behavior`, and which skill (required `skill_ids`).

### 3. Assemble diagnostics

```
Chef: For defects I attach recent Chef activity by default: which Chef scripts ran,
      whether they succeeded, and counts. No list contents, recipes, messages or file
      contents are recorded. You'll see every entry next.

      Using the last 6 Chef runs from the shopping-lists skill (past 40 minutes).
      [Use these] [Pick a different time window] [Don't attach activity]
```

- Default selection: events for the named or inferred `skill_ids` in the current session, capped at the schema's max events (50). If nothing matches, says so and offers "last N runs of any skill".
- Enhancement / behavior change: no bundle unless the user asks ("attach recent activity").

### 4. Preview (complete, readable)

Two candidate renderings. **Pick one** (or a hybrid); see Q1.

#### Option P1: numbered readable rendering, raw JSON on request

Every leaf of the payload gets a number. The rendering is lossless and generated from the same bytes the builder submits.

```
Chef: Here is the complete report. This is everything that would be sent.

      REPORT  (sent to Chef feedback intake)
       1  class            defect
       2  trigger          user-initiated
       3  summary          Shopping list puts some dairy items under the wrong store section.
       4  expected         Dairy items are grouped under the Dairy section.
       5  actual           A dairy item was grouped under Produce.
       6  frequency        always
       7  skill_ids        chef-shopping-lists

      DIAGNOSTICS  (6 Chef runs; times relative to 2026-11-14 15:00 UTC)
       8  environment      Chef 1.3.0 · skills: 10 installed (list: 8a-8j) · runtime muse,
                           adapter 1 · JS engine bun 1.3 · OS linux
       9  run 1  +02:14  chef-shopping-lists / build-list      ok   items_written: 14
      10  run 2  +02:15  chef-shopping-lists / group-sections  ok   sections: 6
      ...
      14  run 6  +38:02  chef-shopping-lists / group-sections  ok   sections: 6
      15  not observed   what Muse did before Chef started; what the reply looked like
                         (Chef can only see its own scripts)

      Nothing removed yet.
      Not sent: your name, account, list contents, recipes, location, timezone.

      Reply: "remove 9", "edit 3", "show raw", or "looks good".
```

- Pros: readable in chat, cheap removal by number, the "not observed" and "not sent" lines make the three kinds of absence visible.
- Cons: the user approves a rendering, not literal bytes. Needs the builder test to prove rendering <-> bytes are lossless. `show raw` prints the exact JSON.

#### Option P2: the exact JSON is the preview

~~~
Chef: This is the exact report that would be sent:

      ```json
      {
        "schema_version": 1,
        "class": "defect",
        "trigger": "user-initiated",
        "summary": "Shopping list puts some dairy items under the wrong store section.",
        ...
        "diagnostic_bundle": { "events": [ ... 6 events ... ], "evidence_gaps": [...] }
      }
      ```
      Reply "remove <field path>" e.g. "remove diagnostic_bundle.events[2]".
~~~

- Pros: literally byte-for-byte; nothing to trust.
- Cons: ~150 lines for a defect with 6 events; removal by path is hostile; Muse may truncate long code blocks (unverified, [Muse capabilities](https://github.com/jleonelion/chef/issues/52)).

**Prototype leaning: P1, with `show raw` always available and the final confirm stating the byte size.**

Pattern-scan hit (both options) flags the item and suggests removal, without editing it:

```
       3  summary   Milk from Safeway on 4th St goes under Produce.
                    ⚠ looks like a street address ("4th St"). Remove or edit? It stays unless you change it.
```

### 5. Remove / edit (loop)

```
> remove 8, and edit 3 to drop the store

Chef: Updated. Removed: environment (8). Edited: summary (3).
       3  summary   Milk goes under Produce in the shopping list.
      Removed fields will be listed in the report as "removed by you" (just the field
      names, not their values), so the maintainer knows it was withheld on purpose.

      Show the full report again before sending? [Show full report] [Send now]
```

- Required fields (`class`, `trigger`, `summary`, and the class's required fields) can't be removed, only edited. Chef says so.
- `post-error` `focus_invocation`: removable, but removing it turns the report into `user-initiated` (warns first).
- Removing all events drops the bundle. Removing one event keeps the rest.
- Any change after the last full preview forces a full re-render before "send" is accepted ("Send now" re-renders, then asks). Each re-render = new `submission_nonce`.

### 6. Destination-aware confirmation

```
Chef: Final check. Reply "send" to submit exactly the report above (3.1 KB).

      Where it goes:  Chef feedback intake, a private service run by the Chef maintainer.
                      Not GitHub, not Meta.
      Who sees it:    named Chef maintainers only. Every view is logged.
      How long:       deleted 90 days after receipt, or 30 days after it's closed.
      Your identity:  not included. Muse account details aren't stored.
      Afterward:      you get a receipt to check status, add a comment or delete it any time.

      Muse will then ask you to approve the "submit_feedback" action. That's expected.

> send

[Muse] Chef Feedback wants to: Submit feedback report (3.1 KB) to Chef feedback intake.
       [Allow once]  [Deny]
```

- Chef's "send" is required even if Muse's write is set to Always allow ([Muse capabilities](https://github.com/jleonelion/chef/issues/52)).
- "send" is accepted only as a reply to this exact message; anything else ("ok", "sure") re-asks.
- Off-Muse replaces this step: "This runtime can't send reports. Saved the approved report to `<data root>/diagnostics/outbox/<file>.json`." No other egress offered.

### 7. Result

Success:
```
Chef: Sent. Report ID FR-7K2Q.
      Your receipt is saved in Chef ("my reports"). It's the only way to check on or
      delete this report: Chef can't recover it if you delete it.
      Receipt secret (shown once): 9f3e-...-a1c0
```

Failure:
```
Chef: Not sent: Chef feedback intake didn't respond. The approved report is saved here
      unchanged. Say "retry report" to resend the identical report; I won't retry on my own.
      If you change anything, you'll get a new preview and a new "send".
```

- Rejected by intake (schema/size/rate limit): states the reason in plain words; no automatic trimming.

### 8. Follow-up (pull-only)

```
> my reports

Chef: 1 report
        FR-7K2Q  defect  "Milk goes under Produce in the shopping list."
                 status: triaged · 1 maintainer reply · deletes by 2027-02-12
      [Read reply] [Add a comment] [Delete report]
```

- Add a comment: same draft -> preview -> scan -> "send" loop, smaller.
- Delete: one confirmation, then immediate hard delete; receipt removed locally.
- No notifications. Chef may mention new replies only when the user opens `my reports`.

---

## Flow B: post-error reporting

```
> email me the shopping list

Chef: I couldn't build the email: something went wrong inside Chef (not your list).
      Want to report it? I'd send what failed and the Chef runs around it, nothing
      from your list. [Report this] [No thanks]
```

- Offered only for `internal-error` (Chef's fault). Not for `validation-error` (user input) or `dependency-unavailable` (connector/network) unless it repeats. See Q3.
- Offered at most once per `error_code` per conversation. "No thanks" is final for that error.
- Skips classification: class = defect, trigger = post-error, `focus_invocation` preselected, `expected` pre-drafted from the operation ("Shopping list email is built"), `actual` from the error code. User confirms or edits.
- Then steps 4-8 as Flow A. Preview marks the focus run:

```
      11  run 3  +00:41  chef-shopping-lists / export-email  internal-error  unclassified  ◀ the failure
```

---

## Flow C: enhancement (short)

```
> chef should be able to plan around my CSA box

Chef: Sounds like an enhancement. What would you want Chef to do? (I'll write it up generally.)
...
       1  class            enhancement
       2  trigger          user-initiated
       3  summary          Plan meals around a recurring produce delivery.
       4  desired_outcome  Meal plans use what's in a weekly produce box first.
      No Chef activity attached (say "attach recent activity" to include it).
```

---

## Questions to react to

- [ ] Q1. Preview: P1 (numbered readable rendering + `show raw`) or P2 (raw JSON is the preview)?
- [ ] Q2. Two confirmations (Chef "send" then Muse approval): acceptable, or does Muse's prompt make Chef's redundant when the write is classified sensitive?
- [ ] Q3. Post-error offer: only `internal-error`, or also repeated `dependency-unavailable`? Once per error code per conversation OK?
- [ ] Q4. Default diagnostic window: session events for the inferred skill (cap 50), or a fixed "last N runs"?
- [ ] Q5. Receipt secret shown once in chat: necessary, given Chef saves it locally? Showing it puts a secret in conversation history; not showing it means losing the VM loses the receipt.
- [ ] Q6. Contact: where does it enter? Prototype omits it (Muse v1 likely lacks `contact.opaque`). Ask at step 6 only when available?
- [ ] Q7. Agent-generalized drafting ("a dairy item" for "milk"): right default, or too paternalistic?
- [ ] Q8. "send" as the literal confirm word, re-asking on anything else: too strict?
