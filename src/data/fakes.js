/** This file conatins repository fakes used in testing */

class FakeLastExecutionsRepository {
    constructor() {
        this.lastExecutions = {};
    }

    get() {
        return this.lastExecutions;
    }
    save(lastExecutions) {
        this.lastExecutions = lastExecutions;
    }
}

class FakeInterpretationsRepository {
    constructor() {
        this.interpretationsTemplate = [
            {
                lastUpdated: "2020-03-30T10:37:38.790",
                id: "BR11Oy1Q4yR",
                text: "This chart shows that BCG doses is low for 2014, why is that?",
                comments: [
                    {
                        lastUpdated: "2014-10-21T10:11:19.537",
                        id: "Eg7x5Kt2XgV",
                        text: "It might be caused by a stock-out of vaccines.",
                    },
                    {
                        lastUpdated: "2014-10-21T10:11:44.325",
                        id: "oRmqfmnCLsQ",
                        text: "Yes I believe so",
                    },
                ],
            },
            {
                lastUpdated: "2020-04-01T06:03:10.380",
                id: "q5K5C2pxz6G",
                text: "Jorge interprestation about chart hlzEdAWPd4L xdxdx",
                comments: [
                    {
                        lastUpdated: "2020-04-01T05:31:28.947",
                        id: "k9qUEvhz63S",
                        text: "jorge comment b",
                    },
                ],
            },
        ];
        this.interpretationsFromAPI = [];
        this.interpretationsFromCache = [];
    }

    async getFromAPI(dateFilter) {
        this.lastDateFilter = dateFilter;
        return this.interpretationsFromAPI;
    }
    getFromCache() {
        return this.interpretationsFromCache;
    }

    saveToCache(interpretations) {
        this.interpretationsFromCache = interpretations;
    }
}

class FakeEventsRepository {
    constructor() {
        this.events = [];
    }

    get() {
        return this.events;
    }
    save(events) {
        this.events = [...this.events, ...events];
    }
}

exports.FakeLastExecutionsRepository = FakeLastExecutionsRepository;
exports.FakeInterpretationsRepository = FakeInterpretationsRepository;
exports.FakeEventsRepository = FakeEventsRepository;
