const _ = require("lodash");
const fs = require("fs");
const util = require('util');
const path = require("path");
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const moment = require('moment');
const child_process = require('child_process');
const memoize = require("micro-memoize").default;

const helpers = require('./helpers');
const {Dhis2Api} = require('./api');
const {objectsInfo} = require('./objects-info');

const exec = util.promisify(child_process.exec);
const {debug} = helpers;

const templateSettings = {
    interpolate: /{{([\s\S]+?)}}/g,  /* {{variable}} */
};

const translations = helpers.loadTranslations(path.join(__dirname, "i18n"));

function _getUserLocale(api, username) {
    return api.get(`/userSettings/keyUiLocale?user=${username}`);
}

const getUserLocale = memoize(_getUserLocale, {isPromise: true, maxSize: 1000});

async function getI18n(api, user, defaultLocale = "en") {
    const locale = await getUserLocale(api, user.userCredentials.username);
    debug(`Get user locale ${user.userCredentials.username}: locale=${locale}`)
    moment.locale(locale);
    return translations[locale] || translations[defaultLocale];
}

function getObjectFromInterpretation(interpretation) {
    const matchingInfo = objectsInfo.find(info => info.type === interpretation.type);

    if (!matchingInfo) {
        throw new Error(`Cannot find object type for interpretation ${interpretation.id}`);
    } else {
        const object = interpretation[matchingInfo.field];
        return {...object, extraInfo: matchingInfo};
    }
}

function getInterpretationUrl(interpretation, publicUrl) {
    const object = interpretation.object;
    const {appPath} = object.extraInfo;
    return `${publicUrl}/${appPath}/index.html?id=${object.id}&interpretationid=${interpretation.id}`;
}

function getObjectUrl(object, publicUrl) {
    return `${publicUrl}/${object.extraInfo.appPath}/index.html?id=${object.id}`;
}

async function getNotificationMessagesForEvent(api, locale, event, publicUrl, interpretationsById, usersById, interpretationOrComment) {
    const interpretation = interpretationsById[event.interpretationId];
    if (!interpretation || !interpretationOrComment)
        return [];

    const subscribers = interpretation.object.subscribers || [];
    debug(`Object ${interpretation.object.id} subscribers: ${subscribers.join(", ") || "-"}`);
    if (_(subscribers).isEmpty())
        return [];

    const text = interpretationOrComment.text;
    const interpretationUrl = getInterpretationUrl(interpretation, publicUrl);
    const getMessageForUser = async (userId) => {
        const user = usersById[userId];
        if (!user) {
            debug(`User not found: ${userId}`);
            return null;
        }

        const i18n = await getI18n(api, user, locale);
        const isSameUser = (interpretationOrComment.user.id === user.id);

        if (!user.email || isSameUser)
            return null;

        const subject = [
            interpretation.user.displayName,
            i18n.t(`${event.model}_${event.type}`),
        ].join(" ");

        const bodyText = [
            [
                interpretation.user.displayName,
                `(${interpretation.user.userCredentials.username})`,
                i18n.t(`${event.model}_${event.type}`),
                i18n.t("object_subscribed") + ":",
            ].join(" "),
            interpretationUrl,
            text,
        ].join("\n\n");

        return {
            username: user.userCredentials.username,
            eventDate: event.created,
            data: {
                subject,
                text: bodyText,
                recipients: [user.email],
            },
        };
    };

    return _.compact(await helpers.mapPromise(subscribers, getMessageForUser));
}

