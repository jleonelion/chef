// Where a built list goes. No recipients: chat. On Muse: an email payload for the runtime's
// Gmail connector (this script never sends email). Off Muse: a file in the data root.
import { writeWiki } from '../../../../lib/wiki.mjs';
import { muse } from '../../../../runtime/muse.mjs';

export const listPath = (weekStart) => `data/shopping-lists/${weekStart}.md`;

export function deliverList(root, list, { recipients, onMuse = muse.isMuse() }) {
  if (!recipients.length) return { mode: 'chat' };
  const subject = `Shopping list: week of ${list.week_start}`;
  if (onMuse) return { mode: 'email', ...muse.householdEmail({ to: recipients, subject, body: list.text }) };
  const file = listPath(list.week_start);
  const write = writeWiki(root, { data: [{ path: file, content: list.text }], message: `chef-shopping-lists: ${subject}` });
  return write.status === 'written' ? { mode: 'file', path: file } : write;
}
