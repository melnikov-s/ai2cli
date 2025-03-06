import enquirer from "enquirer";
import log from "../log.js";
import { State } from "../machine.js";
import {
  clearScreen,
  getAvailableScripts,
  loadExistingScript,
} from "../util.js";
import { highlight } from "cli-highlight";
import { getRefinementPrompt } from "../prompt.js";

const { Select, Input } = enquirer;

// Handle script selection state
export async function handleScriptSelection(context) {
  const { config } = context;

  // Get available scripts
  const scripts = await getAvailableScripts(config);

  if (scripts.length === 0) {
    log.warning("No scripts found. Please create a script first.");
    return { nextState: State.NEW, context };
  }

  clearScreen();
  log.header("ai2cli");
  log.nl();
  log.success("Select a script to refine");

  try {
    // Use Enquirer's Select prompt for script selection
    const selectPrompt = new Select({
      name: "script",
      message: "Choose a script to refine:",
      choices: scripts.map((script) => ({
        name: script,
        message: script,
      })),
    });

    const selectedScript = await selectPrompt.run();

    // Load the selected script
    const scriptContent = await loadExistingScript(selectedScript, config);

    if (!scriptContent) {
      log.error(`Failed to load script: ${selectedScript}`);
      return { nextState: State.EXIT, context };
    }

    log.header("Selected Script: " + selectedScript);
    log.nl();
    log.text(
      highlight(scriptContent, { language: "javascript", ignoreIllegals: true })
    );
    log.nl();

    // Ask the user how they want to refine the script
    const refinePrompt = new Input({
      name: "refinement",
      message: "How would you like to refine this script?",
      initial: "Add more features",
    });

    const refinementRequest = await refinePrompt.run();

    // Update context with the selected script
    const newContext = {
      ...context,
      currentCommand: {
        request: getRefinementPrompt({
          existingScript: scriptContent,
          request: refinementRequest,
        }),
        existingScript: scriptContent,
        type: "prompt",
        response: null,
      },
      scriptName: selectedScript,
      scriptMode: true,
    };

    // Go to USER_REQUEST state to generate the response
    clearScreen();
    return { nextState: State.USER_REQUEST, context: newContext };
  } catch (error) {
    // Handle Ctrl+C or other errors
    if (error.message !== "cancelled") {
      log.error(`Error: ${error.message}`);
    }
    return { nextState: State.EXIT, context };
  }
}
