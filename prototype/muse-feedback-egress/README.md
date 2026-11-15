# Spike: script-side feedback intake egress on Muse

Throwaway prototype for [Prove script-side feedback intake egress on Muse](https://github.com/jleonelion/chef/issues/64). Never merged.

## Setup (in the Muse app)

1. Ask Muse to create a custom connector: provider `chef-feedback-spike`, API host `httpbin.org`, auth scheme `api_key`, placement header `X-Chef-Intake-Key`.
2. In the secure entry card, type a dummy key: `spike-dummy-not-secret`. Never a real credential: httpbin echoes headers back.
3. Allow the host when asked.

## Run

Copy `spike.mjs` into the VM and ask Muse to run `node spike.mjs`. Paste the output and what Muse showed on the ticket.

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
