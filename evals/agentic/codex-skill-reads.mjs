// Static subset only: no shell execution, substitutions, globbing or general brace expansion.
export function codexSkillReads(command) {
  const skills = [];
  let words = [];
  const flush = () => {
    const [executable, ...args] = words;
    words = [];
    const name = executable?.text.split('/').at(-1);
    if (['sh', 'bash', 'zsh'].includes(name) && /^-(?:lc|c)$/.test(args[0]?.text ?? '')) {
      skills.push(...codexSkillReads(args[1]?.text ?? ''));
    } else if (['cat', 'sed', 'head', 'tail', 'rg', 'grep'].includes(name)) {
      let needsPattern = ['sed', 'rg', 'grep'].includes(name);
      for (let index = 0; index < args.length; index++) {
        const word = args[index];
        if (word.text.startsWith('-')) {
          if (['-n', '-c'].includes(word.text) && ['head', 'tail'].includes(name)) index++;
          if (['sed', 'rg', 'grep'].includes(name) && ['-e', '-f', '--regexp', '--file'].includes(word.text)) {
            index++;
            needsPattern = false;
          }
          continue;
        }
        if (needsPattern) {
          needsPattern = false;
          continue;
        }
        const match = word.text.match(/^(?:[^\s{}]*\/)?skills\/([\w{},-]+)\/SKILL\.md$/);
        if (!match) continue;
        const [, skill] = match;
        const brace = skill.match(/^([\w-]*)\{([\w-]+(?:,[\w-]+)+)\}([\w-]*)$/);
        if (brace && !word.literalBraces) {
          skills.push(...brace[2].split(',').map((part) => `${brace[1]}${part}${brace[3]}`));
        } else if (/^[\w-]+$/.test(skill)) {
          skills.push(skill);
        }
      }
    }
  };
  const tokens = shellTokens(command);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (typeof token !== 'string') words.push(token);
    else if (token === '>' || token === '>>') {
      if (/^\d+$/.test(words.at(-1)?.text ?? '')) words.pop();
      index++; // A redirect destination is not a read.
    } else if (token !== '<') flush();
  }
  flush();
  return skills;
}

function shellTokens(command) {
  const tokens = [];
  let word = null;
  let quote = null;
  const flush = () => {
    if (word) tokens.push(word);
    word = null;
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === '\\' && quote !== "'") {
      const next = command[++index];
      if (next === undefined) return [];
      if (next === '\n') continue;
      word ??= { text: '', literalBraces: false };
      word.text += next;
      if (/[{}]/.test(next)) word.literalBraces = true;
    } else if (quote && char === quote) {
      quote = null;
    } else if (!quote && (char === "'" || char === '"')) {
      quote = char;
      word ??= { text: '', literalBraces: false };
    } else if (quote !== "'" && (char === '`' || (char === '$' && command[index + 1] === '('))) {
      return [];
    } else if (!quote && char === '#' && !word) {
      while (index < command.length && command[index] !== '\n') index++;
      flush();
      tokens.push('\n');
    } else if (!quote && /[;&|<>\n]/.test(char)) {
      flush();
      if (char === '<' && command[index + 1] === '<') return []; // Here-doc bodies are not commands.
      if (char === '>' && command[index + 1] === '>') {
        tokens.push('>>');
        index++;
      } else tokens.push(char);
    } else if (!quote && /\s/.test(char)) {
      flush();
    } else {
      word ??= { text: '', literalBraces: false };
      word.text += char;
      if (quote && /[{}]/.test(char)) word.literalBraces = true;
    }
  }
  if (quote) return [];
  flush();
  return tokens;
}
