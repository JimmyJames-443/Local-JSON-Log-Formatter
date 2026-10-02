<div align="center">

<!-- Animated ASCII banner -->
```
 _          _ _____             
| |        | |  ___|  ___  __ _ 
| |    _   | | |_    / __|/ _` |
| |___| |_| |  _|  | (__| (_| |
|______\__,_|_|     \___|\__,_|
   stream filter · redact · colorize
```

<!-- Animated typewriter headline -->
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&pause=1000&color=00FF41&center=true&vCenter=true&width=640&lines=Parse+JSON+lines+in+real-time;Redact+secrets+before+they+leak;Colorize+log+levels+like+magic;O(1)+memory+--+pure+streaming;One+binary+--+zero+toolchain+juggling" alt="Typing SVG" />

<!-- Badges -->
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-00FF41?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![NPM](https://img.shields.io/badge/npm-%3E%3D6.0.0-red?style=for-the-badge&logo=npm&logoColor=white)](https://npmjs.org)
[![PRs](https://img.shields.io/badge/PRs-welcome-ff69b4?style=for-the-badge)](https://github.com/YOUR_USERNAME/YOUR_REPO/pulls)

<br>

**A stream-oriented CLI filter for parsing unformatted JSON payloads,
redacting sensitive key-value pairs, and colorizing log levels —
from stdin or disk, at wire speed.**

[Install](#install) · [Usage](#usage) · [Architecture](#architecture) · [Internals](#internals) · [Why](#why-logfmt)

</div>

---

## Install

### Requirements

| Component | Version |
|---|---|
| Node.js | `>= 14.0.0` |
| NPM | `>= 6.0.0` |
| OS | Linux (POSIX) · macOS · Windows (Git Bash / MSYS2 / WSL) |

### From source

```bash
git clone https://github.com/JimmyJames-443/log_Fmt.git
cd log_Fmt
npm install
chmod +x index.js
npm link
```

`npm link` symlinks the binary onto your `$PATH` — after that, `logfmt` is callable from anywhere.

<details>
<summary><b>Verify the install</b></summary>

```bash
logfmt --help

# or pipe something trivial through it
echo '{"level":"info","msg":"hello"}' | logfmt
```
</details>

---

## Usage

```bash
# From stdin — pipe any log stream in
tail -f app.log | logfmt

# From a file on disk
logfmt access.log

# Redact secrets while you read (the important one)
logfmt --sanitize app.log
logfmt -s app.log

# Chain it in a pipeline
cat app.log | logfmt -s | grep ERROR | tee audit.log
```

### Flags

| Flag | Short | Effect |
|---|---|---|
| `--sanitize` | `-s` | Recursively redact sensitive key-value pairs |
| `--help` | `-h` | Show usage |

### What gets redacted

Any key (case-insensitive) matching the blacklist:

```
password · token · auth · secret · api_key · bearer · private_key · ...
```

```diff
- {"user":"admin","password":"hunter2","token":"eyJhbGci..."}
+ {"user":"admin","password":"[REDACTED]","token":"[REDACTED]"}
```

### Colorization

| Level | Color |
|---|---|
| `ERROR` | red |
| `WARN` | yellow |
| `INFO` | green |
| `DEBUG` | cyan |

JSON keys, strings, integers, booleans, and `null` each get distinct ANSI highlighting — no heavyweight syntax-highlight dependency.

---

## Architecture

```text
                +------------------------+
                |  Input Stream (stdin)  |
                |  or fs.createReadStream|
                +-----------+------------+
                            |
                            v
                +------------------------+
                | Readline Stream Buffer |
                +-----------+------------+
                            | (line by line)
                            v
                +------------------------+
                |   JSON Parse Check     |
                +-----+------------+-----+
                      |            |
          (valid JSON)|            |(parse exception)
                      v            v
             +-----------+    +-----------+
             | Redact &  |    | ANSI log  |
             | highlight |    | highlight |
             +-----+-----+    +-----+-----+
                   |                |
                   +-------+--------+
                           |
                           v
                +------------------------+
                |  Output Stream (stdout)|
                +------------------------+
```

`logfmt` acts as a single high-throughput stream transformer. It ingests input chunk-by-chunk via Node.js `readline` interfaces hooked directly to `process.stdin` or file descriptors (`fs.createReadStream`) — everything flows, nothing accumulates.

---

## Internals

<details open>
<summary><b>Recursive secret masking (deep AST traversal)</b></summary>

With `--sanitize` (`-s`), parsed JSON objects are passed through a recursive redaction function operating directly on nested Object and Array structures — **not** string-level regex replacement — so structural JSON syntax is never corrupted:

1. **Type checking** — evaluate whether the incoming node is a Primitive, Array, or Object.
2. **Key matching** — lowercase each map key, test against the blacklist of sensitive signatures.
3. **In-memory redaction** — replace target values with the literal `"[REDACTED]"`.
4. **Recursive step** — descend into child sub-objects and arrays before stringification.

```text
        visit(node)
             |
      +------v------+
      | node type?  |
      +---+-----+---+
          |     |
   Object/Array Primitive
          |     |
   walk keys   key in blacklist?
          |     |        \
          v     v         -> "[REDACTED]"
    visit(children)     keep otherwise
```
</details>

<details>
<summary><b>ANSI colorization engine</b></summary>

To minimize terminal processing overhead, log-level matching uses **boundary-anchored** regular expressions (`\b...\b`) mapped to chalk's ANSI escape sequences — so `ERROR` inside `MyERRORMessage` never triggers a false highlight.

JSON output uses custom regex lookbehinds and replacements applied directly to the formatted string, colorizing keys, strings, integers, booleans, and `null` distinctly — without any third-party AST highlighting dependency.
</details>

<details>
<summary><b>Memory footprint & stream processing</b></summary>

Unlike tools that load entire files into memory (`fs.readFileSync`), `logfmt` uses non-blocking, event-driven stream parsing. Memory usage stays constant — **O(1)** relative to total input size — bounded strictly by the length of the single longest line in the stream.

```text
input:   2 GB log file
memory:  ~ size of the longest single line
```

That means `logfmt` on a 2 GB file costs the same RAM as `logfmt` on a 2 KB file.
</details>

---

## Why logfmt

```text
   the old way                          the logfmt way
+---------------------------+       +---------------------------+
|  cat app.log              |       |  logfmt -s app.log        |
|    | jq 'try . catch .'   |       |                           |
|    | sed -E "s/(token|    |       |   one process             |
|      pass).../\1=***"/    |       |   one pass                |
|    | awk / grep / perl    |       |   constant memory         |
|                           |       |   colors included         |
|  4 tools, 3 regexes,      |       |                           |
|  O(n) memory, no colors   |       |                           |
+---------------------------+       +---------------------------+
```

- **Stream-native** — stdin or file, line by line, backpressure-safe.
- **Safe redaction** — structural JSON traversal, never string surgery.
- **Fast** — one pass, no temp files, no subprocess chains.
- **Readable** — level + JSON highlighting out of the box.

---

## Demo

```text
$ logfmt -s app.log

INFO  {"user":"admin","api_key":"[REDACTED]","latency_ms":42}
WARN  {"endpoint":"/login","token":"[REDACTED]","retries":3}
ERROR {"trace_id":"a1b2c3","auth_header":"[REDACTED]","status":500}
DEBUG {"cache":"hit","keys":17,"null_fields":null}
```

<!-- Drop in a real recording for the full effect:
     asciinema rec demo.cast && agg demo.cast assets/demo.gif -->
<!-- ![logfmt in action](assets/demo.gif) -->

---

<div align="center">

<img src="https://img.shields.io/badge/memory-O(1)_streaming-00FF41?style=flat-square" />
<img src="https://img.shields.io/badge/secrets-recursively_redacted-red?style=flat-square" />
<img src="https://img.shields.io/badge/deps-chalk_only-blue?style=flat-square" />

<sub>Built for people who read logs in a terminal at 2 AM.</sub>

</div>
