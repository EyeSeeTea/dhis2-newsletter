const helpers = require("../helpers");
const path = require("path");

class LastExecutionsRepository {
    constructor(cacheDir = "./cache") {
        this.cacheFilePath = path.join(cacheDir, "lastExecutions.json");
    }
    get() {
        return JSON.parse(helpers.fileRead(this.cacheFilePath, JSON.stringify({})));
    }

    save(newCache) {
        helpers.fileWrite(this.cacheFilePath, helpers.toJson(newCache));
    }
}

exports.LastExecutionsRepository = LastExecutionsRepository;