async function getDataForTriggerEvents(api, triggerEvents) {
    const interpretationIds = triggerEvents.map(event => event.interpretationId);
    const userField = "user[id,displayName,userCredentials[username]]";
    const objectModelFields = objectsInfo.map(info => `${info.field}[` + [
        "id",
        "name",
        "subscribers",
        userField,
    ].join(",") + "]");

    const {interpretations} = await api.get("/interpretations/", {
        paging: false,
        filter: `id:in:[${interpretationIds.join(',')}]`,
        fields: [
            "id",
            "text",
            "type",
            "created",
            "likes",
            userField,
            `comments[id,text,${userField}]`,
            ...objectModelFields,
        ].join(","),
    });

    const {users} = await api.get("/users/", {
        paging: false,
        fields: ["id", "email", "userCredentials[username]"].join(","),
    });

    const interpretationsByIdWithObject = _(interpretations)
        .map(interpretation =>
            ({...interpretation, object: getObjectFromInterpretation(interpretation)}))
        .keyBy("id")
        .value();

    const commentsById = _(interpretations).flatMap("comments").keyBy("id").value();

    const getEventModel = event => {
        switch (event.model) {
            case "interpretation": return interpretationsByIdWithObject[event.interpretationId];
            case "comment": return commentsById[event.commentId];
            default: throw new Error("Unknown event model", event);
        }
    };

    const events = _(triggerEvents)
        // Get only events with existing interpretation and comments
        .filter(event => interpretationsByIdWithObject[event.interpretationId])
        .filter(event => !event.commentId || commentsById[event.commentId])
        // Take only 1 event over the same interpretation/comment (preference for creation events)
        .groupBy(event => [event.interpretationId, event.commentId].join("-"))
        .map((eventsInGroups, key) =>
            _(eventsInGroups).sortBy(event => event.type !== "created").first()
        )
        // Build a rich event object
        .map(event => {
            const interpretation = interpretationsByIdWithObject[event.interpretationId];
            return {
                ...event,
                user: getEventModel(event).user,
                interpretation: interpretation,
                object: interpretation.object,
                comment: event.commentId ? commentsById[event.commentId] : null,
            };
        })
        .value();
        
    return {
        events: events,
        interpretations: interpretationsByIdWithObject,
        comments: commentsById,
        objects: _(interpretationsByIdWithObject).values().map("object").keyBy("id").value(),
        users: _.keyBy(users, "id"),
    };
}

async function sendMessagesForEvents(api, cacheKey, options, action) {
    const {cacheFilePath, namespace, maxTimeWindow, ignoreCache, smtp, assets} = _.defaults(options, {
        cacheFilePath: ".notifications-cache.json",
        namespace: "notifications",
        ignoreCache: false,
        maxTimeWindow: [1, "hour"],
        smtp: {},
        assets: {},
    });
    const cache = JSON.parse(helpers.fileRead(cacheFilePath, JSON.stringify({})));
    const lastSuccessDate = ignoreCache || !cache[cacheKey] ? null : cache[cacheKey].lastSuccess;
    const lastEventDateForUserByUser = ignoreCache || !cache[cacheKey] ? {} : (cache[cacheKey].users || {});
    const getBucketFromTime = (time) => "ev-month-" + time.format("YYYY-MM");
    const defaultStartDate = moment().subtract(...maxTimeWindow);
    const startDate = lastSuccessDate ? moment.max(moment(lastSuccessDate), defaultStartDate) : defaultStartDate;
    const endDate = moment();

    debug(`startDate=${startDate}, endDate=${endDate}`);
    const buckets = helpers.getMonthDatesBetween(startDate, endDate).map(getBucketFromTime);
    const eventsInBuckets = await helpers.mapPromise(buckets,
        bucket => api.get(`/dataStore/${namespace}/${bucket}`).catch(err => []));
    const triggerEvents = _(eventsInBuckets)
        .flatten()
        .filter(event => moment(event.created) >= startDate && moment(event.created) < endDate)
        .sortBy("created")
        .value();

    const messages = await action({triggerEvents, startDate, endDate});

    const mailer = nodemailer.createTransport(smtp);
    const usersSentWithTimestamp = _.compact(await helpers.mapPromise(messages, message => {
        const lastEventDateForUser = lastEventDateForUserByUser[message.username];
        const messagePendingToSend = !lastEventDateForUser || message.eventDate > lastEventDateForUser;
        const sendEmail$ = messagePendingToSend ? helpers.sendEmail(mailer, message.data) : Promise.resolve();

        return sendEmail$
            .then(() => ({username: message.username, created: message.eventDate}))
            .catch(err => null)
    }));

    const success = usersSentWithTimestamp.length === messages.length;
    const usersSent = _(usersSentWithTimestamp)
        .groupBy("username")
        .mapValues(group => _(group).map("created").max())
        .value();

    const cacheDataInKey = cache[cacheKey] || {};
    const newCache = {
        ...cache,
        [cacheKey]: {
            ...cacheDataInKey,
            lastSuccess: success ? endDate : startDate,
            users: {...cacheDataInKey.users, ...usersSent},
        },
    };

    helpers.fileWrite(cacheFilePath, JSON.stringify(newCache, null, 4) + "\n");

    if (assets.clean) {
        debug(`Cleanup remote files: ${assets.clean}`);
        await exec(assets.clean);
    }
}

