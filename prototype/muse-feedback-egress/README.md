# Spike: script-side feedback intake egress on Muse

Throwaway prototype for [Prove script-side feedback intake egress on Muse](https://github.com/jleonelion/chef/issues/64). Never merged.

## Prompts to paste into Muse

Paste each into a fresh message, in order.

**1. Create the connector**

```text
Create a custom connector with your connector tools, with exactly these details: provider `chef-feedback-spike`, API host `httpbin.org`, auth scheme `api_key`, placement header `X-Chef-Intake-Key`. Start Muse's secure entry card so I type the key there, and ask me to allow the host. Do not ask me for the key in chat.
```

In the secure entry card type the dummy key `spike-dummy-not-secret`. Never a real credential: httpbin echoes headers back. Allow `httpbin.org` when asked.

**2. Fetch and run the spike**

```text
Download https://raw.githubusercontent.com/jleonelion/chef/prototype/muse-feedback-egress/prototype/muse-feedback-egress/spike.mjs to ~/workspace/chef-spike/spike.mjs, then run `node ~/workspace/chef-spike/spike.mjs` from a script, not with your own web tools. Show me the full output verbatim. Do not retry, edit the script, or print any credential or surrogate value.
```

**3. Record what Muse did**

Note whether Muse showed an approval prompt before the POST, and what it displayed (host, method, body, or nothing). Paste the output and those notes on the ticket.

**2b. Rerun after a fix (connector folder already deleted)**

The stored key outlives the connector folder, so try this first. If it reports no surrogate, paste prompt 1 again, then this.

```text
Download https://raw.githubusercontent.com/jleonelion/chef/prototype/muse-feedback-egress/prototype/muse-feedback-egress/spike.mjs to ~/workspace/chef-spike/spike.mjs, overwriting any old copy, then run `node ~/workspace/chef-spike/spike.mjs custom.chef-feedback-spike` from a script, not with your own web tools. Show me the full output verbatim. Do not retry, edit the script, or print any credential or surrogate value. Then tell me whether you or Muse asked me to approve this request, and what that prompt showed.
```

**4. Clean up**

```text
Delete the custom connector `chef-feedback-spike` and the folder ~/workspace/chef-spike.
```

## What each result decides

| Step | If PASS | If FAIL |
|---|---|---|
| 1 surrogate | custom connectors work for a non-USDA host | script-side egress is impossible; use the fallback |
| 2 header placement | intake can authenticate on a header | intake must accept the key as a query param (logged by proxies; worse) |
| 3 POST leaves VM | Sentinel permits script-side writes with bodies | Sentinel is read-only for scripts; use the fallback |
| 4 swap | intake sees the real key, script never does | intake would receive surrogates; unusable |
| 5 byte-identical | proxy does not rewrite bodies | proxy rewrites; intake cannot verify `submission_nonce` dedupe on bytes |
| 6 approval prompt | Muse approves each send (matches the consent-first reporting experience) | only Chef's own "send" confirmation guards the write; record that as a known limit |

Note on step 4: an echoing host hands the swapped real key back to the script. Feedback intake must never echo request headers.

After prompt 4, finish in the app: Settings > Connectors > Chef Feedback Spike > View > Disconnect. authd refuses credential deletion from the VM (403).

## Results

### Run 1 (2026-11-14)

- Connector creation: Muse asked for the key in its secure entry card and asked to allow `httpbin.org`, offering **Allow always** (chosen). Registered placement: `custom_header:X-Chef-Intake-Key`.
- Muse's own generated helper (GET, read-only) reported `header_present`, `header_nonempty`, `credential_swapped` all true. Its first attempt timed out while waiting for approval.
- Spike: step 1 PASS. `authdc` returns `placement` as an **object** for a custom header, not the `query_param:api_key` string USDA returns; the spike crashed at step 2. Fixed in the next commit; steps 3 to 6 not yet run.
- Cleanup: the folders were moved to trash; the stored key needs to be disconnected in Settings.
