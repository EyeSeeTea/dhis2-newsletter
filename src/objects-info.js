const objectsInfo = [
    {
        type: "MAP",
        field: "map",
        appPath: "dhis-web-maps/index.html?id=${id}&interpretationid=${interpretationId}",
        visualizationType: "image",
        apiModel: "maps",
    },
    {
        type: "REPORT_TABLE",
        field: "reportTable",
        appPath: "dhis-web-pivot/index.html?id=${id}&interpretationid=${interpretationId}",
        apiModel: "reportTables",
        visualizationType: "html",
    },
    {
        type: "CHART",
        field: "chart",
        appPath: "dhis-web-data-visualizer/index.html/#/${id}/interpretation/${interpretationId}",
        apiModel: "charts",
        visualizationType: "image",
    },
    {
        type: "EVENT_REPORT",
        field: "eventReport",
        appPath: "dhis-web-event-reports/index.html?id=${id}&interpretationid=${interpretationId}",
        apiModel: "eventReports",
        visualizationType: "none",
    },
    {
        type: "EVENT_CHART",
        field: "eventChart",
        appPath:
            "dhis-web-event-visualizer/index.html?id=${id}&interpretationid=${interpretationId}",
        apiModel: "eventCharts",
        visualizationType: "image",
    },
];

module.exports = { objectsInfo };