async function _uploadVisualization(api, object, date, assets, imageParams) {
    const imageUrl = `/${object.extraInfo.apiModel}/${object.id}/data.png`;
    debug(`Get image visualization: ${imageUrl}`);
    const imageData = await api.get(imageUrl, imageParams, {encoding: null});
    const imageFilename = _(["image", object.id, date]).compact().join("-") + ".png";
    const imagePath = path.join(__dirname, imageFilename);
    const uploadTemplate = _.template(assets.upload, templateSettings);
    const uploadCommand = uploadTemplate({files: [imagePath].join(" ")});
    helpers.fileWrite(imagePath, imageData);
    debug(`Upload visualization image: ${uploadCommand}`);
    await exec(uploadCommand);
    debug(`Remove temporal file: ${imagePath}`);
    fs.unlinkSync(imagePath);
    return imageFilename;
}

const uploadVisualization = memoize(_uploadVisualization, {isPromise: true, isEqual: _.isEqual, maxSize: 1000});

async function getObjectVisualization(api, assets, object, date) {
    const [width, height] = [500, 350];
    const baseParams = {date: moment(date).format("YYYY-MM-DD")};

    switch (object.extraInfo.visualizationType) {
        case "image":
            debug(`Get image visualization: ${object.id}`);
            const imageParams = {...baseParams, width, height};
            const imageFilename = await uploadVisualization(api, object, date, assets, imageParams);
            return `<img width="500" height="350" src="${assets.url}/resources/${imageFilename}" />`
        case "html":
            const tableUrl = `/${object.extraInfo.apiModel}/${object.id}/data.html`;
            debug(`Get table visualization: ${tableUrl}`);
            const tableHtml = await api.get(tableUrl, baseParams);
            return `<div style="display: block; overflow: auto; height: ${height}px">${tableHtml}</div>`;
        case "none":
            return "";
        default:
            throw new Error(`Unsupported visualization type: ${object.extraInfo.visualizationType}`);
    }
}

async function getCachedVisualizationFun(api, assets, events) {
    // Package ejs doesn't support calling async functions, so we preload visualizations beforehand.
    const argsList = _(events)
        .map(event => ({object: event.object, date: event.interpretation.created}))
        .uniqWith(_.isEqual)
        .value();

    // Build array of objects {args: {object, date}, value: html} for all entries.
    const cachedEntries = await helpers.mapPromise(argsList, async (args) => ({
        args: args,
        value: await getObjectVisualization(api, assets, args.object, args.date),
    }));

    return (object, date) => {
        const cachedEntry = cachedEntries.find(entry => _.isEqual(entry.args, {object, date}));

        if (cachedEntry) {
            return cachedEntry.value;
        } else {
            throw new Error(`No cached visualization for objectId=${object.id} and date=${date}`);
        }
    };
}

function getLikes(i18n, interpretation) {
    const nlikes = interpretation.likes || 0;

    switch (nlikes) {
        case 0: return "";
        case 1: return " (" + i18n.t("1_like") + ")";
        default: return " (" + i18n.t("n_likes", {n: nlikes}) + ")";
    }
}

async function getNewslettersMessages(api, triggerEvents, startDate, endDate, options) {
    const {dataStore, publicUrl, locale, assets} = options;
    const templatePath = path.join(__dirname, "templates/newsletter.ejs");
    const templateStr = fs.readFileSync(templatePath, "utf8");
    const template = ejs.compile(templateStr, {filename: templatePath});
    const data = await getDataForTriggerEvents(api, triggerEvents);
    debug(`${data.events.length} events to process`);

    const eventsByUsers = _(data.events)
        .flatMap(event => _(event.object.subscribers).toArray().map(userId => ({userId, event})).value())
        .groupBy("userId")
        .map((objs, userId) => ({
            user: data.users[userId],
            events: objs.map(obj => obj.event),
        }))
        .filter(({user}) => user.email)
        .value();

    if (_(eventsByUsers).isEmpty()) {
        debug("No newsletters to send");
        return Promise.resolve([]);
    }

    return helpers.mapPromise(eventsByUsers, async ({user, events}) => {
        const i18n = await getI18n(api, user, locale);
        const baseNamespace = {
            startDate,
            endDate,
            i18n: i18n,
            privacyPolicyUrl: options.footer.privacyPolicyUrl,
            footerText: options.footer.text,
            publicUrl,
            assetsUrl: assets.url,

            routes: {
                object: object => getObjectUrl(object, publicUrl),
                interpretation: interpretation => getInterpretationUrl(interpretation, publicUrl),
                objectImage: object => getObjectImage(object, publicUrl),
            },
            helpers: {
                _,
                getObjectVisualization: await getCachedVisualizationFun(api, assets, data.events),
                getLikes: interpretation => getLikes(i18n, interpretation),
            },
        };

        const html = await buildNewsletterForUser(i18n, baseNamespace, template, assets, user, events, data);

        return {
            username: user.userCredentials.username,
            eventDate: _(events).map("created").max(),
            data: {
                subject: i18n.t("newsletter_title") + ` (${moment().format("L")})`,
                recipients: [user.email],
                html,
            },
        };
    });
}

