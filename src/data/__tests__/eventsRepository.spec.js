const moment = require("moment");
const fs = require("fs");
const Path = require("path");

var { EventsRepository } = require("../eventsRepository");

const cachePath = "./test_cache/";

describe("eventRepository", () => {
    afterEach(() => {
        clearCache(cachePath);
    });

    describe("one month", () => {
        it("should create a new file in cache for month with events if it doesn't exist ", () => {
            const events = givenThereEventsForOneMonthAndNotExistsInCache();
            const repository = new EventsRepository(cachePath);
            repository.save(events);
            verifyExistFilesForMonths(events, repository);
        });

        it("should update the existed file in cache for month with events if it does exist", () => {
            const events = givenThereEventsForOneMonthAndExistsPreviouslyOldInCache();
            const repository = new EventsRepository(cachePath);
            repository.save(events);
            verifyExistFilesForMonths(events, repository);
        });
    });

    describe("two month", () => {
        it("should create new files in cache for months with events if it doesn't exist ", () => {
            const events = givenThereEventsForTwoMonthsAndNotExistsInCache();
            const repository = new EventsRepository(cachePath);
            repository.save(events);
            verifyExistFilesForMonths(events, repository);
        });

        it("should update the existed files in cache for months with events if the files does exist", () => {
            const events = givenThereEventsForTwoMonthsAndExistsPreviouslyOldInCache();
            const repository = new EventsRepository(cachePath);
            repository.save(events);
            verifyExistFilesForMonths(events, repository);
        });

        it("should create a new file and update the existed file in cache for months with events if only one does exist", () => {
            const events = givenThereEventsForTwoMonthsAndExistsPreviouslyForOneOldInCache();

            const repository = new EventsRepository(cachePath);

            repository.save(events);

            verifyExistFilesForMonths(events, repository);
        });
    });
});

function verifyExistFilesForMonths(newEvents, repository) {
    const monthNames = newEvents.reduce((accumulator, currentValue) => {
        const fileName = "ev-month-" + moment(currentValue.created).format("YYYY-MM");

        if (!accumulator.includes(fileName)) {
            return [...accumulator, fileName];
        } else {
            return accumulator;
        }
    }, []);

    monthNames.forEach((monthName) => {
        const savedEventsMonth = repository.get(monthName);
        const month = monthName.slice(-7);

        const newEventsInMonth = newEvents.filter((event) => {
            const eventMoth = moment(event.created).format("YYYY-MM");
            return eventMoth === month;
        });

        expect(
            newEventsInMonth.every((event) =>
                savedEventsMonth.some(
                    (savedEvent) =>
                        savedEvent.interpretationId === event.interpretationId &&
                        savedEvent.commentId === event.commentId &&
                        savedEvent.created === event.created
                )
            )
        );
    });
}

function givenThereEventsForOneMonthAndNotExistsInCache() {
    return generateEvents();
}

function givenThereEventsForTwoMonthsAndNotExistsInCache() {
    return generateEvents(false);
}

function givenThereEventsForOneMonthAndExistsPreviouslyOldInCache() {
    const oldEvents = generateEvents();
    const repository = new EventsRepository(cachePath);
    repository.save(oldEvents);

    return generateEvents();
}

function givenThereEventsForTwoMonthsAndExistsPreviouslyOldInCache() {
    const oldEvents = generateEvents(false);
    const repository = new EventsRepository(cachePath);
    repository.save(oldEvents);

    return generateEvents(false);
}

function givenThereEventsForTwoMonthsAndExistsPreviouslyForOneOldInCache() {
    const oldEvents = generateEvents();
    const repository = new EventsRepository(cachePath);
    repository.save(oldEvents);

    return generateEvents(false);
}

function generateEvents(oneMonth = true) {
    return [...Array(10).keys()].map((index) => {
        return {
            type: `update`,
            model: `interpretation ${index}`,
            created: oneMonth
                ? moment().toISOString()
                : index % 2 == 0
                ? moment().toISOString()
                : moment()
                      .subtract(1, "month")
                      .toISOString(),
            commentId: null,
            interpretationId: index.toString(),
        };
    });
}

const clearCache = (path) => {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach((file) => {
            const curPath = Path.join(path, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};
