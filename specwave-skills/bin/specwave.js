#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function isCI() {
  return 'CI' in process.env && String(process.env.CI).length > 0;
}

function isTTY() {
  if (isCI()) return false;
  return Boolean(process.stdout.isTTY);
}

function ansi(rgb, text) {
  if (!isTTY()) return text;
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[0m`;
}

const PALETTE = {
  accent: (text) => ansi([84, 180, 255], text),
  text: (text) => ansi([235, 245, 255], text),
  dim: (text) => ansi([150, 170, 190], text),
  ok: (text) => ansi([118, 255, 170], text),
  bad: (text) => ansi([255, 120, 120], text),
  hint: (text) => ansi([255, 210, 120], text),
  create: (text) => ansi([118, 255, 170], text), // Green
  update: (text) => ansi([84, 180, 255], text),  // Blue
  merge: (text) => ansi([255, 210, 120], text),  // Yellow
  patch: (text) => ansi([216, 120, 255], text),  // Purple
  conflict: (text) => ansi([255, 120, 120], text), // Red
};

function normalizeLang(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('zh')) return 'zh';
  return 'zh';
}

const CREATE_I18N = {
  zh: {
    step_check_env: '检查环境',
    step_generate_plan: '生成初始化计划',
    step_write_files: '写入文件',

    plan_title: '初始化计划',
    plan_target_dir: '目标目录：',
    plan_target_dir_missing: '目标目录不存在：执行时将自动创建',
    plan_model: '模型：',
    plan_language: '语言：',
    plan_profile: 'profile：',

    plan_will_write: '将写入/刷新：',
    plan_machine_specwave: '- 机器区 .specwave：',
    plan_project_root: '- 项目根：',
    plan_workspace_dirs: '- 工作区 .specwave/workspace：创建/确保目录 ',
    plan_hint_legacy_workspace: '提示：检测到项目根存在旧工作区 specwave（执行时将迁移到 .specwave/workspace 并删除旧目录）',
    plan_hint_legacy_dirs_prefix: '提示：检测到根目录存在 ',
    plan_hint_legacy_dirs_suffix: '（SpecWave 不把它们作为需求入口；建议迁移到 .specwave/workspace）',

    plan_codex_assets: 'Codex 全局资源：',
    plan_slash_commands: '斜杠命令：',

    plan_details_by_group: '明细（按类）：',
    group_dir_conflicts: '【冲突（是目录）】',
    group_specwave_base: '【.specwave 基础】',
    group_specwave_prompts: '【.specwave prompts】',
    group_specwave_roles: '【.specwave roles】',
    group_project_root: '【项目根】',
    group_specwave_workspace: '【.specwave workspace】',
    group_specwave_other: '【.specwave 其他】',
    group_other: '【其他】',

    summary_prefix: '摘要：将写入/刷新 ',
    conflicts_hint: '提示：发现冲突文件，执行时会中止（避免覆盖）。',
    conflicts_suggest: '建议：换空目录执行 create。',

    confirm_write: '准备好写入这些文件了吗？(y/N) ',
    cancelled: '已取消。',
    non_tty_hint: '提示：非交互环境默认不落盘；要执行请加 --agree 或 --yes。',

    codex_router_note: '自动路由与门禁',
    codex_note_write_requirements: '写需求（澄清与拆任务）',
    codex_note_acceptance_review: '需求验收（白盒复核）',
    codex_note_report_bug: '报 Bug（复现→定位→回归）',
    codex_note_start_dev: '开始开发（执行态门禁）',

    op_note_settings_merge: '（合并设置：保留你的自定义）',
    op_note_settings: '（设置项）',
    op_note_agents: '（协作规则：受控更新并保留自定义）',
    op_note_delete: '（清理已废弃的官方托管文件）',
    op_note_pack: '（pack 定义）',
    op_note_prompt: '（提示卡）',
    op_note_role: '（角色定义）',
    op_note_agents_root: '（项目协作门禁与规范）',

    pick_model: '请选择模型（Select model）：',
    pick_language: '请选择语言（Select language）：',
    pick_index: '选择编号（Select number）：'
  },
  en: {
    step_check_env: 'Check environment',
    step_generate_plan: 'Generate plan',
    step_write_files: 'Write files',

    plan_title: 'Create plan',
    plan_target_dir: 'Target directory: ',
    plan_target_dir_missing: 'Target directory does not exist: it will be created on write',
    plan_model: 'Model: ',
    plan_language: 'Language: ',
    plan_profile: 'Profile: ',

    plan_will_write: 'Will write/update:',
    plan_machine_specwave: '- Machine area .specwave: ',
    plan_project_root: '- Project root: ',
    plan_workspace_dirs: '- Workspace .specwave/workspace: ensure dirs ',
    plan_hint_legacy_workspace: 'Hint: legacy workspace "specwave" detected (will migrate to .specwave/workspace and delete legacy dir)',
    plan_hint_legacy_dirs_prefix: 'Hint: legacy dirs detected at root: ',
    plan_hint_legacy_dirs_suffix: ' (SpecWave does not treat them as requirement inputs; consider migrating into .specwave/workspace)',

    plan_codex_assets: 'Codex global assets:',
    plan_slash_commands: 'Slash commands:',

    plan_details_by_group: 'Details (grouped):',
    group_dir_conflicts: '[Conflicts (is a directory)]',
    group_specwave_base: '[.specwave base]',
    group_specwave_prompts: '[.specwave prompts]',
    group_specwave_roles: '[.specwave roles]',
    group_project_root: '[Project root]',
    group_specwave_workspace: '[.specwave workspace]',
    group_specwave_other: '[.specwave other]',
    group_other: '[Other]',

    summary_prefix: 'Summary: will write/update ',
    conflicts_hint: 'Hint: conflicts found; execution will abort to avoid overwriting.',
    conflicts_suggest: 'Suggestion: run create in an empty directory.',

    confirm_write: 'Ready to write these files? (y/N) ',
    cancelled: 'Cancelled.',
    non_tty_hint: 'Hint: non-interactive mode does not write by default; use --agree or --yes to write.',

    codex_router_note: 'auto routing & gates',
    codex_note_write_requirements: 'Write requirements (clarify & tasks)',
    codex_note_acceptance_review: 'Acceptance review (white-box)',
    codex_note_report_bug: 'Report bug (repro→locate→regress)',
    codex_note_start_dev: 'Start development (execution gates)',

    op_note_settings_merge: '(merge settings: keep your custom)',
    op_note_settings: '(settings)',
    op_note_agents: '(collab rules: controlled update, keep custom)',
    op_note_delete: '(prune deprecated managed files)',
    op_note_pack: '(pack definition)',
    op_note_prompt: '(prompt card)',
    op_note_role: '(role definition)',
    op_note_agents_root: '(project collaboration gates & rules)',

    pick_model: 'Select model:',
    pick_language: 'Select language:',
    pick_index: 'Select number:'
  }
};

function tCreate(lang, key) {
  const normalized = normalizeLang(lang);
  const dict = CREATE_I18N[normalized] || CREATE_I18N.zh;
  return dict[key] || CREATE_I18N.zh[key] || key;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const NEON_ART = `
   _____                 _       __
  / ___/____  ___  _____| |     / /___ __   _____
  \\__ \\/ __ \\/ _ \\/ ___/ | /| / / __ \`/ | / / _ \\
 ___/ / /_/ /  __/ /__ | |/ |/ / /_/ /| |/ /  __/
/____/ .___/\\___/\\___/ |__/|__/\\__,_/ |___/\\___/
    /_/
`;

let CURRENT_CREATE_LANG = 'zh';

function setCreateUiLang(value) {
  CURRENT_CREATE_LANG = normalizeLang(value);
}

function getCreateUiLang() {
  return CURRENT_CREATE_LANG;
}

function getCreateSubtitle() {
  const lang = getCreateUiLang();
  if (lang === 'en') return 'Setup wizard: install SpecWave resources and enable Codex routing';
  return '初始化向导：生成 SpecWave 规范资源，并启用 Codex 路由技能';
}

function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  
  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function renderNeonLogo(timeOverride) {
  const lines = NEON_ART.split('\n').filter(line => line.length > 0);
  const reset = '\x1b[0m';
  let output = '';
  
  // Pick a static time that looks good (highlight in middle)
  const time = timeOverride !== undefined ? timeOverride : 37.5; 

  lines.forEach((line, y) => {
    let outputLine = '';
    for (let x = 0; x < line.length; x++) {
      if (line[x] === ' ') {
        outputLine += ' ';
        continue;
      }

      // Cyberpunk Neon Logic (Static Snapshot)
      let hue = (time * 0.02 + (x - y * 3) * 0.02) % 1;
      if (hue < 0) hue += 1;

      let sat = 1.0;

      // Highlight logic
      const highlightPos = (time * 0.8) % (line.length + 20) - 10;
      const dist = Math.abs(x - highlightPos);
      
      let val = 0.8;
      if (dist < 3) {
        val = 1.0; 
        sat = 0.3; 
      } else if (dist < 6) {
        val = 0.9; 
        sat = 0.8;
      }

      const [r, g, b] = hsvToRgb(hue, sat, val);
      outputLine += `\x1b[38;2;${r};${g};${b}m` + line[x];
    }
    output += outputLine + reset + '\n';
  });
  
  return output;
}

async function animateIntro() {
  if (!isTTY()) return;

  const totalFrames = 30;
  const interval = 40;
  const lines = NEON_ART.split('\n').filter(line => line.length > 0);
  const linesCount = lines.length + 2; // +2 for padding newlines

  process.stdout.write('\x1b[?25l'); // Hide cursor

  for (let i = 0; i < totalFrames; i++) {
    const time = i * 2.0;
    const content = '\n' + renderNeonLogo(time) + '\n';
    process.stdout.write(content);
    
    await new Promise(resolve => setTimeout(resolve, interval));
    
    if (i < totalFrames - 1) {
      process.stdout.write(`\x1b[${linesCount}A`);
    }
  }
  
  process.stdout.write(`\x1b[${linesCount}A`);
  process.stdout.write('\x1b[J');
  process.stdout.write('\x1b[?25h'); // Show cursor
}

function renderBanner() {
  if (!isTTY()) return;

  process.stdout.write('\n');
  process.stdout.write(renderNeonLogo());
  process.stdout.write('\n');
  process.stdout.write(PALETTE.text(getCreateSubtitle()) + '\n\n');
}

function getNeonLogoLineCount() {
  return NEON_ART.split('\n').filter((line) => line.length > 0).length;
}

function getCreateHeaderRowCount() {
  // logo + subtitle + blank line
  return getNeonLogoLineCount() + 2;
}

function enablePinnedCreateHeader() {
  if (!isTTY()) return null;
  if (!process.stdout.rows || process.stdout.rows < 10) return null;

  const headerRows = getCreateHeaderRowCount();
  const top = headerRows + 1;
  const bottom = process.stdout.rows;

  process.stdout.write('\x1b[?25l'); // Hide cursor
  process.stdout.write('\x1b[2J'); // Clear screen
  process.stdout.write('\x1b[H'); // Home
  process.stdout.write(renderNeonLogo() + '\n');
  process.stdout.write(PALETTE.text(getCreateSubtitle()) + '\n\n');
  process.stdout.write(`\x1b[${top};${bottom}r`); // Set scroll region (keep header fixed)
  process.stdout.write(`\x1b[${top};1H`); // Move cursor to start of scroll region

  return {
    headerRows,
    disable() {
      process.stdout.write('\x1b[r'); // Reset scroll region
      // Windows Terminal + PowerShell 有时不会立刻把 viewport 拉回“最底部”，导致看起来像卡住；
      // 把光标移动到可视区底部并清掉尾部残留，能避免用户需要反复按回车才能回到正常提示符。
      process.stdout.write('\x1b[0m'); // Reset attributes
      process.stdout.write('\x1b[999;1H'); // Move cursor to bottom row
      process.stdout.write('\x1b[2K'); // Clear current line
      process.stdout.write('\x1b[0J'); // Clear to end of screen
      process.stdout.write('\x1b[?25h'); // Show cursor
    }
  };
}

function printStep(stepIndex, totalSteps, title) {
  if (!isTTY()) {
    process.stdout.write(`[${stepIndex}/${totalSteps}] ${title}\n`);
    return;
  }
  process.stdout.write(PALETTE.accent(`▶ 阶段 ${stepIndex}/${totalSteps} `) + PALETTE.text(title) + '\n\n');
}

function startSpinner(text) {
  if (!isTTY()) {
    process.stdout.write(`${text}\n`);
    return {
      succeed: (finalText) => {
        process.stdout.write(`OK  ${finalText ?? text}\n`);
      },
      fail: (finalText) => {
        process.stdout.write(`ERR ${finalText ?? text}\n`);
      }
    };
  }

  let frameIndex = 0;
  const tick = () => {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    frameIndex += 1;
    process.stdout.write(`\r${PALETTE.accent(frame)} ${PALETTE.dim(text)}\x1b[0K`);
  };

  tick();
  const timer = setInterval(tick, 80);

  const stop = (symbol, color, finalText) => {
    clearInterval(timer);
    process.stdout.write(`\r${color(symbol)} ${PALETTE.text(finalText)}\x1b[0K\n`);
  };

  return {
    succeed(finalText) {
      stop('✓', PALETTE.ok, finalText ?? text);
    },
    fail(finalText) {
      stop('✕', PALETTE.bad, finalText ?? text);
    }
  };
}

function printHelp() {
  const helpText = `
SpecWave CLI（来自 specwave-skills）

用法：
  specwave <command> [options]

命令：
  create    初始化目录为 SpecWave Skills 项目（默认先输出计划并二次确认）
  catalog   输出已安装 pack/roles/prompts 的索引信息

create 选项：
  --dir <目录>            目标目录（默认当前目录）
  --pack <packId>         pack 包（默认 core）
  --profile <light|full>  安装档位（默认 light）
  --plan                  只输出计划，不落盘
  --agree                 确认执行并落盘（非交互）
  --yes                   同 --agree

catalog 选项：
  --format <text|machine> 输出格式（默认 text）
  --only <packs|roles|prompts>  （兼容：skills 等价于 roles）

codex 选项：
  install                 安装 Codex 全局资源（specwave-router + SpecWave 斜杠命令）（支持 --plan/--yes）

示例：
  specwave create
  specwave create --plan
  specwave create --agree
  specwave catalog --format machine
  specwave codex install --plan
`.trim();

  process.stdout.write(helpText + '\n');
}

function exitWithError(message) {
  process.stderr.write(`[specwave] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    command: null,
    positionals: [],
    options: {}
  };

  if (argv.length === 0) return args;
  args.command = argv[0];

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      args.positionals.push(token);
      continue;
    }

    const name = token.slice(2);
    const next = argv[index + 1];

    const isFlag = next === undefined || next.startsWith('--');

    args.options[name] = isFlag ? true : next;
    if (!isFlag) index += 1;
  }

  return args;
}

function isTruthyOption(value) {
  return value === true || value === 'true' || value === '1';
}

function promptYesNo(questionText) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(questionText, (answer) => {
      rl.close();
      const normalized = String(answer || '').trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

function countTerminalCharWidth(char) {
  const codePoint = char.codePointAt(0);
  if (!codePoint) return 0;
  // 粗略处理：CJK 统一按 2 列宽（对齐“视觉行数”的目的足够）
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK + Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul Syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) || // Vertical forms
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || // CJK Compatibility Forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth Forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

function withStdoutRowCounting(fn) {
  const columns = typeof process.stdout.columns === 'number' && process.stdout.columns > 0 ? process.stdout.columns : 120;
  let rowCount = 0;
  let col = 0;
  let inEscape = false;
  let escapeSawBracket = false;

  const originalWrite = process.stdout.write.bind(process.stdout);

  const countText = (text) => {
    const value = String(text ?? '');
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];

      // ANSI escape：忽略其对列宽的影响（尽量稳）
      if (inEscape) {
        const code = value.charCodeAt(index);
        // 仅处理常见 CSI：ESC [ ... <final>
        if (!escapeSawBracket) {
          if (char === '[') {
            escapeSawBracket = true;
          } else {
            // 非 CSI：按单字符 escape 处理
            inEscape = false;
          }
          continue;
        }
        // CSI 终止符通常在 0x40~0x7E（例如 m、K、J、A）
        if (code >= 0x40 && code <= 0x7e) {
          inEscape = false;
          escapeSawBracket = false;
        }
        continue;
      }
      if (char === '\x1b') {
        inEscape = true;
        escapeSawBracket = false;
        continue;
      }

      if (char === '\r') {
        col = 0;
        continue;
      }
      if (char === '\n') {
        rowCount += 1;
        col = 0;
        continue;
      }

      const width = countTerminalCharWidth(char);
      col += width;
      if (col >= columns) {
        rowCount += 1;
        col = col % columns;
      }
    }
  };

  process.stdout.write = (...args) => {
    const chunk = args[0];
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    countText(text);
    return originalWrite(...args);
  };

  try {
    const value = fn();
    return { value, rowCount };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function promptYesNoWithLogoAnimation(questionText, offsetToLogo) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !isTTY()) {
    return promptYesNo(questionText);
  }

  return new Promise((resolve) => {
    process.stdout.write('\x1b[?25l'); // Hide cursor
    process.stdout.write(questionText);

    let frame = 0;
    let finished = false;

    const timer = setInterval(() => {
      if (finished) return;
      frame += 1;

      const time = frame * 2.0;
      const logo = renderNeonLogo(time);

      process.stdout.write('\x1b[s'); // Save cursor at prompt
      process.stdout.write(`\x1b[${Math.max(0, offsetToLogo)}A`);
      process.stdout.write('\x1b[0G'); // Column 1

      // Clear and redraw logo lines without touching the rest of the output.
      const logoLines = logo.split('\n').filter((line) => line.length > 0);
      for (let index = 0; index < logoLines.length; index += 1) {
        process.stdout.write('\x1b[2K' + logoLines[index] + '\n');
      }

      process.stdout.write('\x1b[u'); // Restore cursor to prompt
    }, 60);

    const cleanup = (result, echo) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      process.stdin.removeListener('data', onData);
      try {
        process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
      process.stdout.write('\x1b[?25h'); // Show cursor
      process.stdout.write((echo ?? '') + '\n');
      resolve(result);
    };

    const onData = (data) => {
      const char = data.toString();

      if (char === 'y' || char === 'Y') {
        cleanup(true, 'y');
        return;
      }
      if (char === 'n' || char === 'N') {
        cleanup(false, 'n');
        return;
      }
      if (char === '\r' || char === '\n') {
        cleanup(true, 'y');
        return;
      }
      if (char === '\x1b') {
        cleanup(false, 'n');
        return;
      }
      if (char === '\u0003') {
        cleanup(false, '');
        process.exit(0);
      }
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    } catch {
      // Fallback if raw mode isn't available.
      clearInterval(timer);
      process.stdout.write('\x1b[?25h');
      promptYesNo(questionText).then(resolve);
    }
  });
}

function promptYesNoWithPinnedHeaderAnimation(questionText, renderHeader) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !isTTY()) {
    return promptYesNo(questionText);
  }

  return new Promise((resolve) => {
    process.stdout.write('\x1b[?25l'); // Hide cursor
    process.stdout.write(questionText);

    let frame = 0;
    let finished = false;

    const timer = setInterval(() => {
      if (finished) return;
      frame += 1;
      const time = frame * 2.0;

      process.stdout.write('\x1b[s'); // Save cursor at prompt
      process.stdout.write('\x1b[H'); // Home (top of viewport, outside scroll region)
      process.stdout.write(renderHeader(time));
      process.stdout.write('\x1b[u'); // Restore cursor to prompt
    }, 60);

    const cleanup = (result, echo) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      process.stdin.removeListener('data', onData);
      try {
        process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
      process.stdout.write('\x1b[?25h'); // Show cursor
      process.stdout.write((echo ?? '') + '\n');
      resolve(result);
    };

    const onData = (data) => {
      const char = data.toString();

      if (char === 'y' || char === 'Y') {
        cleanup(true, 'y');
        return;
      }
      if (char === 'n' || char === 'N') {
        cleanup(false, 'n');
        return;
      }
      if (char === '\r' || char === '\n') {
        cleanup(true, 'y');
        return;
      }
      if (char === '\x1b') {
        cleanup(false, 'n');
        return;
      }
      if (char === '\u0003') {
        cleanup(false, '');
        process.exit(0);
      }
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    } catch {
      clearInterval(timer);
      process.stdout.write('\x1b[?25h');
      promptYesNo(questionText).then(resolve);
    }
  });
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, { encoding: 'utf8' });
}

function parseFrontMatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== '---') return { data: {}, body: markdown };

  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === '---') {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) return { data: {}, body: markdown };

  const frontMatterLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join('\n');
  const data = parseSimpleYaml(frontMatterLines);
  return { data, body };
}

function parseSimpleYaml(lines) {
  const result = {};
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('- ')) {
      if (!currentKey) continue;
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(line.slice(2).trim());
      continue;
    }

    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim();
    currentKey = key;

    if (value === '') {
      result[key] = [];
      continue;
    }

    if (/^-?\d+$/.test(value)) {
      result[key] = Number(value);
      continue;
    }

    result[key] = stripYamlQuotes(value);
  }

  return result;
}

function stripYamlQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function listFilesRecursively(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];

  const result = [];
  const queue = [directoryPath];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      result.push(entryPath);
    }
  }

  return result;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function tryStat(directoryPath) {
  try {
    if (!fs.existsSync(directoryPath)) return { exists: false, stat: null };
    return { exists: true, stat: fs.statSync(directoryPath) };
  } catch {
    return { exists: false, stat: null };
  }
}

function isDirectoryPath(targetPath) {
  const { exists, stat } = tryStat(targetPath);
  return exists && Boolean(stat && stat.isDirectory());
}

function isFilePath(targetPath) {
  const { exists, stat } = tryStat(targetPath);
  return exists && Boolean(stat && stat.isFile());
}

function countChineseChars(text) {
  const matches = String(text || '').match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function isGoodCnSummary(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/(概括|待补充|todo|tbd)/i.test(value)) return false;
  return countChineseChars(value) >= 4;
}

function normalizeCnSummary(text) {
  const raw = String(text || '')
    .replace(/[`*_>#]/g, '')
    .replace(/[()（）]/g, '')
    .replace(/[\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Prefer the first clause (more like a title).
  const firstClause = raw.split(/[。；;!?！?\n]/)[0].trim();
  const cleaned = firstClause.replace(/^[\-\*\d\.\)\(]+/g, '').trim();
  if (cleaned.length <= 18) return cleaned;
  return cleaned.slice(0, 18).trim();
}

function extractFirstMeaningfulLine(markdown, headingKeywords) {
  const lines = String(markdown || '').split(/\r?\n/);
  const wanted = Array.isArray(headingKeywords) ? headingKeywords : [];

  const isHeading = (line) => /^\s*#{1,6}\s+/.test(line);
  const getHeadingText = (line) => String(line || '').replace(/^\s*#{1,6}\s+/, '').trim();

  for (const keyword of wanted) {
    const keywordText = String(keyword || '').trim();
    if (!keywordText) continue;

    let inSection = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isHeading(line)) {
        inSection = getHeadingText(line) === keywordText;
        continue;
      }
      if (!inSection) continue;
      if (isHeading(line)) break;

      const trimmed = String(line || '').trim();
      if (!trimmed) continue;
      // Stop when reaching next section.
      if (isHeading(trimmed)) break;
      // Use the first non-empty line; allow bullets.
      return trimmed.replace(/^[\-\*]\s+/, '').trim();
    }
  }

  // Fallback: first non-empty non-heading line.
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (isHeading(trimmed)) continue;
    return trimmed.replace(/^[\-\*]\s+/, '').trim();
  }

  return '';
}

function deriveCnSummaryFromWorkDir(workDirPath, kind) {
  const candidates = [
    '01-需求.md',
    '02-任务.md',
    '03-追溯.md',
    '04-验收.md',
    '05-规则.md',
    // Legacy (keep for migration compatibility)
    '01-诉求.md',
    '02-需求.md',
    '03-任务.md',
    '05-验收.md',
    '06-规则.md',
    'intent.md',
    'requirements.md',
    'work.md',
    'trace.md',
    'accept.md',
    'rules.md'
  ];
  const headingOrderByKind = {
    story: ['你最终会看到什么', '需求概览', '诉求', '目标', '期望效果', '背景'],
    bug: ['现象', '复现', '期望', '实际', '风险/止损', '背景', '诉求']
  };

  const keywords = headingOrderByKind[kind] ?? headingOrderByKind.story;

  for (const fileName of candidates) {
    const filePath = path.join(workDirPath, fileName);
    if (!isFilePath(filePath)) continue;
    const content = readFileUtf8(filePath);
    const line = extractFirstMeaningfulLine(content, keywords);
    const normalized = normalizeCnSummary(line);
    if (isGoodCnSummary(normalized)) return normalized;
  }

  return '';
}

function mergeDirectoryContents(sourceDir, targetDir) {
  ensureDirectory(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (fs.existsSync(targetPath)) {
      exitWithError(`迁移冲突：目标已存在同名条目：${targetPath}`);
    }
    ensureDirectory(path.dirname(targetPath));
    movePathWithFallback(sourcePath, targetPath);
  }
  fs.rmSync(sourceDir, { recursive: true, force: true });
}

function movePathWithFallback(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    if (code === 'EPERM' || code === 'EACCES') {
      fs.cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true });
      fs.rmSync(sourcePath, { recursive: true, force: true });
      return;
    }
    throw error;
  }
}

function normalizeWorkItemDirs({ workspaceRoot }) {
  const storiesRoot = path.join(workspaceRoot, 'stories');
  const bugsRoot = path.join(workspaceRoot, 'bugs');

  // 支持 -草稿 后缀：STORY-000001(概要) 或 STORY-000001(概要)-草稿
  const storyRe = /^STORY-(\d{6})(?:\(([^)]+)\))?(?:-草稿)?$/;
  const bugRe = /^BUG-(\d{6})-(\d{2,})(?:\(([^)]+)\))?$/;

  const normalizeIn = (rootDir, kind) => {
    if (!isDirectoryPath(rootDir)) return;
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'archive') continue;

      const currentName = entry.name;
      const currentPath = path.join(rootDir, currentName);

      const match = kind === 'story' ? currentName.match(storyRe) : currentName.match(bugRe);
      if (!match) {
        exitWithError(`工作区目录命名不合规：${currentName}（请使用 ${kind === 'story' ? 'STORY-000001(示例标题)' : 'BUG-000001-01(示例标题)'}）`);
      }

      const idPart = kind === 'story' ? match[1] : `${match[1]}-${match[2]}`;
      const existingSummary = String(kind === 'story' ? match[2] : match[3] || '').trim();
      const summaryFromName = normalizeCnSummary(existingSummary);

      let summary = summaryFromName;
      if (!isGoodCnSummary(summary)) {
        summary = deriveCnSummaryFromWorkDir(currentPath, kind);
      }

      if (!isGoodCnSummary(summary)) {
        exitWithError(`无法推导中文短标题：${currentName}（请补齐括号内中文短标题）`);
      }

      const nextName =
        kind === 'story'
          ? `STORY-${idPart}(${summary})`
          : `BUG-${idPart}(${summary})`;

      if (nextName === currentName) continue;
      const nextPath = path.join(rootDir, nextName);
      if (fs.existsSync(nextPath)) {
        exitWithError(`改名冲突：目标已存在：${nextName}`);
      }
      movePathWithFallback(currentPath, nextPath);
    }
  };

  normalizeIn(storiesRoot, 'story');
  normalizeIn(bugsRoot, 'bug');
}

