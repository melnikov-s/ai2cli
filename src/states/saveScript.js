import { highlight } from "cli-highlight";
import chalk from "chalk";
import ora from "ora";
import fs from "fs/promises";
import path from "path";
import { execAsync, copyToClipboard } from "../util.js";
import { State } from "../machine.js";
import log from "../log.js";

// Create and save the script to disk
async function createAndSaveScript(
  scriptName,
  scriptContent,
  dependencies,
  config,
  skipDependencyInstall = false
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

      // Install dependencies unless we're skipping it
      if (!skipDependencyInstall) {
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
      } else {
        spinner.text = chalk.blue(
          "Skipping dependency installation as requested..."
        );
        log.warning(
          "\nDependencies were not installed. You can manually install them by running 'npm install' in the script directory."
        );
      }
    }

    spinner.stop();
    log.success(`\nScript created successfully at ${scriptPath}`);

    // Display the command to run the script
    const scriptRunCommand = `node ${scriptPath}`;
    log.info("\nTo run the script, use this command:");
    log.success(`  ${scriptRunCommand}`);

    // Copy the command to clipboard
    try {
      const copied = await copyToClipboard(scriptRunCommand);
      if (copied) {
        log.info("\nThe command has been copied to your clipboard.");
      }
    } catch (error) {
      log.warning(`\nCouldn't copy command to clipboard: ${error.message}`);
    }

    return true;
  } catch (error) {
    log.error(`Error creating script: ${error.message}`);
    return false;
  }
}
// Handle save script state
export async function handleSaveScript(context) {
  const {
    config,
    currentCommand,
    skipDependencyInstall = false,
    scriptName,
  } = context;
  const scriptResult = currentCommand.response;

  // Parse dependencies
  const dependencies = scriptResult.dependencies
    ? scriptResult.dependencies.split(",").filter(Boolean)
    : [];

  log.header("Script: " + scriptName);
  log.text(
    highlight(scriptResult.content, {
      language: "javascript",
      ignoreIllegals: true,
    })
  );
  log.nl();

  // Save the script
  await createAndSaveScript(
    scriptName,
    scriptResult.content,
    dependencies,
    config,
    skipDependencyInstall
  );

  return { nextState: State.EXIT, context };
}
