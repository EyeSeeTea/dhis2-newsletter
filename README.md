# Dhis2 notifications

## Setup

* Build the assets:

```
$ yarn install
$ yarn build
```

This will create directory `build/` containing the directory structure of the assets that needs to be uploaded to a public server.

* Edit the configuration file: `config.json` (details below)

* Install the package from sources:

```
$ [sudo] npm install -g .

# Check that the executable has been installed and where (it will depend on your specific node configuration)
$ which dhis2-subscriptions
/home/someuser/.npm-global/bin/dhis2-subscriptions
```

* Add crontab entries (`crontab -e`) to send notifications and newsletters to subscribers. An example:

```
*/5 * * * *   chronic /path/to/bin/dhis2-subscriptions generate-events --config-file=/path/to/your/config.json 

*/8 * * * *   chronic /path/to/bin/dhis2-subscriptions send-notifications --config-file=/path/to/your/config.json --ge=true or false

00  8 * * MON chronic /path/to/bin/dhis2-subscriptions send-newsletters --config-file=/path/to/your/config.json --ge=true or false
```

## Configuration file (`config.json`)

```
{
    // Global locale code (used for literal translations)
    "locale": "en",

    // Images (icons and dhis2 resources) must be uploaded to a public server (local or remote)
    "assets": {
        "url": "http://some-public-server.com/resources",
        // Copy PNG downloaded from DHIS2 to the folder of the public server (use cp/sc/.rsync/...)
        "upload": "cp {{files}} /path/to/build/resources/"
    },

    // DHIS2 public URL
    "publicUrl": "http://localhost:8080",

    // Cache file to store timestamp of previous commands executions
    "cacheFilePath": "./cache/lastExecutions.json",

    // DHIS2 Api details
    "api": {
        "url": "http://localhost:8080/api/",
        "auth": {
            "username": "admin",
            "password": "district"
        }
    },

    // E-mail footer literals
    "footer": {
        "text": "Population services international (PSI)"
    },

    // E-mail SMTP configuration
    "smtp": {
        "host": "smtp.gmail.com",
        "port": 465,
        "auth": {
            "user": "user@gmail.com",
            "pass": "password"
        }
    }
}
```

## Commands examples

Detect changes in interpretations and its comments for objects (charts, eventCharts, maps, reportTables, eventReports):

```
$ dhis2-subscriptions generate-events [-c path/to/config.json] 
```

Execute previously the generate events command and send emails to subscribers of objects (charts, eventCharts, maps, reportTables, eventReports):

```
$ dhis2-subscriptions send-notifications [-c path/to/config.json] --ge=true
```

Execute previously the generate events command and send a weekly report of interpretations to subscribers of their parent objects:

```
$ dhis2-subscriptions send-newsletters [-c path/to/config.json] --ge=true
```