function pad3(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const intValue = Math.floor(Math.abs(numberValue));
  if (intValue > 999) return String(intValue);
  return String(intValue).padStart(3, '0');
}

function normalizeStableIdsZh(markdown) {
  let next = String(markdown ?? '');

  // Normalize existing stable IDs (ensure 3-digit padding).
  next = next.replace(/\bREQ-(\d{1,3})\b/g, (_, n) => `REQ-${pad3(n) ?? n}`);
  next = next.replace(/\bAC-(\d{1,3})\b/g, (_, n) => `AC-${pad3(n) ?? n}`);
  next = next.replace(/\bT-(\d{1,3})\b/g, (_, n) => `T-${pad3(n) ?? n}`);

  // Migrate legacy IDs (需求/验收/任务) into stable IDs.
  next = next.replace(/需求-(\d{1,3})/g, (_, n) => `REQ-${pad3(n) ?? n}`);
  next = next.replace(/验收-(\d{1,3})/g, (_, n) => `AC-${pad3(n) ?? n}`);
  next = next.replace(/任务-(\d{1,3})/g, (_, n) => `T-${pad3(n) ?? n}`);

  // Also support "需求 1" style (best-effort, avoid matching headers like "第1次").
  next = next.replace(/(^|\s)需求\s+(\d{1,3})(?=[\s：:])/g, (m, prefix, n) => `${prefix}REQ-${pad3(n) ?? n}`);
  next = next.replace(/(^|\s)验收\s+(\d{1,3})(?=[\s：:])/g, (m, prefix, n) => `${prefix}AC-${pad3(n) ?? n}`);
  next = next.replace(/(^|\s)任务\s+(\d{1,3})(?=[\s：:])/g, (m, prefix, n) => `${prefix}T-${pad3(n) ?? n}`);

  return next;
}

