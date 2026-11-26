const paths = {
  auth: '/api/auth', seeker: '/api/seeker', recruiter: '/api/recruiter', applications: '/api/applications',
};
const today = new Date();
const dateLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(today).toUpperCase();
const dateShort = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'long', day: 'numeric' }).format(today).toUpperCase();
const cachedUser = JSON.parse(localStorage.getItem('ats_user') || 'null');
const state = {
  token: localStorage.getItem('ats_token') || '',
  user: cachedUser,
  page: 'overview', jobs: [], applications: [], myApplications: [], pipelineApplications: [], candidates: [], clients: [],
  search: '', applicationSearch: '', applicationFilter: 'all', selectedJob: null, busy: false,
};
const app = document.querySelector('#app');

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function initials(value = 'N') { return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function resumeUrl(path) { const value = String(path || ''); const marker = value.lastIndexOf('Resumes/'); const tail = marker < 0 ? '' : value.slice(marker + 8); return tail && tail !== 'None' ? `${paths.seeker}/Resumes/${encodeURIComponent(tail)}` : ''; }
function authHeaders(extra = {}) { return { ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...extra }; }
async function api(service, path, { method = 'GET', body, form } = {}) {
  const options = { method, headers: authHeaders() };
  if (form) options.body = form;
  else if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(`${paths[service]}${path}`, options);
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.detail || data || `Request failed (${response.status})`);
  return data;
}
function notify(message, type = 'success') {
  const host = document.querySelector('#toast-stack');
  if (!host) return;
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; host.append(toast);
  setTimeout(() => toast.remove(), 4200);
}
function setBusy(busy) { state.busy = busy; document.body.classList.toggle('busy', busy); }
function shell(content, active = state.page) {
  const person = state.user || {};
  const recruiter = ['recruiter', 'staffing'].includes(person.role);
  const nav = recruiter
    ? [['overview', '◫', 'Overview'], ['jobs', '▤', 'Job postings'], ['all-applications', '↗', 'Applications'], ['talent', '⌕', 'Talent search'], ['clients', '◎', 'Clients']]
    : [['overview', '◫', 'Overview'], ['jobs', '▤', 'Find a job'], ['applications', '↗', 'My applications'], ['profile', '◉', 'My profile']];
  return `<div class="shell"><aside class="sidebar">
      <a class="brand" href="#overview"><span class="brand-mark">n</span><span>northstar<span class="brand-dot">.</span><small>HIRING, IN FOCUS</small></span></a>
      <div class="workspace-label">WORKSPACE <button class="more" type="button" aria-label="Workspace actions" data-menu-trigger="workspace-actions">•••</button></div>
      <button class="workspace" type="button" data-menu-trigger="workspace"><span class="workspace-icon">${recruiter ? '◈' : '◉'}</span><span><b>${recruiter ? 'Recruiting team' : 'Candidate space'}</b><small>${recruiter ? 'People operations' : 'Your job search'}</small></span><span class="chevron">⌄</span></button>
      <div class="nav-label">WORKSPACE</div>
      <nav>${nav.map(([key, icon, label]) => `<button class="nav-item ${active === key ? 'active' : ''}" data-page="${key}"><span class="nav-icon">${icon}</span>${label}${key === 'applications' && state.myApplications.length ? `<span class="nav-count">${state.myApplications.length}</span>` : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="service-health"><div class="health-heading"><span>Service status</span><span class="pulse"></span></div><div id="health-pills" class="health-pills"><span class="health-loading">Checking services…</span></div></div>
      <button class="profile-switch" type="button" data-menu-trigger="profile"><span class="avatar small-avatar">${initials(person.name || 'N')}</span><span class="profile-text"><b>${esc(person.name || 'Guest')}</b><small>${esc(person.role || 'Demo')}</small></span><span class="chevron">⌄</span></button></div>
    </aside><main class="main-area"><header class="topbar"><div class="breadcrumb"><span>Workspace</span><span class="crumb-slash">/</span><b>${esc(nav.find((item) => item[0] === active)?.[2] || 'Overview')}</b></div><div class="top-actions"><span class="top-date">${dateShort}</span><button class="icon-btn" type="button" data-menu-trigger="workspace-actions" aria-label="Help and demo menu">?</button><button class="avatar top-avatar" type="button" data-menu-trigger="profile" title="${esc(person.name || '')}" aria-label="Account menu">${initials(person.name || 'N')}</button></div></header>
    <div class="page-content">${content}</div></main><div id="toast-stack" class="toast-stack"></div></div>`;
}
function pageHead(eyebrow, title, subtitle, action = '') { return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function modal(id, title, body, submit = 'Save changes') {
  return `<div class="modal-backdrop" data-close="${id}"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title"><div class="modal-head"><div><div class="eyebrow">NORTHSTAR ATS</div><h2 id="${id}-title">${title}</h2></div><button class="icon-btn close-modal" data-close="${id}">×</button></div>${body}<div class="modal-actions"><button class="btn btn-quiet close-modal" data-close="${id}">Cancel</button><button class="btn btn-primary" form="${id}-form">${submit}<span>↗</span></button></div></section></div>`;
}
function empty(icon, title, copy) { return `<div class="empty-state"><span class="empty-icon">${icon}</span><h3>${title}</h3><p>${copy}</p></div>`; }
function jobCard(job, recruiter = false) {
  const tags = Array.isArray(job.keywords) ? job.keywords.slice(0, 4) : [];
  const client = job.client?.client_name || state.clients.find((item) => Number(item.client_id) === Number(job.client_id))?.client_name;
  return `<article class="job-card"><div class="job-card-top"><span class="company-logo">${initials(client || 'N')}</span><span class="status-pill ${esc(job.status || 'open')}">${esc(job.status || 'open')}</span></div><h3>${esc(job.role || 'Untitled role')}</h3><p class="job-company">${esc(client || 'No client assigned')} <span>·</span> ${job.client_id ? `Client #${job.client_id}` : 'Client partner'}</p><p class="job-description">${esc(job.description || 'A new opportunity is waiting for its next great hire.')}</p><div class="tag-row">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div><div class="job-card-foot"><span class="job-id">JOB-${String(job.id || '—').padStart(4, '0')}</span>${recruiter ? `<span class="job-card-actions"><button class="text-btn" data-action="assign-client" data-id="${job.id}">${job.client_id ? 'Change client' : 'Add client'}</button><button class="text-btn" data-action="view-applicants" data-id="${job.id}">Applicants <span>→</span></button></span>` : `<button class="btn btn-small btn-primary" data-action="apply" data-id="${job.id}">Apply now <span>↗</span></button>`}</div></article>`;
}
function overviewPage() {
  const recruiter = ['recruiter', 'staffing'].includes(state.user.role);
  if (recruiter) {
    const open = state.jobs.filter((job) => job.status === 'open').length;
    const avgScore = state.applications.length ? Math.round(state.applications.reduce((total, item) => total + (item.score || 0), 0) / state.applications.length) : 0;
    return `${pageHead(dateLong, `Good morning, ${esc(state.user.name?.split(' ')[0] || 'there')}.`, 'Your recruiting workspace is ready for the week.', `<button class="btn btn-primary" data-action="new-job">＋ <span>Post a role</span></button>`)}
      <div class="welcome-banner recruiter-banner"><div class="banner-copy"><span class="banner-kicker">RECRUITING OVERVIEW <span class="mini-line"></span> NOVEMBER 2026</span><h2>Great teams start<br/>with great conversations.</h2><p>Keep every search moving, from first look to final offer.</p><button class="banner-link" data-page="jobs">Explore your postings <span>→</span></button></div><div class="banner-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-core"><span>n</span></div><div class="art-star">✳</div><div class="art-dot dot-one"></div><div class="art-dot dot-two"></div><span class="art-caption">PEOPLE<br/>FIRST</span></div></div>
      <div class="section-title-row"><div><div class="eyebrow">AT A GLANCE</div><h2>Your hiring pulse</h2></div><span class="muted-note">Live from your workspace <i class="tiny-live"></i></span></div><div class="metric-grid"><div class="metric-card"><span class="metric-icon mint">▤</span><span class="metric-label">Open roles</span><strong>${open}</strong><small><b>▲</b> ${state.jobs.length} total postings</small></div><div class="metric-card"><span class="metric-icon lavender">♙</span><span class="metric-label">Active applicants</span><strong>${state.applications.filter((a) => ['submitted', 'reviewed'].includes(a.status)).length}</strong><small><b>↗</b> Across your visible roles</small></div><div class="metric-card"><span class="metric-icon peach">✧</span><span class="metric-label">Average match score</span><strong>${avgScore}<em>pts</em></strong><small><b>✳</b> Skills matched per application</small></div><div class="metric-card"><span class="metric-icon sky">◎</span><span class="metric-label">Client partners</span><strong>${state.clients.length}</strong><small><b>↗</b> Growing your network</small></div></div>
      <div class="content-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">YOUR PIPELINE</div><h2>Recent roles</h2></div><button class="text-btn" data-page="jobs">All postings <span>→</span></button></div>${state.jobs.length ? `<div class="compact-jobs">${state.jobs.slice(0, 3).map((job) => `<button class="compact-job" data-action="view-applicants" data-id="${job.id}"><span class="company-logo">${initials(job.role)}</span><span class="compact-job-main"><b>${esc(job.role)}</b><small>JOB-${String(job.id).padStart(4, '0')} · ${esc(job.status || 'open')}</small></span><span class="compact-job-arrow">→</span></button>`).join('')}</div>` : empty('▤', 'No roles posted yet', 'Post your first role to start building a pipeline.')}</section><section class="panel activity-panel"><div class="panel-heading"><div><div class="eyebrow">NEXT UP</div><h2>Keep things moving</h2></div><span class="panel-ornament">✳</span></div><div class="next-step"><span class="next-icon">01</span><div><b>Publish a new role</b><p>Give great candidates something to find.</p></div><button data-action="new-job">→</button></div><div class="next-step"><span class="next-icon">02</span><div><b>Meet new talent</b><p>Search profiles by their strengths.</p></div><button data-page="talent">→</button></div><div class="next-step"><span class="next-icon">03</span><div><b>Grow your client list</b><p>Build better partnerships together.</p></div><button data-page="clients">→</button></div></section></div>`;
  }
  const openJobs = state.jobs.filter((job) => !job.status || job.status === 'open');
  return `${pageHead('YOUR NEXT CHAPTER', `Good morning, ${esc(state.user.name?.split(' ')[0] || 'there')}.`, 'A good opportunity can change everything. Let’s find yours.', `<button class="btn btn-secondary" data-page="profile">${state.seeker ? 'Update my profile' : 'Create my profile'} <span>↗</span></button>`)}
    <div class="welcome-banner seeker-banner"><div class="banner-copy"><span class="banner-kicker">A LITTLE SPACE FOR BIG AMBITIONS <span class="mini-line"></span> 01 / 03</span><h2>Your next chapter<br/>is closer than it looks.</h2><p>Discover roles that value what makes you, you.</p><button class="banner-link" data-page="jobs">Browse open opportunities <span>→</span></button></div><div class="seeker-art"><div class="sun-disc"></div><div class="arch arch-back"></div><div class="arch arch-front"></div><div class="tiny-plant"><span></span><span></span><i></i></div><span class="art-caption">MAKE<br/>YOUR MOVE</span><span class="art-spark">✳</span></div></div>
    <div class="section-title-row"><div><div class="eyebrow">YOUR SEARCH, AT A GLANCE</div><h2>Good things are in motion</h2></div><span class="muted-note">You’re right where you need to be <i class="tiny-live"></i></span></div><div class="metric-grid seeker-metrics"><div class="metric-card"><span class="metric-icon mint">▤</span><span class="metric-label">Open opportunities</span><strong>${openJobs.length}</strong><small>Ready for your next move</small></div><div class="metric-card"><span class="metric-icon lavender">↗</span><span class="metric-label">My applications</span><strong>${state.myApplications.length}</strong><small>Synced from your account</small></div><div class="metric-card"><span class="metric-icon peach">✧</span><span class="metric-label">Skills on your profile</span><strong>${state.seeker?.strengths?.length || 0}</strong><small>${state.seeker?.resume_processing_status === 'completed' ? 'Resume reviewed' : 'Keep your profile fresh'}</small></div></div>
    <div class="section-title-row jobs-heading"><div><div class="eyebrow">HANDPICKED FOR YOU</div><h2>Open roles worth a look</h2></div><button class="text-btn" data-page="jobs">See all roles <span>→</span></button></div><div class="job-grid">${openJobs.slice(0, 3).map((job) => jobCard(job)).join('') || empty('✳', 'New roles are on the way', 'Check back soon — something great may be just around the corner.')}</div>`;
}
function jobsPage() {
  const recruiter = ['recruiter', 'staffing'].includes(state.user.role);
  const filtered = state.jobs.filter((job) => `${job.role} ${job.description} ${(job.keywords || []).join(' ')}`.toLowerCase().includes(state.search.toLowerCase()));
  return `${pageHead(recruiter ? 'YOUR JOB BOARD' : 'FIND YOUR FIT', recruiter ? 'Job postings' : 'Open opportunities', recruiter ? 'Every search starts with a role worth talking about.' : 'Explore roles built for people like you.', recruiter ? `<button class="btn btn-primary" data-action="new-job">＋ <span>Post a role</span></button>` : '')}
    <div class="search-toolbar"><label class="search-box"><span>⌕</span><input id="job-search" value="${esc(state.search)}" placeholder="Search roles, skills, or keywords"/><kbd>⌘ K</kbd></label><button class="filter-btn" data-action="refresh">↻ <span>Refresh</span></button></div>
    <div class="listing-meta"><span><b>${filtered.length}</b> roles ${recruiter ? 'in your workspace' : 'to explore'}</span><span>Sorted by ${recruiter ? 'recently added' : 'best fit'} <span class="sort-chevron">⌄</span></span></div>
    <div class="job-grid">${filtered.map((job) => jobCard(job, recruiter)).join('') || empty('⌕', 'No matching roles', 'Try another title or skill to widen your search.')}</div>`;
}
function allApplicationsPage() {
  const statuses = ['all', 'submitted', 'reviewed', 'selected', 'rejected', 'withdraw'];
  const selected = state.applicationFilter || 'all';
  const terms = state.applicationSearch.toLowerCase();
  const filtered = state.applications.filter((application) => {
    const job = state.jobs.find((item) => Number(item.id) === Number(application.job_id));
    const candidate = state.candidates.find((item) => Number(item.id) === Number(application.cand_id));
    const matchesStatus = selected === 'all' || application.status === selected;
    const matchesText = `${application.id} ${application.job_id} ${application.cand_id} ${job?.role || ''} ${candidate?.name || ''} ${candidate?.email || ''}`.toLowerCase().includes(terms);
    return matchesStatus && matchesText;
  }).sort((a, b) => new Date(b.applied_at || 0) - new Date(a.applied_at || 0));
  const counts = Object.fromEntries(statuses.map((status) => [status, status === 'all' ? state.applications.length : state.applications.filter((item) => item.status === status).length]));
  const list = filtered.map((application) => {
    const job = state.jobs.find((item) => Number(item.id) === Number(application.job_id));
    const candidate = state.candidates.find((item) => Number(item.id) === Number(application.cand_id));
    const resume = resumeUrl(application.resume_path);
    const date = application.applied_at ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(application.applied_at)) : '—';
    const feedback = Object.entries(application.round_feedback || {});
    const feedbackBlock = feedback.length ? `<details class="all-app-feedback"><summary>Interview feedback · ${feedback.length}</summary><div>${feedback.map(([round, note]) => `<p><b>${esc(['selected', 'rejected'].includes(round) ? round : `Round ${round}`)}</b><span>${esc(note || 'No feedback left')}</span></p>`).join('')}</div></details>` : '';
    return `<article class="all-application-row"><div class="all-app-person"><span class="avatar candidate-avatar">${initials(candidate?.name || `C${application.cand_id}`)}</span><div><b>${esc(candidate?.name || `Candidate #${application.cand_id}`)}</b><small>${esc(candidate?.email || (application.resume_path === 'Profile Deleted / Anonymised' ? 'Profile anonymized' : 'Candidate'))}</small></div></div><div class="all-app-role"><b>${esc(job?.role || `Job #${application.job_id}`)}</b><small>JOB-${String(application.job_id).padStart(4, '0')} · App #${application.id}</small></div><div class="all-app-match"><b>${application.score || 0}</b><small>skills</small></div><span class="status-pill ${esc(application.status)}">${esc(application.status)}</span><time>${date}</time><div class="all-app-actions">${resume ? `<a class="text-btn" href="${esc(resume)}" target="_blank" rel="noreferrer">Resume ↗</a>` : ''}<button class="text-btn" data-action="progress" data-id="${application.id}">History ↗</button></div>${feedbackBlock}</article>`;
  }).join('');
  return `${pageHead('YOUR RECRUITING PIPELINE', 'All applications', 'One view across every role, from new submissions to final outcomes.', `<button class="btn btn-secondary" data-action="refresh">↻ <span>Refresh</span></button>`)}<div class="all-app-summary"><div><strong>${state.applications.length}</strong><span>Total applications</span></div><div><strong>${counts.submitted + counts.reviewed}</strong><span>In progress</span></div><div><strong>${counts.selected}</strong><span>Selected</span></div><div><strong>${counts.rejected + counts.withdraw}</strong><span>Closed</span></div></div><div class="all-app-toolbar"><label class="search-box"><span>⌕</span><input id="application-search" value="${esc(state.applicationSearch)}" placeholder="Search candidate, role, or application ID" /></label><button class="filter-btn" data-action="refresh">↻ <span>Refresh</span></button></div><div class="status-tabs">${statuses.map((status) => `<button class="status-tab ${selected === status ? 'selected' : ''}" data-application-filter="${status}">${status === 'all' ? 'All applications' : status[0].toUpperCase() + status.slice(1)}<span>${counts[status]}</span></button>`).join('')}</div><div class="all-app-list">${list || empty('↗', 'No applications in this view', 'Try another status or search term.')}</div>`;
}
function applicationsPage() {
  const applications = [...state.myApplications].sort((a, b) => new Date(b.applied_at || 0) - new Date(a.applied_at || 0));
  return `${pageHead('YOUR JOURNEY', 'My applications', 'Your application history, synced from your Northstar account.', `<button class="btn btn-secondary" data-action="refresh">↻ <span>Refresh</span></button>`)}<div class="application-intro"><span class="intro-icon">✦</span><div><b>Every opportunity, all in one place.</b><p>Application status and interview feedback are loaded from your seeker account.</p></div></div>${applications.length ? `<div class="application-list">${applications.map((item) => {
    const job = state.jobs.find((posting) => Number(posting.id) === Number(item.job_id));
    const role = job?.role || `Job #${item.job_id}`;
    const client = job?.client?.client_name || state.clients.find((entry) => Number(entry.client_id) === Number(job?.client_id))?.client_name || 'Northstar opportunity';
    const rounds = job?.rounds || [];
    let progress = item.status === 'submitted' ? 'Submitted, awaiting review' : item.status;
    if (item.status === 'reviewed') progress = item.current_round != null && rounds[item.current_round] ? `In progress · ${rounds[item.current_round]}` : 'In progress';
    if (item.status === 'selected') progress = 'You were selected';
    if (item.status === 'rejected') progress = 'Application was rejected';
    if (item.status === 'withdraw') progress = 'You withdrew this application';
    if (item.status === 'reviewed' && item.current_round != null && rounds.length && item.current_round >= rounds.length) progress = 'All rounds complete · awaiting final decision';
    const date = item.applied_at ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(item.applied_at)) : 'Date unavailable';
    const feedback = Object.entries(item.round_feedback || {});
    const feedbackRows = feedback.length ? `<details class="my-app-feedback"><summary>Interview feedback · ${feedback.length}</summary><div>${feedback.map(([round, note]) => `<p><b>${esc(['selected', 'rejected'].includes(round) ? round : `Round ${round}`)}</b><span>${esc(note || 'No feedback left')}</span></p>`).join('')}</div></details>` : '';
    return `<article class="application-row"><div class="company-logo">${initials(role)}</div><div class="application-main"><span class="eyebrow">APPLICATION #${item.id} · ${date}</span><h3>${esc(role)}</h3><p>${esc(client)} · Job #${esc(item.job_id)}</p></div><div class="application-status"><span class="status-pill ${esc(item.status)}">${esc(item.status)}</span><small>${esc(progress)}</small></div><div class="row-actions">${item.status === 'submitted' ? `<button class="text-btn danger-text" data-action="withdraw" data-id="${item.id}">Withdraw</button>` : ''}<button class="btn btn-small btn-secondary" data-action="track" data-id="${item.id}">Refresh status <span>↻</span></button></div>${feedbackRows}</article>`;
  }).join('')}</div>` : empty('↗', 'No applications yet', 'When you apply for a role, it will appear here.')}`;
}
function profilePage() {
  const seeker = state.seeker || {};
  const resume = resumeUrl(seeker.resume_path);
  return `${pageHead('YOUR PROFILE', 'A little about you', 'Help the right opportunities find their way to you.', `<button class="btn btn-secondary" data-action="refresh">↻ <span>Refresh profile</span></button>`)}
    <div class="profile-layout"><section class="panel profile-card"><div class="profile-banner"></div><div class="profile-avatar">${initials(state.user.name)}</div><div class="profile-card-body"><div class="profile-card-head"><div><h2>${esc(seeker.name || state.user.name)}</h2><p>${esc(seeker.email || state.user.email)}</p></div><span class="status-pill ${seeker.resume_processing_status === 'completed' ? 'open' : 'hold'}">${esc(seeker.resume_processing_status || 'profile needed')}</span></div><div class="profile-divider"></div><div class="detail-label">SKILLS & STRENGTHS</div><div class="tag-row profile-tags">${(seeker.strengths || []).map((skill) => `<span class="tag">${esc(skill)}</span>`).join('') || '<span class="quiet-copy">Your resume skills will appear here after processing.</span>'}</div><div class="profile-divider"></div><div class="detail-label">RESUME</div>${resume ? `<a class="resume-link" href="${esc(resume)}" target="_blank" rel="noreferrer">▧ &nbsp;View your resume <span>↗</span></a>` : '<span class="quiet-copy">No resume on file yet.</span>'}<div class="upload-card"><div><b>${resume ? 'Upload a fresh resume' : 'Add your resume'}</b><p>PDF works best. We’ll take it from there.</p></div><label class="btn btn-small btn-secondary upload-label">Choose file<input id="resume-input" type="file" accept="application/pdf,.pdf" hidden /></label></div></div></section>
    <section class="panel profile-edit"><div class="panel-heading"><div><div class="eyebrow">ACCOUNT DETAILS</div><h2>Keep things current</h2></div><span class="panel-ornament">✳</span></div><form id="profile-form" class="form-stack"><label class="field-label">Full name<input name="name" required value="${esc(state.user.name || '')}" /></label><label class="field-label">Email address<input name="email" type="email" required value="${esc(state.user.email || '')}" /></label><div class="profile-note"><span>✦</span><p>Your profile is kept in sync across Northstar services, so your details stay consistent.</p></div><button class="btn btn-primary" type="submit">Save profile <span>↗</span></button></form><div class="danger-zone"><div><b>Close your account</b><p>Remove access to your Northstar profile.</p></div><button class="text-btn danger-text" data-action="delete-account">Delete account</button></div></section></div>`;
}
function talentPage() {
  return `${pageHead('PEOPLE, NOT KEYWORDS', 'Find your next great hire', 'Search candidate profiles by the skills they bring.', '')}<div class="search-toolbar talent-search"><label class="search-box"><span>⌕</span><input id="talent-search" value="${esc(state.search)}" placeholder="Try “Python”, “product design”, or “SQL”"/><kbd>↵</kbd></label><button class="btn btn-primary" data-action="search-talent">Search talent <span>↗</span></button></div><div class="listing-meta"><span><b>${state.candidates.length}</b> candidate profiles</span><span>Matching your search</span></div>${state.candidates.length ? `<div class="candidate-grid">${state.candidates.map((person) => `<article class="candidate-card"><div class="candidate-top"><span class="avatar candidate-avatar">${initials(person.name)}</span><span class="match-chip">✦ Profile</span></div><h3>${esc(person.name)}</h3><p>${esc(person.email || 'Candidate')}</p><div class="tag-row">${(person.strengths || []).slice(0, 6).map((skill) => `<span class="tag">${esc(skill)}</span>`).join('') || '<span class="quiet-copy">Skills pending resume review</span>'}</div><div class="candidate-footer"><span class="job-id">CANDIDATE #${person.id}</span><button class="text-btn" data-action="recruit" data-id="${person.id}">Invite to a role <span>→</span></button></div></article>`).join('')}</div>` : empty('⌕', 'Find the right people', 'Search by a skill to see matching candidate profiles.')}`;
}
function clientsPage() {
  return `${pageHead('PARTNERS IN THE WORK', 'Client partners', 'Strong partnerships make meaningful work possible.', `<button class="btn btn-primary" data-action="new-client">＋ <span>Add a client</span></button>`)}${state.clients.length ? `<div class="client-grid">${state.clients.map((client) => `<article class="client-card"><span class="company-logo client-logo">${initials(client.client_name)}</span><h3>${esc(client.client_name)}</h3><p>${esc(client.client_email)}</p><div class="client-address">${esc([client.client_address_1, client.client_address_2].filter(Boolean).join(', ') || 'Address not provided')}</div><span class="client-id">CLIENT-${String(client.client_id).padStart(4, '0')}</span><button class="text-btn" data-action="client-history" data-id="${client.client_id}">View hiring history <span>→</span></button></article>`).join('')}</div>` : empty('◎', 'Your client list is ready to grow', 'Add a partner to keep every relationship close at hand.')}`;
}
function render() {
  if (!state.user) return renderAuth();
  let content;
  switch (state.page) {
    case 'jobs': content = jobsPage(); break;
    case 'all-applications': content = allApplicationsPage(); break;
    case 'applications': content = applicationsPage(); break;
    case 'profile': content = profilePage(); break;
    case 'talent': content = talentPage(); break;
    case 'clients': content = clientsPage(); break;
    default: content = overviewPage(); state.page = 'overview';
  }
  app.innerHTML = shell(content);
  bindCommon();
  if (state.page === 'profile') bindProfile();
  if (state.page === 'jobs') document.querySelector('#job-search')?.addEventListener('input', (event) => { state.search = event.target.value; const pos = event.target.selectionStart; render(); const input = document.querySelector('#job-search'); input.focus(); input.setSelectionRange(pos, pos); });
  if (state.page === 'all-applications') document.querySelector('#application-search')?.addEventListener('input', (event) => { state.applicationSearch = event.target.value; const pos = event.target.selectionStart; render(); const input = document.querySelector('#application-search'); input.focus(); input.setSelectionRange(pos, pos); });
  document.querySelectorAll('[data-application-filter]').forEach((button) => button.addEventListener('click', () => { state.applicationFilter = button.dataset.applicationFilter; render(); }));
  if (state.page === 'talent') document.querySelector('#talent-search')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchTalent(); });
  loadHealth();
}
function renderAuth() {
  app.innerHTML = `<div class="auth-shell"><aside class="auth-aside"><a class="brand light-brand" href="#"><span class="brand-mark">n</span><span>northstar<span class="brand-dot">.</span><small>HIRING, IN FOCUS</small></span></a><div class="auth-story"><span class="banner-kicker">A BETTER WAY TO FIND YOUR NEXT</span><h1>Work should<br/>feel like a<br/><em>good fit.</em></h1><p>Meet the people, opportunities, and teams ready for what comes next.</p><div class="auth-story-foot"><span>✳</span><span>Thoughtful hiring.<br/>More human, by design.</span></div></div><span class="auth-aside-footer">NORTHSTAR TALENT PLATFORM &nbsp;·&nbsp; 2026</span></aside><main class="auth-main"><div class="auth-main-top"><span>Already part of Northstar?</span><button class="auth-toggle" data-auth-mode="login">Sign in <span>↗</span></button></div><section class="auth-card"><span class="auth-spark">✳</span><div class="eyebrow">A FRESH START, OR A NEXT STEP</div><h2 id="auth-title">${state.authMode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p id="auth-subtitle">${state.authMode === 'register' ? 'Let’s get you started on the right path.' : 'Sign in and pick up where your next chapter begins.'}</p><div class="auth-tabs"><button class="auth-tab ${state.authMode !== 'register' ? 'selected' : ''}" data-auth-mode="login">Sign in</button><button class="auth-tab ${state.authMode === 'register' ? 'selected' : ''}" data-auth-mode="register">Create account</button></div><form id="auth-form" class="form-stack">${state.authMode === 'register' ? '<label class="field-label">Full name<input name="name" required placeholder="Your name" autocomplete="name" /></label>' : ''}<label class="field-label">Email address<input type="email" name="email" required placeholder="you@example.com" autocomplete="email" /></label><label class="field-label">${state.authMode === 'register' ? 'Create a password' : 'Password'}<input type="password" name="password" required placeholder="At least 8 characters" autocomplete="${state.authMode === 'register' ? 'new-password' : 'current-password'}" /></label><button class="btn btn-primary auth-submit" type="submit">${state.authMode === 'register' ? 'Create candidate account' : 'Sign in to Northstar'} <span>↗</span></button></form><div class="auth-footnote"><span>◈</span> Securely connected to your Northstar workspace</div></section><div class="auth-service-strip"><span class="pulse"></span> Demo services <span>·</span> <span id="auth-service-count">checking…</span></div></main><div id="toast-stack" class="toast-stack"></div></div>`;
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => { state.authMode = button.dataset.authMode; renderAuth(); }));
  document.querySelector('#auth-form').addEventListener('submit', authSubmit);
  loadHealth(true);
}
async function authSubmit(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
  try {
    if (state.authMode === 'register') await api('auth', '/register', { method: 'POST', body: { email: form.get('email'), name: form.get('name'), user_pass: form.get('password') } });
    const response = await api('auth', '/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
    state.token = response.token;
    const users = await api('auth', '/users');
    state.user = users.find((person) => person.email === form.get('email'));
    if (!state.user) throw new Error('Your account was created, but the profile could not be loaded. Please sign in again.');
    localStorage.setItem('ats_token', state.token); localStorage.setItem('ats_user', JSON.stringify(state.user));
    state.page = 'overview'; await loadWorkspace();
    if (state.user.role === 'seeker' && !state.seeker) { state.page = 'profile'; render(); notify('Create your seeker profile and add a resume to get started.'); }
    else { render(); notify(`Welcome ${state.user.name.split(' ')[0]}.`); }
  } catch (error) { renderAuth(); notify(error.message, 'error'); }
  finally { setBusy(false); }
}
async function loadWorkspace() {
  const recruiter = ['recruiter', 'staffing'].includes(state.user?.role);
  const jobsPromise = api('recruiter', '/postings').catch(() => []);
  const seekerPromise = recruiter ? Promise.resolve(null) : api('seeker', `/authSeeker?id=${state.user.id}`).then((person) => person?.id ? api('seeker', `/seeker?id=${person.id}`).catch(() => person) : null).catch(() => null);
  const applicationPromise = recruiter ? api('applications', '/applications').catch(() => []) : Promise.resolve([]);
  const myApplicationsPromise = recruiter ? Promise.resolve([]) : api('seeker', '/myapplications').catch(() => []);
  const clientsPromise = recruiter ? api('recruiter', '/clients').catch(() => JSON.parse(localStorage.getItem('ats_clients') || '[]')) : Promise.resolve([]);
  [state.jobs, state.seeker, state.applications, state.clients, state.myApplications] = await Promise.all([jobsPromise, seekerPromise, applicationPromise, clientsPromise, myApplicationsPromise]);
  if (recruiter) state.seeker = null;
  if (state.selectedJob) await loadApplicants(state.selectedJob);
}
async function loadApplicants(jobId) {
  state.selectedJob = jobId;
  try {
    const allApplications = await api('applications', '/applications');
    state.pipelineApplications = allApplications.filter((application) => Number(application.job_id) === Number(jobId));
    state.candidates = await api('seeker', '/seekers');
  } catch (error) { state.pipelineApplications = []; notify(error.message, 'error'); }
}
async function loadHealth(authOnly = false) {
  const services = [['Auth', 'auth', '/health-check'], ['Seeker', 'seeker', '/health-check'], ['Recruiter', 'recruiter', '/health-check'], ['Applications', 'applications', '/health-check']];
  const results = await Promise.all(services.map(async ([label, service, path]) => {
    try { await api(service, path); return { label, ok: true }; } catch { return { label, ok: false }; }
  }));
  const host = document.querySelector(authOnly ? '#auth-service-count' : '#health-pills'); if (!host) return;
  if (authOnly) host.textContent = `${results.filter((result) => result.ok).length} of 4 online`;
  else host.innerHTML = results.map((result) => `<span class="health-pill ${result.ok ? 'online' : 'offline'}" title="${result.label} service ${result.ok ? 'online' : 'offline'}"><i></i>${result.label}</span>`).join('');
}
function bindCommon() {
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', async () => {
    if (button.dataset.page === 'talent' && state.candidates.length === 0) await searchTalent();
    if (button.dataset.page === 'all-applications') {
      try { state.candidates = await api('seeker', '/seekers'); } catch { state.candidates = []; }
    }
    state.page = button.dataset.page; render();
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action, button.dataset.id)));
  document.querySelector('.brand')?.addEventListener('click', (event) => { event.preventDefault(); state.page = 'overview'; render(); });
  document.addEventListener('keydown', hotkey, { once: true });
}
function hotkey(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#job-search, #talent-search')?.focus(); } }
async function handleAction(action, id) {
  try {
    if (action === 'refresh') { await loadWorkspace(); render(); notify('Workspace refreshed.'); }
    if (action === 'new-job') showJobModal();
    if (action === 'new-client') showClientModal();
    if (action === 'assign-client') showAssignClientModal(Number(id));
    if (action === 'view-applicants') { await loadApplicants(Number(id)); renderApplicantsModal(id); }
    if (action === 'apply') await applyToJob(Number(id));
    if (action === 'track') await trackProgress(id);
    if (action === 'search-talent') await searchTalent();
    if (action === 'recruit') showRecruitModal(id);
    if (action === 'client-history') { const history = await api('recruiter', `/clientHistory?id=${id}`); showHistoryModal(history); }
    if (action === 'progress') { const progress = await api('recruiter', `/progress?app_id=${id}`); notify(typeof progress === 'string' ? progress : progress?.current_round || progress?.status || 'Application progress loaded.'); }
    if (action === 'withdraw') { await api('seeker', `/withdraw?app_id=${id}`, { method: 'PUT' }); await loadMyApplications(); render(); notify(`Application #${id} withdrawn.`); }
    if (action === 'delete-account') showDeleteModal();
    if (action === 'forward' || action === 'reject') { const feedback = document.querySelector(`#feedback-${id}`)?.value || ''; await api('recruiter', `/${action}?id=${id}&update=${encodeURIComponent(feedback)}`, { method: 'PUT' }); await loadApplicants(state.selectedJob); renderApplicantsModal(state.selectedJob); notify(action === 'forward' ? 'Candidate moved forward.' : 'Application marked as rejected.'); }
    if (action === 'change-status') { await api('recruiter', `/${id}?id=${state.selectedJob}`, { method: 'PUT' }); await loadWorkspace(); renderApplicantsModal(state.selectedJob); notify('Role status updated.'); }
  } catch (error) { notify(error.message, 'error'); }
}
function showJobModal() {
  const clientOptions = state.clients.map((client) => `<option value="${client.client_id}">${esc(client.client_name)} · #${client.client_id}</option>`).join('');
  document.body.insertAdjacentHTML('beforeend', modal('job', 'Post a new role', `<form id="job-form" class="form-stack modal-form"><label class="field-label">Role title<input name="role" required placeholder="e.g. Senior product designer" /></label><label class="field-label">Role description<textarea name="description" required maxlength="3000" rows="4" placeholder="What will this person make possible?"></textarea></label><label class="field-label">Skills & keywords <small>Separate with commas</small><input name="keywords" placeholder="Design systems, Figma, research" /></label><label class="field-label">Interview rounds <small>One per line</small><textarea name="rounds" rows="3" placeholder="Portfolio conversation&#10;Team interview"></textarea></label><label class="field-label">Client partner <small>Optional, you can also link it later</small><select name="client_id"><option value="">No client yet</option>${clientOptions}</select></label>${state.clients.length ? '' : '<label class="field-label">Client ID <small>Use an existing client ID</small><input name="client_id_custom" type="number" min="1" placeholder="Client ID" /></label>'}</form>`, 'Publish role'));
  document.querySelector('#job-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const clientId = form.get('client_id_custom') || form.get('client_id'); try { const result = await api('recruiter', '/createPosting', { method: 'POST', body: { role: form.get('role'), description: form.get('description'), keywords: form.get('keywords').split(',').map((v) => v.trim()).filter(Boolean), rounds: form.get('rounds').split('\n').map((v) => v.trim()).filter(Boolean), client_id: clientId ? Number(clientId) : null } }); document.querySelector('.modal-backdrop')?.remove(); await loadWorkspace(); state.page = 'jobs'; render(); notify(`Role published${result.id ? ` · JOB-${String(result.id).padStart(4, '0')}` : ''}.`); } catch (error) { notify(error.message, 'error'); } });
}
function showAssignClientModal(jobId) {
  const job = state.jobs.find((item) => Number(item.id) === Number(jobId));
  const clientOptions = state.clients.map((client) => `<option value="${client.client_id}" ${Number(client.client_id) === Number(job?.client_id) ? 'selected' : ''}>${esc(client.client_name)} · #${client.client_id}</option>`).join('');
  document.body.insertAdjacentHTML('beforeend', modal('assign-client', 'Link a client partner', `<form id="assign-client-form" class="form-stack modal-form"><p class="form-helper">${esc(job?.role || `Job #${jobId}`)} can be linked to a client now. You can also use a client ID if the partner isn’t in this list.</p>${clientOptions ? `<label class="field-label">Select a client<select name="client_id"><option value="">Choose a client</option>${clientOptions}</select></label>` : ''}<label class="field-label">Client ID<input name="client_id_custom" type="number" min="1" placeholder="Existing client ID" ${clientOptions ? '' : 'required'} /></label></form>`, 'Link client'));
  document.querySelector('#assign-client-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const clientId = values.get('client_id_custom') || values.get('client_id');
    if (!clientId) { notify('Choose a client or enter its ID.', 'error'); return; }
    try {
      const updated = await api('recruiter', `/tagJob?job_id=${jobId}&client_id=${Number(clientId)}`, { method: 'PUT' });
      state.jobs = state.jobs.map((item) => Number(item.id) === Number(jobId) ? { ...item, ...updated, client_id: Number(clientId) } : item);
      document.querySelector('.modal-backdrop')?.remove();
      render();
      notify('Client linked to this role.');
    } catch (error) { notify(error.message, 'error'); }
  });
}
function showClientModal() {
  document.body.insertAdjacentHTML('beforeend', modal('client', 'Add a client partner', `<form id="client-form" class="form-stack modal-form"><label class="field-label">Company name<input name="client_name" required minlength="2" placeholder="Company name" /></label><label class="field-label">Contact email<input name="client_email" required type="email" placeholder="hello@company.com" /></label><label class="field-label">Address line 1<input name="client_address_1" placeholder="Street address" /></label><label class="field-label">Address line 2<input name="client_address_2" placeholder="City, region, postal code" /></label></form>`, 'Add client'));
  document.querySelector('#client-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); Object.keys(values).forEach((key) => { if (!values[key]) values[key] = null; }); try { const created = await api('recruiter', '/addClient', { method: 'POST', body: values }); if (state.user.role !== 'staffing') { state.clients = [...state.clients, created]; localStorage.setItem('ats_clients', JSON.stringify(state.clients)); } document.querySelector('.modal-backdrop').remove(); await loadWorkspace(); render(); notify('Client partner added.'); } catch (error) { notify(error.message, 'error'); } });
}
function renderApplicantsModal(jobId) {
  document.querySelector('.modal-backdrop[data-close="applicants"]')?.remove();
  const job = state.jobs.find((item) => item.id === Number(jobId));
  const content = state.pipelineApplications.length ? state.pipelineApplications.map((item) => {
    const candidate = state.candidates.find((person) => person.id === item.cand_id) || {};
    const resume = resumeUrl(candidate.resume_path || item.resume_path);
    const resumeLink = resume
      ? `<a class="resume-action" href="${esc(resume)}" target="_blank" rel="noreferrer">▧ &nbsp;View resume <span>↗</span></a>`
      : `<span class="resume-hint">${item.resume_path === 'Profile Deleted / Anonymised' ? 'Resume unavailable · profile anonymized' : 'No resume on file'}</span>`;
    const canAdvance = ['submitted', 'reviewed'].includes(item.status);
    const feedback = item.round_feedback && Object.keys(item.round_feedback).length
      ? `<div class="feedback-history">${Object.entries(item.round_feedback).map(([round, note]) => `<p><b>${esc(['selected', 'rejected'].includes(round) ? round : `Round ${round}`)}</b><span>${esc(note || 'No feedback left')}</span></p>`).join('')}</div>` : '';
    return `<article class="applicant-row"><div class="candidate-row-head"><span class="avatar candidate-avatar">${initials(candidate.name || `C${item.cand_id}`)}</span><div class="candidate-id-copy"><b>${esc(candidate.name || `Candidate #${item.cand_id}`)}</b><small>${esc(candidate.email || '')} · App #${item.id}</small></div><span class="score-chip">${item.score || 0} <small>MATCH</small></span></div><div class="tag-row">${(candidate.strengths || []).slice(0, 5).map((skill) => `<span class="tag">${esc(skill)}</span>`).join('')}</div><div class="applicant-bottom"><span class="status-pill ${esc(item.status)}">${esc(item.status)}</span>${resumeLink}<button class="text-btn" data-action="progress" data-id="${item.id}">Progress history <span>↗</span></button></div>${feedback}${canAdvance ? `<label class="field-label feedback-label">Round feedback<textarea id="feedback-${item.id}" rows="2" placeholder="Share a note for this step (optional)"></textarea></label><div class="applicant-actions"><button class="text-btn danger-text" data-action="reject" data-id="${item.id}">Reject</button><button class="btn btn-small btn-primary" data-action="forward" data-id="${item.id}">Move forward <span>→</span></button></div>` : ''}</article>`;
  }).join('') : empty('♙', 'No applications yet', 'New applications will appear here, ranked by matching skills.');
  const activeCount = state.pipelineApplications.filter((item) => ['submitted', 'reviewed'].includes(item.status)).length;
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-close="applicants"><section class="modal wide-modal" role="dialog"><div class="modal-head"><div><div class="eyebrow">ROLE PIPELINE · JOB-${String(jobId).padStart(4, '0')}</div><h2>${esc(job?.role || 'Applicants')}</h2><p class="modal-subtitle">${state.pipelineApplications.length} total applications · ${activeCount} active · ${state.pipelineApplications.length - activeCount} completed</p></div><button class="icon-btn close-modal" data-close="applicants" aria-label="Close">×</button></div><div class="role-status-actions"><span>Role status <b class="status-pill ${esc(job?.status || 'open')}">${esc(job?.status || 'open')}</b></span><div>${job?.status !== 'open' ? '<button class="text-btn" data-action="change-status" data-id="statusOpener">Reopen role</button>' : ''}<button class="text-btn" data-action="change-status" data-id="statusHold">Put on hold</button><button class="text-btn" data-action="change-status" data-id="statusCloser">Close role</button></div></div><div class="applicant-list">${content}</div></section></div>`);
  bindModalActions();
}
function bindModalActions() {
  document.querySelectorAll('.modal-backdrop [data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action, button.dataset.id)));
}
function openPopover(anchor, kind) {
  document.querySelector('.popover-menu')?.remove();
  const recruiter = ['recruiter', 'staffing'].includes(state.user?.role);
  const items = {
    workspace: [
      { label: recruiter ? 'Recruiting team' : 'Candidate space', detail: state.user?.role || 'Workspace', disabled: true },
      { label: 'Workspace overview', action: 'workspace-home' },
      { label: 'Refresh workspace', action: 'workspace-refresh' },
    ],
    'workspace-actions': [
      { label: 'Refresh workspace', action: 'workspace-refresh' },
      { label: 'Service health', action: 'service-health' },
      { label: 'About this demo', action: 'demo-info' },
    ],
    profile: [
      { label: state.user?.name || 'Account', detail: state.user?.email || '', disabled: true },
      ...(!recruiter ? [{ label: 'My profile', action: 'profile-page' }] : []),
      { label: 'Service health', action: 'service-health' },
      { label: 'Sign out', action: 'sign-out', danger: true },
    ],
  };
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = `popover-menu ${kind === 'profile' ? 'profile-menu' : ''}`;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items[kind].map((item) => item.disabled
    ? `<div class="popover-heading"><b>${esc(item.label)}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</div>`
    : `<button type="button" role="menuitem" class="popover-item ${item.danger ? 'danger' : ''}" data-menu-action="${item.action}">${esc(item.label)}${item.danger ? '<span>↗</span>' : ''}</button>`).join('');
  document.body.append(menu);
  menu.dataset.kind = kind;
  const left = Math.max(10, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 10));
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(10, Math.min(rect.bottom + 7, window.innerHeight - menu.offsetHeight - 10))}px`;
}
function showUtilityModal(title, body) {
  document.querySelector('.modal-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-close="utility"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">NORTHSTAR ATS</div><h2>${esc(title)}</h2></div><button class="icon-btn close-modal" type="button" data-close="utility" aria-label="Close">×</button></div>${body}</section></div>`);
}
async function showServiceHealth() {
  const services = [['Auth service', 'auth'], ['Seeker service', 'seeker'], ['Recruiter service', 'recruiter'], ['Application service', 'applications']];
  const rows = await Promise.all(services.map(async ([label, key]) => {
    try { await api(key, '/health-check'); return `<div class="health-detail-row"><span>${label}</span><b class="is-online"><i></i>Online</b></div>`; }
    catch { return `<div class="health-detail-row"><span>${label}</span><b class="is-offline"><i></i>Offline</b></div>`; }
  }));
  showUtilityModal('Service health', `<p class="utility-copy">Live checks for the four local API services.</p><div class="health-detail-list">${rows.join('')}</div>`);
}
function signOut() {
  state.token = ''; state.user = null; state.page = 'overview'; state.jobs = []; state.applications = []; state.myApplications = []; state.pipelineApplications = []; state.candidates = []; state.clients = []; state.selectedJob = null;
  localStorage.removeItem('ats_token'); localStorage.removeItem('ats_user');
  document.querySelector('.popover-menu')?.remove();
  state.authMode = 'login'; render();
}
document.addEventListener('click', async (event) => {
  const closer = event.target.closest('[data-close]');
  if (closer) {
    const backdrop = closer.classList.contains('modal-backdrop') ? closer : closer.closest('.modal-backdrop');
    if (backdrop && (closer !== backdrop || event.target === backdrop)) backdrop.remove();
    return;
  }
  const trigger = event.target.closest('[data-menu-trigger]');
  if (trigger) {
    const kind = trigger.dataset.menuTrigger;
    const current = document.querySelector('.popover-menu');
    if (current?.dataset.kind === kind) current.remove();
    else openPopover(trigger, kind);
    return;
  }
  const item = event.target.closest('[data-menu-action]');
  if (item) {
    const action = item.dataset.menuAction;
    document.querySelector('.popover-menu')?.remove();
    if (action === 'workspace-home') { state.page = 'overview'; render(); }
    if (action === 'workspace-refresh') { await loadWorkspace(); render(); notify('Workspace refreshed.'); }
    if (action === 'service-health') await showServiceHealth();
    if (action === 'demo-info') showUtilityModal('About this demo', '<p class="utility-copy">Northstar connects candidate discovery, jobs, applications, and authentication across four local FastAPI services.</p><div class="health-detail-list"><div class="health-detail-row"><span>Workspace</span><b>Local demo</b></div><div class="health-detail-row"><span>API routing</span><b>Vite development proxy</b></div></div>');
    if (action === 'profile-page') { state.page = 'profile'; render(); }
    if (action === 'sign-out') signOut();
    return;
  }
  if (!event.target.closest('.popover-menu')) document.querySelector('.popover-menu')?.remove();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { document.querySelector('.modal-backdrop')?.remove(); document.querySelector('.popover-menu')?.remove(); }
});
async function applyToJob(jobId) {
  if (!state.seeker) { state.page = 'profile'; render(); notify('Create your seeker profile before applying.', 'error'); return; }
  const application = await api('applications', '/createApplication', { method: 'POST', body: { job_id: jobId } });
  await loadMyApplications();
  state.page = 'applications'; render(); notify(`Application #${application.id} submitted.`);
}
async function loadMyApplications() {
  state.myApplications = await api('seeker', '/myapplications');
  return state.myApplications;
}
async function trackProgress(id) {
  const progress = await api('seeker', `/progress?application_id=${encodeURIComponent(id)}`);
  const text = typeof progress === 'string' ? progress : progress?.current_round || progress?.status || 'Application received';
  await loadMyApplications();
  state.page = 'applications'; render(); notify(`Application #${id}: ${text}`);
}
async function searchTalent() {
  const input = document.querySelector('#talent-search'); if (input) state.search = input.value;
  try { state.candidates = state.search ? await api('recruiter', `/searchCandidate?search=${encodeURIComponent(state.search)}`) : []; state.page = 'talent'; render(); } catch (error) { notify(error.message, 'error'); }
}
function showRecruitModal(candidateId) {
  document.body.insertAdjacentHTML('beforeend', modal('recruit', 'Invite this candidate', `<form id="recruit-form" class="form-stack modal-form"><label class="field-label">Choose a role<select name="job" required>${state.jobs.filter((job) => job.status === 'open').map((job) => `<option value="${job.id}">${esc(job.role)} · Job #${job.id}</option>`).join('')}</select></label><p class="form-helper">This creates an application and adds the candidate to the role pipeline.</p></form>`, 'Send invitation'));
  document.querySelector('#recruit-form').addEventListener('submit', async (event) => { event.preventDefault(); const job = Number(new FormData(event.currentTarget).get('job')); try { const result = await api('recruiter', `/recruit?id=${candidateId}&job=${job}`, { method: 'POST' }); document.querySelector('.modal-backdrop').remove(); notify(`Candidate added to the pipeline · Application #${result.id}.`); } catch (error) { notify(error.message, 'error'); } });
}
function showHistoryModal(history) {
  const postings = history?.job_postings || [];
  const content = postings.length ? postings.map((job) => `<div class="history-row"><span class="company-logo">${initials(job.role)}</span><div><b>${esc(job.role)}</b><small>JOB-${String(job.id).padStart(4, '0')} · ${esc(job.status || 'open')}</small></div><span class="status-pill ${esc(job.status || 'open')}">${esc(job.status || 'open')}</span></div>`).join('') : '<div class="form-helper">No roles are linked to this partner yet.</div>';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-close="history"><section class="modal"><div class="modal-head"><div><div class="eyebrow">CLIENT PARTNER · ${String(history?.client_id || '').padStart(4, '0')}</div><h2>${esc(history?.client_name || 'Hiring history')}</h2><p class="modal-subtitle">${esc(history?.client_email || '')}</p></div><button class="icon-btn close-modal" data-close="history">×</button></div><div class="history-list">${content}</div></section></div>`);
  bindModalActions();
}
function showDeleteModal() {
  document.body.insertAdjacentHTML('beforeend', modal('delete-profile', 'Close your Northstar account?', `<div class="confirm-copy">This will remove your sign-in and anonymize your seeker profile. You can’t reverse this step.</div><form id="delete-profile-form"></form>`, 'Yes, close my account'));
  document.querySelector('#delete-profile-form')?.addEventListener('submit', async (event) => { event.preventDefault(); try { await api('seeker', '/deleteSeeker', { method: 'DELETE' }); state.token = ''; state.user = null; localStorage.removeItem('ats_token'); localStorage.removeItem('ats_user'); render(); notify('Your account has been closed.'); } catch (error) { notify(error.message, 'error'); } });
}
function bindProfile() {
  document.querySelector('#profile-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { state.user = await api('auth', '/updateUser', { method: 'PUT', body }); localStorage.setItem('ats_user', JSON.stringify(state.user)); await loadWorkspace(); render(); notify('Your profile is up to date.'); } catch (error) { notify(error.message, 'error'); } });
  document.querySelector('#resume-input')?.addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; const form = new FormData(); form.append('resume', file); try { state.seeker = await api('seeker', state.seeker ? '/updateResume' : '/registerSeeker', { method: state.seeker ? 'PUT' : 'POST', form }); await loadWorkspace(); render(); notify('Resume uploaded. Skills are being processed.'); } catch (error) { notify(error.message, 'error'); } });
}

if (state.user && state.token) { loadWorkspace().then(render).catch(() => { render(); }); }
else { state.authMode = 'login'; render(); }
