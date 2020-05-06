#!/usr/bin/env node
const yargs = require("yargs");
const helpers = require("./helpers");
const { sendNotifications, sendNewsletters } = require("./commands");
const { generateEvents } = require("./generateEventsCommand");

async function main() {
    helpers.setDebug(true);

    const generateEventsOption = {
        key: "generate-events",
        options: {
            alias: "ge",
            description: "Execute previously generate-events command",
            type: "boolean",
            default: false,
        },
    };

    const configFileOption = {
        key: "config-file",
        options: { alias: "c", type: "string", default: "config.json" },
    };

    const executeSendCommand = async (argv, command) => {
        if (argv.generateEvents) {
            helpers.debug("Executing generate events previously");
            await generateEvents(argv);
        }

        return command(argv);
    };

    return yargs
        .help("help", "Display this help message and exit")
        .command(
            "generate-events",
            "Detect and generate in cache change events of interpretations and comments",
            (yargs) => yargs.option(configFileOption.key, configFileOption.options),
            generateEvents
        )
        .command(
            "send-notifications",
            "Send e-mail notifications on recent activity to subscribers",
            (yargs) =>
                yargs
                    .option(configFileOption.key, configFileOption.options)
                    .option(generateEventsOption.key, generateEventsOption.options),
            (argv) => executeSendCommand(argv, sendNotifications)
        )
        .command(
            "send-newsletters",
            "Send e-mail weekly newsletter to subscribers",
            (yargs) =>
                yargs
                    .option(configFileOption.key, configFileOption.options)
                    .option(generateEventsOption.key, generateEventsOption.options),
            (argv) => executeSendCommand(argv, sendNewsletters)
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