function normalizeStoryDocsZh({ storyDir }) {
  const targetNames = [
    '01-需求.md',
    '02-设计.md',
    '03-任务.md',
    // Legacy (keep for migration compatibility)
    '01-诉求.md',
    '02-需求.md',
    '02-任务.md',
    '03-设计.md',
    'intent.md',
    'requirements.md',
    'design.md',
    'work.md',
    'tasks.md'
  ];

  for (const name of targetNames) {
    const filePath = path.join(storyDir, name);
    if (!isFilePath(filePath)) continue;
    const before = readFileUtf8(filePath);
    const after = normalizeStableIdsZh(before);
    if (after !== before) {
      fs.writeFileSync(filePath, after, { encoding: 'utf8' });
    }
  }
}

function normalizeStoryFilesZh({ workspaceRoot }) {
  const storiesRoot = path.join(workspaceRoot, 'stories');
  if (!isDirectoryPath(storiesRoot)) return;

  const mergeMarkdownInto = ({ targetPath, sourcePath, sourceLabel }) => {
    if (!isFilePath(sourcePath)) return false;
    if (!fs.existsSync(targetPath)) {
      ensureDirectory(path.dirname(targetPath));
      movePathWithFallback(sourcePath, targetPath);
      return true;
    }
    if (!isFilePath(targetPath)) {
      exitWithError(`Story 文件迁移冲突：目标不是文件：${targetPath}`);
    }

    const sourceText = readFileUtf8(sourcePath).trim();
    if (sourceText.length === 0) {
      fs.rmSync(sourcePath, { force: true });
      return true;
    }

    const targetText = readFileUtf8(targetPath).trimEnd();
    const merged =
      targetText.length > 0
        ? `${targetText}\n\n---\n\n## 迁移内容（来自 ${sourceLabel}）\n\n${sourceText}\n`
        : `${sourceText}\n`;
    fs.writeFileSync(targetPath, merged.trimEnd() + '\n', { encoding: 'utf8' });
    fs.rmSync(sourcePath, { force: true });
    return true;
  };

  const ensureCanonical = ({ storyDir, targetName, candidates }) => {
    const targetPath = path.join(storyDir, targetName);
    if (fs.existsSync(targetPath) && !isFilePath(targetPath)) {
      exitWithError(`Story 文件迁移冲突：目标存在同名非文件：${targetPath}`);
    }
    let hasTarget = isFilePath(targetPath);

    for (const sourceName of candidates) {
      const sourcePath = path.join(storyDir, sourceName);
      if (!isFilePath(sourcePath)) continue;
      if (!hasTarget) {
        movePathWithFallback(sourcePath, targetPath);
        hasTarget = true;
        continue;
      }
      mergeMarkdownInto({ targetPath, sourcePath, sourceLabel: sourceName });
    }
  };

  const entries = fs.readdirSync(storiesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') continue;

    const storyDir = path.join(storiesRoot, entry.name);

    const refsDir = path.join(storyDir, 'refs');
    if (fs.existsSync(refsDir) && !isDirectoryPath(refsDir)) {
      exitWithError(`Story refs 冲突：存在同名文件：${refsDir}`);
    }
    ensureDirectory(refsDir);

    // Canonical story docs (current standard):
    // - 01-需求.md (merged from legacy 01-诉求/02-需求/intent/requirements)
    // - 02-设计.md (merged from legacy 03-设计/design)
    // - 03-任务.md (merged from legacy 02-任务/work/tasks)
    ensureCanonical({
      storyDir,
      targetName: '01-需求.md',
      candidates: ['02-需求.md', 'requirements.md', '01-诉求.md', 'intent.md']
    });
    ensureCanonical({
      storyDir,
      targetName: '02-设计.md',
      candidates: ['03-设计.md', 'design.md']
    });
    ensureCanonical({
      storyDir,
      targetName: '03-任务.md',
      candidates: ['02-任务.md', 'work.md', 'tasks.md']
    });

    // Normalize IDs inside story docs (REQ/AC/T). Keep it idempotent.
    normalizeStoryDocsZh({ storyDir });
  }
}

function migrateLegacyWorkspaceIfNeeded({ targetRoot, workspaceRoot }) {
  const legacyWorkspaceRoot = path.join(targetRoot, 'specwave');
  const legacyStat = tryStat(legacyWorkspaceRoot);
  if (!legacyStat.exists) return { migrated: false };
  if (!legacyStat.stat || !legacyStat.stat.isDirectory()) {
    exitWithError('工作区迁移失败：项目根存在 specwave 同名文件（需要先手动处理）');
  }

  ensureDirectory(workspaceRoot);

  const migrateSection = (name) => {
    const src = path.join(legacyWorkspaceRoot, name);
    if (!isDirectoryPath(src)) return;

    const dest = path.join(workspaceRoot, name);
    if (fs.existsSync(dest) && !isDirectoryPath(dest)) {
      exitWithError(`迁移冲突：目标不是目录：${dest}`);
    }
    mergeDirectoryContents(src, dest);
  };

  migrateSection('stories');
  migrateSection('bugs');
  migrateSection('specs');

  // Move any remaining entries under legacy root into _legacy (avoid leaving root specwave).
  const remaining = fs.readdirSync(legacyWorkspaceRoot, { withFileTypes: true });
  if (remaining.length > 0) {
    const legacyDest = path.join(workspaceRoot, '_legacy-root-specwave');
    ensureDirectory(legacyDest);
    for (const entry of remaining) {
      const src = path.join(legacyWorkspaceRoot, entry.name);
      const dest = path.join(legacyDest, entry.name);
      if (fs.existsSync(dest)) exitWithError(`迁移冲突：_legacy 下已存在同名条目：${entry.name}`);
      movePathWithFallback(src, dest);
    }
  }

  fs.rmSync(legacyWorkspaceRoot, { recursive: true, force: true });

  normalizeWorkItemDirs({ workspaceRoot });

  return { migrated: true };
}

function writeFileFromTemplate(sourcePath, targetPath) {
  const content = readFileUtf8(sourcePath);
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
}

function readJsonIfPossible(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, value: null };
    const raw = readFileUtf8(filePath);
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return { ok: false, value: null };
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
}

function mergeSettings(templateObj, existingObj) {
  const template = templateObj && typeof templateObj === 'object' ? templateObj : {};
  const existing = existingObj && typeof existingObj === 'object' ? existingObj : {};

  const merged = {};

  // 1) 先用模板作为“最高规范”
  for (const key of Object.keys(template)) merged[key] = template[key];

  // 2) 保留用户扩展（模板没有定义的顶层字段）
  for (const key of Object.keys(existing)) {
    if (!(key in template)) merged[key] = existing[key];
  }

  // 3) specwave：强制刷新 version，但保留其余字段（如果用户扩展）
  if (template.specwave && typeof template.specwave === 'object') {
    const existingSpecwave = existing.specwave && typeof existing.specwave === 'object' ? existing.specwave : {};
    merged.specwave = { ...existingSpecwave, ...template.specwave };
    if ('version' in template.specwave) merged.specwave.version = template.specwave.version;
  }

  // 4) executionGate：完全由模板定义（强制规范）
  if ('executionGate' in template) merged.executionGate = template.executionGate;

  // 4.5) currentSession：运行时状态，create/refresh 不应把用户的会话锁定清空
  // - 模板里通常是 null（表示“无会话”），但如果用户当前正在 spec 会话中，应当保留现状。
  if ('currentSession' in existing) {
    const session = existing.currentSession;
    if (session != null) merged.currentSession = session;
  }

  // 5) requirementsTemplate：
  // - 旧版本默认值会让协作变“重”（首次进入就提模板选择等）。
  // - 这里做一次温和迁移：如果用户没有自定义（仍是 default-* 且没有 customTemplateText），就用新模板覆盖为轻量默认。
  // - 如果用户确实自定义过，则尊重用户配置，并用模板补齐缺失字段。
  if (template.requirementsTemplate && typeof template.requirementsTemplate === 'object') {
    const existingReq = existing.requirementsTemplate && typeof existing.requirementsTemplate === 'object'
      ? existing.requirementsTemplate
      : {};
    const existingTemplateId = typeof existingReq.templateId === 'string' ? existingReq.templateId : '';
    const hasCustomText = existingReq.customTemplateText != null && String(existingReq.customTemplateText).trim().length > 0;
    const looksLikeLegacyDefault = !hasCustomText && existingTemplateId.startsWith('default-');
    merged.requirementsTemplate = looksLikeLegacyDefault
      ? { ...template.requirementsTemplate }
      : { ...template.requirementsTemplate, ...existingReq };
  }

  return merged;
}

