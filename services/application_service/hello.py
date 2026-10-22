from fastapi import FastAPI,HTTPException,status
from contextlib import asynccontextmanager
import aiohttp
import json
from sqlmodel import select,desc
from .models import Application,ApplicationPublic
from fastapi.concurrency import run_in_threadpool
from .db import SessionDep

@asynccontextmanager
async def Lifespan(app:FastAPI): #this is a async function
  app.state.messageSesh=aiohttp.ClientSession()
  yield
  await app.state.messageSesh.close()


app=FastAPI(title="Application Service",summary="all the info regarding applications",lifespan=Lifespan)

@app.get('/health-check')
async def healthCheck():
  return {"service":"application_service","status":"live"}

@app.get("/applications",summary="get all the applications that happened",description="end point provides all the applications ever created")
async def allApplications(session:SessionDep,job_id:int|None=None):
  try:
    if job_id is not None:
          statement=select(Application).where(Application.job_id==job_id).order_by(desc(Application.score))
          specific_db=await run_in_threadpool(session.exec,statement)
          specific=specific_db.fetchall()
          resumes=[]
          for i in specific:
            async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":i.cand_id}) as resp:
               cand = await resp.json()
               resumes.append(cand.get('resume_path'))
          storage=[{"id":j.id,"job_id":j.job_id,"cand_id":j.cand_id,"score":j.score,"status":j.status,"applied_at":j.applied_at,"resume_path":resumes[i]} for i,j in enumerate(specific)]
          return storage
    statement=select(Application)
    apps_db=await run_in_threadpool(session.exec,statement)
    apps=apps_db.all()
    resumes=[]
    for i in apps:
      async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":i.cand_id}) as resp:
          cand = await resp.json()
          resumes.append(cand.get('resume_path'))
    print(resumes)
    storage=[{"id":j.id,"job_id":j.job_id,"cand_id":j.cand_id,"score":j.score,"status":j.status,"applied_at":j.applied_at,"resume_path":resumes[i]} for i,j in enumerate(apps)]
    return storage 
  except Exception as e:
    print(e)
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,detail="something went wrong")

@app.get("/application",summary="get one application that was created",description="end point provides a application based on id")
async def oneApplication(session:SessionDep,id:int):
  application = await run_in_threadpool(session.get,Application,id)
  if application is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="application not present")
  async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":application.cand_id}) as resp:
     body=await resp.json()
     resume=body.get('resume_path')
  return {"id":application.id,"job_id":application.job_id,"cand_id":application.cand_id,"score":application.score,"status":application.status,"applied_at":application.applied_at,"resume_path":resume}
  

@app.post('/createApplication')
async def createApplication(session:SessionDep,apply:ApplicationPublic):
   async with app.state.messageSesh.get('http://localhost:8000/seeker',params={"id":apply.cand_id}) as resp:
    seeker= await resp.json() 
   async with app.state.messageSesh.get('http://localhost:8001/posting',params={"id":apply.job_id}) as resp:
    job= await resp.json() 

    if job.get('status') not in ["hold","closed"]:
          score=0
          seeker_strengths = {s.lower() for s in seeker.get('strengths', [])}
          for i in seeker_strengths:
            if i in job.get('keywords'):
              score+=1
          main_application=Application(job_id=job['id'],cand_id=seeker['id'],score=score)
      
          
          def save_to_db():
              session.add(main_application)
              session.commit()
              session.refresh(main_application)
              return main_application
          saved_application = await run_in_threadpool(save_to_db)
          return saved_application   
    else:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="job not found")

@app.put('/forward')
async def moveForward(id:int,session:SessionDep):
  try:
    application=session.get(Application,id)
    if application is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Application not found")
    async with app.state.messageSesh.get('http://127.0.0.1:8001/posting',params={"id":application.job_id}) as resp:
      job=await resp.json()
 
    if application.current_round is None and application.status != "rejected":
       application.current_round=0
       application.status="reviewed"  

    if application.current_round == 0 and application.status not in ['submitted','rejected']: 
       if application.current_round<len(job.get('rounds')):  
            application.current_round+=1
       else:
            application.status="selected"    
    
    def Sync():
      session.commit()  
      session.refresh(application)
      return application
    final_application=await run_in_threadpool(Sync) 
    return final_application
  except Exception as e:
     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong")    
    



# # 1. Convert all seeker strengths to lowercase sets
# seeker_strengths = {s.lower() for s in seeker.get('strengths', [])}

# # 2. Convert all job keywords to lowercase sets (for a fair match)
# job_keywords = {k.lower() for k in job.get('keywords', [])}

# # 3. Calculate score by finding the intersection of both sets
# score = len(seeker_strengths.intersection(job_keywords))


# • The Error: This would have silently blocked your FastAPI server or thrown an exception.

# • Why it happened: Python evaluates code inside parentheses from the inside out. By placing the () database calls inside run_in_threadpool(...), Python executed the heavy database operations immediately on the main thread before run_in_threadpool could move them to a background thread.

# • The Rule: You must pass the function reference and its arguments separately, like this: await run_in_threadpool(session.get, Application, id).
