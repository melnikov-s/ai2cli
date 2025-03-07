import chalk from "chalk";

import { State } from "../machine.js";
import log from "../log.js";
import { clearScreen, copyToClipboard, setupKeypressHandler } from "../util.js";

// Display command breakdown with detailed information
function displayCommandBreakdown(currentCommand) {
  // Show explanation
  if (currentCommand.explanation) {
    log.info("\nExplanation:");
    log.text(currentCommand.explanation);
    log.nl();
  }

  // Show breakdown if available
  if (currentCommand.breakdown && currentCommand.breakdown.length > 0) {
    log.info("\nCommand Breakdown:");

    // Map through each step in the breakdown array
    currentCommand.breakdown.forEach((step, index) => {
      log.warning(`\nStep ${index + 1}:`);

      // Display command in bold
      log.text(chalk.white.bold(`Command: ${step.command}`));

      // Display description with proper indentation
      if (step.description) {
        log.text(chalk.white("Description:"));
        // Split description into lines and indent them
        const descriptionLines = step.description.split("\n");
        descriptionLines.forEach((line) => {
          log.text(`  ${line.trim()}`);
        });
      }
    });

    log.nl();
  }

  log.detail("\nPress any key to return...");
}

function displayOptions(
  currentCommand,
  hasMultipleModels,
  scriptMode,
  options = {}
) {
  const { response, executionResults } = currentCommand;
  const hasOutput = executionResults?.output;

  if (scriptMode) {
    // Setup command for decision making
    log.info("  • Press Enter to execute the script");
    log.info("  • Press 'c' to copy the script and exit");
    log.info(
      "  • Press 'r' to refine/modify the script" +
        (hasOutput ? " (with the output)" : "")
    );
  } else {
    // If destructive, show a warning
    if (response?.destructive) {
      log.warning("This command may modify or delete existing files.");
    }

    // Show caution message if present
    if (response?.caution) {
      log.warning("Caution: " + response.caution);
    }

    // Setup readline interface
    log.nl();
    log.info("  • Press Enter to execute the command");
    log.info("  • Press 'c' to copy the command and exit");
    log.info("  • Press 's' to convert this to a script instead");
    log.info(
      "  • Press 'r' to refine/modify the command" +
        (hasOutput ? " (with the output)" : "")
    );
    if (response?.breakdown) {
      log.info("  • Press 'b' to see detailed command breakdown");
    }
  }
  if (hasMultipleModels) {
    log.info("  • Press 'm' to re-run with a different model");
  }
  // Add debug option if debug flag is enabled
  if (options.debug) {
    log.info("  • Press 'd' to display raw response data");
  }
}
// Handle generate state - display command/script and options
export async function handleUserResponse(context) {
  const { currentCommand, options, scriptMode, hasMultipleModels } = context;

  if (context.scriptMode) {
    log.info("\nScript name: " + context.scriptName);

    // Display the script details
    log.info("\nScript generated successfully!");
    log.info("\nScript explanation:");
    if (currentCommand.response.explanation) {
      log.text(currentCommand.response.explanation);
    }

    log.info("\nRequired dependencies:");
    const dependencies = currentCommand.response.dependencies
      ? currentCommand.response.dependencies.split(",").filter(Boolean)
      : [];
    if (dependencies.length > 0) {
      dependencies.forEach((dep) => log.text(`- ${dep.trim()}`));
    } else {
      log.text("No external dependencies required");
    }
    log.nl();
  }

  // If there's a changelog and this is a refinement or clarification, display it
  if (
    currentCommand.response.changelog &&
    (currentCommand.type === "refinement" ||
      currentCommand.type === "clarification")
  ) {
    log.warning("\nChangelog:");
    log.text(chalk.yellow(currentCommand.response.changelog));
    log.nl();
  }

  if (currentCommand.executionResults?.output) {
    log.header("\nLast Output:");
    log.nl();
    if (currentCommand.executionResults?.error) {
      log.error(currentCommand.executionResults.output ?? "<no output>");
    } else if (currentCommand.executionResults?.output) {
      log.text(currentCommand.executionResults.output);
    }
  }

  displayOptions(currentCommand, hasMultipleModels, scriptMode, options);

  // Set up keypress handler for user interaction
  return new Promise((resolve) => {
    const keypressHandler = (str, key) => {
      if (key.name === "return") {
        // Execute command or save script
        cleanupHandler();
        resolve({
          nextState: State.EXECUTE_COMMAND,
          context,
        });
      } else if (key.name === "c") {
        // Copy command to clipboard and exit (command mode only)
        cleanupHandler();
        copyToClipboard(currentCommand.response.content.trim()).then(
          (success) => {
            if (success) {
              log.success("\nCommand copied to clipboard");
            } else {
              log.warning("\nFailed to copy command to clipboard");
            }
            resolve({ nextState: State.EXIT, context });
          }
        );
      } else if (key.name === "b" && !scriptMode) {
        // Show detailed breakdown (command mode only)
        cleanupHandler();
        clearScreen();
        displayCommandBreakdown(currentCommand.response);

        // Wait for a key press to return to main screen
        const returnHandler = () => {
          cleanupTempHandler();
          // Return to command display
          displayOptions(
            currentCommand.response,
            hasMultipleModels,
            scriptMode,
            options
          );
          cleanupHandler = setupKeypressHandler(keypressHandler);
        };

        const cleanupTempHandler = setupKeypressHandler(returnHandler);
      } else if (key.name === "s" && !scriptMode) {
        // Convert to script mode
        cleanupHandler();
        log.info("\nConverting to script mode...");
        resolve({
          nextState: State.USER_REQUEST,
          context: { ...context, scriptMode: true },
        });
      } else if (key.name === "d" && options.debug) {
        // Debug option - transition to DEBUG state
        cleanupHandler();
        resolve({ nextState: State.DEBUG, context });
      } else if (key.name === "m" && hasMultipleModels) {
        // Change model
        cleanupHandler();
        resolve({ nextState: State.CHANGE_MODEL, context });
      } else if (key.name === "r") {
        // Refine command or script
        cleanupHandler();
        resolve({ nextState: State.REFINE, context });
      } else if (key.ctrl && key.name === "c") {
        // Handle CTRL+C
        cleanupHandler();
        log.warning("\nProcess terminated");
        resolve({ nextState: State.EXIT, context });
      }
    };

    let cleanupHandler = setupKeypressHandler(keypressHandler);
  });
}
