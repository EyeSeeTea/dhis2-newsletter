const moment = require("moment");
const helpers = require("../../helpers");
var { GenerateEventsUseCase } = require("../generateEventsUseCase");
var {
    FakeLastExecutionsRepository,
    FakeInterpretationsRepository,
    FakeEventsRepository,
} = require("../../data/fakes");

let fakeLastExecutionsRepository;
let fakeInterpretationsRepository;
let fakeEventsRepository;
let generateEventsUseCase;

describe("generateEventsUseCase", () => {
    describe("first time", () => {
        it("should get interpretations to API with null date filter", async () => {
            givenAFirstTime();
            await generateEventsUseCase.execute({ ignoreCache: false });

            expect(fakeInterpretationsRepository.lastDateFilter).toBeNull();
        });
        it("should save interpretations in cache", async () => {
            givenAFirstTime();
            await generateEventsUseCase.execute({ ignoreCache: false });

            expect(fakeInterpretationsRepository.getFromCache()).toEqual(
                await fakeInterpretationsRepository.getFromAPI()
            );
        });
        it("should not save events in cache", async () => {
            givenAFirstTime();
            await generateEventsUseCase.execute({ ignoreCache: false });

            expect(fakeEventsRepository.get()).toEqual([]);
        });
        it("should save lastExecution date in cache", async () => {
            givenAFirstTime();
            await generateEventsUseCase.execute({ ignoreCache: false });

            const lastSuccess = moment(
                fakeLastExecutionsRepository.get().getEvents.lastSuccess
            ).toISOString();

            expect(moment().isSame(lastSuccess, "second")).toBe(true);
        });
    });
    describe("next times", () => {
        it("should get interpretations to API with expected date filter", async () => {
            givenANextTimeWithoutChangesInInterpretations();
            await generateEventsUseCase.execute({ ignoreCache: false });

            const lastSuccess = moment(
                fakeLastExecutionsRepository.get().getEvents.lastSuccess
            ).format("YYYY-MM-DD");

            expect(fakeInterpretationsRepository.lastDateFilter).toBe(lastSuccess);
        });
        it("should not generate events if there are no changes in interpretations and comments", async () => {
            givenANextTimeWithoutChangesInInterpretations();
            await generateEventsUseCase.execute({ ignoreCache: false });

            expect(fakeEventsRepository.get()).toEqual([]);
        });
        it("should save lastExecution date in cache event if not generate events", async () => {
            givenANextTimeWithoutChangesInInterpretations();
            await generateEventsUseCase.execute({ ignoreCache: false });

            const lastSuccess = moment(
                fakeLastExecutionsRepository.get().getEvents.lastSuccess
            ).toISOString();

            expect(moment().isSame(lastSuccess, "second")).toBe(true);
        });
        it("should generate new events of create type and interpretation model if interpretations has been created", async () => {
            const { newInterpretations } = givenANextTimeWithCreateInterpretationsChanges();
            const previousCachedEvents = fakeEventsRepository.get();
            await generateEventsUseCase.execute({ ignoreCache: false });
            const events = newInterpretations.map(interpretation => {
                return {
                    type: "insert",
                    model: "interpretation",
                    created: helpers.dhisDateToISODate(interpretation.lastUpdated),
                    commentId: null,
                    interpretationId: interpretation.id,
                };
            });
            const cachedEvents = fakeEventsRepository.get();
            expect(cachedEvents).toEqual([...previousCachedEvents, ...events]);
        });
        it("should add interpretations to cache if new interpretations has been created ", async () => {
            const { newInterpretations } = givenANextTimeWithCreateInterpretationsChanges();
            const previousCachedInterpretations = fakeInterpretationsRepository.getFromCache();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const cachedInterpretations = fakeInterpretationsRepository.getFromCache();

            expect(cachedInterpretations).toEqual([
                ...previousCachedInterpretations,
                ...newInterpretations,
            ]);
        });
        it("should generate new events of update type and interpretation model if interpretations has been updated", async () => {
            const { editedInterpretations } = givenANextTimeWithEditInterpretationsChanges();
            const previousCachedEvents = fakeEventsRepository.get();
            await generateEventsUseCase.execute({ ignoreCache: false });
            const events = editedInterpretations.map(interpretation => {
                return {
                    type: "update",
                    model: "interpretation",
                    created: helpers.dhisDateToISODate(interpretation.lastUpdated),
                    commentId: null,
                    interpretationId: interpretation.id,
                };
            });
            const cachedEvents = fakeEventsRepository.get();
            expect(cachedEvents).toEqual([...previousCachedEvents, ...events]);
        });
        it("should udpate interpretations in cache if interpretations has been edited", async () => {
            const { editedInterpretations } = givenANextTimeWithEditInterpretationsChanges();
            const previousCachedInterpretations = fakeInterpretationsRepository.getFromCache();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const cachedInterpretations = fakeInterpretationsRepository.getFromCache();

            expect(cachedInterpretations).toEqual(
                previousCachedInterpretations.map(
                    old => editedInterpretations.find(edited => edited.id === old.id) || old
                )
            );
        });
        it("should generate comment create event if a comment has been created ", async () => {
            const { interpretationsWithNewComments } = givenANextTimeWithCreateCommentsChanges();
            const previousCachedEvents = fakeEventsRepository.get();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const events = interpretationsWithNewComments.reduce((events, interpretation) => {
                const createdCommentEvents = interpretation.comments
                    .filter(comment => comment.text.includes("new"))
                    .map(comment => {
                        return {
                            type: "insert",
                            model: "comment",
                            created: helpers.dhisDateToISODate(comment.lastUpdated),
                            commentId: comment.id,
                            interpretationId: interpretation.id,
                        };
                    });

                return [...events, ...createdCommentEvents];
            }, []);

            const cachedEvents = fakeEventsRepository.get();
            expect(cachedEvents).toEqual([...previousCachedEvents, ...events]);
        });
        it("should udpate interpretations in cache if a comment has been created", async () => {
            const { interpretationsWithNewComments } = givenANextTimeWithCreateCommentsChanges();
            const previousCachedInterpretations = fakeInterpretationsRepository.getFromCache();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const cachedInterpretations = fakeInterpretationsRepository.getFromCache();

            expect(cachedInterpretations).toEqual(
                previousCachedInterpretations.map(
                    old =>
                        interpretationsWithNewComments.find(edited => edited.id === old.id) || old
                )
            );
        });

        it("should generate comment edit event if a comment has been edited ", async () => {
            const { interpretationsWithEditedComments } = givenANextTimeWithEditedCommentsChanges();
            const previousCachedEvents = fakeEventsRepository.get();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const events = interpretationsWithEditedComments.reduce((events, interpretation) => {
                const editedCommentEvents = interpretation.comments
                    .filter(comment => comment.text.includes("edited"))
                    .map(comment => {
                        return {
                            type: "update",
                            model: "comment",
                            //TODO: verify interpretations date because dhis2 does not update comment las updated
                            //when a comment is edited
                            created: helpers.dhisDateToISODate(interpretation.lastUpdated),
                            commentId: comment.id,
                            interpretationId: interpretation.id,
                        };
                    });

                return [...events, ...editedCommentEvents];
            }, []);

            const cachedEvents = fakeEventsRepository.get();
            expect(cachedEvents).toEqual([...previousCachedEvents, ...events]);
        });
        it("should udpate interpretations in cache if a comment has been edited", async () => {
            const { interpretationsWithEditedComments } = givenANextTimeWithEditedCommentsChanges();
            const previousCachedInterpretations = fakeInterpretationsRepository.getFromCache();

            await generateEventsUseCase.execute({ ignoreCache: false });

            const cachedInterpretations = fakeInterpretationsRepository.getFromCache();

            expect(cachedInterpretations).toEqual(
                previousCachedInterpretations.map(
                    old =>
                        interpretationsWithEditedComments.find(edited => edited.id === old.id) ||
                        old
                )
            );
        });
        it("should save lastExecution date in cache if generate events", async () => {
            givenANextTimeWithCreateCommentsChanges();
            await generateEventsUseCase.execute({ ignoreCache: false });
            const lastSuccess = moment(
                fakeLastExecutionsRepository.get().getEvents.lastSuccess
            ).toISOString();
            expect(moment().isSame(lastSuccess, "second")).toBe(true);
        });
    });
});

