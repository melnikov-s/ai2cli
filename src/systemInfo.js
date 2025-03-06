import os from "os";
import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

/**
 * Gathers comprehensive system information for CLI command generation
 * @returns {Promise<Object>} System information object
 */
async function getSystemInfo() {
  try {
    // Basic system information
    const systemInfo = {
      currentDirectory: process.cwd(),
      homeDirectory: os.homedir(),
      username: os.userInfo().username,
      operatingSystem: `${os.type()} ${os.release()}`,
      shell: process.env.SHELL || process.env.COMSPEC || "unknown",
      terminalType: process.env.TERM || process.env.TERM_PROGRAM || "unknown",
      dateTime: new Date().toLocaleString(),
    };

    // User and Permission Context
    try {
      systemInfo.isAdmin = await checkAdminPrivileges();
      systemInfo.userGroups = await getUserGroups();
      systemInfo.umask = process.umask().toString(8);
    } catch (error) {
      systemInfo.permissionError = error.message;
    }

    // System Configuration
    systemInfo.architecture = `${os.arch()} (${os.platform()})`;
    systemInfo.relevantEnvVars = getRelevantEnvVars();
    systemInfo.locale = process.env.LANG || process.env.LC_ALL || "unknown";
    systemInfo.defaultEditor =
      process.env.EDITOR || process.env.VISUAL || "unknown";

    // Software Context
    try {
      systemInfo.installedTools = await getInstalledTools();
      systemInfo.packageManagers = await detectPackageManagers();
      systemInfo.recentCommands = await getRecentCommands();
    } catch (error) {
      systemInfo.softwareContextError = error.message;
    }

    // Storage Context
    try {
      systemInfo.diskSpace = await getDiskSpace();
      systemInfo.mountPoints = await getMountPoints();
      systemInfo.fileSystem = await getFileSystemType();
    } catch (error) {
      systemInfo.storageError = error.message;
    }

    // Network Context
    try {
      systemInfo.networkInterfaces = getNetworkInterfaces();
    } catch (error) {}

    // Development Context
    try {
      systemInfo.gitStatus = await getGitStatus();
      systemInfo.languageEnvironments = await detectProjectType();
      systemInfo.virtualEnvironments = await detectVirtualEnvironments();
    } catch (error) {
      systemInfo.developmentContextError = error.message;
    }

    return systemInfo;
  } catch (error) {
    console.error("Error getting system information:", error);
    return {
      error: "Failed to gather system information",
      message: error.message,
      stack: error.stack,
    };
  }
}

// Helper Functions

async function checkAdminPrivileges() {
  if (os.platform() === "win32") {
    try {
      execSync("net session", { stdio: "ignore" });
      return true;
    } catch (e) {
      return false;
    }
  } else {
    return os.userInfo().uid === 0;
  }
}

async function getUserGroups() {
  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync("whoami /groups");
      return stdout.trim();
    } catch (e) {
      return "unknown";
    }
  } else {
    try {
      const { stdout } = await execAsync("groups");
      return stdout.trim();
    } catch (e) {
      return "unknown";
    }
  }
}

function getRelevantEnvVars() {
  const relevantVars = [
    "PATH",
    "PYTHONPATH",
    "NODE_PATH",
    "JAVA_HOME",
    "GOPATH",
  ];
  const result = {};

  relevantVars.forEach((varName) => {
    if (process.env[varName]) {
      result[varName] = process.env[varName];
    }
  });

  return result;
}

async function getInstalledTools() {
  const tools = {};
  const commands = [
    { name: "git", command: "git --version" },
    { name: "node", command: "node --version" },
    { name: "bun", command: "bun --version" },
    { name: "npm", command: "npm --version" },
    { name: "python", command: "python --version" },
    { name: "python3", command: "python3 --version" },
    { name: "java", command: "java -version" },
    { name: "docker", command: "docker --version" },
    { name: "gcc", command: "gcc --version" },
  ];

  for (const { name, command } of commands) {
    try {
      const { stdout, stderr } = await execAsync(command);
      tools[name] = (stdout || stderr).trim().split("\n")[0];
    } catch (e) {
      // Tool not installed or not in PATH
    }
  }

  return tools;
}

async function detectPackageManagers() {
  const packageManagers = [];

  const managers = [
    { name: "apt", command: "apt --version", platforms: ["linux"] },
    { name: "yum", command: "yum --version", platforms: ["linux"] },
    { name: "dnf", command: "dnf --version", platforms: ["linux"] },
    { name: "pacman", command: "pacman --version", platforms: ["linux"] },
    { name: "brew", command: "brew --version", platforms: ["darwin", "linux"] },
    { name: "chocolatey", command: "choco --version", platforms: ["win32"] },
    { name: "scoop", command: "scoop --version", platforms: ["win32"] },
    { name: "winget", command: "winget --version", platforms: ["win32"] },
  ];

  for (const { name, command, platforms } of managers) {
    if (platforms.includes(os.platform())) {
      try {
        await execAsync(command);
        packageManagers.push(name);
      } catch (e) {
        // Package manager not installed
      }
    }
  }

  return packageManagers;
}

