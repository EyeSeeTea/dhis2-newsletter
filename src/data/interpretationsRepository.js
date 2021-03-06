const _ = require("lodash");
const helpers = require("../helpers");
const path = require("path");

class InterpretationsRepository {
    constructor(api, cacheDir = "./cache") {
        this.api = api;
        this.cacheFilePath = path.join(cacheDir, "interpretations.json");
    }

    async getFromAPI(dateFilter) {
        const { interpretations } = await this.api.get(
            "/interpretations/",
            _.omitBy(
                {
                    paging: false,
                    filter: dateFilter ? `lastUpdated:ge:${dateFilter}` : null,
                    fields: "id,text,likes,lastUpdated,comments[id,text,lastUpdated]",
                },
                _.isNil
            )
        );

        return interpretations;
    }

    getFromCache() {
        return JSON.parse(helpers.fileRead(this.cacheFilePath, JSON.stringify([])));
    }

    saveToCache(interpretations) {
        helpers.fileWrite(this.cacheFilePath, helpers.toJson(interpretations));
    }
}

exports.InterpretationsRepository = InterpretationsRepository;