async function buildNewsletterForUser(i18n, baseNamespace, template, assets, user, events, data) {
    const interpretationEvents = events.filter(event => event.model === "interpretation");
    const interpretationIds = new Set(interpretationEvents.map(ev => ev.interpretationId));

    const commentEvents = events.filter(event =>
        event.model === "comment" && data.interpretations[event.interpretationId]);

    const interpretationEntries = _(interpretationEvents)
        .groupBy(event => event.object.id)
        .map((interpretationEventsForObject, objectId) => ({
            model: "interpretation",
            object: data.objects[objectId],
            events: _.sortBy(interpretationEventsForObject, "created"),
        }))
        .value();

    const commentEntries = _(commentEvents)
        .groupBy(event => event.interpretation.id)
        .map((commentEventsForInterpretation, interpretationId) => {
            const interpretation = data.interpretations[interpretationId];
            return {
                model: "comment",
                object: data.objects[interpretation.object.id],
                interpretation: interpretation,
                events: _.sortBy(commentEventsForInterpretation, "created"),
            }
        })
        .value();

    const entries = _(interpretationEntries)
        .concat(commentEntries)
        .sortBy(entry => [entry.object.name, entry.model !== "interpretation"])
        .value();

    const details_title = i18n.t("n_interpretations_and_comments_on_m_favorites", {
        n: _.size(events),
        m: _(events).map("object").uniqBy("id").size(),
    });

    const namespace = {...baseNamespace, entries, details_title};

    return template(namespace);
}

function loadConfigOptions(configFile) {
    return JSON.parse(helpers.fileRead(configFile));
}

async function getNotificationMessages(api, triggerEvents, options) {
    const {publicUrl, locale} = options;

    const {events, interpretations, users, comments} =
        await getDataForTriggerEvents(api, triggerEvents);

    return _.flatten(await helpers.mapPromise(events, event => {
        switch (event.model) {
            case "interpretation":
                const interpretation = interpretations[event.interpretationId];
                return getNotificationMessagesForEvent(api, locale, event, publicUrl, interpretations, users, interpretation);
            case "comment":
                const comment = comments[event.commentId];
                return getNotificationMessagesForEvent(api, locale, event, publicUrl, interpretations, users, comment);
            default:
                debug(`Unknown event model: ${event.model}`)
                return [];
        }
    }));
}

/* Main functions */

async function sendNotifications(argv) {
    const options = loadConfigOptions(argv.configFile);
    const {api: apiOptions, dataStore, cacheFilePath, smtp, assets} = options;
    const api = new Dhis2Api(apiOptions);
    const triggerOptions = {
        cacheFilePath: cacheFilePath,
        namespace: dataStore.namespace,
        ignoreCache: argv.ignoreCache,
        maxTimeWindow: [1, "hour"],
        smtp,
        assets,
    };

    return sendMessagesForEvents(api, "notifications", triggerOptions, ({triggerEvents}) =>
        getNotificationMessages(api, triggerEvents, options)
    );
}

async function sendNewsletters(argv) {
    const options = loadConfigOptions(argv.configFile);
    const {cacheFilePath, dataStore, api: apiOptions, smtp, assets} = options;
    const api = new Dhis2Api(apiOptions);
    const triggerOptions = {
        cacheFilePath: cacheFilePath,
        namespace: dataStore.namespace,
        ignoreCache: argv.ignoreCache,
        maxTimeWindow: [7, "days"],
        smtp,
        assets,
    };

    return sendMessagesForEvents(api, "newsletters", triggerOptions, ({triggerEvents, startDate, endDate}) =>
        getNewslettersMessages(api, triggerEvents, startDate, endDate, options)
    );
}

Object.assign(module.exports, {
    sendNotifications,
    sendNewsletters,
});
