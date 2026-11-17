// The one-time trace notice (v1.3.0): the first captured run on a machine tells the user about the
// invocation trace, how to turn it off and how to report a problem. The trace has been on by
// default since v1.2.0, so the wording says what Chef does, never that it starts now. With the
// trace off there is nothing to tell: the user turned it off, and nothing is recorded.
import { takeLocalNotice } from '../notices.mjs';

export const TRACE_NOTICE_KEY = 'invocation-trace';

export const TRACE_NOTICE =
  'Chef keeps a short technical log on this machine of its own script runs: which script ran, how long it took and how it ended. ' +
  'It never records what you ask, recipes, or household, health or dietary details, and it never leaves this machine on its own. ' +
  'To turn it off, which also deletes it, say "turn off Chef\'s log". ' +
  'To report a problem with Chef, say "report a problem with Chef"; you see every line of the report, and nothing is sent until you say "send".';

const MESSAGE = 'Show `text` to the user once, exactly as given, with your answer. Chef will not show it again.';

// The notice to attach to this run's result, or null. Never throws: a notice must not break the skill.
export function takeTraceNotice(root, { traceOn, now = new Date() }) {
  if (!traceOn) return null;
  try {
    return takeLocalNotice(root, TRACE_NOTICE_KEY, now.toISOString().slice(0, 10)) ? { text: TRACE_NOTICE, message: MESSAGE } : null;
  } catch {
    return null;
  }
}
