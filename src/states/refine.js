import enquirer from "enquirer";
import log from "../log.js";
import { State } from "../machine.js";

const { Input } = enquirer;

// Handle refine state - refine command/script
export async function handleRefine(context) {
  const { currentCommand, scriptMode } = context;

  const hasOutput = currentCommand.executionResults?.output;

  if (hasOutput) {
    log.detail("Your last output will be used as context for refinement");
    log.nl();
    if (currentCommand.executionResults.error) {
      log.error(currentCommand.executionResults.output);
    } else {
      log.text(currentCommand.executionResults.output);
    }
    log.nl();
  }

  try {
    // Use Enquirer's Input prompt for refinement input
    const inputPrompt = new Input({
      name: "refinement",
      message: `How would you like to refine the ${
        scriptMode ? "script" : "command"
      }?`,
      hint: scriptMode
        ? 'Examples: "add error handling", "make it support CSV files", etc.'
        : 'Examples: "add verbose output", "sort results by date instead", etc.',
    });

    const refinementRequest = await inputPrompt.run();

    if (refinementRequest.trim() === "") {
      // If the user presses enter without typing anything, return with empty refinement
      return {
        nextState: State.USER_RESPONSE,
        context,
      };
    }

    const newCurrentCommand = {
      request: refinementRequest,
      previousExecutionResults: currentCommand.executionResults,
      type: "refinement",
    };

    const newCommandHistory = [...context.commandHistory, currentCommand];

    // Redirect to USER_REQUEST state with the updated context
    return {
      nextState: State.USER_REQUEST,
      context: {
        ...context,
        currentCommand: newCurrentCommand,
        commandHistory: newCommandHistory,
      },
    };
  } catch (error) {
    // Handle Ctrl+C or other errors
    if (error.message !== "cancelled") {
      log.error(`Error: ${error.message}`);
    }
    return { nextState: State.USER_RESPONSE, context };
  }
}
