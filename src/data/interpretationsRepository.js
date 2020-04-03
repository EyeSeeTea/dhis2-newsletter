const _ = require("lodash");
const helpers = require("../helpers");

class InterpretationsRepository {
    constructor(api) {
        this.api = api;
        this.cacheFilePath = "./cache/interpretations.json";
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
        helpers.fileWrite(this.cacheFilePath, JSON.stringify(interpretations, null, 4) + "\n");
    }
}

exports.InterpretationsRepository = InterpretationsRepository;