async function getRecentCommands(limit = 10) {
  try {
    const historyFile =
      process.env.HISTFILE ||
      path.join(os.homedir(), ".bash_history") ||
      path.join(os.homedir(), ".zsh_history");

    if (fs.existsSync(historyFile)) {
      const history = fs.readFileSync(historyFile, "utf8");
      return history
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map((cmd) => cmd.replace(/^: \d+:0;/, "")) // Clean zsh timestamps if present
        .filter((cmd) => !cmd.includes("getSystemInfo")); // Don't include calls to this function
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function getDiskSpace() {
  const currentDir = process.cwd();

  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync(
        `powershell -command "Get-PSDrive -PSProvider 'FileSystem' | Where-Object { '${currentDir}'.StartsWith($_.Root) } | Select-Object -ExpandProperty Free"`
      );
      const freeBytes = parseInt(stdout.trim(), 10);
      return {
        free: formatBytes(freeBytes),
        freeBytes: freeBytes,
      };
    } catch (e) {
      return "unknown";
    }
  } else {
    try {
      const { stdout } = await execAsync(
        `df -k "${currentDir}" | tail -1 | awk '{print $4}'`
      );
      const freeKB = parseInt(stdout.trim(), 10);
      return {
        free: formatBytes(freeKB * 1024),
        freeBytes: freeKB * 1024,
      };
    } catch (e) {
      return "unknown";
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function getMountPoints() {
  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync("wmic logicaldisk get caption");
      return stdout
        .trim()
        .split("\r\r\n")
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  } else {
    try {
      const { stdout } = await execAsync(
        "mount | grep -E \"^/dev\" | awk '{print $3}'"
      );
      return stdout.trim().split("\n");
    } catch (e) {
      return [];
    }
  }
}

async function getFileSystemType() {
  const currentDir = process.cwd();

  if (os.platform() === "win32") {
    try {
      const { stdout } = await execAsync(
        `powershell -command "Get-Volume -DriveLetter '${
          currentDir.split(":")[0]
        }' | Select-Object -ExpandProperty FileSystem"`
      );
      return stdout.trim();
    } catch (e) {
      return "unknown";
    }
  } else {
    try {
      const { stdout } = await execAsync(
        `df -T "${currentDir}" | tail -1 | awk '{print $2}'`
      );
      return stdout.trim();
    } catch (e) {
      return "unknown";
    }
  }
}

function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = {};

  for (const [name, addresses] of Object.entries(interfaces)) {
    const nonInternalAddresses = addresses
      .filter((addr) => !addr.internal)
      .map((addr) => ({
        address: addr.address,
        family: addr.family,
        netmask: addr.netmask,
      }));

    if (nonInternalAddresses.length > 0) {
      result[name] = nonInternalAddresses;
    }
  }

  return result;
}

async function getGitStatus() {
  try {
    await execAsync("git rev-parse --is-inside-work-tree");

    const [branch, status, remotes] = await Promise.all([
      execAsync("git branch --show-current"),
      execAsync("git status --porcelain"),
      execAsync("git remote -v"),
    ]);

    return {
      branch: branch.stdout.trim(),
      isDirty: status.stdout.trim().length > 0,
      changes: status.stdout.trim().split("\n").filter(Boolean).length,
      remotes: remotes.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, url] = line.split("\t");
          return { name, url: url.split(" ")[0] };
        }),
    };
  } catch (e) {
    return null;
  }
}

async function detectProjectType() {
  const projectTypes = [];
  const indicators = [
    { type: "Node.js", file: "package.json" },
    {
      type: "Python",
      files: ["requirements.txt", "setup.py", "pyproject.toml"],
    },
    { type: "Ruby", files: ["Gemfile", ".ruby-version"] },
    { type: "Java", files: ["pom.xml", "build.gradle"] },
    { type: "PHP", file: "composer.json" },
    { type: "Go", file: "go.mod" },
    { type: "Rust", file: "Cargo.toml" },
    { type: ".NET", files: ["*.csproj", "*.fsproj", "*.vbproj"] },
  ];

  for (const indicator of indicators) {
    if (
      indicator.file &&
      fs.existsSync(path.join(process.cwd(), indicator.file))
    ) {
      projectTypes.push(indicator.type);
    } else if (indicator.files) {
      for (const filePattern of indicator.files) {
        try {
          if (filePattern.includes("*")) {
            const glob = filePattern.replace("*", "");
            const files = fs.readdirSync(process.cwd());
            if (files.some((file) => file.endsWith(glob))) {
              projectTypes.push(indicator.type);
              break;
            }
          } else if (fs.existsSync(path.join(process.cwd(), filePattern))) {
            projectTypes.push(indicator.type);
            break;
          }
        } catch (e) {
          // Skip this check if it fails
        }
      }
    }
  }

  return projectTypes;
}

async function detectVirtualEnvironments() {
  const environments = {};

  // Check for Node.js version managers
  try {
    if (process.env.NVM_DIR) {
      environments.nvm = true;
    }
  } catch (e) {}

  // Check for Python virtual environments
  try {
    if (process.env.VIRTUAL_ENV) {
      environments.pythonVenv = process.env.VIRTUAL_ENV;
    }
  } catch (e) {}

  // Check for pipenv
  try {
    const { stdout } = await execAsync("pipenv --where", { timeout: 1000 });
    if (stdout.trim()) {
      environments.pipenv = stdout.trim();
    }
  } catch (e) {}

  // Check for conda
  try {
    if (process.env.CONDA_PREFIX) {
      environments.conda = process.env.CONDA_PREFIX;
    }
  } catch (e) {}

  return environments;
}

export { getSystemInfo };
