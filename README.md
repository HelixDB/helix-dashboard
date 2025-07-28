# helix-dashboard

## Overview

This is a dashboard for helixdb. It allows you to view and interact with your helixdb database.

![Dashboard](./public/dashboard.png)


## Query Format

The dashboard works best when your queries follow this naming convention:
    - **Creating** or **linking** nodes and edges should start with "create" or "link" (e.g., "createPatient" or "linkPatientToDoctor")
    - **Searching** or **getting** nodes and edges should start with "get" (e.g., "getPatient" or "getDoctor")
    - **Updating** nodes and edges should start with "update" (e.g., "updatePatient" or "updateDoctor")
    - **Deleting** nodes and edges should start with "delete" (e.g., "deletePatient" or "deleteDoctor")

## Setup

Backend:
1. Navigate to the `backend` directory and ensure your HelixDB is running either locally or on a cloud server
2. You then have 3 options:
    - **Local introspect** (default): Run `cargo run` or `cargo run -- local-introspect`
    - **Local file**: Read queries and schema from your local file, add your helixdb-cfg to the backend folder and run `cargo run -- local-file`
    - **Cloud mode**: Run `cargo run -- cloud http://your-helix-db-url:6969`

- For local introspect, you can specify a custom port for your HelixDB instance: `cargo run -- --port 8888` or `cargo run -- -p 8888`
- For local file: `cargo run -- local-file --port 8888`

Frontend:
- cd into the `frontend` directory and run `npm install` to install the dependencies
- Run `npm run dev` to start the frontend
- The frontend will be available at `http://localhost:3000`