function writeSettingsMergedFromTemplate(sourcePath, targetPath) {
  const templateRaw = readFileUtf8(sourcePath);
  const templateJson = JSON.parse(templateRaw);

  const existing = readJsonIfPossible(targetPath);
  const merged = existing.ok ? mergeSettings(templateJson, existing.value) : templateJson;

  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf8' });
}

function extractSpecwaveManagedBlock(templateText) {
  const startMatch = templateText.match(/<!--\s*SPECWAVE:START\s+([^\s]+)\s*-->/);
  const endMatch = templateText.match(/<!--\s*SPECWAVE:END\s+([^\s]+)\s*-->/);
  if (!startMatch || !endMatch) return null;

  const start = startMatch[0];
  const end = endMatch[0];
  const startIndex = templateText.indexOf(start);
  const endIndex = templateText.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;

  const block = templateText.slice(startIndex, endIndex + end.length);
  return { startMarker: start, endMarker: end, block };
}

function patchAgentsFromTemplate(sourcePath, targetPath) {
  const templateText = readFileUtf8(sourcePath);
  const extracted = extractSpecwaveManagedBlock(templateText);
  if (!extracted) {
    exitWithError('AGENTS 模板缺少 SPECWAVE:START/END 标记（模板错误）');
  }

  const { startMarker, endMarker, block } = extracted;
  const exists = fs.existsSync(targetPath);
  const existingText = exists ? readFileUtf8(targetPath) : '';

  let nextText = '';
  if (!exists || existingText.trim().length === 0) {
    nextText = templateText;
  } else if (existingText.includes(startMarker) && existingText.includes(endMarker)) {
    const startIndex = existingText.indexOf(startMarker);
    const endIndex = existingText.indexOf(endMarker);
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      const before = existingText.slice(0, startIndex);
      const after = existingText.slice(endIndex + endMarker.length);
      nextText = before + block + after;
    } else {
      nextText = block + '\n\n' + existingText;
    }
  } else {
    nextText = block + '\n\n' + existingText;
  }

  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, nextText.trimEnd() + '\n', { encoding: 'utf8' });
}

function createPlanOp({ kind, sourcePath, targetPath, action }) {
  const exists = fs.existsSync(targetPath);
  const isDirectory = exists ? fs.statSync(targetPath).isDirectory() : false;
  return {
    kind,
    sourcePath,
    targetPath,
    exists,
    isDirectory,
    action
  };
}

function createDeletePlanOp({ kind, targetPath }) {
  const exists = fs.existsSync(targetPath);
  const isDirectory = exists ? fs.statSync(targetPath).isDirectory() : false;
  return {
    kind,
    sourcePath: null,
    targetPath,
    exists,
    isDirectory,
    action: 'delete'
  };
}

function copyFilePlan(sourcePath, targetPath) {
  const exists = fs.existsSync(targetPath);
  const isDirectory = exists ? fs.statSync(targetPath).isDirectory() : false;
  return {
    type: 'write',
    sourcePath,
    targetPath,
    exists,
    isDirectory
  };
}

function resolvePackProfileRoot(packId, profile) {
  const direct = path.resolve(__dirname, '..', 'resources', 'packs', packId, profile);
  if (fs.existsSync(direct)) return { root: direct, effectiveProfile: profile };

  if (profile === 'full') {
    const fallback = path.resolve(__dirname, '..', 'resources', 'packs', packId, 'light');
    if (fs.existsSync(fallback)) return { root: fallback, effectiveProfile: 'light' };
  }

  return { root: direct, effectiveProfile: profile };
}

function getPackMetaFromResources(packId, profile) {
  try {
    const packMetaPath = path.resolve(__dirname, '..', 'resources', 'packs', packId, profile, '.specwave', 'pack.md');
    if (!isFilePath(packMetaPath)) return { model: null, language: null };
    const parsed = parseFrontMatter(readFileUtf8(packMetaPath));
    const model = typeof parsed.data.model === 'string' && parsed.data.model.trim().length > 0 ? parsed.data.model.trim() : null;
    const language =
      typeof parsed.data.language === 'string' && parsed.data.language.trim().length > 0
        ? parsed.data.language.trim()
        : typeof parsed.data.lang === 'string' && parsed.data.lang.trim().length > 0
          ? parsed.data.lang.trim()
          : null;
    return { model, language };
  } catch {
    return { model: null, language: null };
  }
}

function listAvailablePackVariants() {
  const packsRoot = path.resolve(__dirname, '..', 'resources', 'packs');
  if (!fs.existsSync(packsRoot)) return [];

  const results = [];
  const packEntries = fs.readdirSync(packsRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const packEntry of packEntries) {
    const packId = packEntry.name;
    const packRoot = path.join(packsRoot, packId);
    const profileEntries = fs.readdirSync(packRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const profileEntry of profileEntries) {
      const profile = profileEntry.name;
      const packMetaPath = path.join(packRoot, profile, '.specwave', 'pack.md');
      if (!isFilePath(packMetaPath)) continue;

      let meta = { data: {}, body: '' };
      try {
        meta = parseFrontMatter(readFileUtf8(packMetaPath));
      } catch {}

      const model = typeof meta.data.model === 'string' && meta.data.model.trim().length > 0 ? meta.data.model.trim() : null;
      const language =
        typeof meta.data.language === 'string' && meta.data.language.trim().length > 0
          ? meta.data.language.trim()
          : typeof meta.data.lang === 'string' && meta.data.lang.trim().length > 0
            ? meta.data.lang.trim()
            : null;
      const name = typeof meta.data.name === 'string' && meta.data.name.trim().length > 0 ? meta.data.name.trim() : null;
      const version = typeof meta.data.version === 'string' && meta.data.version.trim().length > 0 ? meta.data.version.trim() : null;

      results.push({ packId, profile, model, language, name, version });
    }
  }

  return results;
}

async function promptSelectIndex(questionText, items, promptText) {
  const readline = require('readline');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt =
    String(promptText ?? '').trim().length > 0
      ? String(promptText ?? '').trim()
      : tCreate(getCreateUiLang(), 'pick_index');
  const ask = () =>
    new Promise((resolve) => {
      rl.question(prompt + ' ', (answer) => resolve(answer));
    });

  try {
    const question = String(questionText ?? '').trim();
    if (question) process.stdout.write(question + '\n');
    for (let i = 0; i < items.length; i += 1) {
      process.stdout.write(`${i + 1}) ${items[i]}\n`);
    }

    while (true) {
      const answer = String(await ask()).trim();
      if (!answer) continue;
      const value = Number(answer);
      if (!Number.isFinite(value)) continue;
      const idx = Math.floor(value) - 1;
      if (idx >= 0 && idx < items.length) return idx;
    }
  } finally {
    rl.close();
  }
}

