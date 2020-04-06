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
        cacheFilePath: cacheFilePath,
        ignoreCache: argv.ignoreCache,
    };

    const options = _.defaults(commandOptions, {
        cacheFilePath: ".notifications-cache.json",
        ignoreCache: false,
    });

    const lastExecutionsRepository = new LastExecutionsRepository(options.cacheFilePath);
    const interpretationsRepository = new InterpretationsRepository(api);
    const eventsRepository = new EventsRepository();

    const generateEventsUseCase = new GenerateEventsUseCase(
        lastExecutionsRepository,
        interpretationsRepository,
        eventsRepository
    );

    await generateEventsUseCase.execute({
        ignoreCache: options.ignoreCache,
    });
}

Object.assign(module.exports, {
    generateEvents,
});
