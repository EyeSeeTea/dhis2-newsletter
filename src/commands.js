const _ = require("lodash");
const fs = require("fs");
const util = require("util");
const path = require("path");
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const moment = require("moment");
const child_process = require("child_process");
const memoize = require("micro-memoize").default;

const helpers = require("./helpers");
const { Dhis2Api } = require("./api");
const { objectsInfo } = require("./objects-info");

const { EventsRepository } = require("./data/eventsRepository");
const { LastExecutionsRepository } = require("./data/lastExecutionsRepository");

const { promisify, debug, catchWithDebug } = helpers;

const exec = promisify(child_process.exec);

const templateSettings = {
    interpolate: /{{([\s\S]+?)}}/g /* {{variable}} */,
};

const translations = helpers.loadTranslations(path.join(__dirname, "i18n"));

function getNotificationsAppUrl(publicUrl) {
    return `${publicUrl}/api/apps/Notification-Settings/index.html`;
}

async function _getUserSettings(api, username) {
    const userSettings = await api.get(`/userSettings?user=${username}`);

    return {
        locale: userSettings.keyUiLocale,
        emailNotifications: userSettings.keyMessageEmailNotification,
    };
}

const getUserSettings = memoize(_getUserSettings, { isPromise: true, maxSize: 1000 });

async function getI18n(api, user, defaultLocale = "en") {
    const { locale } = await getUserSettings(api, user.userCredentials.username);
    debug(`Get user locale ${user.userCredentials.username}: ${locale}`);
    moment.locale(locale);
    return translations[locale] || translations[defaultLocale];
}

function getObjectFromInterpretation(interpretation) {
    const matchingInfo = objectsInfo.find((info) => info.type === interpretation.type);

    if (!matchingInfo) {
        throw new Error(`Cannot find object type for interpretation ${interpretation.id}`);
    } else {
        const object = interpretation[matchingInfo.field];
        return { ...object, extraInfo: matchingInfo };
    }
}

function getInterpretationUrl(interpretation, publicUrl) {
    const object = interpretation.object;
    const appPathTemplate = object.extraInfo.appPath.interpretation;
    const namespace = { id: object.id, interpretationId: interpretation.id };
    const appPath = helpers.interpolate(appPathTemplate, namespace);
    return `${publicUrl}/${appPath}`;
}

function getObjectUrl(object, publicUrl) {
    const appPathTemplate = object.extraInfo.appPath.object;
    const namespace = { id: object.id };
    const appPath = helpers.interpolate(appPathTemplate, namespace);
    return `${publicUrl}/${appPath}`;
}

async function userShouldGetNotifications(api, userId, user, interpretationOrComment) {
    if (!user) {
        debug(`User not found: ${userId}`);
        return false;
    } else {
        const isSameUser = interpretationOrComment.user.id === userId;
        const { username } = user.userCredentials;
        const { emailNotifications } = await getUserSettings(api, username);
        const notificationSettings = helpers.getNotificationSettings(user);

        if (!user.email) {
            debug(`User has no email: ${username}`);
            return false;
        } else if (isSameUser) {
            debug(`Skip self-notification: ${username}`);
            return false;
        } else if (emailNotifications) {
            debug(`User already receives notifications from DHIS2, skipping: ${username}`);
            return false;
        } else if (notificationSettings.noMentionNotifications) {
            debug(`User has opted out of mention notications: ${username}`);
            return false;
        } else {
            return true;
        }
    }
}

