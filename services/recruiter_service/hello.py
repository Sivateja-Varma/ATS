from fastapi import FastAPI,status,HTTPException,status,Depends
from contextlib import asynccontextmanager
import aiohttp
from Shared.finalToken import RoleCheck
from fastapi.concurrency import run_in_threadpool
from sqlmodel import select,null
from .models import JobPostPublic,JobPost,Keyword,JobStatus
from .db import SessionDep

@asynccontextmanager
async def Lifespan(app:FastAPI): #this is a async function
  app.state.messageSesh=aiohttp.ClientSession()
  yield
  await app.state.messageSesh.close()


app = FastAPI(title='Recruiter Service',summary='provides all info about the recruiters',lifespan=Lifespan)

@app.get('/health-check')
async  def healthCheck():
  return {"service":"recruiter_service","status":"live"}

@app.get('/postings',summary="get all the postings created",description="all postings created will be displayed")
def allJobPost(session:SessionDep):
  postings=session.exec(select(JobPost)).all()
  return postings

@app.get('/posting',summary="get one specific posting created",description="posting queried based on id")
def oneJobPost(session:SessionDep,id:int):
  posting=session.get(JobPost,id) #does not raise an error if not found
  if posting is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="posting not available")
  return posting

@app.post("/createPosting")
def createPosting(job:JobPostPublic,session:SessionDep,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  try:
    opportunity=JobPost(role=job.role,description=job.description,keywords=job.keywords,status=JobStatus.open)
    session.add(opportunity)
    session.commit()
    session.refresh(opportunity)
    return opportunity
  except:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong") 


@app.post("/applied")
async def jobMetrics(id:int,session:SessionDep,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  async with app.state.messageSesh.get('http://127.0.0.1:8002/applications',params={'job_id':id}) as resp:
    collection=await resp.json()
    return collection  


# jobs can be in any one of three states or statuses hold,closed,open ,can have a fourth state cancelled if thats the case then create a flag for that to be deleted from the main db to a secondry db but this fourth state is out of scope for now.  

#build some kind of search so that a recruiter can see candidates based on fields 

@app.get('/searchCandidate')
async def searchCandidate(search:str,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  async with app.state.messageSesh.get('http://127.0.0.1:8000/seekers',params={"search":search}) as resp:
    candidates = await resp.json()
    return candidates


@app.post('/recruit')
async def recruitCandidate(id:int,job:int,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  async with app.state.messageSesh.post('http://127.0.0.1:8002/createApplication',json={"job_id":job,"cand_id":id}) as resp:
    candidate=await resp.json()
    return candidate

@app.put('/statusOpener')
def statusOpen(id:int,session:SessionDep,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  job=session.get(JobPost,id)
  if job.status in [JobStatus.hold , JobStatus.closed , None]: #is checks object identity for single object not to be used here
    job.status=JobStatus.open

    session.commit()
    session.refresh(job)
    return job
  else:
    return job  

@app.put('/statusCloser')
def statusClose(id:int,session:SessionDep,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  job=session.get(JobPost,id)
  if job.status in [JobStatus.hold , JobStatus.open , None]: #is checks object identity for single object not to be used here
    job.status=JobStatus.closed

    session.commit()
    session.refresh(job)
    return job
  else:
    return job  

@app.put('/statusHold')
def statusHold(id:int,session:SessionDep,recruiter:str=Depends(RoleCheck(['recruiter','staffing']))):
  job=session.get(JobPost,id)
  if job.status in [JobStatus.closed , JobStatus.open , None]: #is checks object identity for single object not to be used here
    job.status=JobStatus.hold

    session.commit()
    session.refresh(job)
    return job
  else:
    return job         

#also create the custom rounds for each job and change them based on performance of the applicant by the recuiter or staffing comp and also a way for applicants to see their progress where they are and for a recuiter to see the entire history !!! main concern

@app.put('/forward')
async def appForward(id:int):
  async with app.state.messageSesh.put('127.0.0.1:8002/forward',params={"id":id}) as resp:
    main=await resp.json()
  return main  
  


#create some kind of job metric public endpoint or an endpoint that a seeker can see just how many applicants have applied for a job, where the applicant can only see the metric count and nothing else