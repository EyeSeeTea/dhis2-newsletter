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
            this._updateEventsAndInterpretations(interpretationsFromCache, interpretationsFromAPI);
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

    _updateEventsAndInterpretations(cachedInterpretations, interpretationsChanges) {
        const newEvents = this._generateEvents(cachedInterpretations, interpretationsChanges);

        const createdInterpretations = newEvents
            .filter(newEvent => newEvent.type === "insert" && newEvent.model === "interpretation")
            .map(newEvent =>
                interpretationsChanges.find(
                    interpretationChange => interpretationChange.id === newEvent.interpretationId
                )
            );

        const editedInterpretations = _.uniqBy(
            newEvents
                .filter(
                    newEvent => !(newEvent.type === "insert" && newEvent.model === "interpretation")
                )
                .map(newEvent =>
                    interpretationsChanges.find(
                        interpretationChange =>
                            interpretationChange.id === newEvent.interpretationId
                    )
                ),
            "id"
        );
        const interpretationsToSave = [
            ...cachedInterpretations.map(
                old => editedInterpretations.find(edited => edited.id === old.id) || old
            ),
            ...createdInterpretations,
        ];

        this.interpretationsRepository.saveToCache(interpretationsToSave);
        this.eventsRepository.save(newEvents);
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
            interpretationChange =>
                !cachedInterpretations.some(
                    cachedInterpretation => cachedInterpretation.id === interpretationChange.id
                )
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
        const interpretationsChangesWithNewComments = interpretationsChanges.filter(
            interpretationChange =>
                cachedInterpretations.some(
                    cachedInterpretation =>
                        cachedInterpretation.id === interpretationChange.id &&
                        //TODO: review this
                        !_.isEqual(
                            _.sortBy(cachedInterpretation.comments.map(c => c.id)),
                            _.sortBy(interpretationChange.comments.map(c => c.id))
                        )
                )
        );
        return interpretationsChangesWithNewComments.reduce(
            (events, interpretationWithNewComments) => {
                const editedCachedInterpretation = cachedInterpretations.find(
                    cachedInterpretation =>
                        cachedInterpretation.id === interpretationWithNewComments.id
                );

                const createdCommentEvents = interpretationWithNewComments.comments
                    .filter(
                        comment =>
                            !editedCachedInterpretation.comments.some(
                                cachedComment => cachedComment.id === comment.id
                            )
                    )
                    .map(comment => {
                        return {
                            type: "insert",
                            model: "comment",
                            created: helpers.dhisDateToISODate(comment.lastUpdated),
                            commentId: comment.id,
                            interpretationId: interpretationWithNewComments.id,
                        };
                    });

                return [...events, ...createdCommentEvents];
            },
            []
        );
    }

    _generateEditedCommentsEvents(cachedInterpretations, interpretationsChanges) {
        const hasEditedComents = (interpretationWithChanges, cachedInterpretation) =>
            interpretationWithChanges.comments.filter(commentOfInterpretationChange =>
                cachedInterpretation.comments.some(
                    commentOfcachedInterpretation =>
                        commentOfInterpretationChange.id === commentOfcachedInterpretation.id &&
                        commentOfInterpretationChange.text !== commentOfcachedInterpretation.text
                )
            ).length > 0;

        const interpretationsChangesWithEditedComments = interpretationsChanges.filter(
            interpretationWithChanges =>
                cachedInterpretations.some(
                    cachedInterpretation =>
                        cachedInterpretation.id === interpretationWithChanges.id &&
                        hasEditedComents(interpretationWithChanges, cachedInterpretation)
                )
        );

        return interpretationsChangesWithEditedComments.reduce(
            (events, interpretationWithEditedComments) => {
                const editedCachedInterpretation = cachedInterpretations.find(
                    cachedInterpretation =>
                        cachedInterpretation.id === interpretationWithEditedComments.id
                );

                const editedCommentEvents = interpretationWithEditedComments.comments
                    .filter(comment =>
                        editedCachedInterpretation.comments.some(
                            cachedComment =>
                                cachedComment.id === comment.id &&
                                cachedComment.text !== comment.text
                        )
                    )
                    .map(comment => {
                        return {
                            type: "update",
                            model: "comment",
                            //TODO: set interpretations  date because dhis2 does not update comment las updated
                            //when a comment is edited
                            created: helpers.dhisDateToISODate(
                                interpretationWithEditedComments.lastUpdated
                            ),
                            commentId: comment.id,
                            interpretationId: interpretationWithEditedComments.id,
                        };
                    });

                return [...events, ...editedCommentEvents];
            },
            []
        );
    }
}

exports.GenerateEventsUseCase = GenerateEventsUseCase;
