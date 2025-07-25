# helix-dashboard

## Overview

This is a dashboard for helixdb. It allows you to view and interact with your helixdb database.

![Dashboard](./public/dashboard.png)


## Query Format

**This works best** if your queries have this format:
- create should start with "create" e.g "createPatient"
- get should start with "get" e.g "getPatient"
- update should start with "update" e.g "updatePatient"
- delete should start with "delete" e.g "deletePatient"


## Setup

Backend:
- Local introspect (default): have your helixdb up, then run `cargo run` or `cargo run -- local-introspect`
- Local file: add your helixdb-cfg into the backend folder and run `cargo run -- local-file`
- Cloud mode: run `cargo run -- cloud http://your-helix-db-url:6969`

Frontend:
- Run `npm run dev` to start the frontend
- The frontend will be available at `http://localhost:3000`

