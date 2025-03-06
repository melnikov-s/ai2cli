import { State } from "../machine.js";
import log from "../log.js";
import { capitalizeFirstLetter } from "../util.js";
import enquirer from "enquirer";
const { Input } = enquirer;

// Handle clarification request state
export async function handleRequestClarification(context) {
  const { currentCommand, scriptMode } = context;
  const itemType = scriptMode ? "script" : "command";

  const clarificationNeeded = currentCommand.response.clarification_needed;

   // If there's a changelog and this is a refinement or clarification, display it
   if (currentCommand.response.changelog &&
    (currentCommand.type === "refinement" || currentCommand.type === "clarification")) {
   log.warning("\nChangelog:");
   log.detail(currentCommand.response.changelog);
   log.nl();
  }

  log.header(`${capitalizeFirstLetter(itemType)} needs clarification`);
  log.info(clarificationNeeded);
  log.nl();

  try {
    // Use Enquirer's Input prompt for clarification input
    const inputPrompt = new Input({
      name: "clarification",
      message: "Please provide additional information:",
      hint: "Press Enter with no text to skip",
      result: (value) => value.trim(),
    });

    const clarificationInput = await inputPrompt.run();

    if (clarificationInput === "") {
      const newCurrentCommand = {
        ...currentCommand,
        refusedClarification: true,
      };
      return {
        nextState: State.USER_RESPONSE,
        context: {
          ...context,
          currentCommand: newCurrentCommand,
        },
      };
    }

    const newCurrentCommand = {
      request: clarificationInput,
      type: "clarification",
    };

    const newCommandHistory = [...context.commandHistory, currentCommand];

    return {
      nextState: State.USER_REQUEST,
      context: {
        ...context,
        currentCommand: newCurrentCommand,
        commandHistory: newCommandHistory,
      },
    };
  } catch (error) {
    // Handle Ctrl+C or cancellation
    if (error.message !== "cancelled") {
      log.error(`Error: ${error.message}`);
    }

    const newCurrentCommand = {
      ...currentCommand,
      refusedClarification: true,
    };

    return {
      nextState: State.USER_RESPONSE,
      context: {
        ...context,
        currentCommand: newCurrentCommand,
      },
    };
  }
}
