var moment = require("moment");

const helpers = require("../helpers");

class EventsRepository {
    constructor(cachePath = "./cache/events/") {
        this.cachePath = cachePath;
    }
    get(bucket) {
        return JSON.parse(helpers.fileRead(this.cachePath + `${bucket}.json`, JSON.stringify([])));
    }

    save(events) {
        const eventsByFile = events.reduce((map, event) => {
            const fileName = `ev-month-${moment(event.created).format("YYYY-MM")}.json`;

            (map[fileName] = map[fileName] || []).push(event);
            return map;
        }, {});

        const path = this.cachePath;

        Object.keys(eventsByFile).forEach(function(key) {
            const eventsInCache = JSON.parse(helpers.fileRead(path + key, JSON.stringify([])));
            const eventsToSaveInCache = eventsByFile[key];

            const newEvents = [...eventsInCache, ...eventsToSaveInCache];

            helpers.fileWrite(path + key, JSON.stringify(newEvents, null, 4) + "\n");
        });
    }
}

exports.EventsRepository = EventsRepository;
