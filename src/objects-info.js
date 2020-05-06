const objectsInfo = [
    {
        type: "MAP",
        field: "map",
        appPath: {
            object: "dhis-web-maps/index.html?id=${id}",
            interpretation:
                "dhis-web-maps/index.html?id=${id}&interpretationid=${interpretationId}",
        },
        visualizationType: "image",
        apiModel: "maps",
    },
    {
        type: "REPORT_TABLE",
        field: "reportTable",
        appPath: {
            object: "dhis-web-pivot/index.html?id=${id}",
            interpretation:
                "dhis-web-pivot/index.html?id=${id}&interpretationid=${interpretationId}",
        },
        apiModel: "reportTables",
        visualizationType: "html",
    },
    {
        type: "CHART",
        field: "chart",
        appPath: {
            object: "dhis-web-data-visualizer/index.html#/${id}",
            interpretation:
                "dhis-web-data-visualizer/index.html#/${id}/interpretation/${interpretationId}",
        },
        apiModel: "charts",
        visualizationType: "image",
    },
    {
        type: "EVENT_REPORT",
        field: "eventReport",
        appPath: {
            object: "dhis-web-event-reports/index.html?id=${id}",
            interpretation:
                "dhis-web-event-reports/index.html?id=${id}&interpretationid=${interpretationId}",
        },
        apiModel: "eventReports",
        visualizationType: "none",
    },
    {
        type: "EVENT_CHART",
        field: "eventChart",
        appPath: {
            object: "dhis-web-event-visualizer/index.html?id=${id}",
            interpretation:
                "dhis-web-event-visualizer/index.html?id=${id}&interpretationid=${interpretationId}",
        },
        apiModel: "eventCharts",
        visualizationType: "image",
    },
];

module.exports = { objectsInfo };
