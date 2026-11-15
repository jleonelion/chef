import tasks from './recurring-tasks.json' with { type: 'json' };

export const RECURRING_TASKS = tasks;

export const DELIVERY_TASKS = RECURRING_TASKS.filter((task) => task.delivery);