async function resolveCreateVariantInteractive(options) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !isTTY()) return options;
  if (typeof options.pack === 'string' && options.pack.trim().length > 0) return options;

  const requestedProfile = typeof options.profile === 'string' ? options.profile : 'light';
  const variants = listAvailablePackVariants().filter((v) => v.profile === requestedProfile);
  if (variants.length === 0) return options;

  const biIndexPrompt = `${tCreate('zh', 'pick_index')} / ${tCreate('en', 'pick_index')}`;

  const models = Array.from(
    new Set(variants.map((v) => v.model).filter((v) => typeof v === 'string' && v.length > 0))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const languages = Array.from(
    new Set(variants.map((v) => v.language).filter((v) => typeof v === 'string' && v.length > 0))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  let selectedModel = models.length > 0 ? models[0] : null;
  if (models.length > 1) {
    const idx = await promptSelectIndex(`${tCreate('zh', 'pick_model')} / ${tCreate('en', 'pick_model')}`, models, biIndexPrompt);
    selectedModel = models[idx];
    process.stdout.write('\n');
  }

  let candidates = variants;
  if (selectedModel) candidates = candidates.filter((v) => v.model === selectedModel);

  const availableLanguages = Array.from(
    new Set(candidates.map((v) => v.language).filter((v) => typeof v === 'string' && v.length > 0))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  let selectedLanguage = availableLanguages.length > 0 ? availableLanguages[0] : null;
  if (availableLanguages.length > 1) {
    const idx = await promptSelectIndex(
      `${tCreate('zh', 'pick_language')} / ${tCreate('en', 'pick_language')}`,
      availableLanguages,
      biIndexPrompt
    );
    selectedLanguage = availableLanguages[idx];
    process.stdout.write('\n');
  }

  if (selectedLanguage) setCreateUiLang(selectedLanguage);

  candidates = candidates.filter((v) => {
    if (selectedModel && v.model !== selectedModel) return false;
    if (selectedLanguage && v.language !== selectedLanguage) return false;
    return true;
  });
  if (candidates.length === 0) return options;

  candidates.sort((a, b) => a.packId.localeCompare(b.packId, undefined, { numeric: true, sensitivity: 'base' }));
  const picked = candidates[0];
  return { ...options, pack: picked.packId };
}

function textContainsTokensInOrder(text, tokens) {
  const raw = String(text ?? '');
  let lastIndex = -1;
  for (const token of tokens) {
    const idx = raw.indexOf(token);
    if (idx === -1) return false;
    if (idx < lastIndex) return false;
    lastIndex = idx;
  }
  return true;
}

function assertCreateConsistency({ resourcesRoot, specwaveSourceRoot, uiLang }) {
  const lang = normalizeLang(uiLang);
  const fail = (zh, en) => exitWithError(lang === 'en' ? en : zh);

  // This consistency check is intentionally light-weight:
  // catch the most painful “old vs new wording” drifts early in --plan,
  // instead of letting users discover them in a real session.

  const forbiddenTokens = [
    // historical drifts
    'EARS',
    '02-任务.md'
  ];

  const checkTextForForbiddenTokens = (label, text) => {
    for (const token of forbiddenTokens) {
      if (String(text).includes(token)) {
        fail(
          `资源口径不一致：${label} 包含已废弃口径：${token}`,
          `Resource consistency error: ${label} contains deprecated token: ${token}`
        );
      }
    }
  };

  // 1) Router skill must include session-lock rule (avoid routing spec back to vibe).
  const routerRoot = path.resolve(__dirname, '..', 'resources', 'codex', 'skills', 'specwave-router');
  const routerFiles = isDirectoryPath(routerRoot)
    ? listFilesRecursively(routerRoot).filter((filePath) => filePath.toLowerCase().endsWith('.md'))
    : [];
  if (routerFiles.length === 0) {
    fail('资源缺失：找不到 specwave-router skill 文件', 'Missing resources: specwave-router skill not found');
  }
  for (const filePath of routerFiles) {
    const text = readFileUtf8(filePath);
    checkTextForForbiddenTokens(`codex/skills/specwave-router/${path.basename(filePath)}`, text);
    if (!text.includes('.specwave/settings.json') || !text.includes('currentSession')) {
      fail(
        `资源口径不一致：${path.basename(filePath)} 缺少“会话锁定”规则（需要包含 .specwave/settings.json 与 currentSession）`,
        `Resource consistency error: ${path.basename(filePath)} missing session-lock rule (.specwave/settings.json & currentSession)`
      );
    }
  }

  // 2) For zh packs, enforce the fixed 4-stage order and 01/02/03 doc naming.
  if (lang !== 'zh') return;

  const stageTokens = ['诉求对齐', '需求编写', '设计方案', '任务拆解'];
  const expectedDocs = ['01-需求.md', '02-设计.md', '03-任务.md'];

  const agentsTemplatePath = path.join(resourcesRoot, 'project-root', 'AGENTS.md.template');
  const analystRolePath = path.join(specwaveSourceRoot, 'roles', '需求分析师.md');
  const newStoryPromptPath = path.join(specwaveSourceRoot, 'prompts', '新建需求.md');
  const templatesRoot = path.join(specwaveSourceRoot, 'templates');

  if (!isFilePath(agentsTemplatePath)) {
    fail('资源缺失：project-root/AGENTS.md.template', 'Missing resources: project-root/AGENTS.md.template');
  }
  if (!isFilePath(analystRolePath)) {
    fail('资源缺失：.specwave/roles/需求分析师.md', 'Missing resources: .specwave/roles/需求分析师.md');
  }
  if (!isFilePath(newStoryPromptPath)) {
    fail('资源缺失：.specwave/prompts/新建需求.md', 'Missing resources: .specwave/prompts/新建需求.md');
  }

  const agentsText = readFileUtf8(agentsTemplatePath);
  const roleText = readFileUtf8(analystRolePath);
  const promptText = readFileUtf8(newStoryPromptPath);

  checkTextForForbiddenTokens('project-root/AGENTS.md.template', agentsText);
  checkTextForForbiddenTokens('.specwave/roles/需求分析师.md', roleText);
  checkTextForForbiddenTokens('.specwave/prompts/新建需求.md', promptText);

  const orderOk =
    textContainsTokensInOrder(agentsText, stageTokens) &&
    textContainsTokensInOrder(roleText, stageTokens) &&
    textContainsTokensInOrder(promptText, stageTokens);
  if (!orderOk) {
    fail(
      `资源口径不一致：阶段顺序必须是 ${stageTokens.join(' → ')}`,
      `Resource consistency error: stage order must be ${stageTokens.join(' → ')}`
    );
  }

  for (const docName of expectedDocs) {
    const templatePath = path.join(templatesRoot, docName);
    if (!isFilePath(templatePath)) {
      fail(
        `资源缺失：.specwave/templates/${docName}`,
        `Missing resources: .specwave/templates/${docName}`
      );
    }
  }
}

function getCreatePlan({ dir, pack, profile }) {
  const targetRoot = path.resolve(dir);
  const resolved = resolvePackProfileRoot(pack, profile);
  const resourcesRoot = resolved.root;

  if (!fs.existsSync(resourcesRoot)) {
    exitWithError(`找不到资源：pack=${pack}, profile=${profile}`);
  }

  const operations = [];

  const specwaveSourceRoot = path.join(resourcesRoot, '.specwave');
  const specwaveTargetRoot = path.join(targetRoot, '.specwave');

  let packMeta = { data: {}, body: '' };
  try {
    const packMetaPath = path.join(specwaveSourceRoot, 'pack.md');
    if (isFilePath(packMetaPath)) packMeta = parseFrontMatter(readFileUtf8(packMetaPath));
  } catch {}
  const packLanguage =
    typeof packMeta.data.language === 'string' && packMeta.data.language.trim().length > 0
      ? packMeta.data.language.trim()
      : typeof packMeta.data.lang === 'string' && packMeta.data.lang.trim().length > 0
        ? packMeta.data.lang.trim()
        : null;

  assertCreateConsistency({ resourcesRoot, specwaveSourceRoot, uiLang: packLanguage || getCreateUiLang() });

  const specwaveFiles = listFilesRecursively(specwaveSourceRoot);
  for (const sourceFilePath of specwaveFiles) {
    const relativePath = path.relative(specwaveSourceRoot, sourceFilePath);
    const targetFilePath = path.join(specwaveTargetRoot, relativePath);
    const normalized = path.normalize(relativePath).toLowerCase();
    const exists = fs.existsSync(targetFilePath);
    if (normalized === 'settings.json') {
      operations.push(
        createPlanOp({
          kind: 'settings',
          sourcePath: sourceFilePath,
          targetPath: targetFilePath,
          action: exists ? 'merge' : 'create'
        })
      );
      continue;
    }

    operations.push(
      createPlanOp({
        kind: 'copy',
        sourcePath: sourceFilePath,
        targetPath: targetFilePath,
        action: exists ? 'overwrite' : 'create'
      })
    );
  }

  const agentsTemplatePath = path.join(resourcesRoot, 'project-root', 'AGENTS.md.template');
  const agentsTargetPath = path.join(targetRoot, 'AGENTS.md');
  // AGENTS.md：
  // - 默认不覆盖项目已经沉淀的协作约定；
  // - 仅在以下情况写入：
  //   1) 文件不存在 / 为空；
  //   2) 文件已包含模板的 SPECWAVE:START/END 标记（只更新受控区）。
  // 这样既能保护“初始化成果”，也允许用户在自愿引入受控区后持续升级。
  const shouldWriteAgents = (() => {
    if (!isFilePath(agentsTemplatePath)) return false;
    if (!fs.existsSync(agentsTargetPath)) return true;
    try {
      const existingText = readFileUtf8(agentsTargetPath);
      if (existingText.trim().length === 0) return true;

      const templateText = readFileUtf8(agentsTemplatePath);
      const extracted = extractSpecwaveManagedBlock(templateText);
      if (!extracted) return false;
      return existingText.includes(extracted.startMarker) && existingText.includes(extracted.endMarker);
    } catch {
      return false;
    }
  })();
  if (shouldWriteAgents) {
    operations.push(
      createPlanOp({
        kind: 'agents',
        sourcePath: agentsTemplatePath,
        targetPath: agentsTargetPath,
        action: fs.existsSync(agentsTargetPath) ? 'patch' : 'create'
      })
    );
  }

  const expectedPromptTargets = new Set(
    operations
      .filter((op) =>
        typeof op.targetPath === 'string' &&
        op.targetPath.toLowerCase().includes(`${path.sep}.specwave${path.sep}prompts${path.sep}`.toLowerCase()) &&
        op.targetPath.toLowerCase().endsWith('.md')
      )
      .map((op) => op.targetPath)
  );

  const expectedRoleTargets = new Set(
    operations
      .filter((op) =>
        typeof op.targetPath === 'string' &&
        op.targetPath.toLowerCase().includes(`${path.sep}.specwave${path.sep}roles${path.sep}`.toLowerCase()) &&
        op.targetPath.toLowerCase().endsWith('.md')
      )
      .map((op) => op.targetPath)
  );

  const pruneOps = [];
  const promptsTargetDir = path.join(specwaveTargetRoot, 'prompts');
  const rolesTargetDir = path.join(specwaveTargetRoot, 'roles');

  // prompts：完全由官方托管，删除多余文件（不保留自定义）
  const existingPromptFiles = listFilesRecursively(promptsTargetDir).filter((filePath) => filePath.toLowerCase().endsWith('.md'));
  for (const filePath of existingPromptFiles) {
    if (!expectedPromptTargets.has(filePath)) {
      pruneOps.push(createDeletePlanOp({ kind: 'delete', targetPath: filePath }));
    }
  }

  // roles：仅删除官方托管文件；自定义 roles 不删
  const existingRoleFiles = listFilesRecursively(rolesTargetDir).filter((filePath) => filePath.toLowerCase().endsWith('.md'));
  for (const filePath of existingRoleFiles) {
    if (expectedRoleTargets.has(filePath)) continue;
    try {
      const parsed = parseFrontMatter(readFileUtf8(filePath));
      if (parsed && parsed.data && parsed.data.managedBy === 'specwave') {
        pruneOps.push(createDeletePlanOp({ kind: 'delete', targetPath: filePath }));
      }
    } catch {
      // ignore unreadable files
    }
  }

  operations.push(...pruneOps);

  const codexPlan = getCodexInstallPlan({ packId: pack, profile: resolved.effectiveProfile, lang: packLanguage });
  const legacyRootDirs = ['changes', 'specs'].filter((name) => {
    const fullPath = path.join(targetRoot, name);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  });
  const legacyWorkspaceRoot = path.join(targetRoot, 'specwave');
  const legacyWorkspaceStat = tryStat(legacyWorkspaceRoot);
  const hasLegacyWorkspace = legacyWorkspaceStat.exists && Boolean(legacyWorkspaceStat.stat && legacyWorkspaceStat.stat.isDirectory());
  const legacyWorkspaceIsFile = legacyWorkspaceStat.exists && Boolean(legacyWorkspaceStat.stat && !legacyWorkspaceStat.stat.isDirectory());
  const workspaceRoot = path.join(specwaveTargetRoot, 'workspace');
  const workspaceDirs = [
    workspaceRoot,
    path.join(workspaceRoot, 'stories'),
    path.join(workspaceRoot, 'stories', 'archive'),
    path.join(workspaceRoot, 'bugs'),
    path.join(workspaceRoot, 'bugs', 'archive'),
    path.join(workspaceRoot, 'specs')
  ];

  const workspaceConflicts = workspaceDirs
    .filter((dirPath) => fs.existsSync(dirPath) && !fs.statSync(dirPath).isDirectory())
    .map((dirPath) => ({ kind: 'workspace', targetPath: dirPath, isFile: true }));

  const legacyWorkspaceConflicts = legacyWorkspaceIsFile
    ? [{ kind: 'workspace', targetPath: legacyWorkspaceRoot, isFile: true }]
    : [];

  const conflicts = [
    ...operations.filter((op) => op.isDirectory),
    ...codexPlan.operations.filter((op) => op.isDirectory),
    ...workspaceConflicts,
    ...legacyWorkspaceConflicts
  ];

  return {
    targetRoot,
    pack,
    profile,
    effectiveProfile: resolved.effectiveProfile,
    model:
      typeof packMeta.data.model === 'string' && packMeta.data.model.trim().length > 0
        ? packMeta.data.model.trim()
        : null,
    language:
      typeof packMeta.data.language === 'string' && packMeta.data.language.trim().length > 0
        ? packMeta.data.language.trim()
        : typeof packMeta.data.lang === 'string' && packMeta.data.lang.trim().length > 0
          ? packMeta.data.lang.trim()
          : null,
    legacyRootDirs,
    workspaceRoot,
    legacyWorkspaceRoot,
    hasLegacyWorkspace,
    workspaceDirs,
    operations,
    codexPlan,
    conflicts
  };
}

function safeInstallCodexAssets(codexPlan) {
  try {
    const plan = codexPlan && Array.isArray(codexPlan.operations) ? codexPlan : null;
    if (!plan) return { status: 'failed', message: '缺少 Codex 安装计划' };

    const directoryConflicts = plan.operations.filter((op) => op.isDirectory);
    if (directoryConflicts.length > 0) {
      return { status: 'failed', message: '目标路径是目录，无法写入 Codex 全局资源' };
    }

    const exists = plan.operations.some((op) => op.exists);
    for (const op of plan.operations) {
      if (op.action === 'delete') {
        if (op.exists && !op.isDirectory) fs.rmSync(op.targetPath, { force: true });
        continue;
      }
      if (op.kind === 'codex-prompt') {
        ensureDirectory(path.dirname(op.targetPath));
        fs.writeFileSync(op.targetPath, op.content, { encoding: 'utf8' });
        continue;
      }
      writeFileFromTemplate(op.sourcePath, op.targetPath);
    }
    return { status: exists ? 'updated' : 'installed' };
  } catch (error) {
    return { status: 'failed', message: error && error.message ? error.message : String(error) };
  }
}

function writeCreatePlan(plan, options) {
  const uiLang = normalizeLang(plan && plan.language ? plan.language : getCreateUiLang());
  ensureDirectory(plan.targetRoot);

  const workspaceRoot =
    typeof plan.workspaceRoot === 'string' && plan.workspaceRoot.length > 0
      ? plan.workspaceRoot
      : path.join(plan.targetRoot, '.specwave', 'workspace');

  const workspaceSpinner = startSpinner(uiLang === 'en' ? 'Preparing workspace...' : '正在整理工作区...');
  try {
    ensureDirectory(workspaceRoot);
    migrateLegacyWorkspaceIfNeeded({ targetRoot: plan.targetRoot, workspaceRoot });
    // Ensure the base workspace structure exists even if there was no legacy migration.
    if (Array.isArray(plan.workspaceDirs)) {
      for (const dirPath of plan.workspaceDirs) {
        if (fs.existsSync(dirPath) && !fs.statSync(dirPath).isDirectory()) {
          throw new Error(
            uiLang === 'en'
              ? 'Workspace conflict: a file exists where a directory is required (please fix and rerun create)'
              : '工作区目录冲突：目标路径存在同名文件（请手动处理后再执行 create）'
          );
        }
        ensureDirectory(dirPath);
      }
    }
    // Enforce naming rules (only renames when needed).
    normalizeWorkItemDirs({ workspaceRoot });
    if (uiLang === 'zh') {
      normalizeStoryFilesZh({ workspaceRoot });
    }
    workspaceSpinner.succeed(uiLang === 'en' ? 'Workspace ready' : '工作区就绪');
  } catch (error) {
    workspaceSpinner.fail(uiLang === 'en' ? 'Failed' : '失败');
    exitWithError(error && error.message ? error.message : String(error));
  }

  const deleteOps = Array.isArray(plan.operations)
    ? plan.operations.filter((op) => op.action === 'delete' && op.exists && !op.isDirectory)
    : [];
  if (deleteOps.length > 0) {
    const deleteSpinner = startSpinner(uiLang === 'en' ? 'Pruning deprecated managed files...' : '正在清理废弃的官方文件...');
    try {
      for (const op of deleteOps) {
        fs.rmSync(op.targetPath, { force: true });
      }
      deleteSpinner.succeed(uiLang === 'en' ? `Pruned (${deleteOps.length})` : `已清理（${deleteOps.length} 个）`);
    } catch (error) {
      deleteSpinner.fail(uiLang === 'en' ? 'Failed' : '失败');
      exitWithError(error && error.message ? error.message : String(error));
    }
  }

  const codexSpinner = startSpinner(uiLang === 'en' ? 'Enabling Codex global assets...' : '正在启用 Codex 全局资源...');
  const codexResult = safeInstallCodexAssets(plan.codexPlan);
  if (codexResult.status === 'failed') {
    codexSpinner.fail(uiLang === 'en' ? 'Failed' : '启用失败');
    exitWithError(
      uiLang === 'en'
        ? `Failed to enable Codex global assets: ${codexResult.message}`
        : `无法启用 Codex 全局资源：${codexResult.message}`
    );
  }
  if (codexResult.status === 'installed') codexSpinner.succeed(uiLang === 'en' ? 'Installed' : '已安装');
  else codexSpinner.succeed(uiLang === 'en' ? 'Updated' : '已更新');

  const spinner = startSpinner(uiLang === 'en' ? 'Writing SpecWave files...' : '正在写入 SpecWave 文件...');
  let written = 0;

  for (const operation of plan.operations) {
    if (operation.isDirectory) continue;
    if (operation.action === 'delete') continue;

    if (operation.kind === 'agents') {
      patchAgentsFromTemplate(operation.sourcePath, operation.targetPath);
      written += 1;
      continue;
    }

    if (operation.kind === 'settings') {
      writeSettingsMergedFromTemplate(operation.sourcePath, operation.targetPath);
      written += 1;
      continue;
    }

    if (operation.kind === 'copy') {
      writeFileFromTemplate(operation.sourcePath, operation.targetPath);
      written += 1;
      continue;
    }
  }

  spinner.succeed(uiLang === 'en' ? `Done (${written} files)` : `写入完成（${written} 个文件）`);
  process.stdout.write('\n');

  process.stdout.write(PALETTE.hint(uiLang === 'en' ? 'Next steps:' : '下一步：') + '\n');
  process.stdout.write(
    PALETTE.dim(uiLang === 'en' ? '- Run specwave catalog to view installed indexes' : '- 运行 specwave catalog 查看已安装索引') + '\n'
  );
  const codexOps =
    plan && plan.codexPlan && Array.isArray(plan.codexPlan.operations) ? plan.codexPlan.operations : [];
  const codexCommands = codexOps
    .filter((op) => op && op.kind === 'codex-prompt' && op.action !== 'delete' && !op.isDirectory)
    .map((op) => '/' + path.basename(op.targetPath, '.md'));
  if (codexCommands.length > 0) {
    process.stdout.write(
      PALETTE.dim(
        uiLang === 'en'
          ? `- In Codex, available slash commands: ${codexCommands.join(' ')}`
          : `- 在 Codex 中可用斜杠命令：${codexCommands.join(' ')}`
      ) + '\n'
    );
  } else {
    process.stdout.write(
      PALETTE.dim(
        uiLang === 'en'
          ? '- In Codex: no slash commands installed (prompts dir is empty)'
          : '- 在 Codex 中：未安装斜杠命令（prompts 目录为空）'
      ) + '\n'
    );
  }
  process.stdout.write('\n');

  return { didWrite: true };
}

function printCreatePlan(plan) {
  const columns = typeof process.stdout.columns === 'number' ? process.stdout.columns : 120;
  const safeWidth = Math.max(60, columns - 2);
  const listCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const planLang = normalizeLang(plan && plan.language ? plan.language : 'zh');
  const truncate = (text) => {
    const raw = String(text);
    if (!isTTY()) return raw;
    // Strip ANSI for width check (best-effort).
    const plain = raw.replace(/\x1b\[[0-9;]*m/g, '');
    if (plain.length <= safeWidth) return raw;
    const head = Math.max(12, Math.floor(safeWidth * 0.6));
    const tail = Math.max(12, safeWidth - head - 1);
    const trimmedPlain = plain.slice(0, head) + '…' + plain.slice(-tail);
    // If raw had ANSI, we can't reliably keep them; fall back to plain.
    return trimmedPlain;
  };

  const resolvedProfileText =
    plan.effectiveProfile !== plan.profile ? `（实际使用 ${plan.effectiveProfile}）` : '';

  const targetExists = fs.existsSync(plan.targetRoot);
  const operations = plan.operations;
  const conflicts = plan.conflicts;
  const toCreate = operations.filter((op) => op.action === 'create' && !op.exists);
  const toOverwrite = operations.filter((op) => op.action === 'overwrite' && op.exists);
  const toMerge = operations.filter((op) => op.action === 'merge' && op.exists);
  const toPatch = operations.filter((op) => op.action === 'patch' && op.exists);
  const toDelete = operations.filter((op) => op.action === 'delete' && op.exists);
  const toWriteTotal = toCreate.length + toOverwrite.length + toMerge.length + toPatch.length;
  const codexPlan = plan.codexPlan;
  const codexOps =
    codexPlan && Array.isArray(codexPlan.operations) ? codexPlan.operations : [];
  const codexSkillOp = codexOps.find((op) => op.kind === 'codex-skill') ?? null;
  const codexPromptOps = codexOps.filter((op) => op.kind === 'codex-prompt');

  const dimNote = (text) => (isTTY() ? PALETTE.dim(text) : text);

  const getCodexLineNoteByPromptId = (promptId) => {
    const noteKeyById = {
      'write-requirements': 'codex_note_write_requirements',
      'acceptance-review': 'codex_note_acceptance_review',
      'report-bug': 'codex_note_report_bug',
      'start-dev': 'codex_note_start_dev'
    };
    const key = noteKeyById[promptId];
    if (!key) return '';
    const note = tCreate(planLang, key);
    return planLang === 'en' ? `(${note})` : `（${note}）`;
  };

  const getSpecwaveLineNote = (operation, relativePath) => {
    try {
      const normalized = String(relativePath ?? operation.targetPath ?? '').toLowerCase().replace(/\\/g, '/');
      const action = String(operation.action ?? '');
      const kind = String(operation.kind ?? '');

      if (kind === 'settings') {
        if (action === 'merge') return tCreate(planLang, 'op_note_settings_merge');
        return tCreate(planLang, 'op_note_settings');
      }
      if (kind === 'agents') return tCreate(planLang, 'op_note_agents');

      if (action === 'delete') return tCreate(planLang, 'op_note_delete');
      if (normalized.endsWith('.specwave/pack.md')) return tCreate(planLang, 'op_note_pack');
      if (normalized.endsWith('.specwave/settings.json'))
        return action === 'merge' ? tCreate(planLang, 'op_note_settings_merge') : tCreate(planLang, 'op_note_settings');
      if (normalized.includes('.specwave/prompts/')) return tCreate(planLang, 'op_note_prompt');
      if (normalized.includes('.specwave/roles/')) return tCreate(planLang, 'op_note_role');

      if (normalized === 'agents.md' || normalized.endsWith('/agents.md')) return tCreate(planLang, 'op_note_agents_root');
    } catch {}
    return '';
  };

  const specwaveWrites = operations.filter((op) =>
    op.targetPath.toLowerCase().includes(`${path.sep}.specwave${path.sep}`.toLowerCase())
  );
  const rootWrites = operations.filter((op) => !specwaveWrites.includes(op));

  process.stdout.write(PALETTE.accent(tCreate(planLang, 'plan_title')) + '\n');
  process.stdout.write(PALETTE.dim(`${tCreate(planLang, 'plan_target_dir')}${truncate(plan.targetRoot)}`) + '\n');
  if (!targetExists) {
    process.stdout.write(PALETTE.dim(tCreate(planLang, 'plan_target_dir_missing')) + '\n');
  }
  if (plan.model) process.stdout.write(PALETTE.dim(`${tCreate(planLang, 'plan_model')}${plan.model}`) + '\n');
  if (plan.language) process.stdout.write(PALETTE.dim(`${tCreate(planLang, 'plan_language')}${plan.language}`) + '\n');
  process.stdout.write(
    PALETTE.dim(`${tCreate(planLang, 'plan_profile')}${plan.profile}${resolvedProfileText}`) + '\n\n'
  );

  process.stdout.write(PALETTE.hint(tCreate(planLang, 'plan_will_write')) + '\n');
  process.stdout.write(
    PALETTE.dim(
      `${tCreate(planLang, 'plan_machine_specwave')}${specwaveWrites.filter((op) => op.kind !== 'agents').length} ${planLang === 'en' ? 'files' : '个文件'}`
    ) + '\n'
  );
  process.stdout.write(
    PALETTE.dim(
      `${tCreate(planLang, 'plan_project_root')}${rootWrites.filter((op) => op.kind === 'agents').length} ${planLang === 'en' ? 'files' : '个文件'}`
    ) + '\n\n'
  );

  if (Array.isArray(plan.workspaceDirs) && plan.workspaceDirs.length > 0) {
    process.stdout.write(
      PALETTE.dim(
        `${tCreate(planLang, 'plan_workspace_dirs')}${plan.workspaceDirs.length} ${planLang === 'en' ? 'items' : '个'}`
      ) + '\n\n'
    );
  }

  if (plan.hasLegacyWorkspace) {
    process.stdout.write(
      PALETTE.hint(tCreate(planLang, 'plan_hint_legacy_workspace')) +
        '\n\n'
    );
  }

  if (Array.isArray(plan.legacyRootDirs) && plan.legacyRootDirs.length > 0) {
    process.stdout.write(
      PALETTE.hint(
        `${tCreate(planLang, 'plan_hint_legacy_dirs_prefix')}${plan.legacyRootDirs.join(', ')}${tCreate(planLang, 'plan_hint_legacy_dirs_suffix')}`
      ) +
        '\n\n'
    );
  }

  if (codexSkillOp || codexPromptOps.length > 0) {
    process.stdout.write(PALETTE.hint(tCreate(planLang, 'plan_codex_assets')) + '\n');
    if (codexPlan && typeof codexPlan.codexHome === 'string' && codexPlan.codexHome.length > 0) {
      process.stdout.write(PALETTE.dim(`  CODEX_HOME：${truncate(codexPlan.codexHome)}`) + '\n');
      const codexHomeFromEnv =
        typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim().length > 0;
      if (!codexHomeFromEnv) {
        const localCodexHome = path.join(plan.targetRoot, '.codex');
        process.stdout.write(
          PALETTE.dim(
            planLang === 'en'
              ? `  Hint: to keep changes project-local, set CODEX_HOME to: ${truncate(localCodexHome)}`
              : `  提示：要只影响当前项目，可把 CODEX_HOME 指到：${truncate(localCodexHome)}`
          ) + '\n'
        );
      }
    }
    process.stdout.write('\n');

    if (codexSkillOp) {
      const label = codexSkillOp.isDirectory ? 'CONFLICT' : codexSkillOp.exists ? 'UPDATE' : 'WRITE';
      const coloredLabel = codexSkillOp.isDirectory ? PALETTE.conflict(label) :
        codexSkillOp.exists ? PALETTE.update(label) : PALETTE.create(label);
      const routerNoteRaw = tCreate(planLang, 'codex_router_note');
      const routerNote = planLang === 'en' ? `(${routerNoteRaw})` : `（${routerNoteRaw}）`;
      process.stdout.write(PALETTE.dim(`- ${coloredLabel} specwave-router ${dimNote(routerNote)}`) + '\n');
    }

    if (codexPromptOps.length > 0) {
      process.stdout.write(PALETTE.dim(tCreate(planLang, 'plan_slash_commands')) + '\n');
      for (const promptOp of codexPromptOps) {
        const label = promptOp.isDirectory
          ? 'CONFLICT'
          : promptOp.action === 'delete'
            ? 'DELETE'
            : promptOp.exists
              ? 'UPDATE'
              : 'WRITE';
        const coloredLabel = promptOp.isDirectory
          ? PALETTE.conflict(label)
          : label === 'DELETE'
            ? PALETTE.conflict(label)
            : label === 'UPDATE'
              ? PALETTE.update(label)
              : PALETTE.create(label);

        const fileBaseName = path.basename(promptOp.targetPath, '.md');
        const commandName = fileBaseName.startsWith('specwave-') ? fileBaseName : `specwave-${fileBaseName}`;
        const promptId = fileBaseName.startsWith('specwave-') ? fileBaseName.slice('specwave-'.length) : fileBaseName;
        const note = getCodexLineNoteByPromptId(promptId);
        process.stdout.write(PALETTE.dim(`- ${coloredLabel} /${commandName}${note ? ' ' + dimNote(note) : ''}`) + '\n');
      }
    }

    process.stdout.write('\n');
  }

  const printDetailHeader = () => {
    if (isTTY()) {
      process.stdout.write(PALETTE.dim(tCreate(planLang, 'plan_details_by_group')) + '\n');
    } else {
      process.stdout.write(tCreate(planLang, 'plan_details_by_group') + '\n');
    }
  };

  const printGroupHeader = (title) => {
    if (isTTY()) {
      process.stdout.write(PALETTE.text(title) + '\n');
    } else {
      process.stdout.write(title + '\n');
    }
  };

  const renderOperationLine = (operation, displayPath, note) => {
    const labelByAction = {
      create: 'CREATE',
      overwrite: 'UPDATE',
      merge: 'MERGE',
      patch: 'PATCH',
      delete: 'DELETE'
    };
    const label = labelByAction[operation.action] ?? 'WRITE';

    let coloredLabel = label;
    if (label === 'CREATE') coloredLabel = PALETTE.create(label);
    if (label === 'UPDATE') coloredLabel = PALETTE.update(label);
    if (label === 'MERGE') coloredLabel = PALETTE.merge(label);
    if (label === 'PATCH') coloredLabel = PALETTE.patch(label);
    if (label === 'DELETE') coloredLabel = PALETTE.conflict(label);

    return truncate(`- ${coloredLabel} ${displayPath}${note ? ' ' + dimNote(note) : ''}`) + '\n';
  };

  const renderDisplayPath = (rawPath) => {
    if (!isTTY()) return rawPath;
    const parts = rawPath.split(path.sep);
    if (parts.length > 1) {
      const fileName = parts.pop();
      const dirPath = parts.join(path.sep);
      return PALETTE.dim(dirPath + path.sep) + PALETTE.text(fileName);
    }
    return PALETTE.text(rawPath);
  };

  const categorizeOperation = (normalizedPath) => {
    if (normalizedPath.startsWith('.specwave/')) {
      if (normalizedPath === '.specwave/pack.md' || normalizedPath === '.specwave/settings.json') return 'specwave-base';
      if (normalizedPath.startsWith('.specwave/prompts/')) return 'specwave-prompts';
      if (normalizedPath.startsWith('.specwave/roles/')) return 'specwave-roles';
      if (normalizedPath.startsWith('.specwave/workspace/')) return 'specwave-workspace';
      return 'specwave-other';
    }
    if (normalizedPath === 'agents.md') return 'project-root';
    return 'other-root';
  };

  const groups = {
    'specwave-base': { title: tCreate(planLang, 'group_specwave_base'), rows: [] },
    'specwave-prompts': { title: tCreate(planLang, 'group_specwave_prompts'), rows: [] },
    'specwave-roles': { title: tCreate(planLang, 'group_specwave_roles'), rows: [] },
    'project-root': { title: tCreate(planLang, 'group_project_root'), rows: [] },
    'specwave-other': { title: tCreate(planLang, 'group_specwave_other'), rows: [] },
    'specwave-workspace': { title: tCreate(planLang, 'group_specwave_workspace'), rows: [] },
    'other-root': { title: tCreate(planLang, 'group_other'), rows: [] }
  };

  const directoryConflicts = [];

  for (const operation of operations) {
    if (operation.isDirectory) {
      const relativePath = path.relative(plan.targetRoot, operation.targetPath);
      const displayPath = relativePath.startsWith('..') ? operation.targetPath : relativePath;
      directoryConflicts.push(truncate(`- ${PALETTE.conflict('CONFLICT')} ${displayPath} (是目录)`) + '\n');
      continue;
    }

    const relativePath = path.relative(plan.targetRoot, operation.targetPath);
    const note = getSpecwaveLineNote(operation, relativePath);
    const rawDisplayPath = relativePath.startsWith('..') ? operation.targetPath : relativePath;
    const displayPath = renderDisplayPath(rawDisplayPath);
    const normalized = String(rawDisplayPath).toLowerCase().replace(/\\/g, '/');
    const categoryKey = categorizeOperation(normalized);
    const targetGroup = groups[categoryKey] ?? groups['other-root'];
    targetGroup.rows.push({
      sortKey: normalized,
      output: renderOperationLine(operation, displayPath, note)
    });
  }

  printDetailHeader();

  if (directoryConflicts.length > 0) {
    printGroupHeader(tCreate(planLang, 'group_dir_conflicts'));
    for (const line of directoryConflicts) process.stdout.write(line);
    process.stdout.write('\n');
  }

  const groupOrder = [
    'specwave-base',
    'specwave-prompts',
    'specwave-roles',
    'project-root',
    'specwave-workspace',
    'specwave-other',
    'other-root'
  ];
  for (const key of groupOrder) {
    const group = groups[key];
    if (!group || group.rows.length === 0) continue;
    printGroupHeader(group.title);
    group.rows.sort((a, b) => listCollator.compare(a.sortKey, b.sortKey));
    for (const row of group.rows) process.stdout.write(row.output);
    process.stdout.write('\n');
  }

  process.stdout.write('\n');
  process.stdout.write(
    PALETTE.dim(
      planLang === 'en'
        ? `Summary: will write/update ${PALETTE.text(String(toWriteTotal))} (create ${PALETTE.create(String(toCreate.length))}, update ${PALETTE.update(String(toOverwrite.length))}, merge ${PALETTE.merge(String(toMerge.length))}, patch ${PALETTE.patch(String(toPatch.length))}); delete ${toDelete.length > 0 ? PALETTE.conflict(String(toDelete.length)) : '0'}; conflicts ${conflicts.length > 0 ? PALETTE.conflict(String(conflicts.length)) : '0'}.`
        : `摘要：将写入/刷新 ${PALETTE.text(String(toWriteTotal))} 个（新建 ${PALETTE.create(String(toCreate.length))}，更新 ${PALETTE.update(String(toOverwrite.length))}，合并 ${PALETTE.merge(String(toMerge.length))}，补丁 ${PALETTE.patch(String(toPatch.length))}），删除 ${toDelete.length > 0 ? PALETTE.conflict(String(toDelete.length)) : '0'} 个，冲突 ${conflicts.length > 0 ? PALETTE.conflict(String(conflicts.length)) : '0'} 个。`
    ) + '\n'
  );

  if (conflicts.length > 0) {
    process.stdout.write(
      PALETTE.hint(tCreate(planLang, 'conflicts_hint')) + '\n'
    );
    process.stdout.write(PALETTE.dim(tCreate(planLang, 'conflicts_suggest')) + '\n');
  }
}

function runCreate(options) {
  const dir = typeof options.dir === 'string' ? options.dir : process.cwd();
  const pack = typeof options.pack === 'string' ? options.pack : 'core';
  const profile = typeof options.profile === 'string' ? options.profile : 'light';
  const banner = options.banner !== false;
  setCreateUiLang(getPackMetaFromResources(pack, profile).language || 'zh');
  const uiLang = getCreateUiLang();

  if (!['light', 'full'].includes(profile)) {
    exitWithError(
      uiLang === 'en'
        ? `Unsupported --profile: ${profile} (only light|full)`
        : `不支持的 --profile：${profile}（仅支持 light|full）`
    );
  }

  const isPlan = isTruthyOption(options.plan);
  const isAgree = isTruthyOption(options.agree) || isTruthyOption(options.yes);

  if (isPlan && isAgree) {
    exitWithError('参数冲突：--plan 与 --agree/--yes 不能同时使用');
  }

  if (banner) renderBanner();
  printStep(1, 3, tCreate(uiLang, 'step_check_env'));

  printStep(2, 3, tCreate(uiLang, 'step_generate_plan'));
  const plan = getCreatePlan({ dir, pack, profile });
  printCreatePlan(plan);

  if (isPlan || !isAgree) return { didWrite: false, plan };
  if (plan.conflicts.length > 0) {
    exitWithError('目标目录存在冲突文件，已中止（避免覆盖）');
  }

  printStep(3, 3, tCreate(uiLang, 'step_write_files'));
  return writeCreatePlan(plan, options);
}

function loadPack(projectRoot) {
  const packPath = path.join(projectRoot, '.specwave', 'pack.md');
  if (!fs.existsSync(packPath)) return null;
  const { data } = parseFrontMatter(readFileUtf8(packPath));
  return { path: packPath, ...data };
}

function loadRoles(projectRoot) {
  const rolesRoot = path.join(projectRoot, '.specwave', 'roles');
  const legacySkillsRoot = path.join(projectRoot, '.specwave', 'skills');

  const rootToUse = fs.existsSync(rolesRoot) ? rolesRoot : legacySkillsRoot;
  const files = listFilesRecursively(rootToUse).filter((filePath) => filePath.endsWith('.md'));

  return files.map((filePath) => {
    const { data } = parseFrontMatter(readFileUtf8(filePath));
    return {
      path: filePath,
      id: data.id,
      name: data.name,
      mode: data.mode,
      priority: data.priority,
      exclusiveGroup: data.exclusiveGroup
    };
  });
}

function loadPrompts(projectRoot) {
  const promptsRoot = path.join(projectRoot, '.specwave', 'prompts');
  const files = listFilesRecursively(promptsRoot).filter((filePath) => filePath.endsWith('.md'));

  return files.map((filePath) => {
    const { data } = parseFrontMatter(readFileUtf8(filePath));
    return {
      path: filePath,
      id: data.id,
      name: data.name,
      roles: data.roles ?? data.skills
    };
  });
}

function runCatalog(options) {
  const format = typeof options.format === 'string' ? options.format : 'text';
  const only = typeof options.only === 'string' ? options.only : null;
  const projectRoot = process.cwd();

  if (!['text', 'machine'].includes(format)) {
    exitWithError(`不支持的 --format：${format}（仅支持 text|machine）`);
  }

  const onlyNormalized = only === 'skills' ? 'roles' : only;
  if (onlyNormalized && !['packs', 'roles', 'prompts'].includes(onlyNormalized)) {
    exitWithError(`不支持的 --only：${only}（仅支持 packs|roles|prompts）`);
  }

  const pack = loadPack(projectRoot);
  if (!pack) exitWithError('未找到 .specwave/pack.md，请先在目标目录执行 specwave create');

  const roles = loadRoles(projectRoot);
  const prompts = loadPrompts(projectRoot);

  const result = {
    pack: {
      id: pack.id,
      name: pack.name,
      version: pack.version,
      description: pack.description
    },
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      mode: role.mode,
      priority: role.priority,
      exclusiveGroup: role.exclusiveGroup
    })),
    prompts: prompts.map((prompt) => ({
      id: prompt.id,
      name: prompt.name,
      roles: prompt.roles
    }))
  };

  // 兼容旧字段名（v1 过渡期）
  result.skills = result.roles;

  if (format === 'machine') {
    if (onlyNormalized === 'packs')
      process.stdout.write(JSON.stringify({ pack: result.pack }, null, 2) + '\n');
    else if (onlyNormalized === 'roles')
      process.stdout.write(JSON.stringify({ roles: result.roles, skills: result.roles }, null, 2) + '\n');
    else if (onlyNormalized === 'prompts')
      process.stdout.write(JSON.stringify({ prompts: result.prompts }, null, 2) + '\n');
    else process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const lines = [];
  if (!onlyNormalized || onlyNormalized === 'packs') {
    lines.push(`Pack: ${result.pack.id} (${result.pack.version})`);
    if (result.pack.description) lines.push(`- ${result.pack.description}`);
  }

  if (!onlyNormalized || onlyNormalized === 'roles') {
    lines.push('');
    lines.push(`Roles (${result.roles.length}):`);
    for (const role of result.roles) {
      lines.push(`- ${role.id} | ${role.name} | mode=${role.mode} | priority=${role.priority}`);
    }
  }

  if (!onlyNormalized || onlyNormalized === 'prompts') {
    lines.push('');
    lines.push(`Prompts (${result.prompts.length}):`);
    for (const prompt of result.prompts) {
      const roleList = Array.isArray(prompt.roles) ? prompt.roles.join(',') : '';
      lines.push(`- ${prompt.id} | ${prompt.name} | roles=[${roleList}]`);
    }
  }

  process.stdout.write(lines.join('\n').trim() + '\n');
}

function getCodexHome() {
  const os = require('os');
  const raw = typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim().length > 0
    ? process.env.CODEX_HOME.trim()
    : path.join(os.homedir(), '.codex');
  return path.resolve(raw);
}

function getCodexBuiltInRouterSkillPath(lang) {
  const normalized = normalizeLang(lang);
  if (normalized === 'en') {
    const enPath = path.resolve(__dirname, '..', 'resources', 'codex', 'skills', 'specwave-router', 'SKILL.en.md');
    if (fs.existsSync(enPath)) return enPath;
  }
  return path.resolve(__dirname, '..', 'resources', 'codex', 'skills', 'specwave-router', 'SKILL.md');
}

function getCodexPromptsSourceRoot(packId, profile) {
  const resolved = resolvePackProfileRoot(packId, profile);
  return {
    promptsRoot: path.join(resolved.root, '.specwave', 'prompts'),
    effectiveProfile: resolved.effectiveProfile
  };
}

function getCodexPromptArgumentHintById(promptId, lang) {
  const normalized = normalizeLang(lang);
  const hints =
    normalized === 'en'
      ? {
          'write-requirements': 'request or goal',
          'acceptance-review': 'requirements & tasks to review',
          'report-bug': 'bug description & repro steps',
          'start-dev': 'scope to implement'
        }
      : {
          'write-requirements': '诉求或目标描述',
          'acceptance-review': '待验收的需求与任务摘要',
          'report-bug': 'Bug 描述与复现信息',
          'start-dev': '本次要推进的任务范围'
        };
  return hints[promptId] ?? (normalized === 'en' ? 'input' : '输入');
}

function buildCodexPromptFileContent({ promptId, promptName, body, lang }) {
  const normalized = normalizeLang(lang);
  const description = normalized === 'en' ? `SpecWave: ${promptName}` : `SpecWave：${promptName}`;
  const argumentHint = getCodexPromptArgumentHintById(promptId, normalized);
  const trimmedBody = String(body ?? '').trim();

  return [
    '---',
    `description: ${description}`,
    `argument-hint: ${argumentHint}`,
    'managedBy: specwave',
    `specwavePromptId: ${promptId}`,
    '---',
    '',
    '$ARGUMENTS',
    `<!-- SPECWAVE:START ${promptId} -->`,
    trimmedBody,
    `<!-- SPECWAVE:END ${promptId} -->`,
    ''
  ].join('\n');
}

function createCodexSkillPlanOp({ sourcePath, targetPath }) {
  const exists = fs.existsSync(targetPath);
  const isDirectory = exists ? fs.statSync(targetPath).isDirectory() : false;
  return {
    kind: 'codex-skill',
    sourcePath,
    targetPath,
    exists,
    isDirectory,
    action: exists ? 'overwrite' : 'create'
  };
}

function createCodexPromptPlanOp({ promptId, sourcePath, targetPath, content }) {
  const exists = fs.existsSync(targetPath);
  const isDirectory = exists ? fs.statSync(targetPath).isDirectory() : false;
  return {
    kind: 'codex-prompt',
    promptId,
    sourcePath,
    targetPath,
    content,
    exists,
    isDirectory,
    action: exists ? 'overwrite' : 'create'
  };
}

function getCodexInstallPlan({ packId, profile, lang }) {
  const codexHome = getCodexHome();

  const routerSourcePath = getCodexBuiltInRouterSkillPath(lang);
  const routerTargetPath = path.join(codexHome, 'skills', 'specwave-router', 'SKILL.md');
  if (!fs.existsSync(routerSourcePath)) {
    exitWithError('找不到内置的 specwave-router 资源（打包资源缺失）');
  }

  const promptSource = getCodexPromptsSourceRoot(packId, profile);
  const promptFiles = listFilesRecursively(promptSource.promptsRoot).filter((filePath) =>
    filePath.endsWith('.md')
  );
  // prompts 目录可以为空（方案 B：提示词逻辑合并到角色文件）

  const promptOps = promptFiles.map((filePath) => {
    const parsed = parseFrontMatter(readFileUtf8(filePath));
    const promptId = parsed.data.id;
    const promptName = parsed.data.name ?? promptId;
    if (!promptId) exitWithError('发现缺少 id 的提示卡（资源错误）');

    const commandName = `specwave-${promptId}`;
    const targetPath = path.join(codexHome, 'prompts', `${commandName}.md`);
    const content = buildCodexPromptFileContent({ promptId, promptName, body: parsed.body, lang });
    return createCodexPromptPlanOp({ promptId, sourcePath: filePath, targetPath, content });
  });

  // Codex prompts：只删除“可识别为 SpecWave 官方托管”的旧文件，避免误删用户自定义内容
  const expectedPromptTargets = new Set(promptOps.map((op) => op.targetPath));
  const pruneOps = [];
  const codexPromptsDir = path.join(codexHome, 'prompts');
  const existingPromptFiles = listFilesRecursively(codexPromptsDir)
    .filter((filePath) => filePath.toLowerCase().endsWith('.md'))
    .filter((filePath) => path.basename(filePath).toLowerCase().startsWith('specwave-'));
  for (const filePath of existingPromptFiles) {
    if (expectedPromptTargets.has(filePath)) continue;
    try {
      const parsed = parseFrontMatter(readFileUtf8(filePath));
      if (parsed && parsed.data && parsed.data.managedBy === 'specwave') {
        pruneOps.push(createDeletePlanOp({ kind: 'codex-prompt', targetPath: filePath }));
      }
    } catch {
      // ignore unreadable files
    }
  }

  return {
    codexHome,
    packId,
    profile: promptSource.effectiveProfile,
    operations: [
      createCodexSkillPlanOp({ sourcePath: routerSourcePath, targetPath: routerTargetPath }),
      ...pruneOps,
      ...promptOps
    ]
  };
}

// 兼容旧调用点：历史上只安装 router 技能
function getCodexSkillInstallPlan() {
  const plan = getCodexInstallPlan({ packId: 'core', profile: 'light', lang: 'zh' });
  const onlyRouter = plan.operations.filter((op) => op.kind === 'codex-skill');
  return { ...plan, operations: onlyRouter };
}

function printCodexInstallPlan(plan) {
  process.stdout.write(PALETTE.accent('Codex 安装计划') + '\n');
  process.stdout.write(PALETTE.dim(`CODEX_HOME：${plan.codexHome}`) + '\n\n');
  for (const op of plan.operations) {
    if (op.isDirectory) {
      if (op.kind === 'codex-prompt') {
        process.stdout.write(`- CONFLICT(是目录) prompts/specwave-${op.promptId}.md\n`);
      } else {
        process.stdout.write('- CONFLICT(是目录) skills/specwave-router/SKILL.md\n');
      }
      continue;
    }
    if (op.kind === 'codex-prompt') {
      const basename = path.basename(op.targetPath);
      const label = op.action === 'delete' ? 'DELETE' : (op.exists ? 'UPDATE' : 'WRITE');
      process.stdout.write(`- ${label} prompts/${basename}\n`);
    } else {
      const label = op.action === 'delete' ? 'DELETE' : (op.exists ? 'UPDATE' : 'WRITE');
      process.stdout.write(`- ${label} skills/specwave-router/SKILL.md\n`);
    }
  }
  process.stdout.write('\n');
  process.stdout.write(PALETTE.dim('说明：这是全局资源（技能 + 斜杠命令），只影响 Codex 的行为，不会修改项目文件。') + '\n\n');
}

function runCodex(positionals, options) {
  const action = positionals[0];
  if (!action || action === 'help' || isTruthyOption(options.help) || isTruthyOption(options.h)) {
    process.stdout.write(
      [
        '用法：',
        '  specwave codex install [--plan] [--yes] [--pack core] [--profile light]',
        '',
        '说明：',
        '  install  安装/更新 Codex 全局资源（specwave-router + SpecWave 斜杠命令）'
      ].join('\n') + '\n'
    );
    return;
  }

  if (action !== 'install') {
    exitWithError(`未知子命令：codex ${action}（仅支持 install）`);
  }

  const packId = typeof options.pack === 'string' ? options.pack : 'core';
  const profile = typeof options.profile === 'string' ? options.profile : 'light';
  if (!['light', 'full'].includes(profile)) {
    exitWithError(`不支持的 --profile：${profile}（仅支持 light|full）`);
  }

  const isPlan = isTruthyOption(options.plan) || !isTruthyOption(options.yes);
  const isYes = isTruthyOption(options.yes);
  const allowSkipIfExists = isTruthyOption(options.skipIfExists);
  if (isTruthyOption(options.agree)) {
    exitWithError('codex install 请使用 --yes（不再使用 --agree）');
  }

  const lang = getPackMetaFromResources(packId, profile).language;
  const plan = getCodexInstallPlan({ packId, profile, lang });
  printCodexInstallPlan(plan);

  if (isPlan) return;

  const directoryConflicts = plan.operations.filter((op) => op.isDirectory);
  if (directoryConflicts.length > 0) {
    exitWithError('目标路径是目录，无法写入 Codex 全局资源');
  }

  const exists = plan.operations.some((op) => op.exists);
  if (exists && allowSkipIfExists) {
    process.stdout.write(PALETTE.dim('已存在：按 skipIfExists 跳过写入（避免覆盖）。') + '\n');
    return;
  }

  for (const op of plan.operations) {
    if (op.action === 'delete') {
      if (op.exists && !op.isDirectory) fs.rmSync(op.targetPath, { force: true });
      continue;
    }
    if (op.kind === 'codex-prompt') {
      ensureDirectory(path.dirname(op.targetPath));
      fs.writeFileSync(op.targetPath, op.content, { encoding: 'utf8' });
      continue;
    }
    writeFileFromTemplate(op.sourcePath, op.targetPath);
  }
  process.stdout.write(PALETTE.ok(exists ? '✓ 已更新：Codex 全局资源' : '✓ 已安装：Codex 全局资源') + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const { command, positionals, options } = parseArgs(argv);

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'create') {
    if (isTruthyOption(options.help) || isTruthyOption(options.h)) {
      printHelp();
      return;
    }

    const isPlan = isTruthyOption(options.plan);
    const isAgree = isTruthyOption(options.agree) || isTruthyOption(options.yes);

    if (!isPlan && !isAgree) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        runCreate({ ...options, plan: true });
        process.stdout.write('\n' + tCreate(getCreateUiLang(), 'non_tty_hint') + '\n');
        return;
      }

      // create 交互向导：优先选择“模型 → 语言”，再生成计划
      try {
        Object.assign(options, await resolveCreateVariantInteractive(options));
      } catch {}
      try {
        const pack = typeof options.pack === 'string' ? options.pack : 'core';
        const profile = typeof options.profile === 'string' ? options.profile : 'light';
        setCreateUiLang(getPackMetaFromResources(pack, profile).language || 'zh');
      } catch {}

      const pinned = enablePinnedCreateHeader();
      try {
        const value = runCreate({ ...options, plan: true, banner: !pinned });
        const plan = value && value.plan ? value.plan : null;

        const planLang = normalizeLang(plan && plan.language ? plan.language : getCreateUiLang());
        const question = PALETTE.accent('? ') + PALETTE.text(tCreate(planLang, 'confirm_write'));
        const confirm = pinned
          ? await promptYesNoWithPinnedHeaderAnimation(question, (time) => {
            const logoLines = renderNeonLogo(time).split('\n').filter((line) => line.length > 0);
            let out = '';
            for (const line of logoLines) out += '\x1b[2K' + line + '\n';
            out += '\x1b[2K' + PALETTE.text(getCreateSubtitle()) + '\n';
            out += '\x1b[2K\n';
            return out;
          })
          : await promptYesNoWithLogoAnimation(question, getNeonLogoLineCount());

        if (!confirm) {
          process.stdout.write(PALETTE.dim(tCreate(planLang, 'cancelled')) + '\n');
          return;
        }

        if (!plan) {
          exitWithError('生成计划失败：缺少 plan 数据');
        }

        if (plan.conflicts.length > 0) {
          exitWithError('目标目录存在冲突文件，已中止（避免覆盖）');
        }

        printStep(3, 3, tCreate(planLang, 'step_write_files'));
        writeCreatePlan(plan, options);
        return;
      } finally {
        if (pinned) pinned.disable();
      }
    } else {
      runCreate(options);
      return;
    }
    return;
  } else if (command === 'catalog') {
    if (isTruthyOption(options.help) || isTruthyOption(options.h)) {
      printHelp();
      return;
    }

    runCatalog(options);
    return;
  }

  if (command === 'codex') {
    runCodex(positionals, options);
    return;
  }

  exitWithError(`未知命令：${command}（可用 create/catalog）`);
}

main().catch((error) => {
  exitWithError(error && error.message ? error.message : String(error));
});