function givenAFirstTime() {
    fakeLastExecutionsRepository = new FakeLastExecutionsRepository();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();
    fakeInterpretationsRepository.interpretationsFromAPI =
        fakeInterpretationsRepository.interpretationsTemplate;

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );
}

function givenANextTimeWithoutChangesInInterpretations() {
    createdPreviousExecutionInCache();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();
    fakeInterpretationsRepository.interpretationsFromCache =
        fakeInterpretationsRepository.interpretationsTemplate;
    fakeInterpretationsRepository.interpretationsFromAPI = [];

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );
}

function givenANextTimeWithCreateInterpretationsChanges() {
    createdPreviousExecutionInCache();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();

    fakeInterpretationsRepository.interpretationsFromCache =
        fakeInterpretationsRepository.interpretationsTemplate;

    fakeInterpretationsRepository.interpretationsFromAPI = [
        {
            lastUpdated: helpers.isoDateToDhisDate(moment().toISOString()),
            id: "newUID",
            text: "new interpretation",
            comments: [],
        },
        {
            lastUpdated: helpers.isoDateToDhisDate(moment().toISOString()),
            id: "newUID 2",
            text: "new interpretation 2",
            comments: [],
        },
    ];

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );

    return {
        newInterpretations: fakeInterpretationsRepository.interpretationsFromAPI,
    };
}

