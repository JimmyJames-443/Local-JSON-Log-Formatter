#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const { program } = require('commander');

program
  .name('logfmt')
  .description('Format JSON payloads, mask secrets, and colorize application logs')
  .version('1.0.0')
  .option('-f, --file <path>', 'Path to input log or JSON file')
  .option('-s, --sanitize', 'Mask sensitive fields like passwords, tokens, and API keys', false)
  .option('-l, --level <level>', 'Filter output by log level (ERROR, WARN, INFO, DEBUG)')
  .option('-j, --json-only', 'Only output lines that are valid JSON', false)
  .parse(process.argv);

const options = program.opts();

const SENSITIVE_KEYS = [
  'password', 'pass', 'token', 'auth', 'authorization', 
  'secret', 'api_key', 'apikey', 'bearer', 'private_key', 
  'credit_card', 'ssn', 'access_token'
];

function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  } else if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(obj)) {
      const isSensitive = SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k));
      if (options.sanitize && isSensitive) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeObject(val);
      }
    }
    return cleaned;
  }
  return obj;
}

function highlightJSON(obj) {
  const jsonStr = JSON.stringify(obj, null, 2);
  return jsonStr
    .replace(/"([^"]+)":/g, chalk.blue('"$1"') + ':')
    .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"'))
    .replace(/: (\d+)/g, ': ' + chalk.yellow('$1'))
    .replace(/: (true|false)/g, ': ' + chalk.magenta('$1'))
    .replace(/: (null)/g, ': ' + chalk.gray('$1'));
}

function highlightLogLine(line) {
  if (options.level && !line.toUpperCase().includes(options.level.toUpperCase())) {
    return null;
  }

  return line
    .replace(/\b(ERROR|FATAL|FAIL|CRITICAL)\b/gi, chalk.bgRed.white.bold('$1'))
    .replace(/\b(WARN|WARNING)\b/gi, chalk.yellow.bold('$1'))
    .replace(/\b(INFO|NOTICE)\b/gi, chalk.cyan('$1'))
    .replace(/\b(DEBUG|TRACE)\b/gi, chalk.gray('$1'));
}

function processLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  try {
    let parsed = JSON.parse(line);

    if (options.level) {
      const levelVal = String(parsed.level || parsed.severity || parsed.status || '').toUpperCase();
      if (!levelVal.includes(options.level.toUpperCase())) {
        return;
      }
    }

    parsed = sanitizeObject(parsed);
    console.log(chalk.gray('--- JSON Payload ---'));
    console.log(highlightJSON(parsed));
  } catch (err) {
    if (options.jsonOnly) return;

    const formatted = highlightLogLine(line);
    if (formatted) {
      console.log(formatted);
    }
  }
}

function main() {
  if (options.file) {
    if (!fs.existsSync(options.file)) {
      console.error(chalk.red(`Error: File not found at '${options.file}'`));
      process.exit(1);
    }
    const fileStream = fs.createReadStream(options.file);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    rl.on('line', processLine);
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', processLine);
  }
}

main();