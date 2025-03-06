import enquirer from "enquirer";
import { clearScreen, getAvailableScripts } from "../util.js";
import { State } from "../machine.js";
import log from "../log.js";

const { Select, Input } = enquirer;

// Handle the NEW state showing program info and option selection
export async function handleNew(context) {
  // Get available scripts first to determine if we should show the refine option
  const scripts = await getAvailableScripts(context.config);
  const hasScriptsToRefine = scripts.length > 0;

  // Option selection
  const options = ["Generate a command", "Generate a script"];

  // Add "Refine an existing script" option if scripts are available
  if (hasScriptsToRefine) {
    options.push("Refine an existing script");
  }

  clearScreen();
  log.header("ai2cli");
  log.nl();
  log.success("AI-powered Command Line Interface Tool");

  try {
    // Use Enquirer's Select prompt for option selection
    const selectPrompt = new Select({
      name: "action",
      message: "What would you like to do?",
      choices: options,
    });

    const answer = await selectPrompt.run();
    const selectedIndex = options.findIndex((option) => option.name === answer);

    // Check if the user selected the "Refine an existing script" option
    if (hasScriptsToRefine && selectedIndex === 2) {
      // Go directly to script selection state
      return { nextState: State.SCRIPT_SELECTION, context };
    }

    // Otherwise handle command or script generation
    const isScriptMode = selectedIndex === 1; // Index 1 is "Generate a script"

    // Ask for the command/script request
    clearScreen();

    log.header("ai2cli");
    log.nl();

    // Use Enquirer's Input prompt for text input
    const inputPrompt = new Input({
      name: "request",
      message: isScriptMode
        ? "Describe the script you want to create:"
        : "Describe the command you want to generate:",
      hint: isScriptMode
        ? 'Example: "web scraper for news sites", "image processing tool", etc.'
        : 'Example: "find all large files", "backup my documents", etc.',
    });

    const request = await inputPrompt.run();

    if (request.trim() === "") {
      log.warning("\nNo input provided. Exiting.");
      return { nextState: State.EXIT, context };
    }

    // Update context with the user's request
    const newContext = {
      ...context,
      currentCommand: {
        request,
        existingScript: null,
        type: "prompt",
        refusedClarification: false,
        response: null,
      },
      scriptMode: isScriptMode,
    };

    // Go to USER_REQUEST state to generate the response
    return { nextState: State.USER_REQUEST, context: newContext };
  } catch (error) {
    return { nextState: State.EXIT, context };
  }
}
