const moment = require("moment");
const helpers = require("../helpers");
const _ = require("lodash");

class GenerateEventsUseCase {
    constructor(lastExecutionsRepository, interpretationsRepository, eventsRepository) {
        this.lastExecutionsRepository = lastExecutionsRepository;
        this.interpretationsRepository = interpretationsRepository;
        this.eventsRepository = eventsRepository;
        this.lastExecutionKey = "getEvents";
    }

    async execute(options) {
        const dateFilter = this._getDateFilter(options);
        const isFirstTime = !dateFilter;

        const interpretationsFromAPI = await this.interpretationsRepository.getFromAPI(
            isFirstTime ? null : moment(dateFilter).format("YYYY-MM-DD")
        );

        const interpretationsFromCache = this.interpretationsRepository.getFromCache();

        if (isFirstTime) {
            this.interpretationsRepository.saveToCache(interpretationsFromAPI);
        } else if (interpretationsFromAPI.length > 0) {
            const events = this._generateEvents(interpretationsFromCache, interpretationsFromAPI);
            const interpretations = this._generateChangesInInterpretations(
                interpretationsFromCache,
                interpretationsFromAPI,
                events
            );

            this.eventsRepository.save(events);
            this.interpretationsRepository.saveToCache(interpretations);
        }

        this._saveLastExecution();
    }

    _getDateFilter(options) {
        const lastExecutions = this.lastExecutionsRepository.get();
        const lastSuccessDate =
            options.ignoreCache || !lastExecutions[this.lastExecutionKey]
                ? null
                : lastExecutions[this.lastExecutionKey].lastSuccess;

        return lastSuccessDate;
    }

    _saveLastExecution() {
        const lastExecutions = this.lastExecutionsRepository.get();
        const lastExecutionsInKey = lastExecutions[this.lastExecutionKey] || {};
        const newLastExecutions = {
            ...lastExecutions,
            [this.lastExecutionKey]: {
                ...lastExecutionsInKey,
                lastSuccess: moment().toISOString(),
            },
        };

        this.lastExecutionsRepository.save(newLastExecutions);
    }

    _generateChangesInInterpretations(cachedInterpretations, interpretationsChanges, newEvents) {
        const createdInterpretations = newEvents
            .filter(newEvent => newEvent.type === "insert" && newEvent.model === "interpretation")
            .map(newEvent => _.find(interpretationsChanges, { id: newEvent.interpretationId }));

        const editedInterpretations = _.uniqBy(
            newEvents
                .filter(
                    newEvent => !(newEvent.type === "insert" && newEvent.model === "interpretation")
                )
                .map(newEvent => _.find(interpretationsChanges, { id: newEvent.interpretationId })),
            "id"
        );

        const interpretationsToSave = [
            ...cachedInterpretations.map(
                old => _.find(editedInterpretations, { id: old.id }) || old
            ),
            ...createdInterpretations,
        ];

        return interpretationsToSave;
    }

    _generateEvents(cachedInterpretations, interpretationsChanges) {
        const createdInterpretationEvents = this._generateCreateInterpretationsEvents(
            cachedInterpretations,
            interpretationsChanges
        );

        const editedInterpretationEvents = this._generateEditedInterpretationsEvents(
            cachedInterpretations,
            interpretationsChanges
        );

        const createdCommentEvents = this._generateCreateCommentsEvents(
            cachedInterpretations,
            interpretationsChanges
        );

        const editedCommentEvents = this._generateEditedCommentsEvents(
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
    }

    _generateCreateInterpretationsEvents(cachedInterpretations, interpretationsChanges) {
        const createdInterpretations = interpretationsChanges.filter(
            interpretationChange => !_.some(cachedInterpretations, { id: interpretationChange.id })
        );

        return createdInterpretations.map(interpretation => {
            return {
                type: "insert",
                model: "interpretation",
                created: helpers.dhisDateToISODate(interpretation.lastUpdated),
                commentId: null,
                interpretationId: interpretation.id,
            };
        });
    }

    _generateEditedInterpretationsEvents(cachedInterpretations, interpretationsChanges) {
        const editedInterpretations = interpretationsChanges.filter(interpretationChange =>
            cachedInterpretations.some(
                cachedInterpretation =>
                    cachedInterpretation.id === interpretationChange.id &&
                    cachedInterpretation.text !== interpretationChange.text
            )
        );

        return editedInterpretations.map(interpretation => {
            return {
                type: "update",
                model: "interpretation",
                created: helpers.dhisDateToISODate(interpretation.lastUpdated),
                commentId: null,
                interpretationId: interpretation.id,
            };
        });
    }

    _generateCreateCommentsEvents(cachedInterpretations, interpretationsChanges) {
        const cachedComments = this._extractComments(cachedInterpretations);
        const commentChanges = this._extractComments(interpretationsChanges);

        const createdComments = commentChanges.filter(
            commentChange => !_.some(cachedComments, { id: commentChange.id })
        );

        return createdComments.map(comment => {
            return {
                type: "insert",
                model: "comment",
                created: helpers.dhisDateToISODate(comment.lastUpdated),
                commentId: comment.id,
                interpretationId: comment.interpretationId,
            };
        });
    }

    _generateEditedCommentsEvents(cachedInterpretations, interpretationsChanges) {
        const cachedComments = this._extractComments(cachedInterpretations);
        const commentChanges = this._extractComments(interpretationsChanges);

        const editedComments = commentChanges.filter(commentChange =>
            cachedComments.some(
                cachedComment =>
                    cachedComment.id === commentChange.id &&
                    cachedComment.text !== commentChange.text
            )
        );

        return editedComments.map(comment => {
            return {
                type: "update",
                model: "comment",
                created: helpers.dhisDateToISODate(comment.interpretationLastUpdated),
                commentId: comment.id,
                interpretationId: comment.interpretationId,
            };
        });
    }

    _extractComments(interpretations) {
        const comments = interpretations.map(interpretation =>
            interpretation.comments.map(comment => {
                return {
                    ...comment,
                    interpretationId: interpretation.id,
                    interpretationLastUpdated: interpretation.lastUpdated,
                };
            })
        );

        return _.flatten(comments);
    }
}

exports.GenerateEventsUseCase = GenerateEventsUseCase;