async function getNotificationMessagesForEvent(
    api,
    locale,
    event,
    publicUrl,
    interpretationsById,
    usersById,
    interpretationOrComment
) {
    const interpretation = interpretationsById[event.interpretationId];
    if (!interpretation || !interpretationOrComment) return [];

    const subscribers = interpretation.object.subscribers || [];
    debug(`Object ${interpretation.object.id} subscribers: ${subscribers.join(", ") || "-"}`);
    if (_(subscribers).isEmpty()) return [];

    const text = interpretationOrComment.text;
    const interpretationUrl = getInterpretationUrl(interpretation, publicUrl);
    const getMessageForUser = async (userId) => {
        const user = usersById[userId];

        if (!(await userShouldGetNotifications(api, userId, user, interpretationOrComment))) {
            return null;
        }

        const i18n = await getI18n(api, user, locale);

        const subject = [
            interpretationOrComment.user.displayName,
            i18n.t(`${event.model}_${event.type}`),
        ].join(" ");

        const bodyText = [
            [
                interpretationOrComment.user.displayName,
                `(${interpretationOrComment.user.userCredentials.username})`,
                i18n.t(`${event.model}_${event.type}`),
                i18n.t("object_subscribed") + ":",
            ].join(" "),
            interpretationUrl,
            text,
            "---\n" + i18n.t("unsubscribe") + ": " + getNotificationsAppUrl(publicUrl),
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
    const interpretationIds = triggerEvents.map((event) => event.interpretationId);
    const userField = "user[id,displayName,userCredentials[username]]";
    const objectModelFields = objectsInfo.map(
        (info) => `${info.field}[` + ["id", "name", "subscribers", userField].join(",") + "]"
    );

    const { interpretations } =
        interpretationIds.length === 0
            ? { interpretations: [] }
            : await api.get("/interpretations/", {
                  paging: false,
                  filter: `id:in:[${interpretationIds.join(",")}]`,
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

    const interpretationsWithObject = interpretations.map((interpretation) => ({
        ...interpretation,
        object: getObjectFromInterpretation(interpretation),
    }));

    const interpretationsByIdWithObject = _.keyBy(interpretationsWithObject, "id");

    const commentsById = _(interpretations)
        .flatMap("comments")
        .keyBy("id")
        .value();

    const getEventModel = (event) => {
        switch (event.model) {
            case "interpretation":
                return interpretationsByIdWithObject[event.interpretationId];
            case "comment":
                return commentsById[event.commentId];
            default:
                throw new Error("Unknown event model", event);
        }
    };

    const events = _(triggerEvents)
        // Get only events with existing interpretation and comments
        .filter((event) => interpretationsByIdWithObject[event.interpretationId])
        .filter((event) => !event.commentId || commentsById[event.commentId])
        // Take only 1 event over the same interpretation/comment (preference for creation events)
        .groupBy((event) => [event.interpretationId, event.commentId].join("-"))
        .map((eventsInGroups, key) =>
            _(eventsInGroups)
                .sortBy((event) => event.type !== "created")
                .first()
        )
        // Build a rich event object
        .map((event) => {
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

    const userIds = _.uniq(
        _.concat(
            _.flatMap(events, (event) => event.object.subscribers),
            _.flatMap(interpretationsWithObject, (interp) => interp.object.subscribers)
        )
    );

    const { users } =
        userIds.length === 0
            ? { users: [] }
            : await api.get("/users", {
                  paging: false,
                  filter: `id:in:[${userIds.join(",")}]`,
                  fields: [
                      "id",
                      "displayName",
                      "email",
                      "userCredentials[username]",
                      "attributeValues[value,attribute[code]]",
                  ].join(","),
              });

    return {
        events: events,
        interpretations: interpretationsByIdWithObject,
        comments: commentsById,
        objects: _(interpretationsByIdWithObject)
            .values()
            .map("object")
            .keyBy("id")
            .value(),
        users: _.keyBy(users, "id"),
    };
}

async function sendMessagesForEvents(api, cacheKey, options, action) {
    const { cacheDir, namespace, maxTimeWindow, smtp, assets } = _.defaults(options, {
        namespace: "notifications",
        maxTimeWindow: [1, "hour"],
        smtp: {},
        assets: {},
    });
    const lastExecutionsRepository = new LastExecutionsRepository(cacheDir);
    const cache = lastExecutionsRepository.get();
    const lastSuccessDate = !cache[cacheKey] ? null : cache[cacheKey].lastSuccess;
    const lastEventDateForUserByUser = !cache[cacheKey] ? {} : cache[cacheKey].users || {};
    const getBucketFromTime = (time) => "ev-month-" + time.format("YYYY-MM");
    const defaultStartDate = moment().subtract(...maxTimeWindow);
    const startDate = lastSuccessDate
        ? moment.max(moment(lastSuccessDate), defaultStartDate)
        : defaultStartDate;
    const endDate = moment();

    debug(`startDate=${startDate}, endDate=${endDate}`);
    const buckets = helpers.getMonthDatesBetween(startDate, endDate).map(getBucketFromTime);
    const eventsRepository = new EventsRepository();
    const eventsInBuckets = buckets.map((bucket) => eventsRepository.get(bucket));

    const triggerEvents = _(eventsInBuckets)
        .flatten()
        .filter((event) => moment(event.created) >= startDate && moment(event.created) < endDate)
        .sortBy("created")
        .value();

    const messages = await action({ triggerEvents, startDate, endDate });

    const mailer = nodemailer.createTransport(smtp);
    const usersSentWithTimestamp = _.compact(
        await helpers.mapPromise(messages, (message) => {
            const lastEventDateForUser = lastEventDateForUserByUser[message.username];
            const messagePendingToSend =
                !lastEventDateForUser || message.eventDate > lastEventDateForUser;
            const sendEmail$ = messagePendingToSend
                ? helpers.sendEmail(mailer, message.data)
                : Promise.resolve();

            return sendEmail$
                .then(() => ({ username: message.username, created: message.eventDate }))
                .catch((err) => null);
        })
    );

    const success = usersSentWithTimestamp.length === messages.length;
    const usersSent = _(usersSentWithTimestamp)
        .groupBy("username")
        .mapValues((group) =>
            _(group)
                .map("created")
                .max()
        )
        .value();

    const cacheDataInKey = cache[cacheKey] || {};
    const newCache = {
        ...cache,
        [cacheKey]: {
            ...cacheDataInKey,
            lastSuccess: success ? endDate : startDate,
            users: { ...cacheDataInKey.users, ...usersSent },
        },
    };

    lastExecutionsRepository.save(newCache);

    if (assets.clean) {
        debug(`Cleanup remote files: ${assets.clean}`);
        await exec(assets.clean);
    }
}

async function _uploadVisualization(api, object, date, assets, imageParams) {
    const imageUrl = `/${object.extraInfo.apiModel}/${object.id}/data.png`;
    debug(`Get image visualization: ${imageUrl}`);
    const imageData = await api.get(imageUrl, imageParams, { encoding: null });
    const imageFilename =
        _(["image", object.id, date])
            .compact()
            .join("-") + ".png";
    const imagePath = path.join(__dirname, imageFilename);
    const uploadTemplate = _.template(assets.upload, templateSettings);
    const uploadCommand = uploadTemplate({ files: [imagePath].join(" ") });
    helpers.fileWrite(imagePath, imageData);
    debug(`Upload visualization image: ${uploadCommand}`);
    await exec(uploadCommand);
    debug(`Remove temporal file: ${imagePath}`);
    fs.unlinkSync(imagePath);
    return imageFilename;
}

const uploadVisualization = memoize(_uploadVisualization, {
    isPromise: true,
    isEqual: _.isEqual,
    maxSize: 1000,
});

async function getObjectVisualization(api, assets, object, date) {
    const [width, height] = [500, 350];
    const baseParams = { date: moment(date).format("YYYY-MM-DD") };

    switch (object.extraInfo.visualizationType) {
        case "image":
            debug(`Get image visualization: ${object.id}`);
            const imageParams = { ...baseParams, width, height };
            const imageFilename = await uploadVisualization(api, object, date, assets, imageParams);
            return `<img width="500" height="350" src="${assets.url}/resources/${imageFilename}" />`;
        case "html":
            const tableUrl = `/${object.extraInfo.apiModel}/${object.id}/data.html`;
            debug(`Get table visualization: ${tableUrl}`);
            const tableHtml = await api.get(tableUrl, baseParams);
            return `<div style="display: block; overflow: auto; height: ${height}px">${tableHtml}</div>`;
        case "none":
            return "";
        default:
            throw new Error(
                `Unsupported visualization type: ${object.extraInfo.visualizationType}`
            );
    }
}

async function getCachedVisualizationFun(api, assets, events) {
    // Package ejs doesn't support calling async functions, so we preload visualizations beforehand.
    const argsList = _(events)
        .map((event) => ({ object: event.object, date: event.interpretation.created }))
        .uniqWith(_.isEqual)
        .value();

    // Build array of objects {args: {object, date}, value: html} for all entries.
    const cachedEntries = await helpers.mapPromise(argsList, async (args) => ({
        args: args,
        value: await catchWithDebug(getObjectVisualization(api, assets, args.object, args.date), {
            message: "getObjectVisualization",
            defaultValue: `[Cannot get object visualization]`,
        }),
    }));

    return (object, date) => {
        const cachedEntry = cachedEntries.find((entry) => _.isEqual(entry.args, { object, date }));

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
        case 0:
            return "";
        case 1:
            return " (" + i18n.t("1_like") + ")";
        default:
            return " (" + i18n.t("n_likes", { n: nlikes }) + ")";
    }
}

function userShouldGetNewsletters(user) {
    const notificationSettings = helpers.getNotificationSettings(user);
    const { username } = user.userCredentials;

    if (!user.email) {
        debug(`User has no email: ${username}`);
        return false;
    } else if (notificationSettings.noNewsletters) {
        debug(`User has opted out of newsletters: ${username}`);
        return false;
    } else {
        return true;
    }
}

async function getNewslettersMessages(api, triggerEvents, startDate, endDate, options) {
    const { publicUrl, locale, assets } = options;
    const templatePath = path.join(__dirname, "templates/newsletter.ejs");
    const templateStr = fs.readFileSync(templatePath, "utf8");
    const template = ejs.compile(templateStr, { filename: templatePath });
    const data = await getDataForTriggerEvents(api, triggerEvents);
    debug(`${data.events.length} events to process`);

    const eventsByUsers = _(data.events)
        .flatMap((event) =>
            _(event.object.subscribers)
                .toArray()
                .map((userId) => ({ userId, event }))
                .value()
        )
        .groupBy("userId")
        .map((objs, userId) => ({
            user: data.users[userId],
            events: objs.map((obj) => obj.event),
        }))
        .filter(({ user }) => userShouldGetNewsletters(user))
        .value();

    if (_(eventsByUsers).isEmpty()) {
        debug("No newsletters to send");
        return Promise.resolve([]);
    }

    return helpers.mapPromise(eventsByUsers, async ({ user, events }) => {
        const i18n = await getI18n(api, user, locale);
        const baseNamespace = {
            startDate,
            endDate,
            i18n: i18n,
            unsubscribeUrl: getNotificationsAppUrl(publicUrl),
            privacyPolicyUrl: options.footer.privacyPolicyUrl,
            footerText: options.footer.text,
            publicUrl,
            assetsUrl: assets.url,

            routes: {
                object: (object) => getObjectUrl(object, publicUrl),
                interpretation: (interpretation) => getInterpretationUrl(interpretation, publicUrl),
                //objectImage: object => getObjectImage(object, publicUrl),
            },
            helpers: {
                _,
                getObjectVisualization: await getCachedVisualizationFun(api, assets, data.events),
                getLikes: (interpretation) => getLikes(i18n, interpretation),
            },
        };

        const html = await buildNewsletterForUser(
            i18n,
            baseNamespace,
            template,
            assets,
            user,
            events,
            data
        );

        return {
            username: user.userCredentials.username,
            eventDate: _(events)
                .map("created")
                .max(),
            data: {
                subject: i18n.t("newsletter_title") + ` (${moment().format("L")})`,
                recipients: [user.email],
                html,
            },
        };
    });
}

async function buildNewsletterForUser(i18n, baseNamespace, template, assets, user, events, data) {
    const interpretationEvents = events.filter((event) => event.model === "interpretation");
    const interpretationIds = new Set(interpretationEvents.map((ev) => ev.interpretationId));

    const commentEvents = events.filter(
        (event) => event.model === "comment" && data.interpretations[event.interpretationId]
    );

    const interpretationEntries = _(interpretationEvents)
        .groupBy((event) => event.object.id)
        .map((interpretationEventsForObject, objectId) => ({
            model: "interpretation",
            object: data.objects[objectId],
            events: _.sortBy(interpretationEventsForObject, "created"),
        }))
        .value();

    const commentEntries = _(commentEvents)
        .groupBy((event) => event.interpretation.id)
        .map((commentEventsForInterpretation, interpretationId) => {
            const interpretation = data.interpretations[interpretationId];
            return {
                model: "comment",
                object: data.objects[interpretation.object.id],
                interpretation: interpretation,
                events: _.sortBy(commentEventsForInterpretation, "created"),
            };
        })
        .value();

    const entries = _(interpretationEntries)
        .concat(commentEntries)
        .sortBy((entry) => [entry.object.name, entry.model !== "interpretation"])
        .value();

    const details_title = i18n.t("n_interpretations_and_comments_on_m_favorites", {
        n: _.size(events),
        m: _(events)
            .map("object")
            .uniqBy("id")
            .size(),
    });

    const namespace = { ...baseNamespace, entries, details_title };

    return template(namespace);
}

async function getNotificationMessages(api, triggerEvents, options) {
    const { publicUrl, locale } = options;

    const { events, interpretations, users, comments } = await getDataForTriggerEvents(
        api,
        triggerEvents
    );

    return _.flatten(
        await helpers.mapPromise(events, (event) => {
            switch (event.model) {
                case "interpretation":
                    const interpretation = interpretations[event.interpretationId];
                    return getNotificationMessagesForEvent(
                        api,
                        locale,
                        event,
                        publicUrl,
                        interpretations,
                        users,
                        interpretation
                    );
                case "comment":
                    const comment = comments[event.commentId];
                    return getNotificationMessagesForEvent(
                        api,
                        locale,
                        event,
                        publicUrl,
                        interpretations,
                        users,
                        comment
                    );
                default:
                    debug(`Unknown event model: ${event.model}`);
                    return [];
            }
        })
    );
}

/* Main functions */

async function sendNotifications(argv) {
    const options = helpers.loadConfigOptions(argv.configFile);
    const { api: apiOptions, cacheDir, smtp, assets } = options;
    const api = new Dhis2Api(apiOptions);
    const triggerOptions = {
        cacheDir,
        maxTimeWindow: [1, "hour"],
        smtp,
        assets,
    };

    return sendMessagesForEvents(api, "notifications", triggerOptions, ({ triggerEvents }) =>
        getNotificationMessages(api, triggerEvents, options)
    );
}

async function sendNewsletters(argv) {
    const options = helpers.loadConfigOptions(argv.configFile);
    const { cacheDir, api: apiOptions, smtp, assets } = options;
    const api = new Dhis2Api(apiOptions);
    const triggerOptions = {
        cacheDir: cacheDir,
        maxTimeWindow: [7, "days"],
        smtp,
        assets,
    };

    return sendMessagesForEvents(
        api,
        "newsletters",
        triggerOptions,
        ({ triggerEvents, startDate, endDate }) =>
            getNewslettersMessages(api, triggerEvents, startDate, endDate, options)
    );
}

Object.assign(module.exports, {
    sendNotifications,
    sendNewsletters,
});
