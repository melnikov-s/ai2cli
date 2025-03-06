import log from "./log.js";
import { handleNew } from "./states/new.js";
import { handleUserRequest } from "./states/userRequest.js";
import { handleRequestClarification } from "./states/requestClarification.js";
import { handleUserResponse } from "./states/userResponse.js";
import { handleExecuteCommand } from "./states/executeCommand.js";
import { handleRefine } from "./states/refine.js";
import { handleChangeModel } from "./states/changeModel.js";
import { handleSaveScript } from "./states/saveScript.js";
import { handleScriptSelection } from "./states/scriptSelection.js";
import { handleSetup } from "./states/setup.js";
import { clearScreen } from "./util.js";
import chalk from "chalk";
import { highlight } from "cli-highlight";

export const State = {
  NEW: "NEW",
  USER_REQUEST: "USER_REQUEST",
  USER_RESPONSE: "USER_RESPONSE",
  REQUEST_CLARIFICATION: "REQUEST_CLARIFICATION",
  EXECUTE_COMMAND: "EXECUTE_COMMAND",
  REFINE: "REFINE",
  CHANGE_MODEL: "CHANGE_MODEL",
  SAVE_SCRIPT: "SAVE_SCRIPT",
  SCRIPT_SELECTION: "SCRIPT_SELECTION",
  SETUP: "SETUP",
  EXIT: "EXIT",
};

function displayPromptAndHistory(context) {
  const { commandHistory, currentCommand, scriptName, scriptMode } = context;

  // Display the current model
  log.header("ai2cli");
  log.info("Model: " + context.model);

  const originalCommand =
    commandHistory.length === 0 ? currentCommand : commandHistory[0];
  const originalRequest = originalCommand.existingScript
    ? `Refining script: ${scriptName}: ${originalCommand.request}`
    : originalCommand.request;

  if (commandHistory.length === 0) {
    log.header("Prompt: ");
    log.text(originalRequest);
  } else {
    log.header("History:");

    // Helper function to display responses and questions
    const displayResponseAndQuestion = (command) => {
      if (command.response?.content) {
        log.text(
          chalk.gray("└─ ") +
            chalk.green("Response: ") +
            chalk.dim(
              scriptMode
                ? `[${command.response.explanation || "Script"}]`
                : command.response.content
            )
        );
      }

      if (command.response?.changelog) {
        log.text(
          chalk.gray("└─ ") +
            chalk.yellow("Changelog: ") +
            chalk.dim(command.response.changelog)
        );
      }

      if (command.response?.clarification_needed) {
        log.text(
          chalk.gray("└─ ") +
            chalk.blue("LLM Question: ") +
            chalk.dim(command.response.clarification_needed)
        );
      }
    };

    // Display initial prompt and its response
    log.text("Initial Prompt: " + originalRequest);
    displayResponseAndQuestion(originalCommand);

    const printUserRequest = (command) => {
      log.text(
        (command.type === "clarification"
          ? "User Answer: "
          : "User Refinement: ") + command.request
      );
    };

    // Display the rest of the history
    const historyToDisplay = [...commandHistory.slice(1)];

    historyToDisplay.forEach((command, i) => {
      if (!command.request) return;

      printUserRequest(command);
      displayResponseAndQuestion(command);
    });

    // Display current refinement if it exists
    if (currentCommand.request) {
      printUserRequest(currentCommand);
    }
  }

  log.header("LLM Response");

  if (currentCommand?.response?.content) {
    if (scriptMode) {
      const highlightedCode = highlight(currentCommand.response.content, {
        language: "javascript",
      });
      log.text(highlightedCode);
    } else {
      log.text(chalk.bold(currentCommand.response.content.trim()));
    }
  }
}

// State machine runner
export async function runStateMachine(
  initialContext,
  initialState = State.USER_REQUEST
) {
  let currentState = initialState;
  let context = initialContext;

  while (currentState !== State.EXIT) {
    let result;
    clearScreen();

    // Display the current prompt and all the refinement and clarification history
    displayPromptAndHistory(context);

    // Execute the appropriate state handler
    switch (currentState) {
      case State.NEW:
        result = await handleNew(context);
        break;
      case State.USER_REQUEST:
        result = await handleUserRequest(context);
        break;
      case State.REQUEST_CLARIFICATION:
        result = await handleRequestClarification(context);
        break;
      case State.USER_RESPONSE:
        result = await handleUserResponse(context);
        break;
      case State.EXECUTE_COMMAND:
        result = await handleExecuteCommand(context);
        break;
      case State.REFINE:
        result = await handleRefine(context);
        break;
      case State.CHANGE_MODEL:
        result = await handleChangeModel(context);
        break;
      case State.SAVE_SCRIPT:
        result = await handleSaveScript(context);
        break;
      case State.SCRIPT_SELECTION:
        result = await handleScriptSelection(context);
        break;
      case State.SETUP:
        result = await handleSetup(context);
        break;
      default:
        log.error(`Unknown state: ${currentState}`);
        return;
    }

    // Update state and context
    currentState = result.nextState;
    context = { ...context, ...result.context };
  }
}
