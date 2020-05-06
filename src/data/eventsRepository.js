const moment = require("moment");
const _ = require("lodash");
const helpers = require("../helpers");
const path = require("path");

class EventsRepository {
    constructor(cacheDir = "./cache") {
        this.cacheDir = path.join(cacheDir, "events/");
    }
    get(bucket) {
        return JSON.parse(helpers.fileRead(this.cacheDir + `${bucket}.json`, JSON.stringify([])));
    }

    save(events) {
        const eventsByFile = _.groupBy(
            events,
            (event) => `ev-month-${moment(event.created).format("YYYY-MM")}.json`
        );

        const path = this.cacheDir;

        Object.keys(eventsByFile).forEach(function(key) {
            const eventsInCache = JSON.parse(helpers.fileRead(path + key, JSON.stringify([])));
            const eventsToSaveInCache = eventsByFile[key];
            const newEvents = [...eventsInCache, ...eventsToSaveInCache];

            helpers.fileWrite(path + key, helpers.toJson(newEvents));
        });
    }
}

exports.EventsRepository = EventsRepository;
