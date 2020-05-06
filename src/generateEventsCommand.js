const _ = require("lodash");

const { Dhis2Api } = require("./api");
const helpers = require("./helpers");
const { LastExecutionsRepository } = require("./data/lastExecutionsRepository");
const { InterpretationsRepository } = require("./data/interpretationsRepository");
const { EventsRepository } = require("./data/eventsRepository");
const { GenerateEventsUseCase } = require("./domain/generateEventsUseCase");

async function generateEvents(argv) {
    const configOptions = helpers.loadConfigOptions(argv.configFile);

    const { api: apiOptions, cacheDir } = configOptions;

    const api = new Dhis2Api(apiOptions);

    const lastExecutionsRepository = new LastExecutionsRepository(cacheDir);
    const interpretationsRepository = new InterpretationsRepository(api, cacheDir);
    const eventsRepository = new EventsRepository(cacheDir);

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
