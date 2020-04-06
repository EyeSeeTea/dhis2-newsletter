const _ = require("lodash");

const { Dhis2Api } = require("./api");
const helpers = require("./helpers");
const { LastExecutionsRepository } = require("./data/lastExecutionsRepository");
const { InterpretationsRepository } = require("./data/interpretationsRepository");
const { EventsRepository } = require("./data/eventsRepository");
const { GenerateEventsUseCase } = require("./domain/generateEventsUseCase");

async function generateEvents(argv) {
    const configOptions = helpers.loadConfigOptions(argv.configFile);

    const { api: apiOptions, cacheFilePath } = configOptions;

    const api = new Dhis2Api(apiOptions);
    const commandOptions = {
        cacheFilePath: cacheFilePath
    };

    const options = _.defaults(commandOptions, {
        cacheFilePath: "./cache/lastExecutions.json"
    });

    const lastExecutionsRepository = new LastExecutionsRepository(options.cacheFilePath);
    const interpretationsRepository = new InterpretationsRepository(api);
    const eventsRepository = new EventsRepository();

    const generateEventsUseCase = new GenerateEventsUseCase(
        lastExecutionsRepository,
        interpretationsRepository,
        eventsRepository
    );

    await generateEventsUseCase.execute();
}

Object.assign(module.exports, {
    generateEvents,
});
