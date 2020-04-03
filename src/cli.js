#!/usr/bin/env node
const yargs = require("yargs");
const helpers = require("./helpers");
const { sendNotifications, sendNewsletters } = require("./commands");
const { generateEvents } = require("./generateEventsCommand");

async function main() {
    helpers.setDebug(true);

    return yargs
        .help("help", "Display this help message and exit")
        .option("config-file", { alias: "c", type: "string", default: "config.json" })
        .option("ignore-cache", { type: "boolean", default: false })
        .command(
            "generate-events",
            "Detect and generate in cache change events of interpretations and comments",
            yargs => yargs,
            generateEvents
        )
        .command(
            "send-notifications",
            "Send e-mail notifications on recent activity to subscribers",
            yargs => yargs,
            sendNotifications
        )
        .command(
            "send-newsletters",
            "Send e-mail weekly newsletter to subscribers",
            yargs => yargs,
            sendNewsletters
        )
        .demandCommand()
        .strict()
        .fail((msg, err) => {
            msg && console.error(msg);
            err && console.error(err);
            process.exit(1);
        }).argv;
}

main();
