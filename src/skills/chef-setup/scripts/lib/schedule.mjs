// The recurring-task proposal: which Chef tasks to offer and why. Read-only; it never
// schedules or writes. The agent creates a task only after the user says yes to it.
import { RECURRING_TASKS } from '../../../../lib/recurring-tasks.mjs';
import { readSchemaVersion } from '../../../../lib/schema.mjs';
import { readSettings } from '../../../../lib/settings.mjs';
import { muse } from '../../../../runtime/muse.mjs';
import { activeGoal } from '../../../chef-health-goals/scripts/lib/goals.mjs';

const CONDITIONS = {
  always: () => null,
  'health-goal': ({ goal }) => (goal ? null : 'no health goal is active'),
  'household-recipients': ({ settings }) => (settings.household_recipients.length ? null : 'no household recipients are set'),
  'receipt-senders': ({ settings }) => (settings.trusted_receipt_senders.length ? null : 'receipt forwarding is off'),
};

const offer = ({ name, skill, cadence, prompt, why }) => ({ name, skill, cadence, prompt, why });

export function scheduleProposal(root, { adapter = muse } = {}) {
  if (readSchemaVersion(root) === null) return { status: 'refused', data_root: root, reason: 'not a Chef data root; run chef-setup init first' };
  const state = { settings: readSettings(root).settings, goal: activeGoal(root) };
  const tasks = [];
  const not_offered = [];
  for (const task of RECURRING_TASKS) {
    const reason = CONDITIONS[task.requires](state);
    if (reason) not_offered.push({ name: task.name, reason });
    else tasks.push(offer(task));
  }
  return { status: 'proposal', data_root: root, tasks, not_offered, runtime: adapter.scheduleSetup() };
}
