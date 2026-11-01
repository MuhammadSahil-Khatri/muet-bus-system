# MUET Bus & Route Management System

## Introduction

MUET Bus & Route Management System is a web application for viewing and managing Mehran University of Engineering and Technology bus routes. Visitors can search routes by bus number or stop, view schedules and driver details, and follow routes on an interactive OpenStreetMap map with stop markers, road paths, distance, and duration.

Administrators can sign in to add, edit, and delete bus routes.

Each route also includes an optional **View route in Google Maps** button. It opens the Google Maps website in a new tab with the route stops and driving directions prefilled. The application does not load or require the Google Maps API.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Maps:** Leaflet and OpenStreetMap
- **Backend:** Node.js, Express, and TypeScript
- **Route engine:** C++17
- **Data storage:** Local `data/buses.txt` file

## Requirements

Install the following before starting:

- Node.js 18 or newer
- npm
- A C++ compiler with `g++`

## Start the Project

Install the dependencies:

```bash
npm install --legacy-peer-deps
```

Compile the C++ route engine:

```bash
npm run compile:cpp
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Build and Run for Production

Create the production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The production application is available at [http://localhost:3000](http://localhost:3000).

## Access the Admin Panel

1. Copy `.env.example` to `.env`.
2. Set the administrator credentials:

   ```env
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="your-secure-password"
   ```

3. Start the project.
4. Open the application and select **Admin Login**.
5. Enter the configured username and password.

After signing in, the admin can use **Add Route**, edit existing routes, or delete routes. Visitors can use the search and map features without signing in.

If `ADMIN_PASSWORD` is not configured, the server generates a temporary password and prints it in the server console at startup.
