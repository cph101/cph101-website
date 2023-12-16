const util = require("util");
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");

function fancyLog(text, type = "success") {
  let logText;
  if (type === "success") {
    logText = `\x1b[0;32m✓ ${text}\x1b[0m`;
  } else if (type === "warn") {
    logText = `\x1b[0;33m⚠ ${text}\x1b[0m`;
  } else {
    logText = `\x1b[0;31m× Error: ${text}\x1b[0m`;
  }
  console.log(logText);
}

async function question(text) {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    readline.question(text, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

async function executeCommand(command, options = {}, successMessage) {
  try {
    let commandThrewFatalError = false;
    const { stdout, stderr } = await exec(command);

    if (stderr && Object.keys(options).length > 0) {
      const specialKeys = Object.keys(options);
      let errorHandled = false;

      for (const line of stderr.split("\n")) {
        let errorFlagged = false;

        for (const opkey of specialKeys) {
          if (line.includes(opkey) && options[opkey] !== "ignore") {
            let plainlog = options[opkey].split("---")[0];
            let type = options[opkey].split("---")[1] || "error";

            if (type !== "warn") {
              commandThrewFatalError = true;
            }
            fancyLog(plainlog, type);
            errorFlagged = true;
            break; // Exit loop since the error was flagged
          }
        }

        if (!errorFlagged && !errorHandled) {
          // Unhandled fatal error
          let commandname = command.split(" ")[0];
          fs.appendFileSync("latest.log", options[opkey] !== "ignore" ? stderr.trim() + "\n" : `'${commandname}' logged to stderr but was ignored\n`);
          commandThrewFatalError = options[opkey] !== "ignore";
          fancyLog(options[opkey] !== "ignore" ? `'${commandname}' threw a fatal unhandled error, check latest.log` : `${commandname} logged to stderr but was ignored`, "error");
          errorHandled = true;
        }
      }
    }

    if (!commandThrewFatalError && successMessage) {
      fancyLog(successMessage, "success");
    }
  } catch (flies) {
    // Prevent errors escalating to shell/console
  }
}



async function remoteCommand(webSourcePass) {
  await executeCommand(
    "find ./src -name '.DS_Store' -type f -delete 2>/dev/null",
  );
  const response = await question("Are you sure you want to proceed? (y/n): ");
  if (response === "y") {
    await executeCommand("zip -r src.zip ./src -x '*.DS_Store'");
    await executeCommand(
      `openssl enc -aes-256-cbc -salt -in src.zip -out source_encrypted.enc -pass pass:${webSourcePass}`,
      { deprecated: "Encryption method is deprecated---warn", better:"ignore" },
      "Encryption succeeded",
    );
    await executeCommand("rm src.zip");
    await executeCommand(
      `git commit -a -m "${await question("Enter a custom commit message: ")}"`,
      {},
      "Files successfully committed",
    );
    await executeCommand(
      "git push 2>&1 >/dev/null",
      {
        hint: "ignore",
        To: "ignore",
        rejected: "Upstream changes, rebase might be required---warn",
        "failed to push": "Push failed",
      },
      "Files successfully pushed",
    );
  }
}

async function decryptCommand(webSourcePass) {
  await executeCommand(
    `openssl enc -d -aes-256-cbc -in source_encrypted.enc -out src.zip -pass pass:${webSourcePass}`,
    { deprecated: "Encryption method is deprecated---warn" },
    "Decryption succeeded",
  );
  await executeCommand("unzip src.zip");
  await executeCommand("rm src.zip");
}

async function encryptCommand(webSourcePass) {
  await executeCommand("zip -r src.zip ./src -x '*.DS_Store'");
  await executeCommand(
    `openssl enc -aes-256-cbc -salt -in src.zip -out source_encrypted.enc -pass pass:${webSourcePass}`,
    { deprecated: "Encryption method is deprecated---warn" },
    "Encryption succeeded",
  );
  await executeCommand("rm src.zip");
}

const args = process.argv.slice(2);
const command = args[0];

(async () => {
  let webSourcePass =
    process.env.web_source_pass ||
    process.env["web_source_pass"] ||
    (await question("Enter encryption password: "));

  await executeCommand("rm latest.log", "ignore");

  switch (command) {
    case "remote":
      await remoteCommand(webSourcePass);
      break;
    case "decrypt":
      await decryptCommand(webSourcePass);
      break;
    case "encrypt":
      await encryptCommand(webSourcePass);
      break;
    default:
      fancyLog("You're in my website, and I'm in your walls >:]", "warn");
      break;
  }
})();
