import { program } from "commander";
import { entry } from "./index.mjs";

program
  .description("A CLI tool to fix failing tests using OpenAI GPT.")
  .usage("[options]")
  .option(
    "-t, --testToRun <command>",
    "The command to run your test suite once (not watch mode)."
  )
  .option("-f, --fileToFix <file>", "The file to edit.")
  .option("-a, --apiKey <key>", "Your OpenAI API key.")
  .option(
    "-w, --watchFiles <string>",
    "A glob of files to watch. Usually the code and test file."
  )
  .action(async (options) => {
    try {
      await entry(options);
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program.addHelpText(
  "before",
  `
Example:

npx gptdd \\
  -r "pnpm vitest run src/myFile.test.js" \\
  -f "src/myFile.js" \\
  -k "your_api_key" \\
  -w "src/**/*.js"
`
);

program.parse(process.argv);
