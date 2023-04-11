# Ravensburger Scoreboard
Live Scoreboard for my fantasy football game I play with friends during worldcups/euros.
This project is composed of two submodules

- [rb-scoreboard-frontend](https://github.com/zenoli/rb-scoreboard-frontend): A simple react app
displaying the scoreboard and statistics. 
- [rb-scoreboard-backend](https://github.com/zenoli/rb-scoreboard-backend): An express.js API
providing the live scores.

## Run

### Backend Setup
See [here](https://github.com/zenoli/rb-scoreboard-backend)

### Frontend Setup
Docker compose automatically sets up the proxy url so that backend requests from the frontend
automatically get forwarded to the locally running backend instance. If you want to use the
backend service in the cloud, change the `API_PROXY` environment variable in `docker-compose.yml`.
Keep in mind that this completely bypasses the backend service.

### Starting the services

Execute:

```
> docker compose up --build
```

