const helpers = require("../helpers");

class LastExecutionsRepository {
    constructor(cacheFilePath) {
        this.cacheFilePath = cacheFilePath;
    }
    async get() {
        return JSON.parse(helpers.fileRead(this.cacheFilePath, JSON.stringify({})));
    }

    async save(newCache) {
        helpers.fileWrite(this.cacheFilePath, JSON.stringify(newCache, null, 4) + "\n");
    }
}

exports.LastExecutionsRepository = LastExecutionsRepository;
