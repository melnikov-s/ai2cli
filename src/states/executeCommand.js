import { State } from "../machine.js";
import chalk from "chalk";
import { spawn } from "child_process";
import ora from "ora";
import fs from "fs/promises";
import path from "path";
import { execAsync } from "../util.js";
import log from "../log.js";
import enquirer from "enquirer";

const { Input, Form } = enquirer;

export async function handleExecuteCommand(context) {
  const { currentCommand, scriptMode, config, scriptName } = context;

  let command;

  if (scriptMode) {
    const scriptResult = currentCommand.response;

    // Parse dependencies
    const dependencies = scriptResult.dependencies
      ? scriptResult.dependencies.split(",").filter(Boolean)
      : [];

    log.header("Script: " + scriptName);

    // Save the script
    await createAndSaveScript(
      scriptName,
      scriptResult.content,
      dependencies,
      config
    );

    command = `node ${path.join(config.scriptsDir, scriptName, "index.js")}`;

    // Check if the script has parameters
    if (scriptResult.hasParameters) {
      try {
        let paramString = "";

        // Handle structured parameters if they exist
        if (scriptResult.parameters && scriptResult.parameters.length > 0) {
          log.info("\nScript parameters:");

          // Create a form schema for the structured parameters
          const formSchema = {};

          // Add each parameter to the form
          scriptResult.parameters.forEach((param) => {
            log.text(
              `- ${param.name}: ${param.description}${
                param.required ? " (required)" : ""
              }`
            );
            formSchema[param.name] = {
              type: 'input',
              message: `${param.name}${param.required ? ' (required)' : ''}`,
              hint: param.description,
              required: param.required,
              initial: param.defaultValue || ''
            };
          });

          // Add a field for additional free-form parameters
          formSchema.additionalParams = {
            type: "input",
            message: "Additional parameters (e.g., --foo=bar --baz=qux)",
            hint: "Enter any additional parameters in command-line format",
          };

          // Create and run the form
          const form = new Form({
            name: "parameters",
            message: "Enter script parameters:",
            choices: Object.keys(formSchema).map((key) => ({
              name: key,
              message: formSchema[key].message,
              hint: formSchema[key].hint,
              required: formSchema[key].required,
              initial: formSchema[key].initial,
            })),
          });

          const answers = await form.run();

          // Add structured parameters
          for (const param of scriptResult.parameters) {
            if (answers[param.name] && answers[param.name].trim()) {
              paramString += ` --${param.name}="${answers[param.name].trim()}"`;
            }
          }

          // Add additional free-form parameters
          if (answers.additionalParams && answers.additionalParams.trim()) {
            paramString += ` ${answers.additionalParams.trim()}`;
          }
        } else {
          // No structured parameters, just get free-form parameters
          const prompt = new Input({
            name: "parameters",
            message:
              "Enter command line parameters (e.g. --foo=bar --baz=qux):",
            initial: "",
          });

          const parameters = await prompt.run();
          if (parameters.trim()) {
            paramString += ` ${parameters.trim()}`;
          }
        }

        // Append parameters to command if we have any
        if (paramString.trim()) {
          command += paramString;
        }
      } catch (err) {
        log.warning(`Failed to get parameters: ${err.message}`);
        log.warning("Executing script without parameters");
      }
    }
  } else {
    command = currentCommand.response.content.trim();
  }

  process.stdout.write(chalk.green("\nExecuting...\n"));

  // Buffer to capture output
  let executionOutput = "";
  let hasError = false;

  try {
    // Split the command into program and arguments
    const parts = command.split(" ");
    const program = parts[0];
    const args = parts.slice(1);

    // Use spawn with pipes for stdout/stderr to capture output
    const childProcess = spawn(program, args, {
      shell: true,
    });

    // Flag to track if the process was manually terminated by the user
    let terminatedByUser = false;

    // Set up SIGINT (Ctrl+C) handler
    const sigintHandler = () => {
      // Mark that this process was terminated by user
      terminatedByUser = true;
      // Only kill the child process, not the parent
      childProcess.kill("SIGINT");
      // Don't exit the parent process
      process.stdout.write(
        chalk.yellow(
          "\nCommand terminated by user. Main program still running.\n"
        )
      );
    };

    // Add the SIGINT listener
    process.on("SIGINT", sigintHandler);

    // Capture stdout
    childProcess.stdout.on("data", (data) => {
      const text = data.toString();
      executionOutput += text;
      process.stdout.write(text);
    });

    // Capture stderr
    childProcess.stderr.on("data", (data) => {
      const text = data.toString();
      executionOutput += text;
      process.stderr.write(text);
      hasError = true;
    });

    // Return a promise that resolves when the process exits
    await new Promise((resolve, reject) => {
      childProcess.on("close", (code) => {
        // Remove the SIGINT listener when the child process exits
        process.removeListener("SIGINT", sigintHandler);
        if (code === 0 || terminatedByUser) {
          // Resolve the promise even if terminated by user
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      childProcess.on("error", (err) => {
        reject(new Error(`Failed to start command: ${err.message}`));
      });
    });

    // Only show "Command completed" if not terminated by user (we already showed a message for that)
    if (!terminatedByUser) {
      process.stdout.write(chalk.green("\nCommand completed.\n"));
    }
  } catch (error) {
    hasError = true;
    executionOutput += `Error: ${error.message}\n`;
    log.error(`Error executing command: ${error.message}`);
  }

  const MAX_OUTPUT_LENGTH = 1000;
  if (executionOutput.length > MAX_OUTPUT_LENGTH) {
    executionOutput =
      executionOutput.substring(0, MAX_OUTPUT_LENGTH) +
      `\n[Output truncated - ${
        executionOutput.length - MAX_OUTPUT_LENGTH
      } more characters]`;
  }

  if (!executionOutput) {
    log.detail("No output returned from command");
  }

  const newContext = { ...context };

  try {
    const prompt = new Input({
      name: "refinement",
      message: "Refine (or press Enter to exit):",
      initial: hasError ? "fix the errors" : "",
    });

    const answer = await prompt.run();

    if (answer.trim() === "") {
      // User chose to exit
      // print out the script path and how to execute it
      log.detail(`Done! To execute the script manually, run: ${command}`);
      log.nl();
      return { nextState: State.EXIT, context };
    } else {
      // Store the refinement request and go to USER_REQUEST state
      newContext.currentCommand = {
        request: answer,
        executionResults: executionOutput,
        type: "refinement",
      };
      newContext.commandHistory.push(context.currentCommand);
      return { nextState: State.USER_REQUEST, context: newContext };
    }
  } catch (err) {
    return { nextState: State.EXECUTE_COMMAND, context };
  }
}

async function createAndSaveScript(
  scriptName,
  scriptContent,
  dependencies,
  config
) {
  // Create base directory using the configured scriptsDir
  const baseDir = config.scriptsDir;
  const scriptDir = path.join(baseDir, scriptName);
  const scriptPath = path.join(scriptDir, "index.js");

  try {
    // Show progress
    const spinner = ora({
      text: chalk.blue(`Creating script directory at ${scriptDir}...`),
      color: "cyan",
    }).start();

    // Create directories
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(scriptDir, { recursive: true });

    spinner.text = chalk.blue(`Writing script to ${scriptPath}...`);

    // Create the script file
    await fs.writeFile(scriptPath, scriptContent);

    // Create a basic package.json if there are dependencies
    if (dependencies.length > 0) {
      spinner.text = chalk.blue("Creating package.json...");

      const packageJson = {
        name: scriptName,
        version: "1.0.0",
        description: `Generated script for "${scriptName}"`,
        main: "index.js",
        type: "module",
        dependencies: {},
      };

      // Add each dependency with a default version
      dependencies.forEach((dep) => {
        packageJson.dependencies[dep.trim()] = "latest";
      });

      await fs.writeFile(
        path.join(scriptDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      );

      spinner.text = chalk.blue("Installing dependencies...");
      try {
        await execAsync("npm install", { cwd: scriptDir });
      } catch (error) {
        spinner.stop();
        log.error(`Error installing dependencies: ${error.message}`);
        log.warning(
          "You can manually install dependencies by running 'npm install' in the script directory."
        );
      }
    }

    spinner.stop();
    log.success(`\nScript created successfully at ${scriptPath}`);

    return true;
  } catch (error) {
    log.error(`Error creating script: ${error.message}`);
    return false;
  }
}
