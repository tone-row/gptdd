import { Chalk } from "chalk";
import { exec } from "child_process";
import "colors";
import { diffChars } from "diff";
import { readFileSync, writeFileSync } from "fs";
import inquirer from "inquirer";
import PressToContinuePrompt from "inquirer-press-to-continue";
import fetch from "node-fetch";
import ora from "ora";
import { join } from "path";
import { promisify } from "util";

const asyncExec = promisify(exec);

inquirer.registerPrompt("press-to-continue", PressToContinuePrompt);

const chalk = new Chalk();

const spinner = ora({
  spinner: "aesthetic",
});

/**
 * @typedef {Object} RunOptions
 * @property {string} testToRun - The script command to run the test suite once (not in watch-mode).
 * @property {string} fileToFix - The file that is allowed to be edited.
 * @property {string} apiKey - The OpenAI API key.
 */

/**
 * Runs the test command and suggests changes to the given file to fix the test.
 *
 * @param {RunOptions} options - The options for running the test suite.
 * @returns {Promise<void>}
 */
export async function gptTestFix(options) {
  const { testToRun, fileToFix, apiKey } = options;

  //   Ensure required options are provided
  if (!testToRun) errorAndExit("--testToRun is required");
  if (!fileToFix) errorAndExit("--fileToFix is required");
  if (!apiKey) errorAndExit("--apiKey is required");

  // Ensure fileToFix exists and get content
  const fileToFixPath = join(process.cwd(), fileToFix);
  const fileExists = await asyncExec(`ls ${fileToFixPath}`);
  if (!fileExists) throw new Error("file does not exist");
  const file = readFileSync(fileToFixPath, "utf-8");

  console.log("\n");
  message("Current File Contents");
  console.log("\n");
  console.log(file.split("\n").slice(0, 5).join("\n").trim());
  if (file.split("\n").length > 10) console.log("...");
  console.log("\n");

  try {
    //  Run the test command
    spinner.start(chalk.bgBlack.green(testToRun));
    await asyncExec(testToRun).finally(() => spinner.stop());

    success("All tests passed!");
  } catch (e) {
    //  If you can't recover from the error, throw it
    if (!e) throw new Error("Unknown Error");
    if (typeof e !== "object") throw e;
    if (!("stderr" in e)) {
      if ("message" in e) {
        error(e.message);
      } else {
        error(e);
      }
      process.exit(1);
    }

    //  Get the error message
    const { stderr } = e;

    /* We need to catch errors which aren't the result of the test failing
    but rather the command failing. This will probably be a growing list. */
    if (
      // Happens when the test-runner like jest or vitest isn't found
      stderr.includes("command not found")
    )
      throw e;

    message("Test Error");
    console.log("\n");
    console.log(stderr.trim());
    console.log("\n");

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

    //  Get the suggested response from OpenAI
    spinner.start(chalk.blue("Getting suggested response..."));
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
    }).then((res) => res.json());
    spinner.stop();

    // @ts-ignore
    const fileChanges = response.choices[0].message?.content.trim() ?? "";
    message("Suggested Response");
    console.log("\n");

    // Diff
    const diff = diffChars(file, fileChanges);
    diff.forEach((part) => {
      // green for additions, red for deletions
      // grey for common parts
      const color = part.added ? "green" : part.removed ? "red" : "grey";
      process.stderr.write(chalk[color](part.value));
    });
    console.log("\n");

    //  Ask the user if they want to apply the changes
    const { applyChanges } = await inquirer.prompt([
      {
        type: "confirm",
        name: "applyChanges",
        message: chalk.blue("Apply the suggested changes?"),
      },
    ]);

    if (applyChanges) {
      writeFileSync(fileToFixPath, fileChanges);
      success("Changes applied!");
    }
  }

  console.log("\n");

  // Press any key to restart
  const { restart } = await inquirer.prompt([
    {
      type: "press-to-continue",
      name: "restart",
      anyKey: true,
      pressToContinueMessage: chalk.blue("Press any key to rerun the test..."),
    },
  ]);

  if (restart) {
    await gptTestFix(options);
  }
}

/**
 * Logs the error message and exits the process with a non-zero exit code.
 * @param {string} message - The error message to log.
 * @returns {never}
 */
function errorAndExit(message) {
  error(message);
  process.exit(1);
}

function message(text) {
  return console.log(chalk.bgBlueBright.black(whitespaceToLength(text)));
}

function notify(text) {
  return console.log(chalk.bgYellow.black(whitespaceToLength(text)));
}

function error(text) {
  return console.error(text);
}

function success(text) {
  return console.log(chalk.bgGreen.black(whitespaceToLength(text)));
}

function whitespaceToLength(text, length = 36) {
  const leftWhitespace = " ".repeat(Math.floor((length - text.length) / 2));
  const rightWhitespace = " ".repeat(Math.ceil((length - text.length) / 2));

  return `${leftWhitespace}${text}${rightWhitespace}`;
}
