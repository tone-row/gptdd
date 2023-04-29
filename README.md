# gptdd 🧪

_A single-file, test-driven-development feedback loop with GPT 🌀_

## How it Works

Given command which runs a test and a file to edit , `gptdd` feeds the test results to GPT4, requests a fix, and offers the user the option to apply the fix.

> 💭 It would be amazing to build this in at the test runner/IDE-level, but in the interest of it being language and test-runner agnostic, it's a standalone script. If you're interested in building an IDE plugin, please reach out!

## Usage

```bash
npx gptdd \
  --fileToFix lib/myFunc.ts \
  --testToRun "pnpm vitest run lib/myFunc.test.ts" \
  --apiKey "sk-..." \
  --watchFiles "lib/myFunc*"
```

## CLI Options

| Option             | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `--fileToFix, -f`  | The file to edit. (required)                                        |
| `--testToRun, -t`  | The command to run once to get the initial test results. (required) |
| `--apiKey, -a`     | Your OpenAI API key. (required)                                     |
| `--watchFiles, -w` | A glob of files to watch. Usually the code and test file.           |

### Specific Examples

The following examples specific to your language/test-runner. If you don't see what you're looking for, please contribute!

#### Javascript - Vitest

```bash
npx gptdd \
  --f lib/myFunc.ts \
  --t "pnpm vitest run lib/myFunc.test.ts" \
  --a "sk-..." \
  --w "lib/myFunc*"
```

#### Javascript - Jest

```bash
npx gptdd \
  --f lib/myFunc.ts \
  --t "pnpm jest examples/myFunc.test.ts" \
  --a "sk-..." \
  --w "lib/myFunc*"
```

## Development

We recommend using `pnpm`. Clone the repository, run `pnpm install`. Then run `pnpm link --global` to make the `gptdd` command available globally. From there, you can make tweaks and test them out by running `gptdd` in a directory with a test and file to fix.

## Contributing

We strongly welcome contributions of any kind- simply open a PR explaining what you've changed and why and we'll go from there.
