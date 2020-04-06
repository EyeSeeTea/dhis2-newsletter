const moment = require("moment");
const helpers = require("../helpers");
const _ = require("lodash");

const lastExecutionKey = "getEvents";

const getDateFilter = (lastExecutions, options) => {
    const lastSuccessDate =
        options.ignoreCache || !lastExecutions[lastExecutionKey]
            ? null
            : lastExecutions[lastExecutionKey].lastSuccess;

    return lastSuccessDate;
};

const generateLastExecutions = (lastExecutions) => {
    const lastExecutionsInKey = lastExecutions[lastExecutionKey] || {};
    return {
        ...lastExecutions,
        [lastExecutionKey]: {
            ...lastExecutionsInKey,
            lastSuccess: moment().toISOString(),
        },
    };
};

const extractComments = (interpretations) => {
    const comments = interpretations.map((interpretation) =>
        interpretation.comments.map((comment) => {
            return {
                ...comment,
                interpretationId: interpretation.id,
                interpretationLastUpdated: interpretation.lastUpdated,
            };
        })
    );

    return _.flatten(comments);
};

const generateCreateInterpretationsEvents = (cachedInterpretations, interpretationsChanges) => {
    const createdInterpretations = interpretationsChanges.filter(
        (interpretationChange) => !_.some(cachedInterpretations, { id: interpretationChange.id })
    );

    return createdInterpretations.map((interpretation) => {
        return {
            type: "insert",
            model: "interpretation",
            created: helpers.dhisDateToISODate(interpretation.lastUpdated),
            commentId: null,
            interpretationId: interpretation.id,
        };
    });
};

const generateEditedInterpretationsEvents = (cachedInterpretations, interpretationsChanges) => {
    const editedInterpretations = interpretationsChanges.filter((interpretationChange) =>
        cachedInterpretations.some(
            (cachedInterpretation) =>
                cachedInterpretation.id === interpretationChange.id &&
                cachedInterpretation.text !== interpretationChange.text
        )
    );

    return editedInterpretations.map((interpretation) => {
        return {
            type: "update",
            model: "interpretation",
            created: helpers.dhisDateToISODate(interpretation.lastUpdated),
            commentId: null,
            interpretationId: interpretation.id,
        };
    });
};

const generateCreateCommentsEvents = (cachedInterpretations, interpretationsChanges) => {
    const cachedComments = extractComments(cachedInterpretations);
    const commentChanges = extractComments(interpretationsChanges);

    const createdComments = commentChanges.filter(
        (commentChange) => !_.some(cachedComments, { id: commentChange.id })
    );

    return createdComments.map((comment) => {
        return {
            type: "insert",
            model: "comment",
            created: helpers.dhisDateToISODate(comment.lastUpdated),
            commentId: comment.id,
            interpretationId: comment.interpretationId,
        };
    });
};

const generateEditedCommentsEvents = (cachedInterpretations, interpretationsChanges) => {
    const cachedComments = extractComments(cachedInterpretations);
    const commentChanges = extractComments(interpretationsChanges);

    const editedComments = commentChanges.filter((commentChange) =>
        cachedComments.some(
            (cachedComment) =>
                cachedComment.id === commentChange.id && cachedComment.text !== commentChange.text
        )
    );

    return editedComments.map((comment) => {
        return {
            type: "update",
            model: "comment",
            created: helpers.dhisDateToISODate(comment.interpretationLastUpdated),
            commentId: comment.id,
            interpretationId: comment.interpretationId,
        };
    });
};

const generateChangesInInterpretations = (
    cachedInterpretations,
    interpretationsChanges,
    newEvents
) => {
    const createdInterpretations = newEvents
        .filter((newEvent) => newEvent.type === "insert" && newEvent.model === "interpretation")
        .map((newEvent) => _.find(interpretationsChanges, { id: newEvent.interpretationId }));

    const editedInterpretations = _.uniqBy(
        newEvents
            .filter(
                (newEvent) => !(newEvent.type === "insert" && newEvent.model === "interpretation")
            )
            .map((newEvent) => _.find(interpretationsChanges, { id: newEvent.interpretationId })),
        "id"
    );

    const interpretationsToSave = [
        ...cachedInterpretations.map((old) => _.find(editedInterpretations, { id: old.id }) || old),
        ...createdInterpretations,
    ];

    return interpretationsToSave;
};

const generateEvents = (cachedInterpretations, interpretationsChanges) => {
    const createdInterpretationEvents = generateCreateInterpretationsEvents(
        cachedInterpretations,
        interpretationsChanges
    );

    const editedInterpretationEvents = generateEditedInterpretationsEvents(
        cachedInterpretations,
        interpretationsChanges
    );

    const createdCommentEvents = generateCreateCommentsEvents(
        cachedInterpretations,
        interpretationsChanges
    );

    const editedCommentEvents = generateEditedCommentsEvents(
        cachedInterpretations,
        interpretationsChanges
    );

    return _([
        ...createdInterpretationEvents,
        ...editedInterpretationEvents,
        ...createdCommentEvents,
        ...editedCommentEvents,
    ])
        .orderBy("created")
        .value();
};

const printEvents = (events) => {
    if (events.length > 0) {
        helpers.debug("Changes in interpretations or comments have been found:");
        helpers.debug(
            `New interpretations: ${
                _.filter(events, { type: "insert", model: "interpretation" }).length
            }`
        );
        helpers.debug(
            `Edit interpretations: ${
                _.filter(events, { type: "update", model: "interpretation" }).length
            }`
        );
        helpers.debug(
            `New comments: ${_.filter(events, { type: "insert", model: "comment" }).length}`
        );
        helpers.debug(
            `Edit comments: ${_.filter(events, { type: "update", model: "comment" }).length}`
        );
    } else {
        helpers.debug("Changes in interpretations or comments have not been found");
    }
};

class GenerateEventsUseCase {
    constructor(lastExecutionsRepository, interpretationsRepository, eventsRepository) {
        this.lastExecutionsRepository = lastExecutionsRepository;
        this.interpretationsRepository = interpretationsRepository;
        this.eventsRepository = eventsRepository;
    }

    async execute(options) {
        const dateFilter = getDateFilter(this.lastExecutionsRepository.get(), options);
        const isFirstTime = !dateFilter;

        const interpretationsFromAPI = await this.interpretationsRepository.getFromAPI(
            isFirstTime ? null : moment(dateFilter).format("YYYY-MM-DD")
        );

        const interpretationsFromCache = this.interpretationsRepository.getFromCache();

        if (isFirstTime) {
            this.interpretationsRepository.saveToCache(interpretationsFromAPI);
            helpers.debug("First execution, interpretations have been cached");
        } else if (interpretationsFromAPI.length > 0) {
            const events = generateEvents(interpretationsFromCache, interpretationsFromAPI);
            const interpretations = generateChangesInInterpretations(
                interpretationsFromCache,
                interpretationsFromAPI,
                events
            );

            this.eventsRepository.save(events);
            this.interpretationsRepository.saveToCache(interpretations);

            printEvents(events);
        } else {
            printEvents([]);
        }

        const updatedLastExecutions = generateLastExecutions(this.lastExecutionsRepository.get());
        this.lastExecutionsRepository.save(updatedLastExecutions);
    }
}

exports.GenerateEventsUseCase = GenerateEventsUseCase;
