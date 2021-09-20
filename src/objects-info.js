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
        type: "VISUALIZATION",
        field: "visualization",
        appPath: {
            object: "dhis-web-data-visualizer/#/${id}",
            interpretation:
                "dhis-web-data-visualizer/#/${id}/interpretation/${interpretationId}",
        },
        apiModel: "visualizations",
        visualizationType: "visualization",
    },
    {
        type: "CHART",
        field: "visualization",
        appPath: {
            object: "dhis-web-data-visualizer/#/${id}",
            interpretation:
                "dhis-web-data-visualizer/#/${id}/interpretation/${interpretationId}",
        },
        apiModel: "charts",
        visualizationType: "image",
    },
    {
        type: "REPORT_TABLE",
        field: "visualization",
        appPath: {
            object: "dhis-web-data-visualizer/#/${id}",
            interpretation:
                "dhis-web-data-visualizer/#/${id}/interpretation/${interpretationId}",
        },
        apiModel: "reportTables",
        visualizationType: "html",
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
