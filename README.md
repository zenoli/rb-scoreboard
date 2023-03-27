# Ravensburger Scoreboard
Live Scoreboard for my fantasy football game I play with friends during worldcups/euros.
This project is composed of two submodules

- [rb-scoreboard-frontend](https://github.com/zenoli/rb-scoreboard-frontend): A simple react app
displaying the scoreboard and statistics. 
- [rb-scoreboard-backend](https://github.com/zenoli/rb-scoreboard-backend): An express.js API
providing the live scores.

## Run

In order to run the app, make `MONGO_URL`-environment variable has be set with the valid Mongo DB credentials.
These are stored in the connected railway.app project.
The `MONGO_URL` variable is set when executing `docker compose` from a railway-subshell provided by `railway-cli`:


Enter the sub-shell:

```
> railway shell
No service linked, skipping service variables
Entering subshell with Railway variables available. Type 'exit' to exit.

```

Execute:

```
> docker compose up --build
```

Alternatively, if you can use:
```
MONGO_URL={{my-mongo-url}} docker compose up  --build
```

