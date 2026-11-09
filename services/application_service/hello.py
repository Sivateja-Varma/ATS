from fastapi import FastAPI,HTTPException,status,Depends,BackgroundTasks
from contextlib import asynccontextmanager
import aiohttp
import json
from Shared.mail import send_email
from sqlmodel import select,desc,func
from .models import Application,ApplicationPublic,Status
from fastapi.concurrency import run_in_threadpool
from .db import SessionDep
from Shared.finalToken import RoleCheck

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
async def allApplications(session:SessionDep,job_id:int|None=None,cand_id:int|None=None):
  try:
    if cand_id is not None:
       statement=select(Application).where(Application.cand_id==cand_id)
       specific_db=await run_in_threadpool(session.exec,statement)
       entry=specific_db.fetchall()
       resumes=[]
       for i in entry:
        async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":i.cand_id}) as resp:
          cand = await resp.json()
          raw_path=cand.get('resume_path')
          if raw_path is None or str(raw_path).endswith('/None') or raw_path == 'None':
                    resumes.append("Profile Deleted / Anonymised")
          else:
                    resumes.append(raw_path)
       storage=[{"id":j.id,"job_id":j.job_id,"cand_id":j.cand_id,"score":j.score,"status":j.status,"applied_at":j.applied_at, "current_round": j.current_round,"resume_path":resumes[i]} for i,j in  enumerate(entry)]
       return storage
    if job_id is not None:
          statement=select(Application).where(Application.job_id==job_id,Application.status.in_(["submitted","reviewed"])).order_by(desc(Application.score))
          specific_db=await run_in_threadpool(session.exec,statement)
          specific=specific_db.fetchall()
          resumes=[]
          for i in specific:
            async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":i.cand_id}) as resp:
               cand = await resp.json()
               raw_path=cand.get('resume_path')
               if raw_path is None or str(raw_path).endswith('/None') or raw_path == 'None':
                        resumes.append("Profile Deleted / Anonymised")
               else:
                        resumes.append(raw_path)
          storage=[{"id":j.id,"job_id":j.job_id,"cand_id":j.cand_id,"score":j.score,"status":j.status,"applied_at":j.applied_at, "current_round": j.current_round,"resume_path":resumes[i]} for i,j in enumerate(specific)]
          return storage
    statement=select(Application)
    apps_db=await run_in_threadpool(session.exec,statement)
    apps=apps_db.all()
    resumes=[]
    for i in apps:
      async with app.state.messageSesh.get('http://127.0.0.1:8000/seeker',params={"id":i.cand_id}) as resp:
          cand = await resp.json()
          raw_path=cand.get('resume_path')
          if raw_path is None or str(raw_path).endswith('/None') or raw_path == 'None':
                  resumes.append("Profile Deleted / Anonymised")
          else:
                  resumes.append(raw_path)
          
    print(resumes)
    storage=[{"id":j.id,"job_id":j.job_id,"cand_id":j.cand_id,"score":j.score,"status":j.status,"applied_at":j.applied_at, "current_round": j.current_round,"resume_path":resumes[i]} for i,j in enumerate(apps)]
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
     raw_path=body.get('resume_path')
     if raw_path is None or str(raw_path).endswith('/None') or raw_path == 'None':
            resume="Profile Deleted / Anonymised"
     else:
            resume=raw_path
  return {"id":application.id,"job_id":application.job_id,"cand_id":application.cand_id,"score":application.score,"status":application.status,"applied_at":application.applied_at,"resume_path":resume,"current_round":application.current_round}
  

@app.get("/checkBulk",summary="check endpoint",description="this endpoint checks whether there are any active applications, used for bulk withdraws")
async def checkBulk(session:SessionDep,cand_id:int):
   if cand_id is not None:
     statement=select(Application).where(Application.cand_id==cand_id,Application.status.in_(['reviewed','rejected','selected']))
     specific_db=await run_in_threadpool(session.exec,statement)
     entry=specific_db.first()
     return True if entry is not None else False


@app.post('/createApplication')
async def createApplication(session:SessionDep,apply:ApplicationPublic,background:BackgroundTasks,check:dict=Depends(RoleCheck(['seeker','recruiter','staffing']))):
  try:
    if check.get('role') == 'seeker':
      id=check.get('id')
      async with app.state.messageSesh.get('http://localhost:8000/authSeeker',params={"id":id}) as resp:
          seeker= await resp.json()
      async with app.state.messageSesh.get('http://localhost:8001/posting',params={"id":apply.job_id}) as resp:
          job= await resp.json()    
    else:   
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
        background.add_task(send_email,[seeker.get("email")],seeker.get("name"),job.get("role"),main_application.status.value) # input value is list
        return saved_application  
    else:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="job not found")
  except Exception as e:
     raise HTTPException(status_code=status.HTTP_406_NOT_ACCEPTABLE,detail=("you already applied to it"))  

