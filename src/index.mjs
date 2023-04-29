import { AbortController } from "abort-controller";
import { exec } from "child_process";
import { watch } from "chokidar";
import { readFileSync, writeFileSync } from "fs";
import inquirer from "inquirer";
import fetch from "node-fetch";
import ora from "ora";
import { join } from "path";
import { promisify } from "util";
const asyncExec = promisify(exec);

/**
 * Used for watching files.
 * @type {import("chokidar").FSWatcher}
 */
let watcher;

/**
 * Used for aborting async operations.
 * @type {AbortController}
 */
let abortController;

const spinner = ora({
  spinner: "dots",
});

/**
 * @typedef {Object} RunOptions
 * @property {EntryOptions} entryOptions - The options for running the test suite.
 * @property {AbortController['signal']} [signal] - The signal to abort ongoing async operations.
 */

/**
 * Runs the test command and suggests changes to the given file to fix the test.
 *
 * @param {RunOptions} options - The options for running the test suite.
 * @returns {Promise<void>}
 */
async function gptTestFix({ signal, entryOptions }) {
  const { testToRun, fileToFix, apiKey, watchFiles = "" } = entryOptions;

  // 1.  Ensure required options are provided
  if (!testToRun) errorAndExit("--testToRun is required");
  if (!fileToFix) errorAndExit("--fileToFix is required");
  if (!apiKey) errorAndExit("--apiKey is required");

  // 2. Ensure watchFiles, if provided, resolve to real files
  if (watchFiles) {
    watcher = watch(watchFiles);
    watcher.on("ready", () => {
      const folders = Object.keys(watcher.getWatched());
      if (!folders.length) {
        errorAndExit(
          `No files matched the watchFiles glob: ${watchFiles}\n\n` +
            `Make sure to use quotes around the glob to prevent shell expansion.`
        );
      } else {
        watcher.close();
      }
    });
  }

  // 3. Ensure fileToFix exists and get content
  const fileToFixPath = join(process.cwd(), fileToFix);
  const fileExists = await asyncExec(`ls ${fileToFixPath}`);
  if (!fileExists) throw new Error("file does not exist");
  const file = readFileSync(fileToFixPath, "utf-8");

  console.log("Found File:\n");
  console.log(file.split("\n").slice(0, 10).join("\n"));
  if (file.split("\n").length > 10) console.log("...\n");

  try {
    // 4. Run the test command
    spinner.start(`Running command: ${testToRun}`);
    await asyncExec(testToRun).finally(() => spinner.stop());

    console.log("All tests passed!");
  } catch (e) {
    // 5. If you can't recover from the error, throw it
    if (!e) throw new Error("Unknown Error");
    if (typeof e !== "object") throw e;
    if (!("stderr" in e)) {
      if ("message" in e) {
        console.error(e.message);
      } else {
        console.error(e);
      }
      process.exit(1);
    }

    // 6. Get the error message
    const { stderr } = e;

    /* We need to catch errors which aren't the result of the test failing
    but rather the command failing. This will probably be a growing list. */
    if (
      // Happens when the test-runner like jest or vitest isn't found
      stderr.includes("command not found")
    )
      throw e;

    console.log("Test Error:\n");
    console.log(stderr);

    /**
     * @type {import("openai").CreateChatCompletionRequest['messages']}
     */
    const messages = [
      {
        role: "system",
        content: `You are a software developer. Given a file and a failing test, you return a new file which fixes the test. You return updated file code only with no explanation. Do not wrap file code in markdown or code blocks. Always return a file string. If you cannot fix the test, return the original file code.`,
      },
      {
        role: "user",
        content: `Failing Test:\n${stderr}\n\nFile:\n${file}`,
      },
    ];

    // 7. Get the suggested response from OpenAI
    spinner.start("Generating suggested response...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages,
      }),
      signal, // Pass the signal to the fetch request
    }).then((res) => res.json());
    spinner.stop();

    // @ts-ignore
    const fileChanges = response.choices[0].message?.content.trim() ?? "";
    console.log("Suggested Response\n\n");
    console.log(fileChanges);

    // 8. Ask the user if they want to apply the changes
    const { applyChanges } = await inquirer.prompt([
      {
        type: "confirm",
        name: "applyChanges",
        message: "Apply the suggested changes?",
      },
    ]);

    if (applyChanges) {
      writeFileSync(fileToFixPath, fileChanges);
    }

    // 9. Ask the user if they want to run the tests again
    // Useful for confirming the changes fixed the test
    const { runTestsAgain } = await inquirer.prompt([
      {
        type: "confirm",
        name: "runTestsAgain",
        message: "Run the tests again?",
      },
    ]);

    if (runTestsAgain) {
      return gptTestFix({ entryOptions, signal });
    }
  }

  // 10. If watchFiles is provided, setup the watcher
  if (watchFiles) {
    setupWatcher(watchFiles, { entryOptions, signal });
  } else {
    process.exit(0);
  }
}

/**
 * Logs the error message and exits the process with a non-zero exit code.
 * @param {string} message - The error message to log.
 * @returns {never}
 */
function errorAndExit(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Setup the watcher for the specified files.
 * @param {string} watchFiles - The files to watch for changes.
 * @param {RunOptions} options - The options for running the test suite.
 */
function setupWatcher(watchFiles, options) {
  if (watcher) {
    watcher.close();
  }

  console.log(`Watching for changes...`);

  watcher = watch(watchFiles, {
    ignoreInitial: true,
  });

  watcher.on("change", async () => {
    console.log("File change detected, re-running tests...");

    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();

    try {
      await gptTestFix({ ...options, signal: abortController.signal });
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error:", error.message);
      }
    }
  });
}

/**
 * @typedef {Object} EntryOptions
 * @property {string} testToRun - The script command to run the test suite once (not in watch-mode).
 * @property {string} fileToFix - The file that is allowed to be edited.
 * @property {string} apiKey - The OpenAI API key.
 * @property {string} [watchFiles] - Whether to run the test suite in watch mode.
 */

/**
 * @param {EntryOptions} entryOptions - The options for running the test suite.
 */
export async function entry(entryOptions) {
  try {
    abortController = new AbortController();
    await gptTestFix({
      entryOptions,
      signal: abortController.signal,
    });
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
