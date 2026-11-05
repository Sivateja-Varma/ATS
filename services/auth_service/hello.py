from fastapi import FastAPI,status,HTTPException,Depends
from .models import User,UserPublic,RegUSer,UserReq,LoginModel,UserUpdate
from fastapi.concurrency import run_in_threadpool
from .db import SessionDep
from contextlib import asynccontextmanager
from typing import List
from sqlmodel import SQLModel,select
from Shared.finalToken import RoleCheck
from .helper import hashingFunc,verifyFunc,tokenizeFunc
import aiohttp


@asynccontextmanager
async def Lifespan(app:FastAPI):
  app.state.messageSesh=aiohttp.ClientSession()
  yield
  await app.state.messageSesh.close()

app=FastAPI(title="Auth Service",summary="consolidated Auth service for the entire application",docs_url="/docs",lifespan=Lifespan)


@app.get('/health-check',status_code=status.HTTP_200_OK)
async def healthCheck():
  return {"service":"Auth","status":"live"}

@app.get('/users',status_code=status.HTTP_200_OK,response_model=List[UserPublic])
def allUsers(session:SessionDep):
  users=session.exec(select(User)).all()
  return users

@app.post('/register',summary="endpoint to register user",description="A consolidated user endpoint creator function, all the workflow starts from here when it comes to user",response_model=UserPublic)
def userRegister(chap:RegUSer,session:SessionDep):
  try:
    user = User(
      email=chap.email,
      name=chap.name,
      user_pass=hashingFunc(chap.user_pass),
      role=chap.role
    )

    session.add(user)
    session.commit()
    session.refresh(user)
    return user
  # The reason it looks empty or unexpected is that user is a reserved system keyword in PostgreSQL. When you run SELECT * FROM user; without quotes, PostgreSQL evaluates user as a special function that returns the current logged-in user name (postgres), rather than querying your actual table.
  except Exception as e:
    raise  HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="try again") 

@app.post("/login",summary='user login endpoint',description="a consolidated user login endpoint, which sits at the start of the workflow")
def userLogin(chap:LoginModel,session:SessionDep):

  user=session.exec(select(User).where(User.email==chap.email)).first()
  if not user or not verifyFunc(user.user_pass,chap.password):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="try again")

  token={"id":user.id,"role":user.role,'email':user.email,'name':user.name}
  jwt=tokenizeFunc(token)
  return {"token_type":"BEARER","token":jwt}
# make this more robust and less fault tolerant
@app.put('/updateUser',summary="update profile",description="account updation workflow starts from here",status_code=status.HTTP_202_ACCEPTED)
async def updateUser(session:SessionDep,new:UserUpdate,user:dict=Depends(RoleCheck(['seeker','recruiter','staffing']))):
  person = session.get(User,user.get('id'))
  if new.email is not None:
    person.email=new.email
  if new.name is not None:  
    person.name=new.name

  async with app.state.messageSesh.get("http://127.0.0.1:8000/authSeeker",params={"id":person.id}) as resp:
    fact = await resp.json()
    if resp.status!=200:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=fact.get('detail'))
  body={"name":new.name,"email":new.email}  
  async with app.state.messageSesh.put("http://127.0.0.1:8000/seekerUpdate",params={"id":fact.get('id')},json=body) as resp:

    final = await resp.json()  
    if resp.status != 200 :
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=final.get('detail'))
  if final:  
    def Save():
      session.commit()
      session.refresh(person)  
      return person
    await run_in_threadpool(Save)
  else:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong")  


#delete endpoint

@app.delete('/deleteUser',summary='delete profile',description="account deletion endpoints, all our services are suspended",status_code=status.HTTP_200_OK)
def deleteUser(session:SessionDep,id:int):
  try: 
    chap=session.get(User,id)
    if not chap:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="user not found")
    session.delete(chap)
    session.commit()
    return True
  except Exception as e:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="something went wrong try again")


