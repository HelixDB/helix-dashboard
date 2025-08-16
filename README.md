# helix-dashboard

## Overview

This is a dashboard for helixdb. It allows you to view and interact with your helixdb database.

![Dashboard](./public/dashboard.png)
![Viz](./public/viz.png)

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
1. cd into the `frontend` directory and run `npm install` to install the dependencies
2. Run `npm run dev` to start the frontend
3. The frontend will be available at `http://localhost:3000`

## Visualizer Setup

**NOTE**: 
- You may need to stop your current helixdb instance running on port 6969
- In some browsers like **Brave**, you aren't able to click on all the nodes, brave only allows you to click on 2-3 nodes at most. So I'd recommend using anything but brave.
- I would also not recommend visualizing more than **3000 nodes** it may cause browser to crash

### Setup (Mac)
1. Go into an IDE or terminal, then open/cd to your user (home) directory and do `Command + Shift + .` or cd into the `.helix/repo/helix-db` folder
2. Change the branch to `dev`
3. Then `cd helix-cli` and run `sh build.sh dev`
4. You can now deploy your existing instance using `helix deploy -c <cluster_id> --dev`
5. Run the frontend and backend, then you can now use the visualizer.

**Don't forget that your HelixDB is now on the dev branch, and when you want to update to a newer version of helix you need to git pull in the branch and run the same command. Or you can change back the branch to main**

### Setup (Windows)
1. Same as Mac, I'm not sure where the .helix folder resides in Windows tho