function givenANextTimeWithEditInterpretationsChanges() {
    createdPreviousExecutionInCache();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();

    fakeInterpretationsRepository.interpretationsFromCache =
        fakeInterpretationsRepository.interpretationsTemplate;

    fakeInterpretationsRepository.interpretationsFromAPI = fakeInterpretationsRepository.interpretationsFromCache.map(
        interpretation => {
            return { ...interpretation, text: `${interpretation.text} (edited)` };
        }
    );

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );

    return {
        editedInterpretations: fakeInterpretationsRepository.interpretationsFromAPI,
    };
}

function givenANextTimeWithCreateCommentsChanges() {
    createdPreviousExecutionInCache();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();

    fakeInterpretationsRepository.interpretationsFromCache =
        fakeInterpretationsRepository.interpretationsTemplate;

    const newComments = [
        {
            lastUpdated: helpers.isoDateToDhisDate(moment().toISOString()),
            id: "newUID",
            text: "new comment",
        },
        {
            lastUpdated: helpers.isoDateToDhisDate(moment().toISOString()),
            id: "newUID 2",
            text: "new comment 2",
        },
    ];

    fakeInterpretationsRepository.interpretationsFromAPI = fakeInterpretationsRepository.interpretationsFromCache.map(
        interpretation => {
            return { ...interpretation, comments: [...interpretation.comments, ...newComments] };
        }
    );

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );

    return {
        interpretationsWithNewComments: fakeInterpretationsRepository.interpretationsFromAPI,
    };
}

function givenANextTimeWithEditedCommentsChanges() {
    createdPreviousExecutionInCache();

    fakeInterpretationsRepository = new FakeInterpretationsRepository();

    fakeInterpretationsRepository.interpretationsFromCache =
        fakeInterpretationsRepository.interpretationsTemplate;

    fakeInterpretationsRepository.interpretationsFromAPI = fakeInterpretationsRepository.interpretationsFromCache.map(
        interpretation => {
            return {
                ...interpretation,
                comments: interpretation.comments.map(comment => {
                    return { ...comment, text: `${comment.text} (edited)` };
                }),
            };
        }
    );

    fakeEventsRepository = new FakeEventsRepository();
    generateEventsUseCase = new GenerateEventsUseCase(
        fakeLastExecutionsRepository,
        fakeInterpretationsRepository,
        fakeEventsRepository
    );

    return {
        interpretationsWithEditedComments: fakeInterpretationsRepository.interpretationsFromAPI,
    };
}

function createdPreviousExecutionInCache() {
    fakeLastExecutionsRepository = new FakeLastExecutionsRepository();
    fakeLastExecutionsRepository.lastExecutions = {
        getEvents: {
            lastSuccess: moment()
                .subtract(1, "hour")
                .toISOString(),
        },
    };
}
