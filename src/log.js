import chalk from "chalk";

const log = {
  success: (message) => {
    console.log(chalk.green(message));
  },
  info: (message) => {
    console.log(chalk.cyan(message));
  },
  warning: (message) => {
    console.log(chalk.yellow(message));
  },
  header: (message) => {
    console.log();
    console.log(chalk.grey.bold(message));
  },
  detail: (message) => {
    console.log(chalk.dim(message));
  },
  text: (message = "") => {
    console.log(message);
  },
  error: (message) => {
    console.error(chalk.red(message));
  },
  nl: () => {
    console.log();
  },
};

export default log;
