# Northstar ATS demo

The frontend in `frontend/` connects directly to the four FastAPI services through Vite's local development proxy. Nginx is not required for the demo.

## Start the services

Start each service in a separate terminal from the repository root. The service databases and environment variables must already be configured.

```sh
uv run uvicorn services.seeker_service.hello:app --port 8000 --reload
uv run uvicorn services.recruiter_service.hello:app --port 8001 --reload
uv run uvicorn services.application_service.hello:app --port 8002 --reload
uv run uvicorn services.auth_service.hello:app --port 8003 --reload
```

## Start the frontend

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The frontend proxy sends `/api/seeker`, `/api/recruiter`, `/api/applications`, and `/api/auth` to ports 8000, 8001, 8002, and 8003 respectively.

Create a candidate account from the sign-in screen. To demo recruiting, sign in with an existing `recruiter` or `staffing` account; the current auth service only allows public registration as a seeker and restricts recruiter creation to staffing users.

## Included demo flows

- Candidate registration, sign in, resume upload and processing status, job search, applications, progress tracking, withdrawal, profile updates, and account closure.
- Recruiter and staffing dashboards, job posting and status controls, full applicant histories (active and completed), match scores, round feedback, candidate search and invitations, client onboarding, and client hiring history.
- A recruiter Applications section with all roles and outcome filters, plus client assignment during job creation or afterward.
- A health indicator for each backend service.

The candidate **My applications** page reads from the seeker service's `/myapplications` endpoint, so it shows the signed-in seeker's applications and their statuses and interview feedback across browsers.

When the backends are running, their FastAPI docs are available at `http://localhost:8000/docs` through `http://localhost:8003/docs`.
