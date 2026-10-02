# logfmt

A stream-oriented command-line filter written in Node.js for parsing unformatted JSON payloads, redacting sensitive key-value pairs, and colorizing log levels from standard input streams or disk files.

---

## 1. Technical Overview & Architecture

Modern distributed systems emit structured telemetry (typically JSON lines) intermixed with raw unstructured log streams. Parsing, redacting, and viewing these logs in real-time during debugging or stream piping often introduces memory overhead or requires clunky, external multi-tool chains like `jq` paired with complex regular expressions.

`logfmt` addresses this by acting as a single, high-throughput stream transformer. It ingests input chunk-by-chunk via Node.js `readline` interfaces hooked directly to standard input (`process.stdin`) or file descriptors (`fs.createReadStream`).


                   ┌────────────────────────┐
                   │  Input Stream (stdin)  │
                   └───────────┬────────────┘
                               │
                               ▼
                   ┌────────────────────────┐
                   │ Readline Stream Buffer │
                   └───────────┬────────────┘
                               │ (Line by Line)
                               ▼
                   ┌────────────────────────┐
                   │    JSON Parse Check    │
                   └─────┬────────────┬─────┘
                         │            │
              (Valid JSON)            (Parse Exception)
                         │            │
                         ▼            ▼
               ┌──────────┐          ┌──────────┐
               │ Redact & │          │ ANSI Log │
               │ Highlight│          │ Highlighting│
               └────┬─────┘          └────┬─────┘
                    │                     │
                    └──────────┬──────────┘
                               │
                               ▼
                   ┌────────────────────────┐
                   │ Output Stream (stdout) │
                   └────────────────────────┘


### Memory Footprint & Stream Processing
Unlike tools that load entire files into system memory (`fs.readFileSync`), `logfmt` uses non-blocking event-driven stream parsing. Memory usage remains constant ($O(1)$ space complexity relative to total input file size), bound strictly by the length of the single longest line in the stream.

---

## 2. Low-Level Mechanics & Algorithms

### Recursive Secret Masking (Deep AST Traversal)
When the `--sanitize` (`-s`) flag is provided, `logfmt` passes parsed JSON objects to a recursive redaction function. The algorithm operates directly on nested Object and Array structures without string-level regex replacements, preventing corruption of structural JSON syntax:

1. **Type Checking:** Evaluates whether the incoming node is a Primitive, Array, or Object.
2. **Key Matching:** Converts map keys to lowercase and evaluates them against an array of blacklisted string signatures (`password`, `token`, `auth`, `secret`, `api_key`, `bearer`, `private_key`, etc.).
3. **In-Memory Redaction:** Replaces target values with the literal string `"[REDACTED]"`.
4. **Recursive Step:** Recursively iterates through child sub-objects and arrays prior to stringification.

### ANSI Colorization Engine
To minimize terminal processing overhead, regex matches for log levels (`ERROR`, `WARN`, `INFO`, `DEBUG`) apply boundary-matched regular expressions (`\b...\b`) using chalk's ANSI escape sequence mappings. 

JSON output uses custom regex lookbehinds and replacements directly on the formatted JSON output string to colorize keys, strings, integers, booleans, and null values distinctly without requiring heavy third-party AST syntax highlight dependencies.

---

## 3. Installation & Dependency Graph

### Core System Requirements
* **Node.js Engine:** `>= 14.0.0`
* **NPM:** `>= 6.0.0`
* **Supported OS:** Linux (POSIX compliant), macOS, Windows (Git Bash/MSYS2/WSL)

### Installation Steps

Clone the source repository and link the binary globally to system `$PATH`:

```bash
git clone 
cd log_Fmt
npm install
chmod +x index.js
npm link