@app.put('/forward')
async def moveForward(id:int,session:SessionDep,background:BackgroundTasks):
  try:
    application=session.get(Application,id)
    if application is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Application not found")
    async with app.state.messageSesh.get('http://127.0.0.1:8001/posting',params={"id":application.job_id}) as resp:
      job=await resp.json()
    async with app.state.messageSesh.get("http://127.0.0.1:8000/seeker",params={"id":application.cand_id}) as resp:
        candidate= await resp.json()  

    # add or throw some kind of error when trying to forward rejected or with drawn applications  
    if application.status == "rejected" or application.status == "withdraw" or application.status == "selected":
        raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED,detail="cannot forward this particular application forward, once check again.") 

    if application.current_round is None and application.status != "rejected":
        application.current_round=0
        application.status=Status.reviewed 

    if application.current_round == 0 or application.status not in ['submitted','rejected']: 
        if application.current_round==0:  
            application.current_round+=1
        elif  application.current_round<len(job.get('rounds',[])):
          application.current_round+=1    
        else:
            application.status="selected"    
    
    def Sync():
      session.commit()  
      session.refresh(application)
      return application
    final_application=await run_in_threadpool(Sync) 
    background.add_task(send_email,[candidate.get("email")],candidate.get("name"),job.get("role"),application.status)
    return final_application
  except Exception as e:
     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong")   

# when working with moving a candidate forward or rejecting its important that recruiters forward applications not the candidate directly so use application id not cand_id -> this is very dangerous   
    
#application status toggler rejection!
@app.put('/statusRejecter',summary="endpoint to change status",description="change the status to rejection")
async def statusRejecter(session:SessionDep,app_id:int,background:BackgroundTasks):
   try:
    application=session.get(Application,app_id)
    if application is None:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Application not Found")
    async with app.state.messageSesh.get('http://127.0.0.1:8001/posting',params={"id":application.job_id}) as resp:
          job=await resp.json()
    async with app.state.messageSesh.get("http://127.0.0.1:8000/seeker",params={"id":application.cand_id}) as resp:
            candidate= await resp.json()
    application.status=Status.rejected
    await run_in_threadpool(session.commit)
    background.add_task(send_email,[candidate.get("email")],candidate.get("name"),job.get("role"),application.status)
    return f"{application.id} has been rejected" #also give in which round this profile has been rejected 
   except Exception as e:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="try again")


# single job application withdrawal
@app.put('/statusWithdrawerSingle',summary='endpoint to change status',description="change the status to withdrawn")
async def statusWithdrawerSingle(session:SessionDep,id:int,background:BackgroundTasks):
   try:
    application=session.get(Application,id)
    if application is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="application not found")
    if application.status in [Status.selected,Status.rejected,Status.reviewed]:
        raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED,detail="application is in the process it cannot be with drawn now")
    async with app.state.messageSesh.get('http://127.0.0.1:8001/posting',params={"id":application.job_id}) as resp:
              job=await resp.json()
    async with app.state.messageSesh.get("http://127.0.0.1:8000/seeker",params={"id":application.cand_id}) as resp:
              candidate= await resp.json()
    application.status=Status.withdraw
    await run_in_threadpool(session.commit)
    background.add_task(send_email,[candidate.get("email")],candidate.get("name"),job.get("role"),application.status)
    return "application withdrawn"
   except Exception as e:
       raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="try again.")

#application status toggler withdrawn bulk with draw best for the account deletion workflow!
@app.put('/statusWithdrawerBulk',summary='endpoint to change status',description="change the status to withdrawn")
def statusWithdrawBulk(session:SessionDep,cand_id:int):
   applications=session.exec(select(Application).where(Application.cand_id==cand_id))
   for application in applications:
    application.status=Status.withdraw
    session.add(application)
   session.commit()
   return True

#metrics for the seeker
@app.get('/metrics',summary="job metrics",description="to get the total count of applicants that have applied to a specific job")
def appMetrics(session:SessionDep,job_id:int):
    count = session.exec(select(func.count(Application.id)).where(Application.job_id==job_id)).one()
    return count   


# # 1. Convert all seeker strengths to lowercase sets
# seeker_strengths = {s.lower() for s in seeker.get('strengths', [])}

# # 2. Convert all job keywords to lowercase sets (for a fair match)
# job_keywords = {k.lower() for k in job.get('keywords', [])}

# # 3. Calculate score by finding the intersection of both sets
# score = len(seeker_strengths.intersection(job_keywords))


# • The Error: This would have silently blocked your FastAPI server or thrown an exception.

# • Why it happened: Python evaluates code inside parentheses from the inside out. By placing the () database calls inside run_in_threadpool(...), Python executed the heavy database operations immediately on the main thread before run_in_threadpool could move them to a background thread.

# • The Rule: You must pass the function reference and its arguments separately, like this: await run_in_threadpool(session.get, Application, id).
